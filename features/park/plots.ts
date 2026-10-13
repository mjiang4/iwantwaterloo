import map from '@/assets/park/map.json';
/** Stable preview plots in real park clearings; never based on likes or sorting. */
export function parkPlotPosition(plot: number): [number, number] {
  const index =
    ((Math.trunc(Number.isFinite(plot) ? plot : 0) % map.plots.length) +
      map.plots.length) %
    map.plots.length;
  return map.plots[index] as [number, number];
}
