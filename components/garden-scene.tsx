'use client';
/* oxlint-disable react/react-compiler -- Three.js objects and shader uniforms are intentionally mutated outside React's render cycle. */
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import type { Idea } from '@/lib/garden';
import { Forest } from './garden-forest';
import { type GardenMoment, randomAt } from '@/lib/garden-visuals';
import type { ButterflyVisit } from '@/lib/garden-discovery';
import { parkLight, type TimeMode } from '@/features/park/time';
import map from '@/assets/park/map.json';
import landmarks from '@/assets/park/landmarks.json';
import { ParkModel, clearDetailCache } from '@/features/park/landscape';
import { IonTrain } from '@/features/park/ion-train';
import { DetailBoundary } from '@/features/park/detail-boundary';
import type { ParkQuality } from '@/features/park/quality-picker';
import { LakeGeese } from '@/features/park/wildlife';
import { parkPlotPosition } from '@/features/park/plots';
import { RealismIdeaMarkers } from '@/features/park/realism/idea-markers';
import type { ParkProvider } from '@/features/park/realism/provider';
const RealismLayer = lazy(() => import('@/features/park/realism/layer'));
type Props = {
  ideas: Idea[];
  quality: ParkQuality;
  photoProvider: ParkProvider | null;
  onRealismError: () => void;
  onPhotoCredits: (value: string) => void;
  discoveryId: string | null;
  onDetailReady: () => void;
  onDetailError: () => void;
  selected: string | null;
  focusId: string | null;
  moment: GardenMoment | null;
  onMomentComplete: (serial: number) => void;
  onSelect: (id: string) => void;
  motion: boolean;
  night: boolean;
  timestamp: number;
  timeMode: TimeMode;
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
function Sky({ day, sun }: { day: number; sun: [number, number, number] }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { uDay: { value: 1 } },
        vertexShader:
          'varying vec3 vPos;void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: `uniform float uDay;varying vec3 vPos;void main(){float h=smoothstep(-.12,.85,normalize(vPos).y);vec3 top=mix(vec3(.012,.027,.075),vec3(.28,.53,.68),uDay);vec3 bottom=mix(vec3(.075,.12,.18),vec3(.79,.83,.74),uDay);gl_FragColor=vec4(mix(bottom,top,h),1.);}`,
      }),
    [],
  );
  useEffect(() => {
    material.uniforms.uDay.value = day;
  }, [day, material]);
  useEffect(() => () => material.dispose(), [material]);
  const stars = useMemo(() => {
    const g = new THREE.BufferGeometry(),
      p = new Float32Array(700 * 3);
    for (let i = 0; i < 700; i++) {
      const a = randomAt(872, i) * Math.PI * 2,
        h = 0.01 + randomAt(159, i) * 0.97,
        r = Math.sqrt(1 - h * h) * 110;
      p.set([Math.cos(a) * r, h * 110, Math.sin(a) * r], i * 3);
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    return g;
  }, []);
  useEffect(() => () => stars.dispose(), [stars]);
  return (
    <>
      <mesh material={material}>
        <sphereGeometry args={[130, 24, 12]} />
      </mesh>
      <points geometry={stars} visible={day < 0.65}>
        <pointsMaterial
          color="#d2e7ff"
          fog={false}
          size={0.36}
          transparent
          opacity={1 - day}
          sizeAttenuation
          depthWrite={false}
        />
      </points>
      <mesh position={sun} visible={sun[1] > 0}>
        <sphereGeometry args={[0.75, 16, 12]} />
        <meshBasicMaterial color="#fff6d0" fog={false} />
      </mesh>
      <mesh position={[-38, 48, -55]} visible={day < 0.4}>
        <sphereGeometry args={[0.85, 20, 16]} />
        <meshBasicMaterial color="#dce9ec" fog={false} />
      </mesh>
    </>
  );
}
function Fireflies({ enabled, motion }: { enabled: boolean; motion: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const t = useRef(0);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry(),
      p = new Float32Array(55 * 3);
    for (let i = 0; i < 55; i++)
      p.set(
        [
          3 + randomAt(400, i) * 13,
          0.5 + randomAt(800, i) * 1.6,
          -4 + randomAt(900, i) * 9,
        ],
        i * 3,
      );
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    return g;
  }, []);
  useFrame((_, delta) => {
    if (motion && enabled && ref.current) {
      t.current += Math.min(delta, 0.05);
      ref.current.position.y = Math.sin(t.current * 0.4) * 0.14;
    }
  });
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <points ref={ref} geometry={geometry} visible={enabled}>
      <pointsMaterial
        color="#e9eda1"
        size={0.065}
        transparent
        opacity={0.8}
        depthWrite={false}
      />
    </points>
  );
}
function CameraRig({
  props,
  ready,
}: {
  props: Props;
  ready: RefObject<boolean>;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size, invalidate } = useThree();
  const transition = useRef(0);
  const destination = useRef(new THREE.Vector3());
  const target = useRef(new THREE.Vector3());
  // A primitive plot dependency keeps background query refreshes from moving the camera.
  const focusedPlot = props.ideas.find(
    (idea) => idea.id === (props.moment?.id || props.focusId),
  )?.plot;
  const arrivalPlot = props.ideas[0]?.plot;
  useEffect(() => {
    const focused = focusedPlot !== undefined;
    const arrival = parkPlotPosition(arrivalPlot ?? 0);
    const pi = landmarks.perimeter.position;
    const position = focused
      ? parkPlotPosition(focusedPlot)
      : [(arrival[0] + pi[0]) / 2, (arrival[1] + pi[2]) / 2];
    target.current.set(position[0], focused ? 0.9 : 0.5, position[1]);
    let distance = focused ? 10 : 20;
    const placeCamera = () =>
      destination.current.set(
        position[0] + (distance * (focused ? 0.23 : -0.65)) / props.zoom,
        (distance * (focused ? 0.82 : props.night ? 0.4 : 0.52)) / props.zoom,
        position[1] + (distance * (focused ? 0.9 : -0.7)) / props.zoom,
      );
    placeCamera();
    // Fit a real idea and the landmark in the central safe region on narrow screens.
    // Two projected points are sufficient; this runs on navigation, never per frame.
    if (!focused) {
      const probe = new THREE.PerspectiveCamera(
        45,
        size.width / size.height,
        0.1,
        200,
      );
      const anchors = [
        new THREE.Vector3(arrival[0], 1.4, arrival[1]),
        new THREE.Vector3(pi[0], pi[1], pi[2]),
      ];
      for (let attempt = 0; attempt < 12; attempt++) {
        probe.position.copy(destination.current);
        probe.lookAt(target.current);
        probe.updateMatrixWorld();
        if (
          anchors.every((anchor) => {
            const p = anchor.clone().project(probe);
            return Math.abs(p.x) < 0.58 && Math.abs(p.y) < 0.38;
          })
        )
          break;
        distance *= 1.08;
        placeCamera();
      }
    }
    transition.current = 1;
    ready.current = false;
    invalidate();
  }, [
    arrivalPlot,
    focusedPlot,
    props.night,
    props.focusId,
    props.moment?.serial,
    props.moment?.id,
    props.reset,
    props.zoom,
    size.width,
    size.height,
    camera,
    invalidate,
    ready,
  ]);
  useFrame((_, delta) => {
    if (!controls.current || transition.current === 0) return;
    const ease = props.motion ? 1 - Math.exp(-Math.min(delta, 0.05) * 4) : 1;
    camera.position.lerp(destination.current, ease);
    controls.current.target.lerp(target.current, ease);
    controls.current.update();
    if (camera.position.distanceTo(destination.current) < 0.035) {
      transition.current = 0;
      ready.current = true;
      // Let the forest settle even when reduced motion disables the animation clock.
      invalidate();
    } else invalidate();
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping={props.motion}
      dampingFactor={0.12}
      minDistance={5}
      maxDistance={65}
      minPolarAngle={0.22}
      maxPolarAngle={1.46}
      enableRotate={!props.moment}
      enablePan={!props.moment}
      enableZoom={!props.moment}
      screenSpacePanning={false}
      touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
      onStart={() => {
        transition.current = 0;
        ready.current = true;
      }}
      onChange={() => {
        if (controls.current) {
          controls.current.target.x = THREE.MathUtils.clamp(
            controls.current.target.x,
            -18,
            19,
          );
          controls.current.target.z = THREE.MathUtils.clamp(
            controls.current.target.z,
            -12,
            15,
          );
        }
      }}
    />
  );
}
function FrameClock({ motion, active }: { motion: boolean; active: boolean }) {
  const { invalidate } = useThree();
  useEffect(() => {
    if (!motion || !active) return;
    let frame = 0,
      last = 0;
    const tick = (now: number) => {
      if (now - last > 32) {
        last = now;
        invalidate();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [motion, active, invalidate]);
  return null;
}
function World(props: Props & { active: boolean }) {
  const ready = useRef(false);
  const [detailReady, setDetailReady] = useState(false);
  const [photoReady, setPhotoReady] = useState(false);
  const [anchorHeights, setAnchorHeights] = useState<Record<string, number>>(
    {},
  );
  const photoreal = props.quality === 'realism' && photoReady;
  const notifyReady = props.onDetailReady;
  const photoLoaded = useCallback(() => {
    setPhotoReady(true);
    notifyReady();
  }, [notifyReady]);
  useEffect(() => {
    if (props.quality !== 'realism') {
      setPhotoReady(false);
      setAnchorHeights({});
    }
  }, [props.quality]);
  const detailLoaded = useCallback(() => {
    setDetailReady(true);
    notifyReady();
  }, [notifyReady]);
  useEffect(() => {
    if (props.quality === 'light') setDetailReady(false);
  }, [props.quality]);
  const detailFailed = () => {
    clearDetailCache();
    props.onDetailError();
  };
  const detailed = props.quality === 'high' && detailReady;
  const { gl, scene, invalidate } = useThree();
  const light = parkLight(
    props.timestamp || Date.UTC(2026, 8, 21, 16),
    props.quality === 'realism' ? 'day' : props.timeMode,
  );
  const fog = useMemo(
    () => new THREE.Fog(light.night ? '#132635' : '#b7c7bc', 45, 105),
    [light.night],
  );
  useEffect(() => {
    scene.fog = fog;
    invalidate();
    return () => {
      scene.fog = null;
    };
  }, [scene, fog, invalidate]);
  const onFailure = props.onFailure;
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (event: Event) => {
      event.preventDefault();
      onFailure();
    };
    canvas.addEventListener('webglcontextlost', lost);
    return () => canvas.removeEventListener('webglcontextlost', lost);
  }, [gl, onFailure]);
  return (
    <>
      <Sky day={light.daylight} sun={light.sun} />
      <ambientLight intensity={0.32 + light.daylight * 0.7} />
      <hemisphereLight
        args={[light.night ? '#96bede' : '#c3e4ee', '#405532', 0.8]}
      />
      <directionalLight
        position={light.night ? [-20, 30, -12] : light.sun}
        color={light.night ? '#98bae6' : '#fff0cb'}
        intensity={light.night ? 0.65 : 2.7}
        castShadow={!photoreal}
        shadow-mapSize={detailed ? [2048, 2048] : [1024, 1024]}
        shadow-camera-left={-26}
        shadow-camera-right={26}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
        shadow-camera-near={0.1}
        shadow-camera-far={160}
        shadow-bias={-0.0003}
      />
      <ParkModel
        url="/park/waterloo-park.glb"
        day={light.daylight}
        motion={props.motion}
        visible={!detailed && !photoreal}
      />
      <ParkModel
        url="/park/perimeter.glb"
        day={light.daylight}
        motion={false}
        visible={!detailed && !photoreal}
      />
      <ParkModel
        url="/park/ion-track.glb"
        day={light.daylight}
        motion={false}
        visible={!detailed && !photoreal}
      />
      {props.quality === 'high' && (
        <DetailBoundary onError={detailFailed}>
          <Suspense fallback={null}>
            <ParkModel
              url="/park/waterloo-park-detail.glb"
              day={light.daylight}
              motion={props.motion}
              detailed
              onReady={detailLoaded}
            />
          </Suspense>
        </DetailBoundary>
      )}
      {props.quality === 'realism' && props.photoProvider && (
        <DetailBoundary onError={props.onRealismError}>
          <Suspense fallback={null}>
            <RealismLayer
              provider={props.photoProvider}
              ideas={props.ideas}
              active={props.active}
              onReady={photoLoaded}
              onError={props.onRealismError}
              onCredits={props.onPhotoCredits}
              onHeights={setAnchorHeights}
            />
          </Suspense>
        </DetailBoundary>
      )}
      {!photoreal && <IonTrain motion={props.motion} />}
      <Html
        position={landmarks.perimeter.position as [number, number, number]}
        center
        zIndexRange={[2, 0]}
      >
        <span className="park-landmark park-landmark-key">
          Perimeter Institute
        </span>
      </Html>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        visible={!photoreal}
        position={[0, -0.28, 0]}
        receiveShadow
      >
        <planeGeometry args={[250, 250]} />
        <meshStandardMaterial
          color={light.night ? '#344942' : '#75856b'}
          roughness={1}
        />
      </mesh>
      {photoreal ? (
        <RealismIdeaMarkers
          {...props}
          anchorHeights={anchorHeights}
          momentReady={ready}
        />
      ) : (
        <Forest {...props} momentReady={ready} />
      )}
      <Fireflies enabled={light.night} motion={props.motion} />
      {!photoreal && <LakeGeese motion={props.motion} />}
      {map.landmarks.map((landmark) => (
        <Html
          key={landmark.name}
          position={landmark.position as [number, number, number]}
          center
          zIndexRange={[2, 0]}
        >
          <span className="park-landmark">{landmark.name}</span>
        </Html>
      ))}
      <CameraRig props={props} ready={ready} />
      <FrameClock
        motion={props.motion && (!photoreal || !!props.moment)}
        active={props.active}
      />
    </>
  );
}
export default function GardenScene(props: Props) {
  const [active, setActive] = useState(true);
  const [low, setLow] = useState(false);
  useEffect(() => {
    const update = () => setActive(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return (
    <div
      className="garden-canvas"
      data-quality={props.quality}
      data-render-state={
        active ? (props.motion ? 'animated' : 'paused') : 'suspended'
      }
    >
      <Canvas
        camera={{ position: [18, 30, 35], fov: 45, near: 0.1, far: 200 }}
        dpr={low ? 1 : [1, 1.5]}
        shadows={{ type: THREE.PCFSoftShadowMap }}
        gl={{ antialias: true, powerPreference: 'low-power' }}
        frameloop={active ? 'demand' : 'never'}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.15;
          setLow(gl.capabilities.maxTextureSize < 4096);
        }}
        fallback={<p>Explore every idea in the list.</p>}
      >
        <World {...props} active={active} />
      </Canvas>
    </div>
  );
}
