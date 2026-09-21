'use client';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Layers } from 'lucide-react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { Idea } from '@/lib/garden';
import { useFreshHighlight } from './use-fresh-highlight';
import {
  growthForLikes,
  growthStretch,
  plantingScale,
  type GardenMoment,
  seedForId,
  randomAt,
  gardenPalette,
  clusterTargets,
} from '@/lib/garden-visuals';
import { ideaTheme } from '@/features/park/themes';
import { parkPlotPosition as plotPosition } from '@/features/park/plots';
const noRaycast = () => {};
const growthKeys = [
  'height',
  'fullness',
  'flowers',
  'branches',
  'planted',
] as const;
export type ForestProps = {
  anchorHeights?: Record<string, number>;
  discoveryId?: string | null;
  ideas: Idea[];
  motion: boolean;
  moment: GardenMoment | null;
  momentReady: RefObject<boolean>;
  onMomentComplete: (serial: number) => void;
  selected: string | null;
  plantingId: string | null;
  highlightId: string | null;
  onHighlighted: () => void;
  onPlanted: () => void;
  onSelect: (id: string) => void;
  onCluster: (ids: string[]) => void;
};
// Six instanced draws for the entire grove: trunks, canopies, branches, leaves,
// petals and flower centres. Capacities are fixed; likes never allocate more meshes.
export function Forest(props: ForestProps) {
  const { onPlanted, motion } = props;
  const refs = useRef<(THREE.InstancedMesh | null)[]>([]),
    states = useRef(
      new Map<
        string,
        ReturnType<typeof growthForLikes> & { planted: number }
      >(),
    );
  const momentState = useRef({ serial: -1, progress: -1, done: false });
  const halo = useRef<THREE.Mesh>(null),
    haloMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const object = useMemo(() => new THREE.Object3D(), []),
    color = useMemo(() => new THREE.Color(), []);
  const flowerShape = useMemo(() => {
    const shape = new THREE.Shape();
    for (let i = 0; i <= 36; i++) {
      const angle = (i / 36) * Math.PI * 2,
        radius = 0.76 + 0.24 * Math.cos(angle * 6);
      const x = Math.cos(angle) * radius,
        y = Math.sin(angle) * radius;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    return shape;
  }, []);
  const { invalidate } = useThree();
  const rows = useMemo(
    () =>
      props.ideas.slice(0, 24).map((idea, index) => ({
        idea,
        seed: seedForId(idea.id),
        pos: plotPosition(idea.plot ?? index),
        target: growthForLikes(idea.waters),
      })),
    [props.ideas],
  );
  function pickTree(event: ThreeEvent<MouseEvent>, canopies = false) {
    if (event.delta > 5 || event.instanceId === undefined) return;
    const row = rows[Math.floor(event.instanceId / (canopies ? 3 : 1))];
    if (row) {
      event.stopPropagation();
      props.onSelect(row.idea.id);
    }
  }
  const batchCounts = useRef([0, 0, 0, 0, 0, 0]);
  const dirty = useRef(true),
    time = useRef(0);
  useEffect(() => {
    const ids = new Set(rows.map((r) => r.idea.id));
    for (const id of states.current.keys())
      if (!ids.has(id)) states.current.delete(id);
    for (const row of rows) {
      const state = states.current.get(row.idea.id);
      if (!state)
        states.current.set(row.idea.id, { ...row.target, planted: 1 });
    }
    if (props.moment && momentState.current.serial !== props.moment.serial) {
      const row = rows.find((row) => row.idea.id === props.moment!.id);
      if (row) {
        states.current.set(row.idea.id, {
          ...growthForLikes(props.moment.fromLikes),
          planted: props.moment.kind === 'plant' && motion ? 0.025 : 1,
        });
        momentState.current = {
          serial: props.moment.serial,
          progress: 0,
          done: false,
        };
      }
    }
    dirty.current = true;
    invalidate();
  }, [rows, motion, props.moment, invalidate]);
  useFrame((_, delta) => {
    if (props.motion) time.current += Math.min(delta, 0.05);
    if (refs.current.some((m) => !m)) return;
    const easing = props.motion ? 1 - Math.exp(-Math.min(delta, 0.05) * 9) : 1;
    const counts = batchCounts.current,
      palette = gardenPalette;
    // Only foliage transforms continuously. Flowers and branches upload during growth; paused scenes upload once.
    if (!props.motion && !dirty.current && !props.moment) return;
    let moving = false,
      rebuild = dirty.current;
    for (const { idea, target } of rows) {
      const state = states.current.get(idea.id);
      if (!state) continue;
      const celebrating =
        props.moment?.id === idea.id && !momentState.current.done;
      if (celebrating) {
        if (!props.momentReady.current) continue;
        const progress = (momentState.current.progress = props.motion
          ? Math.min(
              1,
              momentState.current.progress + Math.min(delta, 0.05) / 1.45,
            )
          : 1);
        if (props.moment!.kind === 'plant')
          state.planted = plantingScale(progress);
        rebuild = true;
        moving = true;
        if (progress >= 1) {
          momentState.current.done = true;
          if (props.moment!.kind === 'plant') onPlanted();
          props.onMomentComplete(props.moment!.serial);
        }
      }
      for (const key of growthKeys) {
        if (key === 'planted' && celebrating && props.moment!.kind === 'plant')
          continue;
        const end = key === 'planted' ? 1 : target[key];
        if (state[key] !== end) rebuild = true;
        state[key] += (end - state[key]) * easing;
        if (Math.abs(end - state[key]) < 0.002) state[key] = end;
        else moving = true;
      }
    }
    if (rebuild) counts.fill(0);
    else counts[1] = 0;
    function put(
      batch: number,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
      rx = 0,
      ry = 0,
      rz = 0,
      tint?: string,
    ) {
      const mesh = refs.current[batch]!;
      object.position.set(x, y, z);
      object.scale.set(sx, sy, sz);
      object.rotation.set(rx, ry, rz);
      object.updateMatrix();
      mesh.setMatrixAt(counts[batch], object.matrix);
      if (tint && rebuild) mesh.setColorAt(counts[batch], color.set(tint));
      counts[batch]++;
    }
    for (const {
      idea,
      seed,
      pos: [x, z],
    } of rows) {
      const state = states.current.get(idea.id);
      if (!state) continue;
      const pulse =
        props.moment?.id === idea.id &&
        props.moment.kind === 'like' &&
        props.momentReady.current
          ? growthStretch(momentState.current.progress)
          : 1;
      const p = state.planted,
        h = (0.88 + randomAt(seed, 0) * 0.18) * state.height * p * pulse,
        fullness = state.fullness,
        sway = props.motion
          ? Math.sin(time.current * 0.8 + randomAt(seed, 1) * 6) * 0.016
          : 0,
        crown = palette.foliage[seed % 3],
        width = (0.2 + fullness * 0.26) * p * (1 + (pulse - 1) * 0.5);
      if (rebuild)
        put(0, x, 0.16 + h * 0.38, z, 0.055 * p, h * 0.76, 0.055 * p);
      put(
        1,
        x + sway,
        0.16 + h * 0.82,
        z,
        width,
        h * 0.36,
        width,
        0,
        randomAt(seed, 2) * 3,
        0,
        crown,
      );
      // Two small secondary crowns appear gradually as the sapling matures.
      for (let i = 0; i < 2; i++) {
        const scale = Math.max(0.03, (fullness - 0.3) * 1.3) * p;
        put(
          1,
          x + (i ? 1 : -1) * width * 0.65 + sway,
          0.16 + h * (0.62 + i * 0.07),
          z + 0.03,
          0.26 * scale,
          0.32 * scale,
          0.25 * scale,
          0,
          i,
          0,
          crown,
        );
      }
      if (!rebuild) continue;
      for (let i = 0; i < 2; i++) {
        const born = Math.min(1, Math.max(0, state.branches - i));
        if (born < 0.001) continue;
        const side = i ? 1 : -1,
          by = 0.16 + h * (0.5 + i * 0.1);
        put(
          2,
          x + side * 0.16 * p,
          by,
          z,
          0.024 * p,
          0.34 * born * p,
          0.024 * p,
          0,
          0,
          -side * 0.65,
        );
        put(
          3,
          x + side * 0.27 * p,
          by + 0.17 * born * p,
          z,
          0.18 * born * p,
          0.23 * born * p,
          0.18 * born * p,
          0,
          0,
          0,
          crown,
        );
      }
      for (let i = 0; i < Math.ceil(state.flowers); i++) {
        const born = Math.min(1, Math.max(0, state.flowers - i)) * p;
        if (born < 0.001) continue;
        const a = randomAt(seed, 20 + i) * Math.PI * 2,
          r = 0.43 + randomAt(seed, 40 + i) * 0.22,
          fx = x + Math.cos(a) * r,
          fz = z + Math.sin(a) * r;
        put(
          4,
          fx,
          0.17,
          fz,
          0.085 * born,
          0.085 * born,
          0.085 * born,
          -Math.PI / 2,
          0,
          a,
          palette.flower[i % 4],
        );
        put(
          5,
          fx,
          0.178,
          fz,
          0.026 * born,
          0.026 * born,
          0.026 * born,
          -Math.PI / 2,
          0,
          0,
        );
      }
    }
    if (halo.current && haloMaterial.current) {
      const moment = props.moment;
      const row = moment && rows.find((row) => row.idea.id === moment.id);
      const t = momentState.current.progress;
      halo.current.visible =
        !!row && props.motion && props.momentReady.current && t >= 0 && t < 1;
      if (row) {
        halo.current.position.set(row.pos[0], 0.17, row.pos[1]);
        halo.current.scale.setScalar(0.3 + t * 1.3);
        haloMaterial.current.opacity = (1 - t) * 0.4;
      }
    }
    refs.current.forEach((mesh, i) => {
      if (mesh && (rebuild || i === 1)) {
        mesh.count = counts[i];
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor && rebuild)
          mesh.instanceColor.needsUpdate = true;
      }
    });
    dirty.current = false;
    if (moving) invalidate();
  });
  return (
    <>
      <instancedMesh
        name="idea-trunks"
        ref={(m) => {
          refs.current[0] = m;
        }}
        args={[undefined, undefined, 24]}
        castShadow
        frustumCulled={false}
        onClick={(event) => pickTree(event)}
      >
        <cylinderGeometry args={[0.8, 1, 1, 6]} />
        <meshStandardMaterial color="#85754e" roughness={1} />
      </instancedMesh>
      <instancedMesh
        name="idea-canopies"
        ref={(m) => {
          refs.current[1] = m;
        }}
        args={[undefined, undefined, 72]}
        castShadow
        frustumCulled={false}
        onClick={(event) => pickTree(event, true)}
      >
        <icosahedronGeometry args={[1, 2]} />
        <meshStandardMaterial roughness={0.88} />
      </instancedMesh>
      <instancedMesh
        name="idea-branches"
        ref={(m) => {
          refs.current[2] = m;
        }}
        args={[undefined, undefined, 48]}
        frustumCulled={false}
        raycast={noRaycast}
      >
        <cylinderGeometry args={[0.7, 1, 1, 5]} />
        <meshStandardMaterial color="#85754e" />
      </instancedMesh>
      <instancedMesh
        name="idea-leaves"
        ref={(m) => {
          refs.current[3] = m;
        }}
        args={[undefined, undefined, 48]}
        frustumCulled={false}
        raycast={noRaycast}
      >
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial flatShading />
      </instancedMesh>
      <instancedMesh
        name="idea-flowers"
        ref={(m) => {
          refs.current[4] = m;
        }}
        args={[undefined, undefined, 288]}
        frustumCulled={false}
        raycast={noRaycast}
      >
        <shapeGeometry args={[flowerShape]} />
        <meshStandardMaterial side={THREE.DoubleSide} />
      </instancedMesh>
      <instancedMesh
        name="idea-flower-centres"
        ref={(m) => {
          refs.current[5] = m;
        }}
        args={[undefined, undefined, 288]}
        frustumCulled={false}
        raycast={noRaycast}
      >
        <circleGeometry args={[1, 8]} />
        <meshBasicMaterial color="#a17a42" />
      </instancedMesh>
      <mesh
        ref={halo}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
        raycast={noRaycast}
      >
        <ringGeometry args={[0.94, 1, 40]} />
        <meshBasicMaterial
          ref={haloMaterial}
          color="#edf7c9"
          transparent
          depthWrite={false}
        />
      </mesh>
      {!props.moment && <TreeMarkers {...props} />}
    </>
  );
}
function markerHeight(idea: Idea) {
  const base = 0.88 + randomAt(seedForId(idea.id), 0) * 0.18;
  return 0.36 + base * growthForLikes(idea.waters).height * 1.18;
}
export function TreeMarkers({
  anchorHeights,
  discoveryId,
  ideas,
  selected,
  onSelect,
  onCluster,
  highlightId,
  onHighlighted,
}: ForestProps) {
  const [revealedId, setRevealedId] = useState<string | null>(null);
  useEffect(() => {
    if (!revealedId) return;
    const timer = setTimeout(() => setRevealedId(null), 2400);
    return () => clearTimeout(timer);
  }, [revealedId]);
  const { camera, size } = useThree();
  const [groups, setGroups] = useState<ReturnType<typeof clusterTargets>>([]);
  const previous = useRef(new THREE.Matrix4()),
    projection = useRef(new THREE.Matrix4()),
    version = useRef(''),
    point = useMemo(() => new THREE.Vector3(), []);
  const key =
    ideas.map((i) => `${i.id}:${i.plot}:${i.waters}`).join(':') +
    size.width +
    ':' +
    size.height +
    JSON.stringify(anchorHeights || {});
  useFrame(() => {
    if (
      version.current === key &&
      previous.current.equals(camera.matrixWorld) &&
      projection.current.equals(camera.projectionMatrix)
    )
      return;
    previous.current.copy(camera.matrixWorld);
    projection.current.copy(camera.projectionMatrix);
    version.current = key;
    setGroups(
      clusterTargets(
        ideas.slice(0, 24).map((idea, index) => {
          const [x, z] = plotPosition(idea.plot ?? index);
          point
            .set(x, anchorHeights?.[idea.id] ?? markerHeight(idea), z)
            .project(camera);
          return {
            x: ((point.x + 1) * size.width) / 2,
            y: ((1 - point.y) * size.height) / 2,
            index,
          };
        }),
      ),
    );
  });
  return (
    <>
      {groups.map((group) => {
        const members = group.indices.map((i) => ideas[i]).filter(Boolean);
        if (!members.length) return null;
        const position = new THREE.Vector3();
        for (const idea of members) {
          const index = ideas.indexOf(idea),
            [x, z] = plotPosition(idea.plot ?? index);
          position.add(
            new THREE.Vector3(
              x,
              anchorHeights?.[idea.id] ?? markerHeight(idea),
              z,
            ),
          );
        }
        position.divideScalar(members.length);
        const active = members.some((i) => i.id === selected);
        return (
          <TreeMarker
            key={members.map((i) => i.id).join(':')}
            members={members}
            discoveryTitle={members.find((i) => i.id === discoveryId)?.title}
            position={position}
            tooltipOffset={
              Math.max(126, Math.min(size.width - 126, group.x)) - group.x
            }
            active={active}
            fresh={members.some((i) => i.id === highlightId)}
            onSeen={() => {
              setRevealedId(highlightId);
              onHighlighted();
            }}
            showCue={members.some((i) => i.id === revealedId)}
            onSelect={onSelect}
            onCluster={onCluster}
          />
        );
      })}
    </>
  );
}

