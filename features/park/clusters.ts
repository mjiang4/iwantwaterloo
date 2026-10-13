/** Merge screen-space marker points closer than `spacing` pixels into clusters. */
export function clusterTargets(
  points: { x: number; y: number; index: number }[],
  spacing = 52,
) {
  const groups = points.map((p) => ({ x: p.x, y: p.y, indices: [p.index] }));
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let a = 0; a < groups.length; a++)
      for (let b = a + 1; b < groups.length; b++) {
        const g = groups[a],
          h = groups[b];
        if (Math.abs(g.x - h.x) < spacing && Math.abs(g.y - h.y) < spacing) {
          const n = g.indices.length,
            m = h.indices.length;
          g.x = (g.x * n + h.x * m) / (n + m);
          g.y = (g.y * n + h.y * m) / (n + m);
          g.indices.push(...h.indices);
          groups.splice(b, 1);
          merged = true;
          break outer;
        }
      }
  }
  return groups;
}
