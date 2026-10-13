export type RailPoint = readonly [number, number];
/** Arc-length sampling follows the mapped track without spline overshoot at crossings. */
export function railPath(points: readonly RailPoint[]) {
  const distances = [0];
  for (let i = 1; i < points.length; i++)
    distances.push(
      distances[i - 1] +
        Math.hypot(
          points[i][0] - points[i - 1][0],
          points[i][1] - points[i - 1][1],
        ),
    );
  const length = distances.at(-1) || 0;
  if (!length)
    throw new Error('The ION path needs at least two distinct points.');
  function at(distance: number) {
    const d = Math.max(0, Math.min(length, distance));
    let i = 1;
    while (i < distances.length - 1 && distances[i] < d) i++;
    const a = points[i - 1],
      b = points[i];
    const t = (d - distances[i - 1]) / (distances[i] - distances[i - 1] || 1);
    return {
      x: a[0] + (b[0] - a[0]) * t,
      z: a[1] + (b[1] - a[1]) * t,
      angle: Math.atan2(b[0] - a[0], b[1] - a[1]),
    };
  }
  return { length, at };
}
