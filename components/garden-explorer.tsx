'use client';
/* oxlint-disable react/react-compiler -- Effects hydrate browser-only preferences after SSR and synchronize query/navigation state. */
import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
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
const GardenScene = lazy(() => import('./garden-scene'));
type GardenPage = {
  ideas: Idea[];
  examples: Idea[];
  total: number;
  examplesTotal: number;
  groves: number;
  grovePages: number[];
};
class SceneBoundary extends Component<
  { children: ReactNode; onFailure: () => void },
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
    return this.state.failed ? (
      <div className="scene-fallback">
        3D unavailable. Every idea is in the list.
      </div>
    ) : (
      this.props.children
    );
  }
}
export function GardenExplorer({
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
  onSupport,
  pending,
  onList,
}: {
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
    [night, setNight] = useState(false),
    [inspectedId, setInspectedId] = useState<string | null>(
      focusIdea?.id || null,
    ),
    [framedId, setFramedId] = useState<string | null>(focusIdea?.id || null),
    [nearby, setNearby] = useState<string[]>([]);
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem('garden-appearance') || '{}',
      );
      setNight(saved.night === true);
    } catch {}
  }, []);
  function saveAppearance(nextNight: boolean) {
    setNight(nextNight);
    try {
      localStorage.setItem(
        'garden-appearance',
        JSON.stringify({ night: nextNight }),
      );
    } catch {}
  }
  useEffect(() => {
    setPage(0);
    setNearby([]);
  }, [tag, query, connection]);
  useEffect(() => {
    if (focusIdea) {
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
    queryKey: ['garden', page, tag, query, connection],
    queryFn: () =>
      requestJSON<GardenPage>(
        `/api/ideas?${new URLSearchParams({ garden: '1', page: String(page), tag, q: query, connection })}`,
      ),
    refetchInterval: 15000,
  });
  const data = result.data,
    ideas = data?.ideas || [];
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
    setFailed(true);
    if (moment) onMomentComplete(moment.serial);
  }, [moment, onMomentComplete]);
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
          <div className="scene">
            <SceneBoundary onFailure={onFailure}>
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
                    ideas={ideas}
                    selected={inspected?.id || focusIdea?.id || null}
                    onSelect={setInspectedId}
                    focusId={framedId}
                    moment={moment}
                    onMomentComplete={onMomentComplete}
                    motion={motion}
                    night={night}
                    plantingId={plantingId}
                    highlightId={highlightId}
                    onHighlighted={onHighlighted}
                    butterflyVisit={butterflyVisit}
                    onPlanted={onPlanted}
                    onCluster={setNearby}
                    zoom={zoom}
                    reset={reset}
                    onFailure={onFailure}
                  />
                )}
              </Suspense>
            </SceneBoundary>
          </div>
          {moment && (
            <output className="garden-moment-caption">
              {moment.kind === 'plant'
                ? 'Your idea is taking root.'
                : '+1. A little bigger.'}
            </output>
          )}
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
              aria-label={night ? 'Switch to day' : 'Switch to night'}
              title={night ? 'Switch to day' : 'Switch to night'}
              onClick={() => saveAppearance(!night)}
            >
              {night ? <Moon size={17} /> : <Sun size={17} />}
            </button>
          </div>
        </div>
      )}
      {inspected && (
        <div className="garden-idea-dock" aria-label="Selected tree">
          <button
            className="garden-idea-title"
            onClick={() => onRead(inspected)}
          >
            {inspected.title}
            <ChevronRight size={16} />
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
      <div className="garden-pagination">
        <span>
          {data && (pages.length > 1 || page > 0)
            ? `Grove ${page + 1}`
            : 'New trees fill the open spaces.'}
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
