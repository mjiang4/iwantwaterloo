'use client';
/* oxlint-disable react/react-compiler -- Instance buffers and transforms are owned by the renderer. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import features from '@/assets/park/features.json';
import { loadPaths, type PathGraph } from './people-graph';

const GROUND_Y = 0.11;
/** One lamp every this many units of footpath. */
const LAMP_SPACING = 1.9;
/** A bench every this many units of path along the Silver Lake shore. */
const BENCH_SPACING = 2.6;
const SHORE_DISTANCE = 0.55;
const noRaycast = () => {};

type Placement = { x: number; z: number; angle: number };

function paint(geometry: THREE.BufferGeometry, hex: string) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  g.deleteAttribute('uv');
  const color = new THREE.Color(hex);
  const colors = new Float32Array(g.getAttribute('position').count * 3);
  for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}
function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}
function merge(parts: THREE.BufferGeometry[]) {
  const merged = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  return merged;
}

/** A park bench facing local +Z: slatted seat, backrest and two dark legs. */
function benchGeometry() {
  const wood = '#9a7048',
    iron = '#2f3a33';
  return merge([
    paint(box(0.1, 0.008, 0.03, 0, 0.03, 0), wood),
    paint(box(0.1, 0.026, 0.006, 0, 0.05, -0.014), wood),
    paint(box(0.006, 0.034, 0.03, -0.042, 0.017, 0), iron),
    paint(box(0.006, 0.034, 0.03, 0.042, 0.017, 0), iron),
  ]);
}
/** Swing frame along local X: A-frame legs and a top bar (seats animate separately). */
function swingFrame() {
  const frame = '#c4473a';
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-0.11, 0.11])
    for (const z of [-1, 1]) {
      const leg = new THREE.CylinderGeometry(0.004, 0.004, 0.16, 6);
      leg.rotateX(z * 0.32);
      leg.translate(x, 0.075, z * 0.026);
      parts.push(paint(leg, frame));
    }
  const bar = new THREE.CylinderGeometry(0.005, 0.005, 0.24, 6);
  bar.rotateZ(Math.PI / 2);
  bar.translate(0, 0.152, 0);
  parts.push(paint(bar, frame));
  return merge(parts);
}
/** One swing hanging from its pivot at the origin: two ropes and a seat. */
function swingSeat() {
  return merge([
    paint(box(0.002, 0.1, 0.002, -0.018, -0.05, 0), '#4b4b4b'),
    paint(box(0.002, 0.1, 0.002, 0.018, -0.05, 0), '#4b4b4b'),
    paint(box(0.045, 0.005, 0.02, 0, -0.1, 0), '#2f6fa8'),
  ]);
}
/** A slide: a small tower, ladder rails and a sloped yellow chute along local +X. */
function slideGeometry() {
  const chute = new THREE.BoxGeometry(0.17, 0.005, 0.04);
  chute.rotateZ(-0.62);
  chute.translate(0.085, 0.06, 0);
  return merge([
    paint(box(0.05, 0.11, 0.05, -0.02, 0.055, 0), '#3e8f7a'),
    paint(box(0.06, 0.008, 0.06, -0.02, 0.112, 0), '#2f6fa8'),
    paint(chute, '#f2b33d'),
    paint(box(0.006, 0.1, 0.006, -0.06, 0.05, -0.018), '#c4473a'),
    paint(box(0.006, 0.1, 0.006, -0.06, 0.05, 0.018), '#c4473a'),
  ]);
}
/** A climbing frame: three bright arches. */
function climberGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  ['#c4473a', '#f2b33d', '#2f6fa8'].forEach((color, i) => {
    const arch = new THREE.TorusGeometry(0.07, 0.004, 5, 14, Math.PI);
    arch.translate(0, 0, (i - 1) * 0.045);
    parts.push(paint(arch, color));
  });
  return merge(parts);
}

