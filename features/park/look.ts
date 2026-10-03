'use client';
/**
 * Look development presets for the modeled park.
 *
 * A look defines only colour, light and atmosphere; geometry, ideas and
 * interaction are untouched. Golden lanterns is the chosen direction and the
 * default. `current` reproduces the previously shipped appearance for
 * comparison. Select a look with `?look=<name>`; `?sun=<degrees>` pins the solar
 * altitude (e.g. 24 day, 2 dusk, -24 night) for design review and screenshots.
 */
import { useMemo, useSyncExternalStore } from 'react';
import { Color } from 'three';

/** Colours by daylight. `dusk`, when present, is the twilight peak between night and day. */
type Pair = { day: string; night: string; dusk?: string };

/** Blend a pair for a daylight value in [0, 1]: night → dusk → day, or night → day. */
export function tint(pair: Pair, daylight: number): Color {
  const night = new Color(pair.night),
    day = new Color(pair.day);
  if (!pair.dusk) return night.lerp(day, daylight);
  const dusk = new Color(pair.dusk);
  return daylight < 0.5
    ? night.lerp(dusk, daylight / 0.5)
    : dusk.lerp(day, (daylight - 0.5) / 0.5);
}

export type ParkLook = {
  name: string;
  /** Overrides for glTF materials, by material name. Unlisted materials keep their exported colour. */
  materials: Record<string, { color: string; roughness?: number }>;
  sky: { top: Pair; bottom: Pair };
  fog: Pair & { near: number; far: number };
  hemisphere: { sky: Pair; ground: string; intensity: number };
  ambient: { base: number; day: number };
  sun: { color: string; sunset: string; intensity: number };
  moon: { color: string; intensity: number };
  water: {
    deep: Pair;
    rim: Pair;
    gleam: Pair;
    /** `lattice` is the shipped pattern; `soft` uses summed, non-repeating ripples. */
    style: 'lattice' | 'soft';
  };
  canopyGlow: { color: string; night: number };
  /** Warm light pooled on the ground under each idea tree after dark. */
  pools: { color: string; night: number };
  /** The surrounding city: one ground with the park, streets that continue its paths. */
  city: {
    walls: string;
    /** House roofs pick from these; larger buildings use `flatRoof`. */
    roofs: string[];
    flatRoof: string;
    road: string;
    ground: Pair;
    trees: string[];
  };
  /** Loves: wildflower petals by day, fireflies after dark. */
  loves: { petals: string[]; firefly: string };
  exposure: number;
};

const current: ParkLook = {
  name: 'Current',
  materials: {},
  // Exact conversions of the shipped shader constants.
  sky: {
    top: { day: '#4787ad', night: '#030713' },
    bottom: { day: '#c9d4bd', night: '#131f2e' },
  },
  fog: { day: '#b7c7bc', night: '#132635', near: 45, far: 105 },
  hemisphere: {
    sky: { day: '#c3e4ee', night: '#96bede' },
    ground: '#405532',
    intensity: 0.8,
  },
  ambient: { base: 0.32, day: 0.7 },
  sun: { color: '#fff0cb', sunset: '#fff0cb', intensity: 2.7 },
  moon: { color: '#98bae6', intensity: 0.65 },
  water: {
    deep: { day: '#5da4a9', night: '#2c5974' },
    rim: { day: '#8ba6a0', night: '#597086' },
    gleam: { day: '#999999', night: '#595959' },
    style: 'lattice',
  },
  canopyGlow: { color: '#000000', night: 0 },
  pools: { color: '#000000', night: 0 },
  loves: {
    petals: ['#fff4dc', '#ffd27f', '#ff9e7d', '#f7b8d0', '#cdb8ff'],
    firefly: '#fff3a6',
  },
  city: {
    walls: '#cfc8b6',
    roofs: ['#7d6a58', '#5f6b70'],
    flatRoof: '#c9c6bd',
    road: '#b4ae98',
    ground: { day: '#8e9a78', night: '#2c3a36' },
    trees: ['#4f7d3d', '#5f8c47', '#3f6b35'],
  },
  exposure: 1.15,
};

