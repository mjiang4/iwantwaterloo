'use client';
/* oxlint-disable react/react-compiler -- Effects hydrate browser-only preferences after SSR and synchronize query/navigation state. */
import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Sun,
  Moon,
  Heart,
  WandSparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { GardenMoment } from '@/lib/garden-visuals';
import { requestJSON } from '@/lib/client';
import { useMediaQuery } from '@/hooks/use-media-query';
import { GROVE_SIZE, type Idea } from '@/lib/garden';
import type { ButterflyVisit } from '@/lib/garden-discovery';
import { PlantReceipt } from './idea-share';
const GardenScene = lazy(() => import('./garden-scene'));
import { questionFor, progressLabel } from '@/lib/participation';
import { ideaTheme } from '@/features/park/themes';
import { ThemePicker } from '@/features/park/theme-picker';
import {
  QualityPicker,
  type ParkQuality,
} from '@/features/park/quality-picker';
import { useParkTime } from '@/features/park/use-park-time';
import { setParkFull, useIsPhone, useParkFull } from '@/features/park/tier';
import { useDeclutter } from '@/features/park/declutter';
import { useParkLook } from '@/features/park/look';
import { parkLight } from '@/features/park/time';
import { useLoves, useLoveEcho } from '@/features/loves/queries';
import { LoveComposer } from '@/features/loves/love-composer';
import type { LoveSpot } from '@/features/loves/places';
import { ReportLove } from '@/features/loves/report-love';
import type { GardenPage } from '@/features/ideas/model';
const EMPTY_IDEAS: Idea[] = [];
class SceneBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; onFailure: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
export function GardenExplorer({
  quality,
  onQualityChange,
  mine,
  postedIdea,
  onReceiptDone,
  query,
  place,
  focusIdea,
  moment,
  onMomentComplete,
  plantingId,
  highlightId,
  onHighlighted,
  butterflyVisit,
  onPlanted,
  onRead,
  onExplore,
  onDiscover,
  obscured,
  showIntroduction,
  discoveryRequest,
  onSupport,
  pending,
  onList,
  resetRequest = 0,
  lovePlacementRequest,
  onLovePlacementStarted,
  onPlantIdea,
  onLoveModeChange,
  onBack,
}: {
  quality: ParkQuality;
  onQualityChange: (quality: ParkQuality) => void;
  mine: boolean;
  postedIdea: Idea | null;
  onReceiptDone: () => void;
  query: string;
  place: string;
  focusIdea: Idea | null;
  moment: GardenMoment | null;
  onMomentComplete: (serial: number) => void;
  plantingId: string | null;
  highlightId: string | null;
  onHighlighted: () => void;
  butterflyVisit: RefObject<ButterflyVisit>;
  onPlanted: () => void;
  onRead: (idea: Idea) => void;
  onExplore: () => void;
  onDiscover: () => void;
  obscured: boolean;
  showIntroduction: boolean;
  discoveryRequest: number;
  onSupport: (idea: Idea) => void;
  pending: Set<string>;
  onList: () => void;
  /**
   * Increments when the app returns to the whole garden ("Back to trees"). The
   * explorer resets its own view rather than remounting, so the 3D scene, its
   * models and the city are kept instead of rebuilt.
   */
  resetRequest?: number;
  /** Increments when the visitor chooses "I love…" — enters placement mode. */
  lovePlacementRequest: number;
  /** Called once a request is acted on, so it never replays after a remount. */
  onLovePlacementStarted: () => void;
  /** Opens the idea composer ("Make it even better"). */
  onPlantIdea: () => void;
  /** Reports whether a love is being placed or written (the wordmark reads "i love"). */
  onLoveModeChange?: (active: boolean) => void;
  onBack: () => void;
}) {
  const openOnTap = useMediaQuery('(max-width:760px), (pointer:coarse)');
  const [page, setPage] = useState(
      Math.floor((focusIdea?.plot ?? 0) / GROVE_SIZE),
    ),
    [zoom, setZoom] = useState(1),
    [reset, setReset] = useState(0),
    [motion, setMotion] = useState(false),
    [failed, setFailed] = useState(false),
    [reducedMotion, setReducedMotion] = useState(false),
    [preferencesReady, setPreferencesReady] = useState(false),
    [inspectedId, setInspectedId] = useState<string | null>(
      focusIdea?.id || null,
    ),
    [framedId, setFramedId] = useState<string | null>(focusIdea?.id || null),
    [nearby, setNearby] = useState<string[]>([]);
  const [discoveryIndex, setDiscoveryIndex] = useState(0);
  const [theme, setTheme] = useState('all');
  const [detailLoading, setDetailLoading] = useState(quality !== 'light');
  const [qualityNotice, setQualityNotice] = useState('');
  // Phones start stripped down; "Transform me" grows the full park in place.
  const full = useParkFull();
  const phone = useIsPhone();
  const lite = !full && quality === 'light';
  const [transforming, setTransforming] = useState(false);
  const onCityReady = useCallback(() => setTransforming(false), []);
  useEffect(() => {
    // Without a light-mode scene there is no city to wait for.
    if (quality !== 'light' || failed) setTransforming(false);
  }, [quality, failed]);
  const [sceneKey, setSceneKey] = useState(0);
  const handledDiscovery = useRef(0);
  const onDetailReady = useCallback(() => setDetailLoading(false), []);
  const onDetailError = useCallback(() => {
    onQualityChange('light');
    setDetailLoading(false);
    setQualityNotice('Detail could not load. Light mode is still available.');
  }, [onQualityChange]);
  const clock = useParkTime();
  const { sunAltitude } = useParkLook();
  // The place line follows the same sky as the scene, including a pinned look-dev sun.
  const daylight =
    sunAltitude === null
      ? clock.daylight
      : parkLight(clock.timestamp || Date.now(), 'live', sunAltitude).daylight;
  const explorerRef = useRef<HTMLElement>(null);
  useDeclutter(explorerRef, !obscured);
  // Follows a pinned look-dev sun too, so the interface matches the scene.
  const night = sunAltitude === null ? clock.night : sunAltitude < -6;
  useEffect(() => {
    setPage(0);
    setNearby([]);
  }, [query, place]);
  useEffect(() => {
    if (focusIdea) {
      setTheme('all');
      setPage(Math.floor((focusIdea.plot ?? 0) / GROVE_SIZE));
      setInspectedId(focusIdea.id);
      setFramedId(focusIdea.id);
    }
  }, [focusIdea, moment?.serial]);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion:reduce)');
    const update = () => {
      let enabled = true;
      try {
        enabled = localStorage.getItem('garden-motion') !== 'off';
      } catch {}
      setReducedMotion(media.matches);
      setMotion(!media.matches && enabled);
      setPreferencesReady(true);
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const result = useQuery({
    queryKey: ['garden', page, query, mine, place],
    queryFn: ({ signal }) =>
      requestJSON<GardenPage>(
        `/api/ideas?${new URLSearchParams({ garden: '1', mine: mine ? '1' : '0', page: String(page), q: query, place })}`,
        { signal },
      ),
    refetchInterval: 15000,
  });
  const data = result.data,
    ideas = data?.ideas || EMPTY_IDEAS;
  const discovery = useQuery({
    queryKey: [
      'discovery',
      Math.floor(discoveryIndex / 50),
      query,
      place,
      mine,
    ],
    queryFn: ({ signal }) =>
      requestJSON<GardenPage>(
        `/api/ideas?${new URLSearchParams({ sort: 'discover', page: String(Math.floor(discoveryIndex / 50)), q: query, place, mine: mine ? '1' : '0' })}`,
        { signal },
      ),
    enabled: discoveryRequest > 0,
    staleTime: 15000,
  });
  useEffect(() => {
    if (
      !discoveryRequest ||
      handledDiscovery.current === discoveryRequest ||
      !discovery.data
    )
      return;
    const idea = discovery.data.ideas[discoveryIndex % 50];
    if (!idea) {
      if (discovery.data.total) setDiscoveryIndex(0);
      return;
    }
    handledDiscovery.current = discoveryRequest;
    setTheme('all');
    setPage(Math.floor((idea.plot ?? 0) / GROVE_SIZE));
    setInspectedId(idea.id);
    setFramedId(idea.id);
    setDiscoveryIndex(
      (index) => (index + 1) % Math.max(1, discovery.data!.total),
    );
  }, [discoveryRequest, discovery.data, discoveryIndex]);
  const visibleIdeas =
    theme === 'all' || moment
      ? ideas
      : ideas.filter((i) => ideaTheme(i).id === theme);
  const inspected = ideas.find((idea) => idea.id === inspectedId);
  // Loves share the garden with ideas: flowers on the ground, fireflies at night.
  const loves = useLoves();
  const loveEcho = useLoveEcho();
  const [placingLove, setPlacingLove] = useState(false);
  const [placementNote, setPlacementNote] = useState('');
  const [loveSpot, setLoveSpot] = useState<LoveSpot | null>(null);
  const [selectedLoveId, setSelectedLoveId] = useState<string | null>(null);
  const selectedLove = loves.data?.loves.find((l) => l.id === selectedLoveId);
  // Read synchronously by selection handlers: placement taps never select a tree.
  const placingRef = useRef(false);
  const selectBlockedUntil = useRef(0);
  const selectionBlocked = () =>
    placingRef.current || performance.now() < selectBlockedUntil.current;
  useEffect(() => {
    if (!lovePlacementRequest) return;
    onLovePlacementStarted();
    onExplore();
    setInspectedId(null);
    setSelectedLoveId(null);
    setPlacementNote('');
    // Tapping needs the modeled scene; otherwise choose a named place.
    if (failed) {
      setLoveSpot({ choose: true });
      return;
    }
    placingRef.current = true;
    setPlacingLove(true);
  }, [
    lovePlacementRequest,
    onLovePlacementStarted,
    onExplore,
    failed,
    quality,
  ]);
  const loveMode = placingLove || loveSpot !== null;
  useEffect(() => {
    onLoveModeChange?.(loveMode);
    // Leaving the garden mid-love must not leave the wordmark reading "i love".
    return () => onLoveModeChange?.(false);
  }, [loveMode, onLoveModeChange]);
  const chooseLovePlace = () => {
    placingRef.current = false;
    setPlacingLove(false);
    setPlacementNote('');
    setLoveSpot({ choose: true });
  };
  const placeLove = useCallback((x: number, z: number) => {
    placingRef.current = false;
    selectBlockedUntil.current = performance.now() + 400;
    setPlacingLove(false);
    setInspectedId(null);
    setLoveSpot({ x, z });
  }, []);
  const rejectLoveSpot = useCallback(
    () =>
      setPlacementNote(
        'That’s a path, the lake or a building. Tap a patch of grass.',
      ),
    [],
  );
  const pages = data?.grovePages || [0],
    pageIndex = pages.indexOf(page);
  useEffect(() => {
    if (
      data &&
      !result.isFetching &&
      !moment &&
      !data.grovePages.includes(page)
    )
      setPage(data.grovePages[0] ?? 0);
  }, [data, page, moment, result.isFetching]);
  const onFailure = useCallback(() => {
    if (quality !== 'light') {
      onQualityChange('light');
      setDetailLoading(false);
      setQualityNotice('Your browser switched to Light mode.');
      setSceneKey((key) => key + 1);
      return;
    }
    setFailed(true);
    if (moment) onMomentComplete(moment.serial);
  }, [moment, onMomentComplete, quality, onQualityChange]);
  function selectTree(id: string) {
    setInspectedId(id);
    const idea = ideas.find((item) => item.id === id);
    if (openOnTap && idea) onRead(idea);
  }
  function resetView() {
    setInspectedId(null);
    setSelectedLoveId(null);
    setFramedId(null);
    setNearby([]);
    setZoom(1);
    setReset((n) => n + 1);
  }
  function returnToGarden() {
    resetView();
    onBack();
  }
  const resetViewRef = useRef(resetView);
  resetViewRef.current = resetView;
  useEffect(() => {
    if (resetRequest) resetViewRef.current();
  }, [resetRequest]);
  function toggleMotion() {
    setMotion((v) => {
      try {
        localStorage.setItem('garden-motion', v ? 'off' : 'on');
      } catch {}
      return !v;
    });
  }
  return (
    <section
      ref={explorerRef}
      className="garden-explorer"
      aria-label="Idea trees"
    >
      <div className="garden-caption">
        <p>Ideas plant trees. Likes help them grow.</p>
        <span>
          {data
            ? `${data.total} community ${data.total === 1 ? 'tree' : 'trees'}${data.examplesTotal ? ` · ${data.examplesTotal} examples` : ''}`
            : 'Loading…'}
        </span>
      </div>
      {result.isError ? (
        <div className="empty-state">
          <p>Couldn’t load the garden.</p>
          <Button variant="ghost" onClick={() => result.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <div
          className="garden-stage"
          data-night={night}
          data-motion={motion}
          data-celebrating={moment?.kind || undefined}
        >
          {(framedId || inspectedId || postedIdea) && (
            <button
              type="button"
              className="garden-return"
              aria-label="Back to garden"
              onClick={returnToGarden}
            >
              <ArrowLeft size={20} aria-hidden="true" />
              <span>Back</span>
            </button>
          )}
          <div className="scene">
            <SceneBoundary
              key={sceneKey}
              onFailure={onFailure}
              fallback={
                <div className="scene-fallback">
                  <Button onClick={onList}>View ideas</Button>
                </div>
              }
            >
              <Suspense
                fallback={<div className="scene-fallback">Loading garden…</div>}
              >
                {!preferencesReady ? (
                  <div className="scene-fallback">Loading garden…</div>
                ) : failed ? (
                  <div className="scene-fallback">
                    <Button onClick={onList}>View ideas</Button>
                  </div>
                ) : (
                  <GardenScene
                    key={sceneKey}
                    quality={quality}
                    lite={lite}
                    people={data?.people}
                    peopleMode={phone ? 'phone' : 'full'}
                    riseCity={transforming && motion}
                    onCityReady={onCityReady}
                    discoveryId={
                      showIntroduction ? visibleIdeas[0]?.id || null : null
                    }
                    onDetailReady={onDetailReady}
                    onDetailError={onDetailError}
                    ideas={visibleIdeas}
                    selected={inspected?.id || focusIdea?.id || null}
                    onSelect={(id) => {
                      if (selectionBlocked()) return;
                      onExplore();
                      setSelectedLoveId(null);
                      // Opens the idea immediately on touch screens (main).
                      selectTree(id);
                    }}
                    loves={loves.data?.loves}
                    selectedLoveId={selectedLoveId}
                    onSelectLove={(id) => {
                      if (selectionBlocked()) return;
                      onExplore();
                      setInspectedId(null);
                      setSelectedLoveId(id);
                    }}
                    placingLove={placingLove}
                    onPlaceLove={placeLove}
                    onPlaceLoveRejected={rejectLoveSpot}
                    focusId={framedId}
                    moment={moment}
                    onMomentComplete={onMomentComplete}
                    motion={motion && !obscured && nearby.length === 0}
                    night={night}
                    timestamp={clock.timestamp}
                    timeMode={clock.mode}
                    plantingId={plantingId}
                    highlightId={highlightId}
                    onHighlighted={onHighlighted}
                    butterflyVisit={butterflyVisit}
                    onPlanted={onPlanted}
                    onCluster={(ids) => {
                      if (selectionBlocked()) return;
                      onExplore();
                      setNearby(ids);
                    }}
                    zoom={zoom}
                    reset={reset}
                    onFailure={onFailure}
                  />
                )}
              </Suspense>
            </SceneBoundary>
          </div>
          {theme !== 'all' &&
            visibleIdeas.length === 0 &&
            !result.isPending && (
              <output className="park-empty-lens">
                No matching ideas in this grove.
              </output>
            )}
          {moment && (
            <output className="garden-moment-caption">
              {moment.kind === 'plant'
                ? 'Your idea is taking root.'
                : '+1. A little bigger.'}
            </output>
          )}
          {!failed && (lite || transforming) && (
            <button
              type="button"
              className="park-transform"
              aria-busy={transforming}
              disabled={transforming}
              onClick={() => {
                setTransforming(true);
                onExplore();
                setParkFull(true);
              }}
            >
              <WandSparkles size={16} aria-hidden="true" />
              {transforming ? 'Transforming…' : 'Transform me'}
            </button>
          )}
          <a
            className="park-credit"
            href="https://www.openstreetmap.org/copyright"
          >
            © OpenStreetMap
          </a>
          <div
            className="park-location"
            data-sky={daylight > 0.35 ? 'light' : 'dark'}
          >
            <h1>Waterloo Park</h1>
            <span>
              Waterloo, Ontario ·{' '}
              {clock.mode === 'live' ? clock.clock : clock.mode + ' preview'}
            </span>
          </div>
          <div className="garden-controls">
            <button
              className="icon-button"
              aria-label="Zoom in"
              title="Zoom in"
              disabled={zoom >= 1.4}
              onClick={() => setZoom((z) => Math.min(1.4, z + 0.15))}
            >
              <Plus size={16} />
            </button>
            <button
              className="icon-button"
              aria-label="Zoom out"
              title="Zoom out"
              disabled={zoom <= 0.7}
              onClick={() => setZoom((z) => Math.max(0.7, z - 0.15))}
            >
              <Minus size={16} />
            </button>
            <button
              className="icon-button"
              aria-label="Reset view"
              title="Reset view"
              onClick={returnToGarden}
            >
              <RotateCcw size={16} />
            </button>
            <button
              className="icon-button"
              aria-label={motion ? 'Pause motion' : 'Play motion'}
              title={
                reducedMotion
                  ? 'Motion reduced by your device setting'
                  : motion
                    ? 'Pause motion'
                    : 'Play motion'
              }
              disabled={reducedMotion}
              onClick={toggleMotion}
            >
              {motion ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <span className="garden-control-divider" aria-hidden="true" />
            <button
              className="icon-button"
              aria-label={
                clock.mode === 'live'
                  ? 'Preview daylight'
                  : clock.mode === 'day'
                    ? 'Preview night'
                    : 'Return to live time'
              }
              title={
                clock.mode === 'live'
                  ? 'Live Waterloo time'
                  : 'Preview ' + clock.mode
              }
              onClick={() =>
                clock.setMode(
                  clock.mode === 'live'
                    ? 'day'
                    : clock.mode === 'day'
                      ? 'night'
                      : 'live',
                )
              }
            >
              {night ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <QualityPicker
              quality={quality}
              loading={detailLoading}
              notice={qualityNotice}
              onChange={(next) => {
                onQualityChange(next);
                setDetailLoading(next !== 'light');
                setQualityNotice('');
              }}
            />
          </div>
        </div>
      )}
      {postedIdea && (
        <PlantReceipt
          idea={postedIdea}
          onDone={onReceiptDone}
          onDevelop={() => {
            onReceiptDone();
            onRead(postedIdea);
          }}
        />
      )}
      {placingLove && (
        <output className="love-placement">
          <span>
            <strong>Tap the grass where it is.</strong>{' '}
            {placementNote || 'Your love will bloom there.'}
          </span>
          <span className="love-placement-actions">
            <button type="button" onClick={chooseLovePlace}>
              Choose a place instead
            </button>
            <button
              type="button"
              onClick={() => {
                placingRef.current = false;
                setPlacingLove(false);
                setPlacementNote('');
              }}
            >
              Cancel
            </button>
          </span>
        </output>
      )}
      {selectedLove && !inspected && !postedIdea && !placingLove && (
        <div className="garden-love-dock" aria-label="Selected love">
          <figure>
            <span className="love-caption-kicker">I love</span>
            <blockquote>{selectedLove.body}</blockquote>
            {selectedLove.displayName && (
              <figcaption>{selectedLove.displayName}</figcaption>
            )}
          </figure>
          <div className="love-dock-actions">
            <button
              type="button"
              className="love-echo"
              aria-pressed={selectedLove.echoed}
              disabled={loveEcho.pending.has(selectedLove.id)}
              onClick={() => void loveEcho.echo(selectedLove)}
            >
              <Heart
                size={16}
                fill={selectedLove.echoed ? 'currentColor' : 'none'}
              />
              Me too{selectedLove.echoes ? ` · ${selectedLove.echoes}` : ''}
            </button>
            <button type="button" className="love-build" onClick={onPlantIdea}>
              Make it even better
            </button>
            <ReportLove key={selectedLove.id} loveId={selectedLove.id} />
            <button
              type="button"
              className="icon-button"
              aria-label="Close love"
              onClick={() => setSelectedLoveId(null)}
            >
              <X size={17} />
            </button>
          </div>
          {loveEcho.error && (
            <p className="form-error" role="alert">
              {loveEcho.error}
            </p>
          )}
        </div>
      )}
      {inspected && !postedIdea && (
        <div className="garden-idea-dock" aria-label="Selected tree">
          <button
            className="garden-idea-title"
            aria-label={`Build on this: ${inspected.title}`}
            onClick={() => onRead(inspected)}
          >
            <span>
              <small>{progressLabel(inspected)}</small>
              <strong>{inspected.title}</strong>
              <span className="dock-question">{questionFor(inspected)}</span>
              <span className="dock-build">
                Build on this <ChevronRight size={15} />
              </span>
            </span>
          </button>
          <button
            className="support-button"
            aria-pressed={inspected.watered}
            data-supported={inspected.watered}
            aria-label={`${inspected.watered ? 'Unlike' : 'Like'} ${inspected.title}. ${inspected.waters} likes`}
            disabled={pending.has(inspected.id) || moment?.id === inspected.id}
            onClick={() => onSupport(inspected)}
          >
            <Heart
              size={18}
              fill={inspected.watered ? 'currentColor' : 'none'}
            />
            <span aria-live="polite">{inspected.waters}</span>
          </button>
          <button
            className="icon-button"
            aria-label="Next idea"
            title="Next idea"
            disabled={discovery.isFetching}
            onClick={onDiscover}
          >
            <ChevronRight size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Deselect tree"
            onClick={returnToGarden}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {discovery.isError && (
        <div className="discovery-error" role="alert">
          Couldn’t find the next idea.{' '}
          <button onClick={() => void discovery.refetch()}>Retry</button>
        </div>
      )}
      <div className="park-discovery">
        <ThemePicker
          value={theme}
          onChange={(id) => {
            setTheme(id);
            setInspectedId(null);
          }}
        />
        <div className="garden-pagination">
          {!!data?.total && !inspected && !postedIdea && (
            <button
              className="find-idea"
              disabled={discovery.isFetching}
              onClick={onDiscover}
            >
              Find an idea <ChevronRight size={15} />
            </button>
          )}
          <span>
            {data && (pages.length > 1 || page > 0) ? `Grove ${page + 1}` : ''}
          </span>
          {data && pages.length > 1 && (
            <div>
              <button
                className="icon-button"
                aria-label="Previous grove"
                disabled={pageIndex <= 0}
                onClick={() => setPage(pages[pageIndex - 1])}
              >
                <ChevronLeft size={17} />
              </button>
              <button
                className="icon-button"
                aria-label="Next grove"
                disabled={pageIndex + 1 >= pages.length}
                onClick={() => setPage(pages[pageIndex + 1])}
              >
                <ChevronRight size={17} />
              </button>
            </div>
          )}
        </div>
      </div>
      <Dialog
        open={nearby.length > 0}
        onOpenChange={(open) => {
          if (!open) setNearby([]);
        }}
      >
        <DialogContent className="nearby-dialog">
          <DialogTitle>Nearby ideas</DialogTitle>
          <DialogDescription className="sr-only">
            Choose an idea to read.
          </DialogDescription>
          <div className="nearby-ideas">
            {nearby
              .map((id) => ideas.find((idea) => idea.id === id))
              .filter((idea): idea is Idea => !!idea)
              .map((idea) => (
                <button
                  key={idea.id}
                  onClick={() => {
                    setNearby([]);
                    selectTree(idea.id);
                  }}
                >
                  <span>{idea.title}</span>
                  <ChevronRight size={17} />
                </button>
              ))}
          </div>
        </DialogContent>
      </Dialog>
      {loveSpot && (
        <LoveComposer
          spot={loveSpot}
          onClose={() => setLoveSpot(null)}
          onPosted={(love) => {
            setLoveSpot(null);
            setInspectedId(null);
            setSelectedLoveId(love.id);
          }}
        />
      )}
    </section>
  );
}
