'use client';
/* oxlint-disable react/react-compiler -- R3F owns mutable scene objects and GPU buffers; frame updates intentionally bypass React state. */
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  OrbitControls,
  RoundedBox,
  PerformanceMonitor,
} from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Idea } from '@/lib/garden';
import { Forest } from './garden-forest';
import { GardenButterfly } from './garden-butterfly';
import { inviteButterfly, type ButterflyVisit } from '@/lib/garden-discovery';
import {
  Atmosphere,
  Meadow,
  GardenLighting,
  GardenGround,
  Ripple,
  type GardenEvent,
} from './garden-ambience';
import {
  gardenPalette,
  plotPosition,
  type GardenMoment,
} from '@/lib/garden-visuals';
type Props = {
  ideas: Idea[];
  selected: string | null;
  focusId: string | null;
  moment: GardenMoment | null;
  onMomentComplete: (serial: number) => void;
  onSelect: (id: string) => void;
  motion: boolean;
  night: boolean;
  plantingId: string | null;
  highlightId: string | null;
  onHighlighted: () => void;
  butterflyVisit: RefObject<ButterflyVisit>;
  onPlanted: () => void;
  onCluster: (ids: string[]) => void;
  zoom: number;
  reset: number;
  onFailure: () => void;
};
function Box({
  at,
  size,
  color,
  glow = 0,
  ...rest
}: {
  at: [number, number, number];
  size: [number, number, number];
  color: string;
  glow?: number;
  rotation?: [number, number, number];
}) {
  return (
    <mesh position={at} castShadow receiveShadow {...rest}>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={glow}
        roughness={0.8}
      />
    </mesh>
  );
}
function Pavilion() {
  return (
    <group position={[-1.9, 0.1, -2.6]} rotation={[0, 0.15, 0]}>
      <Box at={[0, 0.15, 0]} size={[2.3, 0.3, 1.3]} color="#e6dac3" />
      <Box at={[0, 0.6, -0.22]} size={[2, 1, 0.9]} color="#e3d9b8" />
      <Box at={[0, 0.72, 0.3]} size={[1.9, 0.72, 0.035]} color="#6b9691" />
      {[-0.8, -0.4, 0, 0.4, 0.8].map((x) => (
        <Box
          key={x}
          at={[x, 0.72, 0.34]}
          size={[0.04, 0.9, 0.09]}
          color="#e9e0c8"
        />
      ))}
      <Box at={[0, 1.16, 0]} size={[2.35, 0.15, 1.4]} color="#e5dfc9" />
      <Box at={[0, 1.27, 0]} size={[2.08, 0.08, 1.13]} color="#8d9f5b" />
      <Box at={[0.82, 0.3, 0.84]} size={[0.55, 0.16, 0.62]} color="#d3c7ae" />
      <Box at={[0.82, 0.16, 1.12]} size={[0.65, 0.1, 0.25]} color="#ded5bf" />
    </group>
  );
}
function WindowLights({ night }: { night: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    if (!mesh.current) return;
    const matrix = new THREE.Matrix4();
    let n = 0;
    for (let i = 0; i < 3; i++)
      for (const x of [-0.16, 0.16])
        for (const y of [0.5, 0.94])
          mesh.current.setMatrixAt(
            n++,
            matrix.makeTranslation((i - 1) * 0.64 + x, y, 0.345),
          );
    mesh.current.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <instancedMesh
      name="windows"
      ref={mesh}
      args={[undefined, undefined, 12]}
      frustumCulled={false}
    >
      <boxGeometry args={[0.12, 0.22, 0.015]} />
      <meshStandardMaterial
        color={night ? '#f5ce8a' : '#476a6a'}
        emissive="#f5ce8a"
        emissiveIntensity={night ? 0.8 : 0}
      />
    </instancedMesh>
  );
}
function BridgePlanks() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    if (!mesh.current) return;
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < 26; i++)
      mesh.current.setMatrixAt(
        i,
        matrix.makeTranslation(-1.86 + i * 0.15, 0.075, 0),
      );
    mesh.current.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <instancedMesh
      name="bridge-planks"
      ref={mesh}
      args={[undefined, undefined, 26]}
      frustumCulled={false}
    >
      <boxGeometry args={[0.019, 0.015, 0.43]} />
      <meshStandardMaterial color="#aa916d" />
    </instancedMesh>
  );
}
function Townhouses({ night }: { night: boolean }) {
  return (
    <group position={[3.2, 0.1, -2.8]} rotation={[0, -0.25, 0]}>
      {['#d4aa84', '#e7d8bd', '#bb795b'].map((c, i) => (
        <group key={c} position={[(i - 1) * 0.64, 0, 0]}>
          <Box at={[0, 0.63, 0]} size={[0.58, 1.26, 0.68]} color={c} />
          <mesh
            position={[0, 1.49, 0]}
            rotation={[0, Math.PI / 4, 0]}
            castShadow
          >
            <coneGeometry args={[0.46, 0.52, 4]} />
            <meshStandardMaterial color="#586b63" />
          </mesh>
          <Box at={[0, 0.18, 0.35]} size={[0.16, 0.36, 0.02]} color="#516956" />
        </group>
      ))}
      <WindowLights night={night} />
    </group>
  );
}
function Goose({
  at,
  rotate = 0,
  event,
  motion,
  onTap,
}: {
  at: [number, number, number];
  rotate?: number;
  event?: GardenEvent | null;
  motion?: boolean;
  onTap?: () => void;
}) {
  const ref = useRef<THREE.Group>(null),
    t = useRef(1),
    { invalidate } = useThree();
  useEffect(() => {
    t.current = event?.kind === 'goose' ? 0 : 1;
    invalidate();
  }, [event, invalidate]);
  useFrame((_, delta) => {
    if (!ref.current || !onTap) return;
    if (!motion) {
      t.current = 1;
      ref.current.position.y = at[1];
      ref.current.rotation.y = rotate + (event?.kind === 'goose' ? 0.25 : 0);
      return;
    }
    t.current = Math.min(1, t.current + Math.min(delta, 0.05) / 0.6);
    ref.current.position.y = at[1] + Math.sin(t.current * Math.PI) * 0.14;
    ref.current.rotation.y = rotate + Math.sin(t.current * Math.PI * 2) * 0.2;
    if (t.current < 1) invalidate();
  });
  return (
    <group
      ref={ref}
      onClick={
        onTap
          ? (e) => {
              e.stopPropagation();
              onTap();
            }
          : undefined
      }
      position={at}
      rotation={[0, rotate, 0]}
      scale={0.7}
    >
      <mesh position={[0, 0.17, 0]} scale={[0.24, 0.15, 0.14]} castShadow>
        <sphereGeometry args={[1, 12, 8]} />
        <meshStandardMaterial color="#eeeee3" />
      </mesh>
      <mesh position={[0.15, 0.34, 0]} rotation={[0, 0, -0.22]}>
        <capsuleGeometry args={[0.047, 0.22, 4, 8]} />
        <meshStandardMaterial color="#36453a" />
      </mesh>
      <mesh position={[0.22, 0.47, 0]}>
        <sphereGeometry args={[0.075, 10, 8]} />
        <meshStandardMaterial color="#36453a" />
      </mesh>
      <Box at={[0.3, 0.46, 0]} size={[0.09, 0.035, 0.05]} color="#bc894b" />
    </group>
  );
}
function Tram({ motion }: { motion: boolean }) {
  const ref = useRef<THREE.Group>(null),
    time = useRef(-3);
  useFrame((_, delta) => {
    if (ref.current && motion) {
      time.current += Math.min(delta, 0.05);
      ref.current.position.x = Math.sin(time.current * 0.12) * 2.8;
    }
  });
  return (
    <group position={[0, 0.12, -4.1]}>
      <Box at={[0, 0, 0]} size={[7.2, 0.06, 0.56]} color="#d7cfb7" />
      {[-0.18, 0.18].map((z) => (
        <Box
          key={z}
          at={[0, 0.035, z]}
          size={[7.2, 0.025, 0.025]}
          color="#7e8982"
        />
      ))}
      <group ref={ref} position={[-1, 0.04, 0]}>
        <RoundedBox
          args={[1.25, 0.36, 0.4]}
          radius={0.1}
          smoothness={3}
          position={[0, 0.25, 0]}
          castShadow
        >
          <meshStandardMaterial color="#f3f4e9" />
        </RoundedBox>
        <Box at={[0, 0.29, 0.205]} size={[0.87, 0.13, 0.01]} color="#3d6c78" />
        <Box at={[0, 0.11, 0.208]} size={[1.1, 0.065, 0.015]} color="#70a7d7" />
        {[-0.35, 0.35].map((x) => (
          <mesh
            key={x}
            position={[x, 0.055, 0.11]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <cylinderGeometry args={[0.07, 0.07, 0.3, 10]} />
            <meshStandardMaterial color="#475a51" />
          </mesh>
        ))}
      </group>
    </group>
  );
}
function World(
  props: Props & { low: boolean; present: boolean; active: boolean },
) {
  const { onFailure } = props;
  const [event, setEvent] = useState<GardenEvent | null>(null);
  const play = (kind: GardenEvent['kind']) => {
    if (kind === 'pond')
      inviteButterfly(
        props.butterflyVisit.current,
        props.motion && !props.night && !props.low,
      );
    setEvent((previous) => ({ kind, serial: (previous?.serial || 0) + 1 }));
  };
  const { size, camera, gl, invalidate } = useThree(),
    controls = useRef<OrbitControlsImpl>(null);
  const [coarse, setCoarse] = useState(true);
  useEffect(() => {
    const media = matchMedia('(pointer:coarse)');
    const update = () => setCoarse(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    gl.domElement.style.touchAction = coarse ? 'pan-y' : 'none';
  }, [coarse, gl]);
  useEffect(() => {
    if (controls.current) {
      controls.current.reset();
      invalidate();
    }
  }, [props.reset, invalidate]);
  const focus = props.ideas.find((idea) => idea.id === props.focusId);
  const hasFocus = !!focus,
    focusPlot = focus?.plot;
  const target = useMemo(() => {
    if (!hasFocus) return new THREE.Vector3();
    const [x, z] = plotPosition(focusPlot ?? 0);
    return new THREE.Vector3(x, 0.55, z);
  }, [hasFocus, focusPlot]);
  const shift = useMemo(() => new THREE.Vector3(), []);
  const momentReady = useRef(false);
  useEffect(() => {
    momentReady.current = false;
    invalidate();
  }, [props.moment?.serial, target, props.present, invalidate]);
  useFrame((_, delta) => {
    if (!controls.current) return;
    const c = camera as THREE.OrthographicCamera;
    const endZoom =
      Math.min(size.width / 15.5, size.height / 11.6) *
      (focus ? 2.4 : 1) *
      props.zoom;
    const moving =
      controls.current.target.distanceTo(target) > 0.012 ||
      Math.abs(c.zoom - endZoom) > 0.05;
    if (moving) {
      const amount = props.motion
        ? 1 - Math.exp(-Math.min(delta, 0.05) * 10)
        : 1;
      shift.copy(target).sub(controls.current.target).multiplyScalar(amount);
      controls.current.target.add(shift);
      camera.position.add(shift);
      c.zoom += (endZoom - c.zoom) * amount;
      c.updateProjectionMatrix();
      controls.current.update();
      invalidate();
    }
    const ready = !!focus && props.present && (!moving || !props.motion);
    if (ready && !momentReady.current) invalidate();
    momentReady.current = ready;
  });
  useEffect(() => {
    const fn = (e: Event) => {
      e.preventDefault();
      onFailure();
    };
    const canvas = gl.domElement;
    canvas.addEventListener('webglcontextlost', fn);
    return () => canvas.removeEventListener('webglcontextlost', fn);
  }, [gl, onFailure]);

  return (
    <>
      <GardenLighting night={props.night} motion={props.motion} />
      <group position={[0, -0.45, 0]}>
        <mesh position={[0, -0.45, 0]} receiveShadow scale={[1, 1, 0.84]}>
          <cylinderGeometry args={[6.65, 6.45, 0.74, 80]} />
          <meshStandardMaterial color="#e7dfc9" roughness={1} />
        </mesh>
        <GardenGround />
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.008, 0]}
          scale={[1, 0.83, 1]}
          receiveShadow
        >
          <ringGeometry args={[4.57, 5.05, 80]} />
          <meshStandardMaterial color="#e8dfc3" />
        </mesh>
        <Box at={[-1.8, 0.035, 0]} size={[0.62, 0.045, 6.4]} color="#e8dfc3" />
        <Box at={[0, 0.04, 2.5]} size={[7.3, 0.045, 0.52]} color="#e8dfc3" />
        <mesh
          position={[1.3, 0.015, 0.1]}
          scale={[2.23, 1, 1.62]}
          receiveShadow
        >
          <cylinderGeometry args={[1.1, 1.1, 0.05, 72]} />
          <meshStandardMaterial color="#eee4cb" />
        </mesh>
        <mesh
          position={[1.3, 0.05, 0.1]}
          scale={[2.16, 1, 1.53]}
          onClick={(e) => {
            e.stopPropagation();
            play('pond');
          }}
        >
          <cylinderGeometry args={[1.08, 1.08, 0.035, 72]} />
          <meshStandardMaterial
            color={gardenPalette.water}
            roughness={0.24}
            metalness={0.13}
          />
        </mesh>
        {[0.65, 0.9].map((r, i) => (
          <mesh
            key={r}
            position={[1.9, 0.075, 0.2]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={[1, 0.58, 1]}
          >
            <ringGeometry args={[r, r + 0.013, 60]} />
            <meshBasicMaterial
              color="#d9eeea"
              transparent
              opacity={0.65 - i * 0.12}
            />
          </mesh>
        ))}
        <group position={[0.45, 0.16, 1.14]} rotation={[0, -0.22, 0]}>
          <Box at={[0, 0, 0]} size={[3.85, 0.13, 0.45]} color="#d5bb90" />
          <BridgePlanks />
          {[-1.6, -0.8, 0, 0.8, 1.6].map((x) => (
            <Box
              key={x}
              at={[x, -0.15, 0]}
              size={[0.08, 0.33, 0.34]}
              color="#9e8969"
            />
          ))}
        </group>
        <group visible={!focus}>
          <Pavilion />
          <Townhouses night={props.night} />
        </group>
        <Tram motion={props.motion && !props.low} />
        <Goose
          at={[2.1, 0.06, 0.2]}
          rotate={-0.6}
          event={event}
          motion={props.motion}
          onTap={() => play('goose')}
        />
        <Goose at={[1.75, 0.06, 0.56]} rotate={-0.5} />
        <Goose at={[-0.8, 0.11, 1.7]} rotate={1.1} />
        {[
          [-3.2, 3.8],
          [3.6, 0.8],
          [-0.55, -1.1],
        ].map(([x, z], i) => (
          <group key={i} position={[x, 0.15, z]} rotation={[0, i * 0.9, 0]}>
            <Box at={[0, 0.22, 0]} size={[0.66, 0.06, 0.24]} color="#b88e61" />
            <Box
              at={[0, 0.41, -0.1]}
              size={[0.66, 0.26, 0.045]}
              color="#b88e61"
            />
            {[-0.23, 0.23].map((n) => (
              <Box
                key={n}
                at={[n, 0.08, 0]}
                size={[0.045, 0.27, 0.2]}
                color="#607459"
              />
            ))}
          </group>
        ))}
        <Meadow />
        <Forest
          {...props}
          ideas={focus ? [focus] : props.ideas}
          momentReady={momentReady}
        />
        <Atmosphere night={props.night} motion={props.motion} low={props.low} />
        <Ripple event={event} motion={props.motion} />
        <GardenButterfly
          visit={props.butterflyVisit}
          enabled={props.active && props.motion && !props.night && !props.low}
        />
      </group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -1.285, 0]}
        receiveShadow
      >
        <planeGeometry args={[200, 200]} />
        <shadowMaterial transparent opacity={0.1} />
      </mesh>
      <OrbitControls
        ref={controls}
        makeDefault
        enablePan={false}
        enableZoom={false}
        enableRotate={!coarse && !props.moment}
        minPolarAngle={0.6}
        maxPolarAngle={1.15}
        minAzimuthAngle={-0.3}
        maxAzimuthAngle={1.6}
        enableDamping={props.motion}
        dampingFactor={0.1}
      />
    </>
  );
}
// Local inspection only; the production build removes this component.
function GardenDiagnostics() {
  const elapsed = useRef(0),
    frames = useRef(0);
  useFrame(({ gl, scene }, delta) => {
    frames.current++;
    elapsed.current += delta;
    if (elapsed.current < 0.5) return;
    elapsed.current = 0;
    const batches: Record<string, number> = {};
    scene.traverse((object) => {
      if (object instanceof THREE.InstancedMesh)
        batches[object.name || object.type] = object.count;
    });
    gl.domElement.dataset.renderStats = JSON.stringify({
      frames: frames.current,
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      batches,
    });
  });
  return null;
}
export default function GardenScene(props: Props) {
  const container = useRef<HTMLDivElement>(null),
    [active, setActive] = useState(false),
    [present, setPresent] = useState(false),
    [low, setLow] = useState(false);
  useEffect(() => {
    let ratio = 0;
    const check = () => {
      setActive(ratio > 0 && !document.hidden);
      setPresent(ratio >= 0.75 && !document.hidden);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        ratio = entries[0].intersectionRatio;
        check();
      },
      { threshold: [0, 0.05, 0.75, 1] },
    );
    if (container.current) observer.observe(container.current);
    document.addEventListener('visibilitychange', check);
    check();
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return (
    <div
      ref={container}
      className="garden-canvas"
      data-quality={low ? 'calm' : 'full'}
      data-render-state={
        !active ? 'suspended' : props.motion ? 'animated' : 'paused'
      }
    >
      <Canvas
        orthographic
        camera={{ position: [9, 10, 13], zoom: 48, near: 0.1, far: 100 }}
        dpr={low ? 1 : [1, 1.5]}
        shadows={low ? false : { type: THREE.PCFShadowMap }}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        frameloop={!active ? 'never' : props.motion ? 'always' : 'demand'}
        fallback={
          <div className="scene-fallback">
            Every idea is available in the list.
          </div>
        }
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.12;
        }}
      >
        <PerformanceMonitor
          bounds={() => [28, 55]}
          onDecline={() => setLow(true)}
        >
          <World {...props} low={low} active={active} present={present} />
          {process.env.NODE_ENV === 'development' && <GardenDiagnostics />}
        </PerformanceMonitor>
      </Canvas>
    </div>
  );
}