/** Lamps along the paths, at even spacing, just off the path edge. */
function lampPlacements(graph: PathGraph): Placement[] {
  const lamps: Placement[] = [];
  let carried = 0;
  const seen = new Set<string>();
  for (let a = 0; a < graph.x.length; a++)
    for (const b of graph.neighbours[a]) {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const dx = graph.x[b] - graph.x[a],
        dz = graph.z[b] - graph.z[a],
        length = Math.hypot(dx, dz);
      if (!length) continue;
      for (let t = LAMP_SPACING - carried; t < length; t += LAMP_SPACING) {
        lamps.push({
          x: graph.x[a] + (dx / length) * t - (dz / length) * 0.07,
          z: graph.z[a] + (dz / length) * t + (dx / length) * 0.07,
          angle: 0,
        });
      }
      carried = (carried + length) % LAMP_SPACING;
    }
  return lamps;
}
function distanceToRing(x: number, z: number, ring: number[][]) {
  let best = Infinity,
    nearest: [number, number] = [x, z];
  for (let i = 1; i < ring.length; i++) {
    const [ax, az] = ring[i - 1],
      [bx, bz] = ring[i];
    const dx = bx - ax,
      dz = bz - az;
    const t = Math.max(
      0,
      Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)),
    );
    const px = ax + t * dx,
      pz = az + t * dz;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) {
      best = d;
      nearest = [px, pz];
    }
  }
  return { distance: best, nearest };
}
/** Benches along the shore paths, set back from the path and facing the water. */
function benchPlacements(graph: PathGraph): Placement[] {
  const shore = features.shore;
  if (!shore) return [];
  const benches: Placement[] = [];
  let carried = 0;
  const seen = new Set<string>();
  for (let a = 0; a < graph.x.length; a++)
    for (const b of graph.neighbours[a]) {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const dx = graph.x[b] - graph.x[a],
        dz = graph.z[b] - graph.z[a],
        length = Math.hypot(dx, dz);
      if (!length) continue;
      for (let t = BENCH_SPACING - carried; t < length; t += BENCH_SPACING) {
        const x = graph.x[a] + (dx / length) * t,
          z = graph.z[a] + (dz / length) * t;
        const { distance, nearest } = distanceToRing(x, z, shore);
        if (distance > SHORE_DISTANCE || distance < 0.12) continue;
        // Sit just beside the path on the lake side, looking at the water.
        const toLake = Math.atan2(nearest[0] - x, nearest[1] - z);
        benches.push({
          x: x + Math.sin(toLake) * 0.1,
          z: z + Math.cos(toLake) * 0.1,
          angle: toLake,
        });
      }
      carried = (carried + length) % BENCH_SPACING;
    }
  return benches;
}

function useInstances(
  ref: React.RefObject<THREE.InstancedMesh | null>,
  placements: Placement[],
  y: number,
) {
  const { invalidate } = useThree();
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new THREE.Object3D();
    placements.forEach((p, i) => {
      o.position.set(p.x, y, p.z);
      o.rotation.set(0, p.angle, 0);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.count = placements.length;
    mesh.instanceMatrix.needsUpdate = true;
    invalidate();
  }, [ref, placements, y, invalidate]);
}

/**
 * The park's furniture: lamp posts along the paths that glow and pool warm light
 * after dark, benches facing Silver Lake, and play equipment on the mapped
 * playgrounds, whose swings sway gently while motion is on. Nothing to tap.
 */
