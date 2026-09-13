'use client';
import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { requestJSON } from '@/lib/client';
import { GROVE_SIZE, type Idea } from '@/lib/garden';
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
  onRead,
  onList,
}: {
  tag: string;
  query: string;
  connection: string;
  focusIdea: Idea | null;
  onRead: (idea: Idea) => void;
  onList: () => void;
}) {
  const [page, setPage] = useState(0),
    [zoom, setZoom] = useState(1),
    [reset, setReset] = useState(0),
    [motion, setMotion] = useState(false),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    setPage(0);
  }, [tag, query, connection]);
  useEffect(() => {
    if (focusIdea) setPage(Math.floor((focusIdea.plot ?? 0) / GROVE_SIZE));
  }, [focusIdea]);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion:reduce)');
    const update = () => {
      let enabled = true;
      try {
        enabled = localStorage.getItem('garden-motion') !== 'off';
      } catch {}
      setMotion(!media.matches && enabled);
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
  const pages = data?.grovePages || [0],
    pageIndex = pages.indexOf(page);
  useEffect(() => {
    if (data && !data.grovePages.includes(page)) setPage(data.grovePages[0]);
  }, [data, page]);
  const onFailure = useCallback(() => setFailed(true), []);
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
        <p>Each idea adds a tree. Tap one to read.</p>
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
        <div className="garden-stage">
          <div className="scene">
            <SceneBoundary onFailure={onFailure}>
              <Suspense
                fallback={<div className="scene-fallback">Loading garden…</div>}
              >
                {failed ? (
                  <div className="scene-fallback">
                    <Button onClick={onList}>View ideas</Button>
                  </div>
                ) : (
                  <GardenScene
                    ideas={ideas}
                    selected={focusIdea?.id || null}
                    onSelect={(id) => {
                      const idea = ideas.find((i) => i.id === id);
                      if (idea) onRead(idea);
                    }}
                    motion={motion}
                    zoom={zoom}
                    reset={reset}
                    onFailure={onFailure}
                  />
                )}
              </Suspense>
            </SceneBoundary>
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
              onClick={() => {
                setZoom(1);
                setReset((n) => n + 1);
              }}
            >
              <RotateCcw size={16} />
            </button>
            <button
              className="icon-button"
              aria-label={motion ? 'Pause motion' : 'Play motion'}
              title={motion ? 'Pause motion' : 'Play motion'}
              onClick={toggleMotion}
            >
              {motion ? <Pause size={16} /> : <Play size={16} />}
            </button>
          </div>
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
    </section>
  );
}
