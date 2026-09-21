'use client';
/* oxlint-disable react/react-compiler -- Three.js objects and shader uniforms are intentionally mutated outside React's render cycle. */
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF, Html } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import type { Idea } from '@/lib/garden';
import { Forest } from './garden-forest';
import { type GardenMoment, randomAt } from '@/lib/garden-visuals';
import type { ButterflyVisit } from '@/lib/garden-discovery';
import { parkLight, type TimeMode } from '@/features/park/time';
import map from '@/assets/park/map.json';
import { LakeGeese } from '@/features/park/wildlife';
import { parkPlotPosition } from '@/features/park/plots';
type Props = {
  ideas: Idea[];
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
const waterVertex = `varying vec3 vWorld; varying vec3 vNormal; void main(){ vec4 w=modelMatrix*vec4(position,1.); vWorld=w.xyz; vNormal=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*w; }`;
const waterFragment = `uniform float uTime;uniform float uDay; varying vec3 vWorld; varying vec3 vNormal;
void main(){vec2 p=vWorld.xz;float waves=sin(p.x*13.+p.y*9.+uTime*.8)*sin(p.x*3.-p.y*17.-uTime*.55);float gleam=pow(max(0.,waves),14.);vec3 col=mix(vec3(.025,.10,.17),vec3(.11,.37,.40),uDay);float fres=pow(1.-max(0.,dot(normalize(cameraPosition-vWorld),vNormal)),3.);col+=mix(vec3(.10,.16,.24),vec3(.26,.38,.35),uDay)*fres;col+=gleam*mix(.10,.32,uDay);gl_FragColor=vec4(col,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>}`;
function Landscape({ day, motion }: { day: number; motion: boolean }) {
  const { scene } = useGLTF('/park/waterloo-park.glb');
  const water = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: waterVertex,
        fragmentShader: waterFragment,
        uniforms: { uTime: { value: 0 }, uDay: { value: 1 } },
      }),
    [],
  );
  const model = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = o.name !== 'water' && o.name !== 'lawn';
        o.receiveShadow = true;
        if (o.name === 'water') o.material = water;
      }
    });
    return copy;
  }, [scene, water]);
  useEffect(() => {
    water.uniforms.uDay.value = day;
  }, [day, water]);
  useEffect(() => () => water.dispose(), [water]);
  useFrame((_, delta) => {
    if (motion) water.uniforms.uTime.value += Math.min(0.05, delta);
  });
  return <primitive object={model} />;
}
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
  useEffect(() => {
    const focused = focusedPlot !== undefined;
    const position = focused ? parkPlotPosition(focusedPlot) : [8, -0.5];
    target.current.set(position[0], 0.3, position[1]);
    const mobile = size.width < size.height;
    const distance = focused ? 8 : mobile ? 27 : 31;
    destination.current.set(
      position[0] + (distance * 0.23) / props.zoom,
      (distance * (focused ? 0.82 : props.night ? 0.28 : 0.7)) / props.zoom,
      position[1] + (distance * 0.9) / props.zoom,
    );
    transition.current = 1;
    ready.current = false;
    invalidate();
  }, [
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
  const { gl, scene, invalidate } = useThree();
  const light = parkLight(
    props.timestamp || Date.UTC(2026, 8, 21, 16),
    props.timeMode,
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
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-26}
        shadow-camera-right={26}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
        shadow-camera-near={0.1}
        shadow-camera-far={160}
        shadow-bias={-0.0003}
      />
      <Landscape day={light.daylight} motion={props.motion} />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.28, 0]}
        receiveShadow
      >
        <planeGeometry args={[250, 250]} />
        <meshStandardMaterial
          color={light.night ? '#344942' : '#75856b'}
          roughness={1}
        />
      </mesh>
      <Forest {...props} momentReady={ready} />
      <Fireflies enabled={light.night} motion={props.motion} />
      <LakeGeese motion={props.motion} />
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
      <FrameClock motion={props.motion} active={props.active} />
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
