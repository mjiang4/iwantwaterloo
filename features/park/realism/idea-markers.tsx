'use client';
/* oxlint-disable react/react-compiler -- A transient annotation pulse follows the renderer's camera transition. */
import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { TreeMarkers, type ForestProps } from '@/components/garden-forest';
import { parkPlotPosition } from '@/features/park/plots';
/** Photographed trees are immutable; likes animate a separate contribution marker. */
export function RealismIdeaMarkers(props: ForestProps) {
  const [visibleSerial, setVisibleSerial] = useState(-1);
  const current = useRef({ serial: -1, elapsed: 0, done: false });
  useFrame((_, delta) => {
    if (!props.moment) return;
    if (current.current.serial !== props.moment.serial)
      current.current = {
        serial: props.moment.serial,
        elapsed: 0,
        done: false,
      };
    if (current.current.done || !props.momentReady.current) return;
    if (visibleSerial !== props.moment.serial)
      setVisibleSerial(props.moment.serial);
    current.current.elapsed += Math.min(delta, 0.25);
    if (!props.motion || current.current.elapsed >= 1.4) {
      current.current.done = true;
      if (props.moment.kind === 'plant') props.onPlanted();
      props.onMomentComplete(props.moment.serial);
    }
  });
  const idea = props.ideas.find((idea) => idea.id === props.moment?.id);
  const point = idea ? parkPlotPosition(idea.plot ?? 0) : null;
  return (
    <>
      {!props.moment && <TreeMarkers {...props} />}
      {idea && point && visibleSerial === props.moment?.serial && (
        <Html
          position={[point[0], props.anchorHeights?.[idea.id] ?? 1.4, point[1]]}
          center
          zIndexRange={[23, 21]}
        >
          <span
            key={props.moment?.serial}
            className="realism-idea-pulse"
            aria-hidden="true"
          >
            {props.moment?.kind === 'like' ? '+1' : '✦'}
          </span>
        </Html>
      )}
    </>
  );
}
