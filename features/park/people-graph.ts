/**
 * The park's people: how many there are, and how they get around the footpath
 * network built by scripts/park/build_paths.mjs. Pure functions, no rendering.
 */

/** One walker per browser with a visible idea in this window. */
export const PEOPLE_WINDOW_DAYS = 10;
/** The park never looks abandoned, even in a quiet stretch. */
export const MIN_PEOPLE = 6;
/** Laptops get a lively park; transformed phones a handful; stripped-down phones none. */
export const PEOPLE_CAP = { full: 36, phone: 8, lite: 0 } as const;
export type PeopleMode = keyof typeof PEOPLE_CAP;

/** How many walkers to show. Most people head home after dark. */
export function peopleTarget(
  contributors: number,
  mode: PeopleMode,
  afterDark: number,
) {
  const cap = PEOPLE_CAP[mode];
  if (!cap) return 0;
  const people = Math.min(
    cap,
    Math.max(MIN_PEOPLE, Math.floor(contributors) || 0),
  );
  const night = Math.min(1, Math.max(0, afterDark));
  // A third stay out at night, near the lanterns; never fewer than two.
  return Math.max(2, Math.round(people * (1 - night * (2 / 3))));
}

export type PathData = {
  quantum: number;
  nodes: number[];
  edges: number[];
  gates: number[];
};
export type PathGraph = {
  x: Float32Array;
  z: Float32Array;
  neighbours: number[][];
  gates: number[];
};

let paths: Promise<PathGraph | null> | null = null;
/** The footpath network, fetched once per page for the people and the lamps. */
export function loadPaths() {
  paths ??= fetch('/park/paths.json')
    .then((r) => (r.ok ? (r.json() as Promise<PathData>) : null))
    .then((data) => (data ? parseGraph(data) : null))
    .catch(() => {
      paths = null; // allow a later retry
      return null;
    });
  return paths;
}

export function parseGraph(data: PathData): PathGraph {
  const count = data.nodes.length / 2;
  const x = new Float32Array(count),
    z = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    x[i] = data.nodes[i * 2] / data.quantum;
    z[i] = data.nodes[i * 2 + 1] / data.quantum;
  }
  const neighbours: number[][] = Array.from({ length: count }, () => []);
  for (let i = 0; i < data.edges.length; i += 2) {
    const a = data.edges[i],
      b = data.edges[i + 1];
    neighbours[a].push(b);
    neighbours[b].push(a);
  }
  return { x, z, neighbours, gates: data.gates };
}

export function nearestNode(graph: PathGraph, x: number, z: number) {
  let best = 0,
    distance = Infinity;
  for (let i = 0; i < graph.x.length; i++) {
    const d = (graph.x[i] - x) ** 2 + (graph.z[i] - z) ** 2;
    if (d < distance) {
      distance = d;
      best = i;
    }
  }
  return best;
}

/** Shortest walk between two junctions (Dijkstra on path length). */
export function route(graph: PathGraph, from: number, to: number): number[] {
  if (from === to) return [from];
  const count = graph.x.length;
  const distance = new Float64Array(count).fill(Infinity);
  const previous = new Int32Array(count).fill(-1);
  const heap: [number, number][] = [[0, from]];
  distance[from] = 0;
  while (heap.length) {
    // Small binary heap keyed on distance.
    const [d, n] = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        const l = i * 2 + 1,
          r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m], heap[i]];
        i = m;
      }
    }
    if (d > distance[n]) continue;
    if (n === to) break;
    for (const m of graph.neighbours[n]) {
      const next =
        d + Math.hypot(graph.x[m] - graph.x[n], graph.z[m] - graph.z[n]);
      if (next < distance[m]) {
        distance[m] = next;
        previous[m] = n;
        heap.push([next, m]);
        for (let i = heap.length - 1; i > 0;) {
          const p = (i - 1) >> 1;
          if (heap[p][0] <= heap[i][0]) break;
          [heap[i], heap[p]] = [heap[p], heap[i]];
          i = p;
        }
      }
    }
  }
  if (previous[to] === -1) return [from];
  const path = [to];
  while (path[0] !== from) path.unshift(previous[path[0]]);
  return path;
}

/** Deterministic randomness, so tests and replays are stable. */
export function random(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

/** Pick a tree to visit, busier trees (likes and replies) more often. */
export function pickWeighted<T>(
  items: T[],
  weight: (item: T) => number,
  roll: number,
) {
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  let left = roll * total;
  for (const item of items) {
    left -= weight(item);
    if (left <= 0) return item;
  }
  return items.at(-1);
}
