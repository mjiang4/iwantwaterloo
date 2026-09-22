'use client';
/* oxlint-disable react/react-compiler -- The renderer owns streamed tiles and GPU resources. */
import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { TilesRenderer } from '3d-tiles-renderer/three';
import { GoogleCloudAuthPlugin } from '3d-tiles-renderer/core/plugins';
import { GLTFExtensionsPlugin } from '3d-tiles-renderer/three/plugins';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import {
  Group,
  type Object3D,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Raycaster,
  Vector3,
} from 'three';
import map from '@/assets/park/map.json';
import { parkPlotPosition } from '@/features/park/plots';
import type { Idea } from '@/lib/garden';
import type { ParkProvider } from './provider';
import { parkFrame } from './frame';
import { ParkExtentPlugin, parkClippingPlanes } from './extent';

type Props = {
  provider: ParkProvider;
  ideas: Idea[];
  active: boolean;
  onReady: () => void;
  onError: () => void;
  onCredits: (value: string) => void;
  onHeights: (value: Record<string, number>) => void;
};
/** No tiles are bundled, prefetched or persisted. Google handles authorization per request. */
export default function RealismLayer(props: Props) {
  const { camera, gl, invalidate } = useThree();
  const container = useRef<Group>(null);
  const runtime = useRef<{
    tiles: TilesRenderer;
    dirty: boolean;
    fine: boolean;
    ready: boolean;
    credits: string;
    detailStep: number;
  } | null>(null);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });
  const { googleMapsKey, elevation } = props.provider;
  // Keep one resource budget across phone rotations and browser resizes.
  const [mobile] = useState(
    () => matchMedia('(pointer: coarse)').matches || innerWidth < 761,
  );
  const anchorKey = props.ideas
    .map((idea) => idea.id + ':' + idea.plot)
    .join(',');
  useEffect(() => {
    if (runtime.current) runtime.current.dirty = true;
    invalidate();
  }, [anchorKey, props.active, invalidate]);
  useEffect(() => {
    const host = container.current;
    if (!host || !googleMapsKey) return;
    const tiles = new TilesRenderer();
    // The renderer tracks original glTF materials before load-model fires.
    // Own and dispose the replacement materials separately on eviction.
    const materials = new Map<Object3D, Set<MeshBasicMaterial>>();
    const draco = new DRACOLoader().setDecoderPath('/draco/').setWorkerLimit(2);
    tiles.registerPlugin(
      new GoogleCloudAuthPlugin({
        apiToken: googleMapsKey,
        autoRefreshToken: true,
        useRecommendedSettings: false,
      }),
    );
    tiles.registerPlugin(
      new GLTFExtensionsPlugin({ dracoLoader: draco, autoDispose: false }),
    );
    const frame = parkFrame(map.center[0], map.center[1], elevation);
    tiles.registerPlugin(new ParkExtentPlugin(frame.localToEarth));
    const clippingPlanes = parkClippingPlanes();
    const previousClipping = gl.localClippingEnabled;
    gl.localClippingEnabled = true;
    const anisotropy = Math.min(
      mobile ? 4 : 8,
      gl.capabilities.getMaxAnisotropy(),
    );
    // Reach a usable park first, then refine the already visible tiles in place.
    tiles.errorTarget = 32;
    tiles.loadSiblings = false;
    // Ancestor fallback implicitly fetches all siblings, defeating the area mask.
    tiles.loadAncestors = false;
    tiles.lruCache.maxBytesSize = (mobile ? 128 : 256) * 1024 * 1024;
    tiles.lruCache.minBytesSize = tiles.lruCache.maxBytesSize * 0.7;
    // Google traverses many small JSON tilesets before reaching any meshes.
    // A 256-item limit deadlocks that traversal even with GPU memory available.
    tiles.lruCache.maxSize = mobile ? 2048 : 4096;
    tiles.lruCache.minSize = mobile ? 1024 : 2048;
    tiles.downloadQueue.maxJobsPerOrigin = mobile ? 4 : 8;
    tiles.parseQueue.maxJobs = 2;
    tiles.setCamera(camera);
    tiles.group.matrixAutoUpdate = false;
    tiles.group.matrix.copy(frame.earthToPark);
    host.add(tiles.group);
    host.updateMatrixWorld(true);
    const state = {
      tiles,
      dirty: true,
      fine: false,
      ready: false,
      credits: '',
      detailStep: 0,
    };
    runtime.current = state;
    let disposed = false;
    const fail = () => {
      if (!disposed) latest.current.onError();
    };
    const timeout = setTimeout(() => {
      if (!state.ready) fail();
    }, 45000);
    tiles.addEventListener('needs-update', invalidate);
    tiles.addEventListener('load-error', (event) => {
      // A single child failure after arrival should retain the already loaded view.
      if (!state.ready || event.tile === null) fail();
    });
    tiles.addEventListener('dispose-model', ({ scene }) => {
      materials.get(scene)?.forEach((material) => material.dispose());
      materials.delete(scene);
    });
    tiles.addEventListener('load-model', ({ scene }) => {
      const owned = new Set<MeshBasicMaterial>();
      materials.set(scene, owned);
      scene.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        object.castShadow = false;
        object.receiveShadow = false;
        // Preserve captured photographic lighting, including baked shadows.
        const unlit = (original: MeshStandardMaterial | MeshBasicMaterial) => {
          if (original.map) {
            original.map.anisotropy = anisotropy;
            original.map.needsUpdate = true;
          }
          if (original instanceof MeshBasicMaterial) {
            original.toneMapped = false;
            original.fog = false;
            original.clippingPlanes = clippingPlanes;
            return original;
          }
          const material = new MeshBasicMaterial({
            map: original.map,
            color: original.color,
            vertexColors: original.vertexColors,
            side: original.side,
            transparent: original.transparent,
            opacity: original.opacity,
            alphaTest: original.alphaTest,
            alphaMap: original.alphaMap,
            clippingPlanes,
            toneMapped: false,
            fog: false,
          });
          owned.add(material);
          original.dispose();
          return material;
        };
        object.material = Array.isArray(object.material)
          ? object.material.map(unlit)
          : unlit(object.material);
      });
      state.dirty = true;
      invalidate();
    });
    tiles.addEventListener('tile-visibility-change', ({ tile, visible }) => {
      if (visible && tile.geometricError <= 32) state.fine = true;
      state.dirty = true;
      invalidate();
    });
    invalidate();
    return () => {
      disposed = true;
      clearTimeout(timeout);
      runtime.current = null;
      host.remove(tiles.group);
      gl.localClippingEnabled = previousClipping;
      tiles.dispose();
      materials.forEach((owned) =>
        owned.forEach((material) => material.dispose()),
      );
      materials.clear();
      draco.dispose();
    };
  }, [googleMapsKey, elevation, camera, gl, invalidate, mobile]);
  const refinementTargets = mobile ? [32, 12, 6] : [32, 12, 6, 3];
  useFrame(() => {
    const state = runtime.current;
    if (!state || !props.active) return;
    const { tiles } = state;
    tiles.setResolutionFromRenderer(camera, gl);
    tiles.group.updateMatrixWorld(true);
    tiles.update();
    // The pinned renderer exposes cachedBytes but omits it from its declarations.
    const cache = tiles.lruCache;
    const bytes =
      'cachedBytes' in cache && typeof cache.cachedBytes === 'number'
        ? cache.cachedBytes
        : Infinity;
    if (
      state.ready &&
      state.detailStep < refinementTargets.length - 1 &&
      tiles.loadProgress === 1 &&
      bytes < cache.maxBytesSize * 0.72
    ) {
      tiles.errorTarget = refinementTargets[++state.detailStep];
      invalidate();
    }
    if (!state.dirty) return;
    state.dirty = false;
    const credits = tiles
      .getAttributions()
      .filter(
        (item) => item.type === 'string' && typeof item.value === 'string',
      )
      .map((item) => String(item.value))
      .filter(Boolean)
      .sort()
      .join('; ');
    if (credits !== state.credits) {
      state.credits = credits;
      latest.current.onCredits(credits);
    }
    if (!state.fine) return;
    // Surface samples anchor annotations for this view only. They are never stored/exported.
    const ray = new Raycaster(new Vector3(), new Vector3(0, -1, 0), 0, 200);
    const heights: Record<string, number> = {};
    const anchors = latest.current.ideas.length
      ? latest.current.ideas
      : [{ id: 'arrival', plot: 0 }];
    for (const idea of anchors.slice(0, 24)) {
      const [x, z] = parkPlotPosition(idea.plot ?? 0);
      ray.ray.origin.set(x, 100, z);
      const hit = ray.intersectObject(tiles.group, true)[0];
      if (hit && Math.abs(hit.point.y) < 12) heights[idea.id] = hit.point.y;
    }
    if (Object.keys(heights).length) {
      latest.current.onHeights(heights);
      if (!state.ready) {
        state.ready = true;
        invalidate();
        latest.current.onReady();
      }
    }
  });
  return <group ref={container} />;
}