/** An architect's model in clear morning light: airy, quiet, legible. */
const paper: ParkLook = {
  name: 'Paper model',
  materials: {
    lawn: { color: '#6f9e55' },
    path: { color: '#c3cba8', roughness: 1 },
    sand: { color: '#d9d0b0' },
    building: { color: '#f2eee6' },
    roof: { color: '#5d6d75' },
    wood: { color: '#8a6a45' },
    rail: { color: '#70746e' },
  },
  sky: {
    top: { day: '#7fb3d9', dusk: '#7188bb', night: '#0b1a33' },
    bottom: { day: '#eef3ea', dusk: '#f4c9a2', night: '#26374f' },
  },
  fog: { day: '#e4ece3', dusk: '#e8c8aa', night: '#1c2c40', near: 32, far: 92 },
  hemisphere: {
    sky: { day: '#e2f1ff', dusk: '#f2d2b4', night: '#8fb0d8' },
    ground: '#6b8a55',
    intensity: 0.9,
  },
  ambient: { base: 0.34, day: 0.5 },
  sun: { color: '#fff7e6', sunset: '#ffc98f', intensity: 2.4 },
  moon: { color: '#a8c2ec', intensity: 0.7 },
  water: {
    deep: { day: '#2f8f9a', dusk: '#3a6e88', night: '#0e2638' },
    rim: { day: '#a6dcd8', dusk: '#eeb896', night: '#2e5068' },
    gleam: { day: '#ffffff', dusk: '#ffe1c2', night: '#7c93b0' },
    style: 'soft',
  },
  canopyGlow: { color: '#000000', night: 0 },
  pools: { color: '#000000', night: 0 },
  loves: {
    petals: ['#fff4dc', '#ffd27f', '#ff9e7d', '#f7b8d0', '#cdb8ff'],
    firefly: '#fff3a6',
  },
  city: {
    walls: '#ece8df',
    roofs: ['#8a6f5a', '#5d6d75'],
    flatRoof: '#e2dfd6',
    road: '#d2d6c0',
    ground: { day: '#a9bb92', dusk: '#98a07e', night: '#26352f' },
    trees: ['#5e9150', '#6fa05a', '#4e8045'],
  },
  exposure: 1.05,
};

/** Late-summer light: warm stone, terracotta roofs, a peach horizon. */
const golden: ParkLook = {
  name: 'Golden hour',
  materials: {
    lawn: { color: '#8aa352' },
    path: { color: '#dccaa0', roughness: 1 },
    sand: { color: '#d8b77e' },
    building: { color: '#e8d4b6' },
    roof: { color: '#a5573a' },
    wood: { color: '#6e4a2c' },
    rail: { color: '#5f5249' },
  },
  sky: {
    top: { day: '#86aecf', dusk: '#5b6caa', night: '#0d1230' },
    bottom: { day: '#f7d7ab', dusk: '#ffb47c', night: '#2a2a4a' },
  },
  fog: { day: '#f2d9b4', dusk: '#f0ba8e', night: '#1f2238', near: 30, far: 90 },
  hemisphere: {
    sky: { day: '#ffe9c9', dusk: '#ffc998', night: '#8fa0d0' },
    ground: '#6e6a3a',
    intensity: 1.05,
  },
  ambient: { base: 0.46, day: 0.34 },
  sun: { color: '#ffe0b0', sunset: '#ff9d5c', intensity: 2.9 },
  moon: { color: '#c7b2e6', intensity: 0.6 },
  water: {
    deep: { day: '#2a6d76', dusk: '#2c5a70', night: '#121a34' },
    rim: { day: '#f1b98b', dusk: '#ffa676', night: '#3d4a72' },
    gleam: { day: '#fff0d8', dusk: '#ffe0b0', night: '#8f9fc8' },
    style: 'soft',
  },
  canopyGlow: { color: '#ffb35c', night: 0.06 },
  pools: { color: '#000000', night: 0 },
  loves: {
    petals: ['#fff4dc', '#ffd27f', '#ff9e7d', '#f7b8d0', '#cdb8ff'],
    firefly: '#fff3a6',
  },
  city: {
    walls: '#e6d1b3',
    roofs: ['#a5573a', '#8a5a44'],
    flatRoof: '#dccbb0',
    road: '#e2cfa6',
    ground: { day: '#b0ad72', dusk: '#9a8a5e', night: '#2b2a2c' },
    trees: ['#6f8f45', '#7d9a4e', '#5d7d3c'],
  },
  exposure: 1.1,
};

/** Blue hour first: paths recede, and every idea is a small warm light. */
const lanterns: ParkLook = {
  name: 'Lanterns',
  materials: {
    lawn: { color: '#5b8a5e' },
    path: { color: '#86a487', roughness: 1 },
    sand: { color: '#a9a78a' },
    building: { color: '#d9dccf' },
    roof: { color: '#3d4f57' },
    wood: { color: '#5a4632' },
    rail: { color: '#4b5552' },
  },
  sky: {
    top: { day: '#6fa0c8', dusk: '#34467f', night: '#060c22' },
    bottom: { day: '#d8e6e2', dusk: '#d99b8c', night: '#223661' },
  },
  fog: { day: '#cfddd8', dusk: '#7a7a9e', night: '#172443', near: 34, far: 98 },
  hemisphere: {
    sky: { day: '#d4ecf2', dusk: '#a3b3e2', night: '#7fa2ff' },
    ground: '#44603f',
    intensity: 0.85,
  },
  ambient: { base: 0.26, day: 0.55 },
  sun: { color: '#fff2d8', sunset: '#ffb07a', intensity: 2.5 },
  moon: { color: '#9bb6ff', intensity: 0.85 },
  water: {
    deep: { day: '#245f6e', dusk: '#1d3558', night: '#060e22' },
    rim: { day: '#a8d3d8', dusk: '#c98f8a', night: '#28447a' },
    gleam: { day: '#ffffff', dusk: '#ffd4a2', night: '#f3c890' },
    style: 'soft',
  },
  canopyGlow: { color: '#ffc27a', night: 0.05 },
  pools: { color: '#ff9f45', night: 0.85 },
  loves: {
    petals: ['#fff4dc', '#ffd27f', '#ff9e7d', '#f7b8d0', '#cdb8ff'],
    firefly: '#fff3a6',
  },
  city: {
    walls: '#d4d7cc',
    roofs: ['#3d4f57', '#56646a'],
    flatRoof: '#c8ccc3',
    road: '#9fb39f',
    ground: { day: '#86a386', dusk: '#50665c', night: '#1a2a2c' },
    trees: ['#4f7f55', '#5d8d5f', '#406e49'],
  },
  exposure: 1.1,
};

