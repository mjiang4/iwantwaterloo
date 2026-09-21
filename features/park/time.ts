import { getPosition } from 'suncalc';
export type TimeMode = 'live' | 'day' | 'night';
export function parkLight(timestamp: number, mode: TimeMode = 'live') {
  const actual = getPosition(new Date(timestamp), 43.4665, -80.529);
  const altitude =
    mode === 'day' ? 24 : mode === 'night' ? -24 : actual.altitude;
  const azimuth = mode === 'live' ? actual.azimuth : 245;
  const a = (altitude * Math.PI) / 180,
    b = (azimuth * Math.PI) / 180;
  const daylight = Math.max(0, Math.min(1, (altitude + 7) / 17));
  return {
    altitude,
    azimuth,
    daylight,
    night: altitude < -6,
    sun: [
      Math.sin(b) * Math.cos(a) * 60,
      Math.sin(a) * 60,
      -Math.cos(b) * Math.cos(a) * 60,
    ] as [number, number, number],
    clock: new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Toronto',
      hour: 'numeric',
      minute: '2-digit',
    }).format(timestamp),
  };
}
