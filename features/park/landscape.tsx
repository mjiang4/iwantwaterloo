'use client';
/* oxlint-disable react/react-compiler -- Shader uniforms and scene materials are owned by the renderer. */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshReflectorMaterial, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
useGLTF.setDecoderPath('/draco/');
export function clearDetailCache() {
  useGLTF.clear('/park/waterloo-park-detail.glb');
}
const vertex = `varying vec3 vWorld; varying vec3 vNormal; void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;vNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}`;
const fragment = `uniform float uTime;uniform float uDay;varying vec3 vWorld;varying vec3 vNormal;
void main(){vec2 p=vWorld.xz;float waves=sin(p.x*13.+p.y*9.+uTime*.8)*sin(p.x*3.-p.y*17.-uTime*.55);float gleam=pow(max(0.,waves),14.);vec3 col=mix(vec3(.025,.10,.17),vec3(.11,.37,.40),uDay);float fres=pow(1.-max(0.,dot(normalize(cameraPosition-vWorld),vNormal)),3.);col+=mix(vec3(.10,.16,.24),vec3(.26,.38,.35),uDay)*fres;col+=gleam*mix(.10,.32,uDay);gl_FragColor=vec4(col,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>}`;
/** Models own cloned materials; cached loader geometry is shared and never mutated. */
export function ParkModel({
  url,
  day,
  motion,
  visible = true,
  detailed = false,
  onReady,
}: {
  url: string;
  day: number;
  motion: boolean;
  visible?: boolean;
  detailed?: boolean;
  onReady?: () => void;
}) {
  const { scene } = useGLTF(url);
  const readyCallback = useRef(onReady);
  const water = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: { uTime: { value: 0 }, uDay: { value: 1 } },
      }),
    [],
  );
  const model = useMemo(() => {
    const copy = scene.clone(true);
    const materials: THREE.Material[] = [];
    let surface: THREE.BufferGeometry | undefined;
    copy.updateMatrixWorld(true);
    copy.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = !['water', 'lawn', 'sand'].includes(object.name);
      object.receiveShadow = true;
      if (object.name === 'water') {
        if (detailed) {
          surface = object.geometry
            .clone()
            .applyMatrix4(object.matrixWorld)
            .rotateX(Math.PI / 2);
          object.visible = false;
        } else object.material = water;
        return;
      }
      if (Array.isArray(object.material)) return;
      const material = object.material.clone() as THREE.MeshStandardMaterial;
      object.material = material;
      materials.push(material);
      if (detailed && object.name === 'lawn') {
        material.onBeforeCompile = (shader) => {
          shader.vertexShader =
            'varying vec3 vGrass;\n' +
            shader.vertexShader.replace(
              '#include <worldpos_vertex>',
              '#include <worldpos_vertex>\nvGrass=(modelMatrix*vec4(transformed,1.)).xyz;',
            );
          shader.fragmentShader =
            'varying vec3 vGrass;\n' +
            shader.fragmentShader.replace(
              '#include <color_fragment>',
              '#include <color_fragment>\nfloat grain=fract(sin(dot(floor(vGrass.xz*140.),vec2(12.9898,78.233)))*43758.5453);diffuseColor.rgb*=.87+grain*.17+.045*sin(vGrass.z*4.);',
            );
        };
      }
    });
    return { scene: copy, materials, surface };
  }, [scene, water, detailed]);
  useEffect(() => {
    water.uniforms.uDay.value = day;
  }, [day, water]);
  useEffect(() => {
    readyCallback.current?.();
  }, []);
  useEffect(
    () => () => {
      water.dispose();
      model.materials.forEach((m) => m.dispose());
      model.surface?.dispose();
    },
    [model, water],
  );
  useFrame((_, delta) => {
    if (motion && visible) water.uniforms.uTime.value += Math.min(delta, 0.05);
  });
  return (
    <group visible={visible}>
      <primitive object={model.scene} />
      {model.surface && (
        <mesh geometry={model.surface} rotation={[-Math.PI / 2, 0, 0]}>
          <MeshReflectorMaterial
            resolution={256}
            mirror={0.52}
            mixStrength={0.65}
            color={day > 0.4 ? '#5a8587' : '#263f48'}
            metalness={0.12}
            roughness={0.32}
            depthScale={0}
          />
        </mesh>
      )}
    </group>
  );
}
