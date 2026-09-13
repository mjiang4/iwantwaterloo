'use client';
import {useEffect,useRef,useState} from 'react';
import {Canvas,useFrame,useThree} from '@react-three/fiber';
import {Html,OrbitControls,RoundedBox} from '@react-three/drei';
import * as THREE from 'three';
import type {OrbitControls as OrbitControlsImpl} from 'three-stdlib';
import {ideaTags,type Idea} from '@/lib/garden';
type Props={ideas:Idea[];selected:string|null;onSelect:(id:string)=>void;motion:boolean;zoom:number;reset:number;onFailure:()=>void};
const seeded=(n:number)=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
const spots:[number,number][]=[[-3.2,2.7],[0,3.65],[-2.1,-1.5],[3.45,2.4],[-4.5,.5],[3.65,-1.9],[-.4,-3.5],[-3.7,-2.4],[1.8,3.4],[4.5,.1],[-.65,2.1],[2.2,-3.7],[.15,-1.9],[-4,1.65],[2.9,1.9],[-1.3,4.3],[4.7,1.5],[-2.7,-3.4],[.7,-4.4],[2.5,-2.5],[3.3,3.5],[-4.8,-1.4],[-2.8,4],[1.1,2.1]];
function Box({at,size,color,...rest}:{at:[number,number,number];size:[number,number,number];color:string;rotation?:[number,number,number]}){return <mesh position={at} castShadow receiveShadow {...rest}><boxGeometry args={size}/><meshStandardMaterial color={color} roughness={.8}/></mesh>;}
function Bloom({
  n,
  index,
  motion,
}: {
  n: number;
  index: number;
  motion: boolean;
}) {
  const ref = useRef<THREE.Group>(null),
    born = useRef(motion ? 0 : 1);
  useFrame((_, delta) => {
    if (!ref.current || born.current >= 1) return;
    born.current = Math.min(1, born.current + delta * 3);
    const s = 1 - Math.pow(1 - born.current, 3);
    ref.current.scale.setScalar(s);
  });
  const a = seeded(n + index * 17) * Math.PI * 2,
    r = 0.29 + seeded(n + index * 29) * 0.32;
  return (
    <group
      ref={ref}
      position={[
        Math.cos(a) * r,
        0.07 + seeded(n + index) * 0.08,
        Math.sin(a) * r,
      ]}
    >
      <mesh rotation={[-Math.PI / 2, 0, a]}>
        <circleGeometry args={[0.075, 6]} />
        <meshStandardMaterial
          color={['#f2cf72', '#e8a2a8', '#ddd98e', '#b7cfe3'][index % 4]}
        />
      </mesh>
      <mesh position={[0, 0.012, 0]}>
        <sphereGeometry args={[0.026, 6, 4]} />
        <meshStandardMaterial color="#9a733a" />
      </mesh>
    </group>
  );
}
function Tree({
  x,
  z,
  n,
  waters,
  motion,
}: {
  x: number;
  z: number;
  n: number;
  waters: number;
  motion: boolean;
}) {
  const h = 0.85 + seeded(n) * 1.15,
    color = ['#6f973d', '#8bae49', '#adc66a', '#507b39', '#92ae54'][n % 5];
  const blooms =
      waters < 1
        ? 0
        : waters < 4
          ? waters
          : waters < 10
            ? 5
            : waters < 25
              ? 8
              : 12,
    branches = waters < 10 ? 0 : waters < 25 ? 1 : 2;
  return (
    <group position={[x, 0.08, z]} scale={0.7 + seeded(n + 100) * 0.3}>
      <mesh position={[0, h * 0.39, 0]} castShadow>
        <cylinderGeometry args={[0.055, 0.085, h * 0.78, 6]} />
        <meshStandardMaterial color="#85754e" />
      </mesh>
      <mesh
        position={[0, h * 0.8, 0]}
        scale={[0.63, h * 0.66, 0.63]}
        castShadow
      >
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color={color} flatShading roughness={1} />
      </mesh>
      <mesh
        position={[-0.25, h * 0.65, 0.09]}
        scale={[0.36, 0.45, 0.36]}
        castShadow
      >
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color={color} flatShading roughness={1} />
      </mesh>
      {Array.from({ length: branches }, (_, i) => (
        <group
          key={`branch-${i}`}
          position={[(i ? 1 : -1) * 0.22, h * (0.48 + i * 0.14), 0]}
          rotation={[0, 0, i ? -0.65 : 0.65]}
        >
          <mesh position={[0, 0.16, 0]}>
            <cylinderGeometry args={[0.025, 0.035, 0.34, 5]} />
            <meshStandardMaterial color="#85754e" />
          </mesh>
          <mesh position={[0, 0.34, 0]} scale={[0.2, 0.26, 0.2]}>
            <icosahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color={color} flatShading />
          </mesh>
        </group>
      ))}
      {Array.from({ length: blooms }, (_, i) => (
        <Bloom key={`bloom-${i}`} n={n} index={i} motion={motion} />
      ))}
    </group>
  );
}
function Pavilion(){return <group position={[-1.9,.1,-2.6]} rotation={[0,.15,0]}>
 <Box at={[0,.15,0]} size={[2.3,.3,1.3]} color="#e6dac3"/><Box at={[0,.6,-.22]} size={[2,1,.9]} color="#e3d9b8"/><Box at={[0,.72,.3]} size={[1.9,.72,.035]} color="#6b9691"/>
 {[-.8,-.4,0,.4,.8].map(x=><Box key={x} at={[x,.72,.34]} size={[.04,.9,.09]} color="#e9e0c8"/>)}
 <Box at={[0,1.16,0]} size={[2.35,.15,1.4]} color="#e5dfc9"/><Box at={[0,1.27,0]} size={[2.08,.08,1.13]} color="#8d9f5b"/><Box at={[.82,.3,.84]} size={[.55,.16,.62]} color="#d3c7ae"/><Box at={[.82,.16,1.12]} size={[.65,.1,.25]} color="#ded5bf"/></group>;}