/**
 * Golden hour by day and dusk, Lanterns after dark. A cooler lawn keeps the
 * grass green under warm light; night keeps a faint violet horizon.
 */
const goldenLanterns: ParkLook = {
  name: 'Golden lanterns',
  materials: {
    lawn: { color: '#6c9a55' },
    path: { color: '#d6c7a0', roughness: 1 },
    sand: { color: '#d8bb86' },
    building: { color: '#ead8bd' },
    roof: { color: '#a5573a' },
    wood: { color: '#6e4a2c' },
    rail: { color: '#5f5249' },
  },
  sky: {
    top: { day: '#8ab4d4', dusk: '#5b6caa', night: '#070d26' },
    bottom: { day: '#f6dcb4', dusk: '#ffb07e', night: '#3a3568' },
  },
  fog: {
    day: '#f1dcbc',
    dusk: '#e8a893',
    night: '#1d2452',
    near: 30,
    far: 94,
  },
  hemisphere: {
    sky: { day: '#fff0d6', dusk: '#ffc4a4', night: '#8a9cf0' },
    ground: '#56703f',
    intensity: 1,
  },
  ambient: { base: 0.4, day: 0.38 },
  sun: { color: '#ffe6bd', sunset: '#ff9d5c', intensity: 2.7 },
  moon: { color: '#9bb6ff', intensity: 0.85 },
  water: {
    deep: { day: '#2a6f7a', dusk: '#34507a', night: '#060e22' },
    rim: { day: '#b9e0dc', dusk: '#f0a88a', night: '#28447a' },
    gleam: { day: '#fff4e0', dusk: '#ffe0b0', night: '#f3c890' },
    style: 'soft',
  },
  canopyGlow: { color: '#000000', night: 0 },
  pools: { color: '#ff9f45', night: 0.85 },
  loves: {
    petals: ['#fff4dc', '#ffd27f', '#ff9e7d', '#f7b8d0', '#cdb8ff'],
    firefly: '#fff3a6',
  },
  city: {
    walls: '#ebdcc4',
    roofs: ['#a5573a', '#b86a45', '#6e6a66'],
    flatRoof: '#ddd3c2',
    road: '#dccdaa',
    ground: { day: '#a6b184', dusk: '#76825e', night: '#1f2d2b' },
    trees: ['#5f8f49', '#6f9c52', '#4f7e40', '#7aa55a'],
  },
  exposure: 1.1,
};

export const PARK_LOOKS = {
  current,
  paper,
  golden,
  lanterns,
  'golden-lanterns': goldenLanterns,
} as const;
export type ParkLookName = keyof typeof PARK_LOOKS;
export const DEFAULT_LOOK: ParkLook = goldenLanterns;

export type LookSelection = {
  look: ParkLook;
  sunAltitude: number | null;
  /**
   * `?loves=demo` draws sample loves for look development — on localhost only,
   * so visitors are never shown sample text dressed as residents' loves.
   */
  demoLoves: boolean;
  /** `?cam=x,y,z,tx,ty,tz` frames a fixed shot for look development, on localhost only. */
  camera: [number, number, number, number, number, number] | null;
};

export function readLook(search: string): LookSelection {
  const params = new URLSearchParams(search);
  const name = params.get('look');
  const sun = Number(params.get('sun'));
  return {
    look:
      name && Object.hasOwn(PARK_LOOKS, name)
        ? PARK_LOOKS[name as ParkLookName]
        : DEFAULT_LOOK,
    sunAltitude:
      params.has('sun') && Number.isFinite(sun)
        ? Math.max(-40, Math.min(60, sun))
        : null,
    demoLoves: params.get('loves') === 'demo' && localhostOnly(),
    camera: lookCamera(params.get('cam')),
  };
}
function localhostOnly() {
  return (
    typeof location !== 'undefined' &&
    ['localhost', '127.0.0.1'].includes(location.hostname)
  );
}
function lookCamera(value: string | null) {
  const numbers = value?.split(',').map(Number);
  return numbers?.length === 6 &&
    numbers.every(Number.isFinite) &&
    localhostOnly()
    ? (numbers as [number, number, number, number, number, number])
    : null;
}

const noSubscription = () => () => {};
/** The server renders the default look; a `?look=` or `?sun=` override applies on the client. */
export function useParkLook(): LookSelection {
  const search = useSyncExternalStore(
    noSubscription,
    () => location.search,
    () => '',
  );
  return useMemo(() => readLook(search), [search]);
}
