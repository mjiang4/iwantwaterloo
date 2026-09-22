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
import type { ParkProvider } from '@/features/park/realism/provider';
import { RealismCredits } from '@/features/park/realism/credits';
import { useParkTime } from '@/features/park/use-park-time';
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
  photoProvider,
  onQualityChange,
  mine,
  postedIdea,
  onReceiptDone,
  tag,
  query,
  connection,
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
}: {
  quality: ParkQuality;
  photoProvider: ParkProvider | null;
  onQualityChange: (quality: ParkQuality, provider?: ParkProvider) => void;
  mine: boolean;
  postedIdea: Idea | null;
  onReceiptDone: () => void;
  tag: string;
  query: string;
  connection: string;
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
}) {
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
  const [photoCredits, setPhotoCredits] = useState('');
  const [detailLoading, setDetailLoading] = useState(quality !== 'light');
  const [qualityNotice, setQualityNotice] = useState('');
  const [sceneKey, setSceneKey] = useState(0);
  const handledDiscovery = useRef(0);
  const onDetailReady = useCallback(() => setDetailLoading(false), []);
  const onDetailError = useCallback(() => {
    onQualityChange('light');
    setDetailLoading(false);
    setQualityNotice('Detail could not load. Light mode is still available.');
  }, [onQualityChange]);
  const onRealismError = useCallback(() => {
    onQualityChange('light');
    setDetailLoading(false);
    setPhotoCredits('');
    setQualityNotice('Realism could not load. Light mode is still available.');
  }, [onQualityChange]);
  const clock = useParkTime();
  const night = quality === 'realism' ? false : clock.night;
  useEffect(() => {
    setPage(0);
    setNearby([]);
  }, [tag, query, connection]);
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
    queryKey: ['garden', page, tag, query, connection, mine],
    queryFn: ({ signal }) =>
      requestJSON<GardenPage>(
        `/api/ideas?${new URLSearchParams({ garden: '1', mine: mine ? '1' : '0', page: String(page), tag, q: query, connection })}`,
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
      tag,
      query,
      connection,
      mine,
    ],
    queryFn: ({ signal }) =>
      requestJSON<GardenPage>(
        `/api/ideas?${new URLSearchParams({ sort: 'discover', page: String(Math.floor(discoveryIndex / 50)), tag, q: query, connection, mine: mine ? '1' : '0' })}`,
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
  function toggleMotion() {
    setMotion((v) => {
      try {
        localStorage.setItem('garden-motion', v ? 'off' : 'on');
      } catch {}
      return !v;
    });
  }
  return (
    <section className="garden-explorer" aria-label="Idea trees">
      <ThemePicker
        value={theme}
        onChange={(id) => {
          setTheme(id);
          setInspectedId(null);
        }}
      />
      <QualityPicker
        quality={quality}
        loading={detailLoading}
        notice={qualityNotice}
        onChange={(next, provider) => {
          if (next === 'realism') {
            if (!provider?.googleMapsKey) return;
            setPhotoCredits('');
            onExplore();
          }
          onQualityChange(next, provider);
          setDetailLoading(next !== 'light');
          setQualityNotice('');
        }}
      />
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
          data-realism={quality === 'realism'}
          data-motion={motion}
          data-celebrating={moment?.kind || undefined}
        >
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
                    photoProvider={photoProvider}
                    onRealismError={onRealismError}
                    onPhotoCredits={setPhotoCredits}
                    discoveryId={
                      showIntroduction ? visibleIdeas[0]?.id || null : null
                    }
                    onDetailReady={onDetailReady}
                    onDetailError={onDetailError}
                    ideas={visibleIdeas}
                    selected={inspected?.id || focusIdea?.id || null}
                    onSelect={(id) => {
                      onExplore();
                      setInspectedId(id);
                    }}
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
                ? quality === 'realism'
                  ? 'Your idea is here.'
                  : 'Your idea is taking root.'
                : quality === 'realism'
                  ? '+1. Your support is here.'
                  : '+1. A little bigger.'}
            </output>
          )}
          {quality === 'realism' && <RealismCredits credits={photoCredits} />}
          <div className="park-location">
            <h1>Waterloo Park</h1>
            <span>
              Waterloo, Ontario ·{' '}
              {quality === 'realism'
                ? 'Photographic imagery'
                : clock.mode === 'live'
                  ? clock.clock
                  : clock.mode + ' preview'}
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
              className={`icon-button ${framedId ? 'garden-back' : ''}`}
              aria-label={framedId ? 'Back to garden' : 'Reset view'}
              title={framedId ? 'Back to garden' : 'Reset view'}
              onClick={() => {
                setFramedId(null);
                setZoom(1);
                setReset((n) => n + 1);
              }}
            >
              <RotateCcw size={16} />
              {framedId && <span>Garden</span>}
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
              disabled={quality === 'realism'}
              aria-label={
                clock.mode === 'live'
                  ? 'Preview daylight'
                  : clock.mode === 'day'
                    ? 'Preview night'
                    : 'Return to live time'
              }
              title={
                quality === 'realism'
                  ? 'Photographic imagery has captured lighting'
                  : clock.mode === 'live'
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
            onClick={() => {
              setInspectedId(null);
              setFramedId(null);
            }}
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
                    setInspectedId(idea.id);
                  }}
                >
                  <span>{idea.title}</span>
                  <ChevronRight size={17} />
                </button>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