export function ParkFurniture({
  afterDark,
  motion,
  visible = true,
}: {
  afterDark: number;
  motion: boolean;
  visible?: boolean;
}) {
  const [graph, setGraph] = useState<PathGraph | null>(null);
  useEffect(() => {
    let current = true;
    void loadPaths().then((loaded) => {
      if (current && loaded) setGraph(loaded);
    });
    return () => {
      current = false;
    };
  }, []);
  const lamps = useMemo(() => (graph ? lampPlacements(graph) : []), [graph]);
  const benches = useMemo(() => (graph ? benchPlacements(graph) : []), [graph]);
  // Equipment by playground size: swings on the big ones, then slides, then climbers.
  const play = useMemo(() => {
    const swings: Placement[] = [],
      slides: Placement[] = [],
      climbers: Placement[] = [];
    for (const p of features.playgrounds) {
      const place = { x: p.x, z: p.z, angle: -p.angle };
      if (p.length >= 0.55) swings.push(place);
      else if (p.length >= 0.35) slides.push(place);
      else climbers.push(place);
    }
    return { swings, slides, climbers };
  }, []);
  const parts = useMemo(
    () => ({
      post: paint(
        (() => {
          const g = new THREE.CylinderGeometry(0.0045, 0.006, 0.17, 6);
          g.translate(0, 0.085, 0);
          return g;
        })(),
        '#2c3832',
      ),
      head: (() => {
        const g = new THREE.SphereGeometry(0.013, 10, 8);
        g.translate(0, 0.175, 0);
        return g;
      })(),
      pool: new THREE.CircleGeometry(0.16, 20).rotateX(-Math.PI / 2),
      bench: benchGeometry(),
      swingFrame: swingFrame(),
      swingSeat: swingSeat(),
      slide: slideGeometry(),
      climber: climberGeometry(),
    }),
    [],
  );
  useEffect(
    () => () => Object.values(parts).forEach((g) => g.dispose()),
    [parts],
  );

  const posts = useRef<THREE.InstancedMesh>(null),
    heads = useRef<THREE.InstancedMesh>(null),
    pools = useRef<THREE.InstancedMesh>(null),
    benchMesh = useRef<THREE.InstancedMesh>(null),
    frames = useRef<THREE.InstancedMesh>(null),
    seats = useRef<THREE.InstancedMesh>(null),
    slideMesh = useRef<THREE.InstancedMesh>(null),
    climberMesh = useRef<THREE.InstancedMesh>(null);
  useInstances(posts, lamps, GROUND_Y);
  useInstances(heads, lamps, GROUND_Y);
  useInstances(pools, lamps, GROUND_Y + 0.004);
  useInstances(benchMesh, benches, GROUND_Y);
  useInstances(frames, play.swings, 0.1);
  useInstances(slideMesh, play.slides, 0.1);
  useInstances(climberMesh, play.climbers, 0.1);

  // Two seats per swing frame, swaying gently while motion is on.
  const time = useRef(0);
  const seatObject = useMemo(() => new THREE.Object3D(), []);
  const { invalidate } = useThree();
  useFrame((_, delta) => {
    const mesh = seats.current;
    if (!mesh) return;
    if (motion) time.current += Math.min(delta, 0.05);
    play.swings.forEach((p, i) => {
      for (let k = 0; k < 2; k++) {
        const along = k ? 0.055 : -0.055;
        seatObject.position.set(
          p.x + Math.cos(p.angle) * along,
          0.1 + 0.152,
          p.z - Math.sin(p.angle) * along,
        );
        seatObject.rotation.set(0, p.angle, 0);
        seatObject.rotateX(
          motion ? Math.sin(time.current * 1.6 + i * 1.3 + k * 2.1) * 0.35 : 0,
        );
        seatObject.updateMatrix();
        mesh.setMatrixAt(i * 2 + k, seatObject.matrix);
      }
    });
    mesh.count = play.swings.length * 2;
    mesh.instanceMatrix.needsUpdate = true;
  });
  useEffect(() => invalidate(), [motion, invalidate]);

  const lampCapacity = Math.max(1, lamps.length);
  return (
    <group visible={visible} name="park-furniture">
      <instancedMesh
        key={'posts' + lampCapacity}
        ref={posts}
        args={[parts.post, undefined, lampCapacity]}
        count={0}
        frustumCulled={false}
        castShadow
        raycast={noRaycast}
      >
        <meshStandardMaterial vertexColors roughness={0.6} metalness={0.3} />
      </instancedMesh>
      <instancedMesh
        key={'heads' + lampCapacity}
        ref={heads}
        args={[parts.head, undefined, lampCapacity]}
        count={0}
        frustumCulled={false}
        raycast={noRaycast}
      >
        <meshStandardMaterial
          color="#fff4dc"
          emissive="#ffc46b"
          emissiveIntensity={0.15 + afterDark * 1.6}
          roughness={0.4}
        />
      </instancedMesh>
      <instancedMesh
        key={'pools' + lampCapacity}
        ref={pools}
        args={[parts.pool, undefined, lampCapacity]}
        count={0}
        frustumCulled={false}
        visible={afterDark > 0.05}
        raycast={noRaycast}
        renderOrder={1}
      >
        <meshBasicMaterial
          color="#ffcf8a"
          transparent
          opacity={afterDark * 0.14}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </instancedMesh>
      <instancedMesh
        key={'benches' + benches.length}
        ref={benchMesh}
        args={[parts.bench, undefined, Math.max(1, benches.length)]}
        count={0}
        frustumCulled={false}
        castShadow
        raycast={noRaycast}
      >
        <meshStandardMaterial vertexColors roughness={0.85} />
      </instancedMesh>
      <instancedMesh
        ref={frames}
        args={[parts.swingFrame, undefined, Math.max(1, play.swings.length)]}
        count={0}
        frustumCulled={false}
        castShadow
        raycast={noRaycast}
      >
        <meshStandardMaterial vertexColors roughness={0.6} />
      </instancedMesh>
      <instancedMesh
        ref={seats}
        args={[parts.swingSeat, undefined, Math.max(1, play.swings.length * 2)]}
        count={0}
        frustumCulled={false}
        raycast={noRaycast}
      >
        <meshStandardMaterial vertexColors roughness={0.7} />
      </instancedMesh>
      <instancedMesh
        ref={slideMesh}
        args={[parts.slide, undefined, Math.max(1, play.slides.length)]}
        count={0}
        frustumCulled={false}
        castShadow
        raycast={noRaycast}
      >
        <meshStandardMaterial vertexColors roughness={0.55} />
      </instancedMesh>
      <instancedMesh
        ref={climberMesh}
        args={[parts.climber, undefined, Math.max(1, play.climbers.length)]}
        count={0}
        frustumCulled={false}
        castShadow
        raycast={noRaycast}
      >
        <meshStandardMaterial vertexColors roughness={0.55} />
      </instancedMesh>
    </group>
  );
}