function Townhouses(){return <group position={[3.2,.1,-2.8]} rotation={[0,-.25,0]}>{['#d4aa84','#e7d8bd','#bb795b'].map((c,i)=><group key={c} position={[(i-1)*.64,0,0]}>
 <Box at={[0,.63,0]} size={[.58,1.26,.68]} color={c}/><mesh position={[0,1.49,0]} rotation={[0,Math.PI/4,0]} castShadow><coneGeometry args={[.46,.52,4]}/><meshStandardMaterial color="#586b63"/></mesh>
 {[-.16,.16].map(x=>[.5,.94].map(y=><Box key={`${x}-${y}`} at={[x,y,.345]} size={[.12,.22,.015]} color="#476a6a"/>))}<Box at={[0,.18,.35]} size={[.16,.36,.02]} color="#516956"/></group>)}</group>;}
function Goose({at,rotate=0}:{at:[number,number,number];rotate?:number}){return <group position={at} rotation={[0,rotate,0]} scale={.7}>
 <mesh position={[0,.17,0]} scale={[.24,.15,.14]} castShadow><sphereGeometry args={[1,12,8]}/><meshStandardMaterial color="#eeeee3"/></mesh><mesh position={[.15,.34,0]} rotation={[0,0,-.22]}><capsuleGeometry args={[.047,.22,4,8]}/><meshStandardMaterial color="#36453a"/></mesh><mesh position={[.22,.47,0]}><sphereGeometry args={[.075,10,8]}/><meshStandardMaterial color="#36453a"/></mesh><Box at={[.3,.46,0]} size={[.09,.035,.05]} color="#bc894b"/></group>;}
