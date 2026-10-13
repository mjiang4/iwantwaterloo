'use client';
/* oxlint-disable react/react-compiler -- Walkers are simulated in the render loop. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Idea } from '@/lib/garden';
import { parkPlotPosition } from './plots';
import {
  nearestNode,
  parseGraph,
  peopleTarget,
  pickWeighted,
  random,
  route,
  type PathData,
  type PathGraph,
  type PeopleMode,
} from './people-graph';

/** Footpaths sit just above the lawn in the park model. */
const PATH_Y = 0.13;
/** Exaggerated like the trees and geese, so people read at the default zoom. */
const FIGURE = 2.3;
/** An unhurried stroll, relative to the park's exaggerated figures. */
const WALK_SPEED = 0.22;
const CAPACITY = 44;
/** Stand this far from a tree's trunk when stopping to read it. */
const READING_DISTANCE = 0.5;
const noRaycast = () => {};
/** Clear, warm colours that read against lawn and path without shouting. */
const CLOTHES = [
  '#e0603f',
  '#2f7fb8',
  '#f2b33d',
  '#c2457a',
  '#3e9b8a',
  '#7b5cc4',
  '#f4f1e6',
  '#e88a2e',
];
const SKIN = ['#e6c3a1', '#c99a73', '#a8774f', '#7a5233', '#f0d2b8'];

type Tree = { id: string; x: number; z: number; weight: number };
type Visit = {
  from: [number, number];
  stand: [number, number];
  tree: [number, number];
  phase: 'out' | 'pause' | 'back';
  time: number;
  pause: number;
};
type Walker = {
  path: number[];
  leg: number;
  along: number;
  /** The tree this walk ends at, if any. */
  goal: Tree | null;
  visit: Visit | null;
  leaving: boolean;
  gone: boolean;
  x: number;
  z: number;
  heading: number;
  stride: number;
  speed: number;
  clothes: number;
  skin: number;
};

/**
 * People strolling Waterloo Park: one per browser that planted a visible idea in
 * the last few days (see people-graph). They walk the real footpaths, stop to
 * read trees (busier trees more often), and when someone plants a new idea, a
 * new person walks in to its tree. Purely illustrative: no names, no identities,
 * nothing to tap.
 */
