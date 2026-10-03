'use client';
/* oxlint-disable react/react-compiler -- Shader uniforms and scene materials are owned by the renderer. */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshReflectorMaterial, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { tint, type ParkLook } from './look';
useGLTF.setDecoderPath('/draco/');
export function clearDetailCache() {
  useGLTF.clear('/park/waterloo-park-detail.glb');
}
const vertex = `varying vec3 vWorld; varying vec3 vNormal; void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;vNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}`;
// `lattice` multiplies two waves (the shipped look); `soft` sums three unrelated ripples.
const fragment = `uniform float uTime;uniform float uSoft;uniform vec3 uDeep;uniform vec3 uRim;uniform vec3 uGleam;varying vec3 vWorld;varying vec3 vNormal;
void main(){vec2 p=vWorld.xz;float lattice=pow(max(0.,sin(p.x*13.+p.y*9.+uTime*.8)*sin(p.x*3.-p.y*17.-uTime*.55)),14.);
float ripple=sin(p.x*17.3+p.y*6.1+uTime*.7)*.45+sin(-p.x*7.9+p.y*21.7+uTime*.5)*.35+sin(p.x*31.-p.y*12.7-uTime*1.1)*.2;float soft=smoothstep(.72,.97,ripple)*.4;
float fres=pow(1.-max(0.,dot(normalize(cameraPosition-vWorld),vNormal)),3.);vec3 col=uDeep+uRim*fres+uGleam*mix(lattice,soft,uSoft);gl_FragColor=vec4(col,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>}`;
/** Models own cloned materials; cached loader geometry is shared and never mutated. */
export function ParkModel({
  url,
  day,
  look,
  motion,
  visible = true,
  detailed = false,
  name,
  onReady,
}: {
  url: string;
  day: number;
  look: ParkLook;
  motion: boolean;
  visible?: boolean;
  detailed?: boolean;
  /** Scene name for lookups (the base landscape is probed for lawn placement). */
  name?: string;
  onReady?: () => void;
}) {
  const { scene } = useGLTF(url);
  const readyCallback = useRef(onReady);
  const water = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: {
          uTime: { value: 0 },
          uSoft: { value: 0 },
          uDeep: { value: new THREE.Color() },
          uRim: { value: new THREE.Color() },
          uGleam: { value: new THREE.Color() },
        },
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
      // The park's buildings are drawn with real roofs and doors (park-buildings);
      // the base model's flat prisms stay only as hidden lawn-probe obstacles.
      if (name === 'park-landscape' && HIDDEN.includes(object.name))
        object.visible = false;
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
      const override = look.materials[material.name];
      if (override) {
        material.color.set(override.color);
        if (override.roughness !== undefined)
          material.roughness = override.roughness;
      }
      perimeterFinish(material);
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
  }, [scene, water, detailed, look, name]);
  useEffect(() => {
    water.uniforms.uSoft.value = look.water.style === 'soft' ? 1 : 0;
    water.uniforms.uDeep.value.copy(tint(look.water.deep, day));
    water.uniforms.uRim.value.copy(tint(look.water.rim, day));
    water.uniforms.uGleam.value.copy(tint(look.water.gleam, day));
  }, [day, water, look]);
  useEffect(() => {
    readyCallback.current?.();
  }, []);
  // Perimeter's windows glow warm only after dark.
  useEffect(() => {
    for (const material of model.materials)
      if (material.name === 'pi-window-warm' && 'emissive' in material) {
        const warm = material as THREE.MeshStandardMaterial;
        warm.emissive.set('#ffc983');
        warm.emissiveIntensity = Math.max(0, 1 - day * 1.4) * 1.6;
      }
  }, [model, day]);
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
    <group visible={visible} name={name}>
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

const HIDDEN = ['building', 'roof'];

/**
 * Perimeter Institute's facade: charcoal panels with a soft metallic sheen,
 * blue-grey glass that catches the sun, a pale frame and a light roof, instead
 * of the export's flat black. Roofs are recognised by upward-facing surfaces.
 */
const PERIMETER: Record<
  string,
  { color: string; roughness: number; metalness?: number }
> = {
  'pi-charcoal': { color: '#41474e', roughness: 0.5, metalness: 0.3 },
  'pi-folds': { color: '#353b41', roughness: 0.45, metalness: 0.35 },
  'pi-frame': { color: '#d3cfc6', roughness: 0.6 },
  'pi-glass': { color: '#86a8b9', roughness: 0.14, metalness: 0.1 },
  'concrete-detail': { color: '#c4bfb4', roughness: 0.9 },
};
function perimeterFinish(material: THREE.MeshStandardMaterial) {
  const finish = PERIMETER[material.name];
  if (!finish) return;
  material.color.set(finish.color);
  material.roughness = finish.roughness;
  material.metalness = finish.metalness ?? 0;
  if (material.name !== 'pi-charcoal' && material.name !== 'pi-folds') return;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'varying float vUp;\n' +
      shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\nvUp=normalize(mat3(modelMatrix)*objectNormal).y;',
      );
    shader.fragmentShader =
      'varying float vUp;\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(.56,.59,.6),smoothstep(.7,.9,vUp));',
      );
  };
}