function TreeMarker({
  discoveryTitle,
  tooltipOffset,
  members,
  position,
  active,
  fresh,
  onSeen,
  showCue,
  onSelect,
  onCluster,
}: {
  discoveryTitle?: string;
  tooltipOffset: number;
  members: Idea[];
  position: THREE.Vector3;
  active: boolean;
  fresh: boolean;
  onSeen: () => void;
  showCue: boolean;
  onSelect: (id: string) => void;
  onCluster: (ids: string[]) => void;
}) {
  const { ref: cueRef, highlighted } = useFreshHighlight<HTMLButtonElement>(
    fresh,
    onSeen,
  );
  const single = members.length === 1,
    idea = members[0];
  return (
    <Html
      position={position}
      center
      zIndexRange={discoveryTitle ? [23, 21] : [20, 0]}
    >
      <button
        ref={cueRef}
        className={`plant-marker garden-target ${active ? 'selected' : ''} ${single ? '' : 'cluster-marker'} ${highlighted || showCue ? 'is-fresh' : ''} ${highlighted ? 'is-arriving' : ''} ${discoveryTitle ? 'is-discovery' : ''}`}
        aria-label={
          single
            ? `Read idea: ${idea.title}`
            : `Choose from ${members.length} nearby ideas`
        }
        onClick={(e) => {
          e.stopPropagation();
          if (single) onSelect(idea.id);
          else onCluster(members.map((i) => i.id));
        }}
      >
        <span className="marker-face">
          {single ? (
            <span
              className="marker-dot"
              style={{ background: ideaTheme(idea).color }}
            />
          ) : (
            <>
              <Layers size={12} />
              <span>{members.length}</span>
            </>
          )}
        </span>
        {(highlighted || showCue) && (
          <span className="fresh-tree-label" aria-hidden="true">
            Your tree{single ? '' : ' is here'}
          </span>
        )}
        <span
          className="plant-tooltip"
          style={discoveryTitle ? { marginLeft: tooltipOffset } : undefined}
        >
          {discoveryTitle ||
            (single ? idea.title : `${members.length} nearby ideas`)}
        </span>
      </button>
    </Html>
  );
}