export function ParkPeople({
  ideas,
  people,
  mode,
  afterDark,
  motion,
}: {
  ideas: Idea[];
  people: number | undefined;
  mode: PeopleMode;
  afterDark: number;
  motion: boolean;
}) {
  const { invalidate, gl } = useThree();
  const [graph, setGraph] = useState<PathGraph | null>(null);
  const bodies = useRef<THREE.InstancedMesh>(null),
    heads = useRef<THREE.InstancedMesh>(null);
  const walkers = useRef<Walker[]>([]);
  const roll = useMemo(() => random(Date.now()), []);
  const shadows = useRef<THREE.InstancedMesh>(null);
  const object = useMemo(() => new THREE.Object3D(), []),
    color = useMemo(() => new THREE.Color(), []);
  const enabled = mode !== 'lite';

  useEffect(() => {
    if (!enabled) return;
    // Optional atmosphere: load after the park, and fail quietly.
    const controller = new AbortController();
    fetch('/park/paths.json', { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<PathData>) : null))
      .then((data) => {
        if (data) setGraph(parseGraph(data));
      })
      .catch(() => {});
    return () => controller.abort();
  }, [enabled]);

  const trees = useMemo<Tree[]>(
    () =>
      ideas
        .filter((idea) => idea.plot !== undefined)
        .map((idea) => {
          const [x, z] = parkPlotPosition(idea.plot!);
          return {
            id: idea.id,
            x,
            z,
            weight: 1 + idea.waters + 2 * (idea.commentCount ?? 0),
          };
        }),
    [ideas],
  );
  const treesRef = useRef(trees);
  treesRef.current = trees;
  const newest = useMemo(
    () =>
      ideas.reduce<Idea | null>(
        (latest, idea) =>
          !latest || idea.createdAt > latest.createdAt ? idea : latest,
        null,
      ),
    [ideas],
  );

  // The count is global, but each grove page or search refetches it; keep the last
  // known value so a page change never reads as "nobody" and sends people home.
  const known = useRef<number | undefined>(undefined);
  if (people !== undefined) known.current = people;
  const target =
    enabled && known.current !== undefined
      ? peopleTarget(known.current, mode, afterDark)
      : 0;

  /** Walk from a junction to a random junction, or to a tree (busier more often). */
  function nextWalk(walker: Walker, from: number) {
    if (!graph) return;
    walker.goal = null;
    let to: number;
    if (walker.leaving) {
      to = nearestGate(graph, graph.x[from], graph.z[from]);
    } else if (treesRef.current.length && roll() < 0.35) {
      walker.goal = pickWeighted(treesRef.current, (t) => t.weight, roll())!;
      to = nearestNode(graph, walker.goal.x, walker.goal.z);
    } else {
      to = Math.floor(roll() * graph.x.length);
    }
    walker.path = route(graph, from, to);
    walker.leg = 0;
    walker.along = 0;
  }
  function spawn(at: number, goal: Tree | null): Walker {
    const walker: Walker = {
      path: [at],
      leg: 0,
      along: 0,
      goal: null,
      visit: null,
      leaving: false,
      gone: false,
      x: graph!.x[at],
      z: graph!.z[at],
      heading: roll() * Math.PI * 2,
      stride: roll() * 10,
      speed: WALK_SPEED * (0.8 + roll() * 0.4),
      clothes: Math.floor(roll() * CLOTHES.length),
      skin: Math.floor(roll() * SKIN.length),
    };
    if (goal) {
      walker.goal = goal;
      walker.path = route(graph!, at, nearestNode(graph!, goal.x, goal.z));
    } else nextWalk(walker, at);
    return walker;
  }

  // Keep the crowd at its target: newcomers walk in from a gate, extras head home.
  // The first crowd (and any change with motion off) appears in place.
  const placed = useRef(false);
  const joinAt = useRef(0);
  const most = useRef<number | undefined>(undefined);
  const seenNewest = useRef<{ id: string; createdAt: number } | null>(null);
  const arrivals = useRef<(Tree | null)[]>([]);
  useEffect(() => {
    // A new browser planted an idea: someone walks in. Only a count above anything
    // seen before counts (a cached page can briefly report an older, lower number).
    // They head to that idea's tree when it is in view: the newest tree here is
    // newer than any seen before. Otherwise they simply join the stroll.
    const latest = newest && { id: newest.id, createdAt: newest.createdAt };
    const fresh =
      latest &&
      seenNewest.current &&
      latest.id !== seenNewest.current.id &&
      latest.createdAt > seenNewest.current.createdAt;
    if (latest && (!seenNewest.current || fresh)) seenNewest.current = latest;
    if (people === undefined) return;
    const previous = most.current;
    if (previous === undefined || people > previous) most.current = people;
    if (previous === undefined || people <= previous || !enabled) return;
    const tree = fresh
      ? (treesRef.current.find((t) => t.id === latest.id) ?? null)
      : null;
    for (let i = previous; i < Math.min(people, previous + 3); i++)
      arrivals.current.push(i === previous ? tree : null);
    arrivals.current = arrivals.current.slice(-3);
  }, [people, newest, enabled]);

  function balance(now: number) {
    // Wait for both the paths and a real count, so the first crowd is the right size.
    if (!graph || known.current === undefined) return;
    const list = walkers.current;
    if (!placed.current || !motion) {
      placed.current = true;
      while (list.length > target) list.pop();
      while (list.length < target)
        list.push(spawn(Math.floor(roll() * graph.x.length), null));
      arrivals.current = [];
      return;
    }
    let staying = list.filter((w) => !w.leaving);
    // Someone needed while others are still heading home: they turn back first.
    for (const walker of list) {
      if (staying.length >= target) break;
      if (walker.leaving) {
        walker.leaving = false;
        staying = [...staying, walker];
      }
    }
    // Never more people than the meshes hold.
    const room = list.length < CAPACITY;
    if (room && arrivals.current.length && now >= joinAt.current) {
      // Arrivals always walk in; someone else heads home if that overfills the park.
      list.push(spawn(randomGate(graph, roll), arrivals.current.shift()!));
      joinAt.current = now + 1.2;
      return;
    }
    if (room && staying.length < target && now >= joinAt.current) {
      list.push(spawn(randomGate(graph, roll), null));
      joinAt.current = now + 1.5;
    } else if (staying.length > target) {
      // The longest-strolling people without somewhere to be go home first, so a
      // newcomer always reaches the tree they came for.
      const order = [
        ...staying.filter((w) => !w.goal && !w.visit),
        ...staying.filter((w) => w.goal || w.visit),
      ];
      for (const walker of order.slice(0, staying.length - target))
        walker.leaving = true;
    }
  }

  const clock = useRef(0);
  useFrame((_, delta) => {
    const body = bodies.current,
      head = heads.current;
    if (!graph || !body || !head) return;
    const dt = motion ? Math.min(delta, 0.1) : 0;
    clock.current += dt;
    balance(clock.current);
    const list = walkers.current;
    for (const walker of list) step(walker, dt);
    walkers.current = list.filter((w) => !w.gone);
    const shown = walkers.current;
    shown.slice(0, CAPACITY).forEach((walker, i) => {
      const bob = motion ? Math.abs(Math.sin(walker.stride)) * 0.012 : 0;
      object.position.set(walker.x, PATH_Y + 0.068 * FIGURE + bob, walker.z);
      object.rotation.set(0, walker.heading, 0);
      object.scale.setScalar(FIGURE);
      object.updateMatrix();
      body.setMatrixAt(i, object.matrix);
      body.setColorAt(i, color.set(CLOTHES[walker.clothes]));
      object.position.y = PATH_Y + 0.158 * FIGURE + bob;
      object.updateMatrix();
      head.setMatrixAt(i, object.matrix);
      head.setColorAt(i, color.set(SKIN[walker.skin]));
      // A soft contact shadow grounds each person and lifts them off the lawn.
      object.position.set(walker.x, PATH_Y + 0.004, walker.z);
      object.rotation.set(-Math.PI / 2, 0, 0);
      object.updateMatrix();
      shadows.current?.setMatrixAt(i, object.matrix);
    });
    const meshes = [body, head, shadows.current].filter(
      (mesh): mesh is THREE.InstancedMesh => !!mesh,
    );
    for (const mesh of meshes) {
      mesh.count = Math.min(shown.length, CAPACITY);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    // Lets tests and look-dev see how many people are out without reading WebGL.
    if (gl.domElement.dataset.people !== String(shown.length))
      gl.domElement.dataset.people = String(shown.length);
  });

  function step(walker: Walker, dt: number) {
    if (!graph) return;
    const move = walker.speed * dt;
    if (walker.visit) {
      const v = walker.visit;
      if (v.phase === 'pause') {
        v.time += dt;
        walker.heading = Math.atan2(v.tree[0] - walker.x, v.tree[1] - walker.z);
        if (v.time >= v.pause) v.phase = 'back';
        return;
      }
      const [tx, tz] = v.phase === 'out' ? v.stand : v.from;
      if (approach(walker, tx, tz, move)) {
        if (v.phase === 'out') v.phase = 'pause';
        else {
          walker.visit = null;
          nextWalk(walker, walker.path.at(-1)!);
        }
      }
      return;
    }
    let left = move;
    while (left > 0 && walker.leg < walker.path.length - 1) {
      const a = walker.path[walker.leg],
        b = walker.path[walker.leg + 1];
      const length = Math.hypot(
        graph.x[b] - graph.x[a],
        graph.z[b] - graph.z[a],
      );
      walker.heading = Math.atan2(
        graph.x[b] - graph.x[a],
        graph.z[b] - graph.z[a],
      );
      if (walker.along + left < length) {
        walker.along += left;
        left = 0;
      } else {
        left -= length - walker.along;
        walker.along = 0;
        walker.leg++;
      }
      const t = length ? walker.along / length : 0;
      const from = walker.path[walker.leg],
        to = walker.path[Math.min(walker.leg + 1, walker.path.length - 1)];
      walker.x = graph.x[from] + (graph.x[to] - graph.x[from]) * t;
      walker.z = graph.z[from] + (graph.z[to] - graph.z[from]) * t;
    }
    walker.stride += move * 55;
    if (walker.leg < walker.path.length - 1) return;
    // Arrived at the end of this walk.
    const end = walker.path.at(-1)!;
    walker.x = graph.x[end];
    walker.z = graph.z[end];
    if (walker.leaving && graph.gates.includes(end)) {
      walker.gone = true;
      return;
    }
    if (walker.goal && !walker.leaving) {
      // Step off the path toward the tree, read it for a moment, step back.
      const { x, z } = walker.goal;
      const dx = walker.x - x,
        dz = walker.z - z,
        distance = Math.hypot(dx, dz) || 1;
      const reach = Math.min(distance, READING_DISTANCE);
      walker.visit = {
        from: [walker.x, walker.z],
        stand: [x + (dx / distance) * reach, z + (dz / distance) * reach],
        tree: [x, z],
        phase: 'out',
        time: 0,
        pause: 3 + roll() * 4,
      };
      walker.goal = null;
      return;
    }
    nextWalk(walker, end);
  }

  // With motion on, the park's frame clock already redraws at 30 fps (train,
  // water, sway), so people add no frames of their own. With motion off, they are
  // placed standing and drawn once.
  useEffect(() => {
    // Motion off: place the crowd again, standing, when the target changes.
    if (!motion) {
      placed.current = false;
      invalidate();
    }
  }, [motion, target, graph, invalidate]);

  useEffect(() => {
    if (!enabled) {
      gl.domElement.dataset.people = '0';
      arrivals.current = [];
    }
    return () => {
      gl.domElement.dataset.people = '0';
    };
  }, [enabled, gl]);

  if (!enabled) return null;
  return (
    <group name="park-people">
      <instancedMesh
        ref={bodies}
        args={[undefined, undefined, CAPACITY]}
        count={0}
        frustumCulled={false}
        raycast={noRaycast}
      >
        <capsuleGeometry args={[0.028, 0.08, 3, 8]} />
        {/* A faint glow after dark keeps the few night walkers visible. */}
        <meshStandardMaterial
          roughness={0.8}
          emissive="#ffe2b8"
          emissiveIntensity={afterDark * 0.14}
        />
      </instancedMesh>
      <instancedMesh
        ref={heads}
        args={[undefined, undefined, CAPACITY]}
        count={0}
        frustumCulled={false}
        raycast={noRaycast}
      >
        <sphereGeometry args={[0.026, 10, 8]} />
        <meshStandardMaterial
          roughness={0.8}
          emissive="#ffe2b8"
          emissiveIntensity={afterDark * 0.1}
        />
      </instancedMesh>
      <instancedMesh
        ref={shadows}
        args={[undefined, undefined, CAPACITY]}
        count={0}
        frustumCulled={false}
        raycast={noRaycast}
        renderOrder={1}
      >
        <circleGeometry args={[0.075, 16]} />
        <meshBasicMaterial
          color="#1d2a1c"
          transparent
          opacity={0.28 * (1 - afterDark * 0.6)}
          depthWrite={false}
        />
      </instancedMesh>
    </group>
  );
}

/** Move toward a point; true once there. */
function approach(walker: Walker, x: number, z: number, move: number) {
  const dx = x - walker.x,
    dz = z - walker.z,
    distance = Math.hypot(dx, dz);
  if (distance <= move || distance < 1e-4) {
    walker.x = x;
    walker.z = z;
    return true;
  }
  walker.heading = Math.atan2(dx, dz);
  walker.x += (dx / distance) * move;
  walker.z += (dz / distance) * move;
  walker.stride += move * 55;
  return false;
}
function nearestGate(graph: PathGraph, x: number, z: number) {
  let best = graph.gates[0],
    distance = Infinity;
  for (const gate of graph.gates) {
    const d = (graph.x[gate] - x) ** 2 + (graph.z[gate] - z) ** 2;
    if (d < distance) {
      distance = d;
      best = gate;
    }
  }
  return best;
}
function randomGate(graph: PathGraph, roll: () => number) {
  return graph.gates[Math.floor(roll() * graph.gates.length)];
}
