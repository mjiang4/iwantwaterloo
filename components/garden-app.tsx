'use client';
import { useIdeaFilters } from '@/features/ideas/use-idea-filters';
import { useIdeas } from '@/features/ideas/queries';
import type { GardenMoment } from '@/lib/garden-visuals';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from '@tanstack/react-query';
import { Info, Search, Sprout, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { TooltipProvider } from '@/components/ui/tooltip';
import { filterIdeas, type Idea } from '@/lib/garden';
import { IdeaComposer } from './idea-composer';
import { useGardenTools } from './garden-tools';
import { GardenExplorer } from './garden-explorer';
import type { ParkQuality } from '@/features/park/quality-picker';
import type { ParkProvider } from '@/features/park/realism/provider';
import { IdeaFilterMenu } from '@/features/ideas/idea-filter-menu';
import { IdeaDetails } from '@/features/ideas/idea-details';
import { IconButton } from './icon-button';
import { IdeaCard } from '@/features/ideas/idea-card';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useIdeaSupport } from '@/features/ideas/use-support';
import { GardenWelcome, useGardenIntroduction } from './garden-welcome';
import Link from 'next/link';
import { Contribute } from '@/features/park/contribute';
import { createButterflyVisit } from '@/lib/garden-discovery';
import type {
  PlantInput,
  IdeasPage as Page,
  SupportState,
} from '@/features/ideas/model';
import { requestJSON as api } from '@/lib/client';
function Garden() {
  const client = useQueryClient();
  const [view, setView] = useState('garden');
  // Preserve this visit's explicit opt-in when the form/list unmounts the canvas.
  const [parkView, setParkView] = useState<{
    quality: ParkQuality;
    provider: ParkProvider | null;
  }>({ quality: 'light', provider: null });
  const changeParkQuality = useCallback(
    (quality: ParkQuality, provider?: ParkProvider) => {
      setParkView((current) => ({
        quality,
        provider: provider ?? current.provider,
      }));
    },
    [],
  );
  const filters = useIdeaFilters();
  const {
    mine,
    setMine,
    tag,
    setTag,
    query,
    setQuery,
    debouncedQuery,
    setDebouncedQuery,
    connection,
    sort,
    filtered,
    clearFilters,
  } = filters;
  const [postedIdea, setPostedIdea] = useState<Idea | null>(null);
  const [plantingId, setPlantingId] = useState<string | null>(null);
  const [newIdeaId, setNewIdeaId] = useState<string | null>(null);
  const [treeHighlightId, setTreeHighlightId] = useState<string | null>(null);
  const onIdeaSeen = useCallback(() => setNewIdeaId(null), []);
  const onTreeHighlighted = useCallback(() => setTreeHighlightId(null), []);
  const butterflyVisit = useRef(createButterflyVisit());
  const onPlanted = useCallback(() => setPlantingId(null), []);
  const [moment, setMoment] = useState<GardenMoment | null>(null);
  const momentSerial = useRef(0);
  const onMomentComplete = useCallback(
    (serial: number) =>
      setMoment((current) => (current?.serial === serial ? null : current)),
    [],
  );
  const [gardenFocus, setGardenFocus] = useState<Idea | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selected, setSelected] = useState<Idea | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const ideaOpener = useRef<HTMLElement | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
  }, [searchOpen]);
  const [aboutOpen, setAboutOpen] = useState(false);
  const introduction = useGardenIntroduction();
  const [discoveryRequest, setDiscoveryRequest] = useState(0);
  const [directLinkError, setDirectLinkError] = useState('');
  const directLinkChecked = useRef(false);
  const small = useMediaQuery('(max-width:760px)');
  const reduced = useMediaQuery('(prefers-reduced-motion:reduce)');
  const list = useIdeas(filters);
  const ideas = useMemo(() => {
    const real = list.data?.pages.flatMap((p) => p.ideas) || [];
    return filterIdeas(real, 'all', debouncedQuery, connection, sort, tag);
  }, [list.data, tag, debouncedQuery, connection, sort]);
  const total = list.data?.pages[0].total || 0;
  useEffect(() => {
    if (directLinkChecked.current) return;
    const id = new URL(window.location.href).searchParams.get('idea');
    if (!id) {
      directLinkChecked.current = true;
      return;
    }
    directLinkChecked.current = true;
    void api<Page>(`/api/ideas?id=${encodeURIComponent(id)}`)
      .then((page) => {
        if (page.ideas[0]) {
          setSelected(page.ideas[0]);
          setSheetOpen(true);
        }
      })
      .catch(() =>
        setDirectLinkError('Couldn’t open that idea. Please try again.'),
      );
  }, []);
  const revealTree = useCallback(
    (idea: Idea, kind: GardenMoment['kind'], fromLikes = 0) => {
      clearFilters();
      setGardenFocus(idea);
      setMoment({
        id: idea.id,
        kind,
        fromLikes,
        serial: ++momentSerial.current,
      });
      setSheetOpen(false);
      setView('garden');
      const url = new URL(location.href);
      url.searchParams.delete('idea');
      history.replaceState(null, '', url);
    },
    [clearFilters],
  );
  useEffect(() => {
    if (!moment || view !== 'garden' || sheetOpen) return;
    // Wait for the detail sheet to release scroll lock before framing the garden.
    const timer = setTimeout(() => {
      const stage = document.getElementById('garden-view');
      stage?.scrollIntoView({
        behavior: reduced ? 'instant' : 'smooth',
        block: 'start',
      });
    }, 220);
    return () => clearTimeout(timer);
  }, [moment, view, sheetOpen, reduced]);
  const share = useCallback(
    async (input: PlantInput) => {
      const { idea } = await api<{ idea: Idea }>('/api/ideas', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      setPostedIdea(idea);
      setPlantingId(idea.id);
      setNewIdeaId(idea.id);
      setTreeHighlightId(idea.id);
      revealTree(idea, 'plant');
      void Promise.all([
        client.invalidateQueries({ queryKey: ['ideas'] }),
        client.invalidateQueries({ queryKey: ['tags'] }),
        client.invalidateQueries({ queryKey: ['garden'] }),
      ]).catch(() => {});
      return idea;
    },
    [client, revealTree],
  );
  const onSupportChange = useCallback((id: string, fields: SupportState) => {
    setSelected((idea) => (idea?.id === id ? { ...idea, ...fields } : idea));
  }, []);
  const onLiked = useCallback(
    (idea: Idea, previousLikes: number) => {
      setPostedIdea(null);
      revealTree(idea, 'like', previousLikes);
    },
    [revealTree],
  );
  const {
    support,
    pending,
    error: supportError,
    setError: setSupportError,
  } = useIdeaSupport({ onChange: onSupportChange, onLiked });
  const selectIdea = useCallback(
    (idea: Idea) => {
      ideaOpener.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setSelected(idea);
      setSheetOpen(true);
      setSupportError('');
      const url = new URL(window.location.href);
      url.searchParams.set('idea', idea.id);
      history.replaceState(null, '', url);
    },
    [setSupportError],
  );
  useGardenTools({
    plant: share,
    explore: (q, c) => {
      setQuery(q);
      setDebouncedQuery(q);
      setTag(c);
      setSearchOpen(Boolean(q));
      setView('ideas');
    },
  });
  function focusComposer() {
    introduction.dismiss();
    setView('ideas');
    requestAnimationFrame(() => {
      document.getElementById('new-idea')?.focus();
      document.getElementById('compose-heading')?.scrollIntoView({
        behavior: reduced ? 'instant' : 'smooth',
        block: 'center',
      });
    });
  }
  function showGarden(idea?: Idea) {
    clearFilters();
    setGardenFocus(idea || null);
    setView('garden');
    requestAnimationFrame(() =>
      document.getElementById('garden-view')?.scrollIntoView({
        behavior: reduced ? 'instant' : 'smooth',
        block: 'start',
      }),
    );
  }

  return (
    <TooltipProvider delay={250}>
      <Tabs
        value={view}
        onValueChange={(v) => setView(String(v))}
        className="garden-app park-experiment"
        data-view={view}
      >
        <button className="skip-link" onClick={focusComposer}>
          Suggest an idea
        </button>
        <header className="site-header">
          <Link
            prefetch={false}
            className="brand"
            href="/"
            aria-label="I want Waterloo"
          >
            <Sprout size={23} strokeWidth={1.8} />
            <span>
              i want<span className="brand-divider">/</span>
              <span className="brand-muted">waterloo</span>
            </span>
          </Link>
          <div className="header-actions">
            <Contribute />
            {view === 'garden' && (
              <Button className="park-plant" onClick={focusComposer}>
                Plant an idea <Sprout size={17} />
              </Button>
            )}

            <IconButton
              label="About and privacy"
              onClick={() => setAboutOpen(true)}
            >
              <Info size={18} />
            </IconButton>
          </div>
        </header>
        <main>
          {view === 'garden' && introduction.open && (
            <GardenWelcome
              onDismiss={introduction.dismiss}
              hasIdeas={total > 0}
              onExplore={() => {
                introduction.dismiss();
                setDiscoveryRequest((request) => request + 1);
              }}
              onPlant={focusComposer}
            />
          )}
          {directLinkError && (
            <p className="form-error" role="alert">
              {directLinkError}{' '}
              <button onClick={() => window.location.reload()}>Retry</button>
            </p>
          )}
          <div hidden={view === 'garden'}>
            <IdeaComposer onShare={share} onGarden={showGarden} />
          </div>
          <div className="explore-section">
            <div className="explore-toolbar">
              <TabsList className="view-tabs">
                <TabsTrigger value="ideas">
                  Ideas <span>{total}</span>
                </TabsTrigger>
                <TabsTrigger value="garden">Garden</TabsTrigger>
              </TabsList>
              {
                <div className="explore-tools">
                  <button
                    className="yours-toggle"
                    aria-label="Your ideas"
                    aria-pressed={mine}
                    onClick={() => {
                      setMine(!mine);
                      setGardenFocus(null);
                      setPostedIdea(null);
                    }}
                  >
                    Yours
                  </button>
                  <IconButton
                    label="Search ideas"
                    onClick={() => setSearchOpen((v) => !v)}
                    pressed={searchOpen}
                  >
                    <Search size={18} />
                  </IconButton>
                  <IdeaFilterMenu
                    filters={filters}
                    loading={list.isFetching}
                    placeholder={list.isPlaceholderData}
                    failed={list.isError}
                  />
                </div>
              }
            </div>
            {mine && (
              <p className="yours-note">Ideas posted from this browser.</p>
            )}
            {searchOpen && (
              <div className="search-wrap">
                <Search size={17} />
                <Input
                  ref={searchInput}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search ideas"
                  aria-label="Search ideas"
                />
                <IconButton
                  label="Clear search"
                  onClick={() => {
                    setQuery('');
                    setSearchOpen(false);
                  }}
                >
                  <X size={16} />
                </IconButton>
              </div>
            )}
            {filtered && (
              <div className="active-filter">
                <span>
                  {[
                    tag !== 'all' ? `#${tag}` : '',
                    connection !== 'all' ? connection : '',
                    sort === 'watered'
                      ? 'Most liked'
                      : sort === 'random'
                        ? 'Random'
                        : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <button aria-label="Clear filters" onClick={clearFilters}>
                  <X size={13} />
                </button>
              </div>
            )}
            {list.isError && (
              <p className="form-error" role="alert">
                Couldn’t load community ideas.{' '}
                <button onClick={() => list.refetch()}>Retry</button>
              </p>
            )}
            {supportError && !selected && (
              <p className="form-error" role="alert">
                {supportError}
              </p>
            )}
            <TabsContent value="ideas" className="view-panel">
              <section
                className="ideas-grid"
                aria-label="Ideas for Waterloo"
                aria-busy={list.isPending}
              >
                {list.isPending && (
                  <output className="empty-copy">Loading ideas…</output>
                )}
                {ideas.map((idea) => (
                  <IdeaCard
                    key={idea.id}
                    idea={idea}
                    onRead={selectIdea}
                    onSupport={support}
                    pending={pending.has(idea.id)}
                    fresh={idea.id === newIdeaId}
                    onSeen={onIdeaSeen}
                  />
                ))}
                {!ideas.length && !list.isPending && !list.isError && (
                  <div className="empty-state">
                    <p>
                      {mine
                        ? 'You haven’t posted an idea from this browser yet.'
                        : 'No ideas yet.'}
                    </p>
                    <Button
                      variant="ghost"
                      onClick={filtered || query ? clearFilters : focusComposer}
                    >
                      {filtered || query ? 'Clear filters' : 'Add the first'}
                    </Button>
                  </div>
                )}
              </section>
              {list.hasNextPage && (
                <Button
                  variant="ghost"
                  className="load-more"
                  onClick={() => list.fetchNextPage()}
                  disabled={list.isFetchingNextPage}
                >
                  {list.isFetchingNextPage ? 'Loading…' : 'More ideas'}
                </Button>
              )}
            </TabsContent>
            <TabsContent
              value="garden"
              className="view-panel"
              id="garden-view"
              tabIndex={-1}
            >
              <GardenExplorer
                quality={parkView.quality}
                photoProvider={parkView.provider}
                onQualityChange={changeParkQuality}
                onExplore={introduction.dismiss}
                onDiscover={() => {
                  introduction.dismiss();
                  setDiscoveryRequest((request) => request + 1);
                }}
                showIntroduction={introduction.open}
                discoveryRequest={discoveryRequest}
                obscured={sheetOpen || aboutOpen}
                mine={mine}
                postedIdea={postedIdea}
                onReceiptDone={() => setPostedIdea(null)}
                tag={tag}
                query={debouncedQuery}
                connection={connection}
                focusIdea={gardenFocus}
                moment={moment}
                onMomentComplete={onMomentComplete}
                plantingId={plantingId}
                highlightId={treeHighlightId}
                onHighlighted={onTreeHighlighted}
                butterflyVisit={butterflyVisit}
                onPlanted={onPlanted}
                onRead={selectIdea}
                onSupport={support}
                pending={pending}
                onList={() => setView('ideas')}
              />
            </TabsContent>
          </div>
        </main>
        <footer className="site-footer">
          <div className="footer-links">
            <a
              className="map-credit"
              href="https://www.openstreetmap.org/copyright"
            >
              © OpenStreetMap
            </a>
            <button type="button" onClick={introduction.show}>
              How it works
            </button>
            <button type="button" onClick={() => setAboutOpen(true)}>
              Privacy
            </button>
            <Link prefetch={false} href="/updates">
              Updates
            </Link>
            <Contribute footer />
          </div>
          <p>
            Help improve this project:{' '}
            <a href="https://github.com/mjiang4/iwantwaterloo/issues">
              suggest a change
            </a>{' '}
            or{' '}
            <a href="https://github.com/mjiang4/iwantwaterloo/blob/main/CONTRIBUTING.md">
              make a pull request
            </a>
            .
          </p>
        </footer>
        <Sheet
          open={sheetOpen}
          onOpenChangeComplete={(open) => {
            if (!open) setSelected(null);
          }}
          onOpenChange={(open) => {
            setSheetOpen(open);
            if (!open) {
              const url = new URL(window.location.href);
              url.searchParams.delete('idea');
              history.replaceState(null, '', url);
            }
          }}
        >
          <SheetContent
            side={small ? 'bottom' : 'right'}
            className="idea-sheet"
            finalFocus={() =>
              view === 'garden'
                ? document.getElementById('garden-view')
                : ideaOpener.current?.isConnected
                  ? ideaOpener.current
                  : document.getElementById('new-idea')
            }
          >
            {selected && (
              <IdeaDetails
                key={selected.id}
                idea={selected}
                pending={pending.has(selected.id)}
                error={supportError}
                onSupport={support}
                onTag={(tag) => {
                  clearFilters();
                  setTag(tag);
                  setSheetOpen(false);
                  const url = new URL(window.location.href);
                  url.searchParams.delete('idea');
                  history.replaceState(null, '', url);
                  setView('ideas');
                }}
              />
            )}
          </SheetContent>
        </Sheet>
        <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
          <DialogContent className="about-dialog">
            <DialogTitle>Waterloo Ideas</DialogTitle>
            <DialogDescription>
              Share suggestions for Waterloo. Everyone is welcome.
            </DialogDescription>
            <p>
              Ideas, replies, names, tags and optional details are public. Names
              are self-entered and not verified. Avoid sharing private contact
              details. No account is needed. A browser cookie remembers support
              and lets you update your ideas; drafts stay in this tab. Temporary
              hashed network identifiers help limit spam. We count contributions
              arriving through shared links, credited contributions, and
              returning authors without storing browsing history. Earlier idea
              versions remain visible. Clearing cookies removes access to your
              author controls.
            </p>
            <p>
              Support counts are not a representative poll. This is an
              independent project, not a City of Waterloo service.
            </p>
            <p>
              Realism mode loads imagery from Google Maps when you enable it.
              Google receives those map requests; its{' '}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noreferrer"
              >
                privacy policy
              </a>{' '}
              and{' '}
              <a
                href="https://www.google.com/help/terms_maps/"
                target="_blank"
                rel="noreferrer"
              >
                Maps terms
              </a>{' '}
              apply.
            </p>
            <Button onClick={() => setAboutOpen(false)}>Got it</Button>
          </DialogContent>
        </Dialog>
      </Tabs>
    </TooltipProvider>
  );
}
export default function GardenApp() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <Garden />
    </QueryClientProvider>
  );
}