function Tram({motion}:{motion:boolean}){
 const ref=useRef<THREE.Group>(null);useFrame(({clock})=>{if(ref.current&&motion)ref.current.position.x=Math.sin(clock.elapsedTime*.12)*2.8;});
 return <group position={[0,.12,-4.1]}><Box at={[0,0,0]} size={[7.2,.06,.56]} color="#d7cfb7"/>{[-.18,.18].map(z=><Box key={z} at={[0,.035,z]} size={[7.2,.025,.025]} color="#7e8982"/>)}<group ref={ref} position={[-1,.04,0]}>
 <RoundedBox args={[1.25,.36,.4]} radius={.1} smoothness={3} position={[0,.25,0]} castShadow><meshStandardMaterial color="#f3f4e9"/></RoundedBox><Box at={[0,.29,.205]} size={[.87,.13,.01]} color="#3d6c78"/><Box at={[0,.11,.208]} size={[1.1,.065,.015]} color="#70a7d7"/>{[-.35,.35].map(x=><mesh key={x} position={[x,.055,.11]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.07,.07,.3,10]}/><meshStandardMaterial color="#475a51"/></mesh>)}</group></group>;
}
function Plant({
  idea,
  index,
  selected,
  onSelect,
  motion,
}: {
  idea: Idea;
  index: number;
  selected: boolean;
  onSelect: () => void;
  motion: boolean;
}) {
  const ref = useRef<THREE.Group>(null),
    [hover, setHover] = useState(false),
    scale = useRef(0.03),
    velocity = useRef(0),
    [x, z] = spots[(idea.plot ?? index) % spots.length],
    [initialWaters] = useState(idea.waters);
  const animateGrowth = idea.waters > initialWaters;
  const target = selected || hover ? 1.12 : 1;
  useFrame(({ clock }, delta) => {
    if (!ref.current) return;
    const dt = Math.min(delta, 0.03);
    if (motion) {
      velocity.current +=
        ((target - scale.current) * 130 - velocity.current * 18) * dt;
      scale.current += velocity.current * dt;
    } else scale.current = target;
    ref.current.scale.setScalar(scale.current);
    ref.current.rotation.z = motion
      ? Math.sin(clock.elapsedTime * 1.4 + index) * 0.035
      : 0;
  });
  return (
    <group position={[x, 0.12, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.44, 24]} />
        <meshStandardMaterial color={selected ? '#edce71' : '#a1b76a'} />
      </mesh>
      <group
        ref={ref}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
        }}
        onPointerOut={() => setHover(false)}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <Tree
          x={0}
          z={0}
          n={(idea.plot ?? index) + 7}
          waters={idea.waters}
          motion={motion && animateGrowth}
        />
        <Html position={[0, 2.15, 0]} center zIndexRange={[20, 0]}>
          <button
            className={`plant-marker ${selected ? 'selected' : ''} ${idea.example ? 'example-tree' : ''}`}
            aria-label={`${idea.example ? 'Example' : 'Read idea'}: ${idea.title}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            onFocus={() => setHover(true)}
            onBlur={() => setHover(false)}
          >
            {idea.example ? 'E' : String((idea.plot ?? index) - 5)}
            <span className="plant-tooltip">
              {idea.title}
              <small>
                {ideaTags(idea)
                  .map((t) => `#${t}`)
                  .join(' ')}
              </small>
            </span>
          </button>
        </Html>
      </group>
    </group>
  );
}
function World(props:Props){
 const {size,camera,gl,invalidate}=useThree(),controls=useRef<OrbitControlsImpl>(null);
 const [coarse,setCoarse]=useState(true);
 useEffect(()=>{const media=matchMedia('(pointer:coarse)');const update=()=>setCoarse(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 useEffect(()=>{gl.domElement.style.touchAction=coarse?'pan-y':'none';},[coarse,gl]);
 useEffect(()=>{if(controls.current){controls.current.reset();invalidate();}},[props.reset,invalidate]);
 useEffect(()=>{const c=camera as THREE.OrthographicCamera;c.zoom=Math.min(size.width/15.5,size.height/11.6)*props.zoom;c.updateProjectionMatrix();invalidate();},[size,camera,props.zoom,props.reset,invalidate]);
 useEffect(()=>{const fn=(e:Event)=>{e.preventDefault();props.onFailure();};const canvas=gl.domElement;canvas.addEventListener('webglcontextlost',fn);return()=>canvas.removeEventListener('webglcontextlost',fn);},[gl,props.onFailure]);

 return <><ambientLight intensity={1.1}/><hemisphereLight args={['#fff9e7','#8d9876',1.65]}/><directionalLight position={[-5,10,4]} intensity={2.5} castShadow shadow-mapSize={[1024,1024]} shadow-camera-left={-9} shadow-camera-right={9} shadow-camera-top={9} shadow-camera-bottom={-9} shadow-bias={-.001} shadow-normalBias={.035}/>
 <group position={[0,-.45,0]}><mesh position={[0,-.45,0]} receiveShadow scale={[1,1,.84]}><cylinderGeometry args={[6.65,6.45,.74,80]}/><meshStandardMaterial color="#e7dfc9" roughness={1}/></mesh><mesh position={[0,-.055,0]} receiveShadow scale={[1,1,.84]}><cylinderGeometry args={[6.65,6.65,.07,80]}/><meshStandardMaterial color="#c4d294" roughness={1}/></mesh>
 <mesh rotation={[-Math.PI/2,0,0]} position={[0,.008,0]} scale={[1,.83,1]} receiveShadow><ringGeometry args={[4.57,5.05,80]}/><meshStandardMaterial color="#e8dfc3"/></mesh><Box at={[-1.8,.035,0]} size={[.62,.045,6.4]} color="#e8dfc3"/><Box at={[0,.04,2.5]} size={[7.3,.045,.52]} color="#e8dfc3"/>
 <mesh position={[1.3,.015,.1]} scale={[2.23,1,1.62]} receiveShadow><cylinderGeometry args={[1.1,1.1,.05,72]}/><meshStandardMaterial color="#eee4cb"/></mesh><mesh position={[1.3,.05,.1]} scale={[2.16,1,1.53]}><cylinderGeometry args={[1.08,1.08,.035,72]}/><meshStandardMaterial color="#8bc7cc" roughness={.24} metalness={.13}/></mesh>{[.65,.9].map((r,i)=><mesh key={r} position={[1.9,.075,.2]} rotation={[-Math.PI/2,0,0]} scale={[1,.58,1]}><ringGeometry args={[r,r+.013,60]}/><meshBasicMaterial color="#d9eeea" transparent opacity={.65-i*.12}/></mesh>)}
 <group position={[.45,.16,1.14]} rotation={[0,-.22,0]}><Box at={[0,0,0]} size={[3.85,.13,.45]} color="#d5bb90"/>{Array.from({length:26},(_,i)=><Box key={i} at={[-1.86+i*.15,.075,0]} size={[.019,.015,.43]} color="#aa916d"/>)}{[-1.6,-.8,0,.8,1.6].map(x=><Box key={x} at={[x,-.15,0]} size={[.08,.33,.34]} color="#9e8969"/>)}</group>
 <Pavilion/><Townhouses/><Tram motion={props.motion}/>
 <Goose at={[2.1,.06,.2]} rotate={-.6}/><Goose at={[1.75,.06,.56]} rotate={-.5}/><Goose at={[-.8,.11,1.7]} rotate={1.1}/>
 {[[-3.2,3.8],[3.6,.8],[-.55,-1.1]].map(([x,z],i)=><group key={i} position={[x,.15,z]} rotation={[0,i*.9,0]}><Box at={[0,.22,0]} size={[.66,.06,.24]} color="#b88e61"/><Box at={[0,.41,-.1]} size={[.66,.26,.045]} color="#b88e61"/>{[-.23,.23].map(n=><Box key={n} at={[n,.08,0]} size={[.045,.27,.2]} color="#607459"/>)}</group>)}
 {Array.from({length:65},(_,i)=>{const a=seeded(i+200)*Math.PI*2,r=4.5+seeded(i+400)*1.7;return <mesh key={i} position={[Math.sin(a)*r,.09,Math.cos(a)*r*.81]} scale={[.04+seeded(i)*.07,.055,.04]}><icosahedronGeometry args={[1,0]}/><meshStandardMaterial color={['#eae6a1','#f4f0cf','#a9b96e'][i%3]}/></mesh>;})}
 {props.ideas.slice(0,24).map((idea,i)=><Plant key={idea.id} idea={idea} index={i} selected={idea.id===props.selected} onSelect={()=>props.onSelect(idea.id)} motion={props.motion}/>)}</group>
 <mesh rotation={[-Math.PI/2,0,0]} position={[0,-1.285,0]} receiveShadow><planeGeometry args={[200,200]}/><shadowMaterial transparent opacity={.1}/></mesh>
 <OrbitControls ref={controls} makeDefault enablePan={false} enableZoom={false} enableRotate={!coarse} minPolarAngle={.6} maxPolarAngle={1.15} minAzimuthAngle={-.3} maxAzimuthAngle={1.6} enableDamping={props.motion} dampingFactor={.1} target={[0,0,0]}/></>;
}
export default function GardenScene(props:Props){
 const [active,setActive]=useState(true);useEffect(()=>{const check=()=>setActive(!document.hidden);document.addEventListener('visibilitychange',check);return()=>document.removeEventListener('visibilitychange',check);},[]);
 return <Canvas orthographic camera={{position:[9,10,13],zoom:48,near:.1,far:100}} dpr={[1,1.5]} shadows gl={{antialias:true,alpha:true,powerPreference:'low-power'}} frameloop={props.motion&&active?'always':'demand'} fallback={<div className="scene-fallback">The garden needs 3D support. Every idea is available in the list.</div>} onCreated={({gl})=>{gl.toneMapping=THREE.ACESFilmicToneMapping;gl.toneMappingExposure=1.12;}}><World {...props} motion={props.motion&&active}/></Canvas>;
}
