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
import { ArrowLeft, Search, X } from 'lucide-react';
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
import { type Idea } from '@/lib/garden';
import { IdeaComposer } from './idea-composer';
import { useGardenTools } from './garden-tools';
import { GardenExplorer } from './garden-explorer';
import type { ParkQuality } from '@/features/park/quality-picker';
import { IdeaFilterMenu } from '@/features/ideas/idea-filter-menu';
import { IdeaDetails } from '@/features/ideas/idea-details';
import { IconButton } from './icon-button';
import { IdeaCard } from '@/features/ideas/idea-card';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useIdeaSupport } from '@/features/ideas/use-support';
import { GardenWelcome, useGardenIntroduction } from './garden-welcome';
import Link from 'next/link';
import { Contribute } from '@/features/park/contribute';
import { ParkMenu } from '@/features/park/park-menu';
import { Wordmark } from '@/features/park/wordmark';
import { LoveList } from '@/features/loves/love-list';
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
  const [parkQuality, setParkQuality] = useState<ParkQuality>('light');
  const [gardenRevision, setGardenRevision] = useState(0);
  const filters = useIdeaFilters();
  const {
    mine,
    setMine,
    query,
    setQuery,
    debouncedQuery,
    setDebouncedQuery,
    place,
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
  const [loveRequest, setLoveRequest] = useState(0);
  const clearLoveRequest = useCallback(() => setLoveRequest(0), []);
  // True while a love is being placed or written: the wordmark reads "i love".
  const [loveMode, setLoveMode] = useState(false);
  const [directLinkError, setDirectLinkError] = useState('');
  const directLinkChecked = useRef(false);
  const small = useMediaQuery('(max-width:760px)');
  const reduced = useMediaQuery('(prefers-reduced-motion:reduce)');
  const list = useIdeas(filters);
  const ideas = useMemo(() => {
    const real = list.data?.pages.flatMap((p) => p.ideas) || [];
    return real;
  }, [list.data]);
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
      if (idea.moderationState === 'pending') return idea;
      setPostedIdea(idea);
      setPlantingId(idea.id);
      setNewIdeaId(idea.id);
      setTreeHighlightId(idea.id);
      revealTree(idea, 'plant');
      void Promise.all([
        client.invalidateQueries({ queryKey: ['ideas'] }),
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
    explore: (q) => {
      setQuery(q);
      setDebouncedQuery(q);
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
          <Wordmark
            verb={loveMode ? 'love' : 'want'}
            onLove={() => {
              setView('garden');
              setLoveRequest((n) => n + 1);
            }}
            onWant={focusComposer}
          />
          <div className="header-actions">
            <ParkMenu
              onHowItWorks={introduction.show}
              onAbout={() => setAboutOpen(true)}
            />
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
                  {[place !== 'all' ? place : '', SORT_LABELS[sort] ?? '']
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
              <LoveList />
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
                quality={parkQuality}
                onQualityChange={setParkQuality}
                onExplore={introduction.dismiss}
                onDiscover={() => {
                  introduction.dismiss();
                  setDiscoveryRequest((request) => request + 1);
                }}
                showIntroduction={introduction.open}
                discoveryRequest={discoveryRequest}
                obscured={sheetOpen || aboutOpen}
                resetRequest={gardenRevision}
                mine={mine}
                postedIdea={postedIdea}
                onReceiptDone={() => setPostedIdea(null)}
                query={debouncedQuery}
                place={place}
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
                lovePlacementRequest={loveRequest}
                onLovePlacementStarted={clearLoveRequest}
                onLoveModeChange={setLoveMode}
                onPlantIdea={focusComposer}
                onBack={() => {
                  setGardenFocus(null);
                  setMoment(null);
                  setPostedIdea(null);
                  setPlantingId(null);
                  setTreeHighlightId(null);
                }}
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
              About
            </button>
            <Link prefetch={false} href="/updates">
              Updates
            </Link>
            <Link href="/feedback">Feedback</Link>
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
            <button
              type="button"
              className="idea-return"
              onClick={() => {
                setSheetOpen(false);
                setGardenFocus(null);
                setGardenRevision((n) => n + 1);
                setPostedIdea(null);
                setMoment(null);
                setView('garden');
                const url = new URL(window.location.href);
                url.searchParams.delete('idea');
                history.replaceState(null, '', url);
              }}
            >
              <ArrowLeft size={20} aria-hidden="true" />
              <span>Back to trees</span>
            </button>
            {selected && (
              <IdeaDetails
                key={selected.id}
                idea={selected}
                pending={pending.has(selected.id)}
                error={supportError}
                onSupport={support}
              />
            )}
          </SheetContent>
        </Sheet>
        <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
          <DialogContent className="about-dialog">
            <DialogTitle>I Want Waterloo</DialogTitle>
            <DialogDescription>
              Share your ideas for making Waterloo a better place.
            </DialogDescription>
            <p>
              I Want Waterloo is an independent, open-source project built by{' '}
              <a href="https://linkedin.com/in/jerrymjiang">Jerry Jiang</a> to
              improve Waterloo by collecting ideas and solutions from residents
              and visitors alike.
            </p>
            <p>
              You can help us improve by simply submitting your ideas,{' '}
              <Link href="/feedback">giving us feedback</Link>, or just{' '}
              <a href="https://github.com/mjiang4/iwantwaterloo">
                submitting a PR
              </a>
              !
            </p>
            <p>
              Ideas, loves, replies, names and optional details are public.
              Names are self-entered and not verified. Avoid sharing private
              contact details. No account is needed. A browser cookie remembers
              support and lets you update your ideas; drafts stay in this tab.
              Temporary hashed network identifiers help limit spam. We count
              contributions arriving through shared links, credited
              contributions, and returning authors without storing browsing
              history. Earlier idea versions remain visible. Clearing cookies
              removes access to your author controls.
            </p>
            <p>
              Submitted text and names are screened by OpenAI for abusive
              content. Some submissions may await review before appearing.
            </p>
            <Button onClick={() => setAboutOpen(false)}>Got it</Button>
          </DialogContent>
        </Dialog>
      </Tabs>
    </TooltipProvider>
  );
}
/** Labels for the active-filter chip; Discover is the default and shows none. */
const SORT_LABELS: Record<string, string> = {
  newest: 'New',
  'needs-input': 'Needs input',
  progress: 'Taking shape',
  watered: 'Most liked',
  random: 'Random',
};
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
