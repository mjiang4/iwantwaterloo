'use client';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { GROVE_SIZE, type Idea } from '@/lib/garden';
import { useFreshHighlight } from './use-fresh-highlight';
import {
  growthForLikes,
  growthStretch,
  plantingScale,
  type GardenMoment,
  seedForId,
  randomAt,
  plotPosition,
  gardenPalette,
  hitTreeTargets,
} from '@/lib/garden-visuals';
const noRaycast = () => {};
const growthKeys = [
  'height',
  'fullness',
  'flowers',
  'fruits',
  'branches',
  'planted',
] as const;
type ForestProps = {
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
// Eight instanced draws for the entire grove, including canopy fruit and
// interaction-only sparkles. Fixed capacities keep geometry bounded on mobile.
export function Forest(props: ForestProps) {
  const { onPlanted, motion } = props;
  const refs = useRef<(THREE.InstancedMesh | null)[]>([]),
    states = useRef(
      new Map<
        string,
        ReturnType<typeof growthForLikes> & { planted: number }
      >(),
    );
  const sparkle = useRef({ key: '', id: '', elapsed: 2 });
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
      props.ideas.slice(0, GROVE_SIZE).map((idea, index) => ({
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
      const ids = [
        ...new Set(
          event.intersections.flatMap((hit) => {
            if (hit.instanceId === undefined) return [];
            const divisor =
              hit.object.name === 'idea-canopies'
                ? 3
                : hit.object.name === 'idea-trunks'
                  ? 1
                  : 0;
            const candidate = divisor
              ? rows[Math.floor(hit.instanceId / divisor)]
              : null;
            return candidate ? [candidate.idea.id] : [];
          }),
        ),
      ];
      if (ids.length > 1) props.onCluster(ids);
      else props.onSelect(row.idea.id);
    }
  }
  const batchCounts = useRef([0, 0, 0, 0, 0, 0, 0, 0]);
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
    const sparkleKey = `${props.selected}:${props.moment?.serial ?? -1}`;
    if (sparkle.current.key !== sparkleKey) {
      const chosen = rows.find(
        (r) => r.idea.id === (props.moment?.id ?? props.selected),
      );
      sparkle.current = {
        key: sparkleKey,
        id: chosen?.idea.id ?? '',
        elapsed: motion && chosen && chosen.idea.waters >= 30 ? 0 : 2,
      };
    }
    dirty.current = true;
    invalidate();
  }, [rows, motion, props.moment, props.selected, invalidate]);
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
    if (sparkle.current.elapsed < 1.2) {
      sparkle.current.elapsed = props.motion
        ? Math.min(1.2, sparkle.current.elapsed + Math.min(delta, 0.05))
        : 1.2;
      rebuild = true;
      moving ||= sparkle.current.elapsed < 1.2;
    }
    if (rebuild) counts.fill(0);
    else {
      counts[1] = 0;
      counts[6] = 0;
    }
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
      for (let i = 0; i < Math.ceil(state.fruits); i++) {
        const born = Math.min(1, Math.max(0, state.fruits - i));
        const angle = i * 2.39996 + randomAt(seed, 70) * Math.PI * 2;
        const vertical = -0.5 + randomAt(seed, 80 + i) * 0.8;
        const radius = Math.sqrt(1 - vertical * vertical) * width;
        const fruitSize = 0.095 * born * p;
        put(
          6,
          x + Math.cos(angle) * radius + sway,
          0.16 + h * (0.82 + vertical * 0.36),
          z + Math.sin(angle) * radius,
          fruitSize,
          fruitSize * 1.05,
          fruitSize,
          0,
          angle,
          0,
          ['#d76549', '#edb955', '#dd8654'][seed % 3],
        );
      }
      if (!rebuild) continue;
      if (
        sparkle.current.id === idea.id &&
        sparkle.current.elapsed < 1.2 &&
        props.motion
      ) {
        const t = sparkle.current.elapsed / 1.2;
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          const size =
            Math.sin(Math.PI * t) * (0.045 + randomAt(seed, 110 + i) * 0.04);
          put(
            7,
            x + Math.cos(a) * (width + 0.12 + t * 0.18),
            0.16 + h * (0.65 + randomAt(seed, 100 + i) * 0.55) + t * 0.2,
            z + Math.sin(a) * (width + 0.12 + t * 0.18),
            size * 0.55,
            size * 1.8,
            size * 0.55,
            0,
            a,
            0,
          );
        }
      }
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
      if (mesh && (rebuild || i === 1 || i === 6)) {
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
        args={[undefined, undefined, GROVE_SIZE]}
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
        args={[undefined, undefined, GROVE_SIZE * 3]}
        castShadow
        frustumCulled={false}
        onClick={(event) => pickTree(event, true)}
      >
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial roughness={1} flatShading />
      </instancedMesh>
      <instancedMesh
        name="idea-branches"
        ref={(m) => {
          refs.current[2] = m;
        }}
        args={[undefined, undefined, GROVE_SIZE * 2]}
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
        args={[undefined, undefined, GROVE_SIZE * 2]}
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
        args={[undefined, undefined, GROVE_SIZE * 12]}
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
        args={[undefined, undefined, GROVE_SIZE * 12]}
        frustumCulled={false}
        raycast={noRaycast}
      >
        <circleGeometry args={[1, 8]} />
        <meshBasicMaterial color="#a17a42" />
      </instancedMesh>
      <instancedMesh
        name="idea-fruit"
        ref={(m) => {
          refs.current[6] = m;
        }}
        args={[undefined, undefined, GROVE_SIZE * 8]}
        frustumCulled={false}
        raycast={noRaycast}
      >
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial roughness={0.65} />
      </instancedMesh>
      <instancedMesh
        name="idea-sparkles"
        ref={(m) => {
          refs.current[7] = m;
        }}
        args={[undefined, undefined, 8]}
        frustumCulled={false}
        raycast={noRaycast}
      >
        <octahedronGeometry args={[1, 0]} />
        <meshBasicMaterial color="#fff3b4" toneMapped={false} />
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
  return 0.16 + base * growthForLikes(idea.waters).height * 0.82;
}
function TreeMarkers({
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
  return (
    <>
      {ideas.slice(0, GROVE_SIZE).map((idea, index) => {
        const [x, z] = plotPosition(idea.plot ?? index);
        return (
          <TreeMarker
            key={idea.id}
            idea={idea}
            position={new THREE.Vector3(x, markerHeight(idea), z)}
            active={idea.id === selected}
            fresh={idea.id === highlightId}
            onSeen={() => {
              setRevealedId(highlightId);
              onHighlighted();
            }}
            showCue={idea.id === revealedId}
            onSelect={onSelect}
            onCluster={onCluster}
          />
        );
      })}
    </>
  );
}
function TreeMarker({
  idea,
  position,
  active,
  fresh,
  onSeen,
  showCue,
  onSelect,
  onCluster,
}: {
  idea: Idea;
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
  const press = useRef<{ x: number; y: number } | null>(null);
  return (
    <Html position={position} center zIndexRange={[20, 0]}>
      <button
        ref={cueRef}
        data-tree-target={idea.id}
        className={`plant-marker garden-target tree-hit-target ${active ? 'selected' : ''} ${highlighted || showCue ? 'is-fresh' : ''}`}
        aria-label={`Read idea: ${idea.title}`}
        onPointerDown={(e) => {
          press.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerCancel={() => {
          press.current = null;
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (e.detail === 0) {
            onSelect(idea.id);
            return;
          }
          if (
            press.current &&
            Math.hypot(
              e.clientX - press.current.x,
              e.clientY - press.current.y,
            ) > 8
          )
            return;
          const stage = e.currentTarget.closest('.garden-stage');
          const targets = Array.from(
            stage?.querySelectorAll<HTMLElement>('[data-tree-target]') ?? [],
          ).map((el) => {
            const { left, top, right, bottom } = el.getBoundingClientRect();
            return { id: el.dataset.treeTarget!, left, top, right, bottom };
          });
          const ids = hitTreeTargets(targets, e.clientX, e.clientY);
          if (ids.length > 1) onCluster(ids);
          else onSelect(idea.id);
        }}
      >
        <span className="marker-face" aria-hidden="true">
          <span className="marker-dot" />
        </span>
        {(highlighted || showCue) && (
          <span className="fresh-tree-label" aria-hidden="true">
            Your tree
          </span>
        )}
        <span className="plant-tooltip" aria-hidden="true">
          {idea.title}
        </span>
      </button>
    </Html>
  );
}
