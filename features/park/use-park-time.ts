'use client';
import { useEffect, useState } from 'react';
import { parkLight, type TimeMode } from './time';
export function useParkTime() {
  const [timestamp, setTimestamp] = useState(0);
  const [mode, setMode] = useState<TimeMode>('live');
  useEffect(() => {
    const tick = () => setTimestamp(Date.now());
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);
  const light = parkLight(timestamp || 1790006400000, mode);
  return {
    ...light,
    // Intl punctuation differs between Safari and Node; render the clock after hydration.
    clock: timestamp ? light.clock : '',
    timestamp,
    mode,
    setMode,
  };
}
