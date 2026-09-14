'use client';
import type { GardenMoment } from '@/lib/garden-visuals';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import {
  Heart,
  Info,
  Link as LinkIcon,
  MessageCircle,
  Search,
  SlidersHorizontal,
  Shuffle,
  Sprout,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CONNECTIONS, ideaTags, filterIdeas, type Idea } from '@/lib/garden';
import { Choice, IdeaComposer } from './idea-composer';
import { useGardenTools } from './garden-tools';
import { GardenExplorer } from './garden-explorer';
import { TagSearch } from './tag-picker';
import { IdeaDiscussion } from './idea-discussion';
import { useFreshHighlight } from './use-fresh-highlight';
import { createButterflyVisit } from '@/lib/garden-discovery';
export type PlantInput = {
  title: string;
  description: string;
  category?: string;
  tags?: string[];
  place: string;
  connection: string;
  consent: boolean;
  website?: string;
  submissionKey?: string;
  displayName?: string;
};
type Page = {
  ideas: Idea[];
  examples: Idea[];
  total: number;
  nextPage: number | null;
};

import { requestJSON as api } from '@/lib/client';
function useMedia(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const m = matchMedia(query);
    setMatches(m.matches);
    const change = () => setMatches(m.matches);
    m.addEventListener('change', change);
    return () => m.removeEventListener('change', change);
  }, [query]);
  return matches;
}
function IconButton({
  label,
  onClick,
  children,
  pressed,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  pressed?: boolean;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="icon-button"
            aria-label={label}
            aria-pressed={pressed}
            disabled={disabled}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
function SupportButton({
  idea,
  onSupport,
  pending,
  large = false,
}: {
  idea: Idea;
  onSupport: (idea: Idea) => void;
  pending: boolean;
  large?: boolean;
}) {
  return (
    <button
      className={`support-button ${large ? 'support-large' : ''}`}
      data-supported={idea.watered}
      aria-pressed={idea.watered}
      aria-label={`${idea.watered ? 'Remove support for' : 'Support'} ${idea.title}. ${idea.waters} supports`}
      aria-disabled={pending}
      onClick={() => {
        if (!pending) onSupport(idea);
      }}
    >
      <Heart
        size={large ? 18 : 15}
        fill={idea.watered ? 'currentColor' : 'none'}
      />
      {large && <span>{idea.watered ? 'Supported' : 'Support'}</span>}
      <span>{idea.waters}</span>
    </button>
  );
}
function IdeaCard({
  idea,
  onRead,
  onSupport,
  pending,
  fresh,
  onSeen,
}: {
  idea: Idea;
  onRead: (idea: Idea) => void;
  onSupport: (idea: Idea) => void;
  pending: boolean;
  fresh: boolean;
  onSeen: () => void;
}) {
  const { ref: cueRef, highlighted } = useFreshHighlight<HTMLElement>(
    fresh,
    onSeen,
  );
  return (
    <article
      ref={cueRef}
      className={`idea-card ${highlighted ? 'is-fresh' : ''}`}
    >
      <button className="idea-open" onClick={() => onRead(idea)}>
        <span className="idea-topic">
          {ideaTags(idea)
            .map((t) => `#${t}`)
            .join(' ') || 'Idea'}
        </span>
        <h3>{idea.title}</h3>
      </button>
      <div className="idea-card-bottom">
        <span className={idea.example ? 'example-badge' : 'idea-place'}>
          {idea.example ? 'Example' : idea.place || 'Waterloo'}
        </span>
        <div className="idea-card-signals">
          {Boolean(idea.commentCount) && (
            <span aria-label={`${idea.commentCount} replies`}>
              <MessageCircle size={14} />
              {idea.commentCount}
            </span>
          )}
          <SupportButton idea={idea} onSupport={onSupport} pending={pending} />
        </div>
      </div>
    </article>
  );
}
function Garden() {
  const client = useQueryClient();
  const [view, setView] = useState('ideas');
  const [tag, setTag] = useState('all');
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
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [connection, setConnection] = useState('all');
  const [sort, setSort] = useState('newest');
  const [shuffle, setShuffle] = useState(0);
  const [shuffleRequested, setShuffleRequested] = useState(false);
  const [shuffleNotice, setShuffleNotice] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState<Idea | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const ideaOpener = useRef<HTMLElement | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [supportError, setSupportError] = useState('');
  const locks = useRef(new Set<string>());
  const directLinkChecked = useRef(false);
  const small = useMedia('(max-width:760px)');
  const reduced = useMedia('(prefers-reduced-motion:reduce)');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timer);
  }, [query]);
  const list = useInfiniteQuery({
    queryKey: ['ideas', tag, debouncedQuery, connection, sort, shuffle],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api<Page>(
        `/api/ideas?${new URLSearchParams({ tag, q: debouncedQuery, connection, sort, seed: String(shuffle), page: String(pageParam) })}`,
      ),
    getNextPageParam: (page) => page.nextPage,
    placeholderData: (previous, previousQuery) =>
      sort === 'random' &&
      previousQuery?.queryKey[4] === 'random' &&
      previousQuery.queryKey[1] === tag &&
      previousQuery.queryKey[2] === debouncedQuery &&
      previousQuery.queryKey[3] === connection
        ? previous
        : undefined,
    staleTime: 15000,
    refetchInterval: 20000,
  });
  useEffect(() => {
    if (!shuffleRequested || list.isFetching || list.isPlaceholderData) return;
    // Query completion updates the one-shot accessibility announcement.
    // oxlint-disable-next-line react/react-compiler
    setShuffleRequested(false);
    setShuffleNotice(
      list.isError ? 'Couldn’t reshuffle. Try again.' : 'Ideas reshuffled.',
    );
  }, [shuffleRequested, list.isFetching, list.isPlaceholderData, list.isError]);
  const ideas = useMemo(() => {
    const real = list.data?.pages.flatMap((p) => p.ideas) || [];
    return filterIdeas(real, 'all', debouncedQuery, connection, sort, tag);
  }, [list.data, tag, debouncedQuery, connection, sort]);
  const total = list.data?.pages[0].total || 0;
  const filtered = tag !== 'all' || connection !== 'all' || sort !== 'newest';
  const clearFilters = useCallback(() => {
    setTag('all');
    setQuery('');
    setDebouncedQuery('');
    setConnection('all');
    setSort('newest');
  }, []);
  const selectIdea = useCallback((idea: Idea) => {
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
  }, []);
  useEffect(() => {
    if (directLinkChecked.current) return;
    const id = new URL(window.location.href).searchParams.get('idea');
    if (!id) {
      directLinkChecked.current = true;
      return;
    }
    directLinkChecked.current = true;
    void api<Page>(`/api/ideas?id=${encodeURIComponent(id)}`).then((page) => {
      if (page.ideas[0]) {
        setSelected(page.ideas[0]);
        setSheetOpen(true);
      }
    });
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
  }, [moment?.serial, view, sheetOpen, reduced]);
  const share = useCallback(
    async (input: PlantInput) => {
      const { idea } = await api<{ idea: Idea }>('/api/ideas', {
        method: 'POST',
        body: JSON.stringify(input),
      });
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
  const patchIdea = useCallback(
    (id: string, fields: Pick<Idea, 'waters' | 'watered'>) => {
      client.setQueriesData<InfiniteData<Page>>(
        { queryKey: ['ideas'] },
        (data) =>
          data
            ? {
                ...data,
                pages: data.pages.map((page) => ({
                  ...page,
                  ideas: page.ideas.map((i) =>
                    i.id === id ? { ...i, ...fields } : i,
                  ),
                  examples: page.examples.map((i) =>
                    i.id === id ? { ...i, ...fields } : i,
                  ),
                })),
              }
            : data,
      );
      client.setQueriesData<Page>({ queryKey: ['garden'] }, (data) =>
        data
          ? {
              ...data,
              ideas: data.ideas.map((idea) =>
                idea.id === id ? { ...idea, ...fields } : idea,
              ),
              examples: data.examples.map((idea) =>
                idea.id === id ? { ...idea, ...fields } : idea,
              ),
            }
          : data,
      );
      setSelected((i) => (i?.id === id ? { ...i, ...fields } : i));
    },
    [client],
  );
  const support = useCallback(
    async (idea: Idea) => {
      if (locks.current.has(idea.id)) return;
      locks.current.add(idea.id);
      setPending(new Set(locks.current));
      setSupportError('');
      // Stop older polls from overwriting the optimistic tree and heart state.
      await Promise.all([
        client.cancelQueries({ queryKey: ['garden'] }),
        client.cancelQueries({ queryKey: ['ideas'] }),
      ]);
      const previous = { waters: idea.waters, watered: idea.watered };
      patchIdea(idea.id, {
        waters: Math.max(0, idea.waters + (idea.watered ? -1 : 1)),
        watered: !idea.watered,
      });
      try {
        const data = await api<{
          id: string;
          waters: number;
          watered: boolean;
        }>('/api/support', {
          method: 'PUT',
          body: JSON.stringify({ ideaId: idea.id, watered: !idea.watered }),
        });
        patchIdea(data.id, data);
        if (!idea.watered && data.watered)
          revealTree({ ...idea, ...data }, 'like', idea.waters);
        void client.invalidateQueries({ queryKey: ['garden'] });
      } catch (e) {
        patchIdea(idea.id, previous);
        setSupportError(
          e instanceof Error ? e.message : 'Couldn’t save support. Try again.',
        );
      } finally {
        locks.current.delete(idea.id);
        setPending(new Set(locks.current));
      }
    },
    [client, patchIdea, revealTree],
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
        className="garden-app"
      >
        <a className="skip-link" href="#new-idea">
          Suggest an idea
        </a>
        <header className="site-header">
          <a className="brand" href="/" aria-label="I want Waterloo">
            <Sprout size={23} strokeWidth={1.8} />
            <span>
              i want<span className="brand-divider">/</span>
              <span className="brand-muted">waterloo</span>
            </span>
          </a>
          <div className="header-actions">
            <IconButton
              label="About and privacy"
              onClick={() => setAboutOpen(true)}
            >
              <Info size={18} />
            </IconButton>
          </div>
        </header>
        <main>
          <div>
            <IdeaComposer
              onShare={share}
              onPrivacy={() => setAboutOpen(true)}
              onGarden={showGarden}
            />
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
                  <IconButton
                    label="Search ideas"
                    onClick={() => setSearchOpen((v) => !v)}
                    pressed={searchOpen}
                  >
                    <Search size={18} />
                  </IconButton>
                  <Popover open={filterOpen} onOpenChange={setFilterOpen}>
                    <PopoverTrigger
                      className={`icon-button ${filtered ? 'has-filter' : ''}`}
                      aria-label="Filter ideas"
                    >
                      <SlidersHorizontal size={18} />
                    </PopoverTrigger>
                    <PopoverContent className="filter-popover" align="end">
                      <PopoverTitle className="popover-heading">
                        Filter ideas
                      </PopoverTitle>
                      <label htmlFor="filter-tag-search">Tags</label>
                      <TagSearch id="filter-tag-search" onChoose={setTag} />
                      {tag !== 'all' && (
                        <div className="tag-options selected-tags">
                          <button
                            type="button"
                            onClick={() => setTag('all')}
                            aria-label={`Remove tag ${tag}`}
                          >
                            #{tag}
                            <X size={12} />
                          </button>
                        </div>
                      )}
                      <div className="filter-field-label">Sort</div>
                      <Choice
                        label="Sort ideas"
                        value={sort}
                        onChange={(value) => {
                          setSort(value);
                          if (value === 'random')
                            setShuffle(
                              (current) =>
                                (current + 1 + Math.floor(Math.random() * 61)) %
                                64,
                            );
                        }}
                        items={[
                          { value: 'newest', label: 'New' },
                          { value: 'watered', label: 'Most liked' },
                          { value: 'random', label: 'Random' },
                        ]}
                      />
                      {sort === 'random' && (
                        <button
                          className="tag-done reshuffle-button"
                          type="button"
                          disabled={list.isFetching || shuffleRequested}
                          aria-busy={shuffleRequested}
                          onClick={() => {
                            setShuffleRequested(true);
                            setShuffleNotice('');
                            setShuffle(
                              (current) =>
                                (current + 1 + Math.floor(Math.random() * 61)) %
                                64,
                            );
                          }}
                        >
                          <Shuffle
                            key={shuffle}
                            size={15}
                            className={
                              shuffleRequested || shuffleNotice
                                ? 'shuffle-feedback'
                                : ''
                            }
                            aria-hidden="true"
                          />
                          Reshuffle
                        </button>
                      )}
                      <label>Connection</label>
                      <Choice
                        label="Filter connection"
                        value={connection}
                        onChange={setConnection}
                        items={[
                          { value: 'all', label: 'Everyone' },
                          ...CONNECTIONS.map((c) => ({ value: c, label: c })),
                        ]}
                      />
                      <div className="filter-actions">
                        <Button variant="ghost" onClick={clearFilters}>
                          Reset
                        </Button>
                        <Button onClick={() => setFilterOpen(false)}>
                          Done
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              }
            </div>
            {searchOpen && (
              <div className="search-wrap">
                <Search size={17} />
                <Input
                  autoFocus
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
            <output className="sr-only">{shuffleNotice}</output>
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
                  <p className="empty-copy" role="status">
                    Loading ideas…
                  </p>
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
                    <p>No ideas yet.</p>
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
              view === 'garden' && moment
                ? document.getElementById('garden-view')
                : ideaOpener.current?.isConnected
                  ? ideaOpener.current
                  : document.getElementById('new-idea')
            }
          >
            {selected && (
              <div className="idea-detail">
                <span className="detail-topic">
                  {ideaTags(selected).map((t) => (
                    <button
                      type="button"
                      className="detail-tag"
                      key={t}
                      onClick={() => {
                        clearFilters();
                        setTag(t);
                        setSheetOpen(false);
                        const url = new URL(window.location.href);
                        url.searchParams.delete('idea');
                        history.replaceState(null, '', url);
                        setView('ideas');
                      }}
                    >
                      #{t}
                    </button>
                  ))}
                  {selected.example && (
                    <span className="example-badge">Example</span>
                  )}
                </span>
                <SheetTitle className="detail-title">
                  {selected.title}
                </SheetTitle>
                <SheetDescription className="detail-meta">
                  {selected.place || 'Waterloo'}
                  {selected.connection ? ` · ${selected.connection}` : ''}
                </SheetDescription>
                {selected.displayName && (
                  <Popover>
                    <PopoverTrigger className="idea-byline">
                      Shared by {selected.displayName}
                    </PopoverTrigger>
                    <PopoverContent className="author-card" align="start">
                      <PopoverTitle>{selected.displayName}</PopoverTitle>
                      <p>Contributed this idea to the Waterloo garden.</p>
                      <small>Names are self-entered and not verified.</small>
                    </PopoverContent>
                  </Popover>
                )}
                {selected.description !== selected.title && (
                  <p className="detail-body">{selected.description}</p>
                )}
                <div className="detail-actions">
                  <SupportButton
                    idea={selected}
                    onSupport={support}
                    pending={pending.has(selected.id)}
                    large
                  />
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      const url = `${location.origin}/?idea=${selected.id}`;
                      if (navigator.share)
                        await navigator.share({ title: selected.title, url });
                      else await navigator.clipboard.writeText(url);
                    }}
                  >
                    <LinkIcon size={16} /> Share
                  </Button>
                </div>
                {supportError && (
                  <p className="form-error" role="alert">
                    {supportError}
                  </p>
                )}
                <IdeaDiscussion idea={selected} />
                <button
                  type="button"
                  className="report-idea"
                  onClick={async () => {
                    try {
                      await api('/api/reports', {
                        method: 'POST',
                        body: JSON.stringify({
                          ideaId: selected.id,
                          reason: 'Please review this idea.',
                        }),
                      });
                      setSupportError(
                        'Thanks. This idea was flagged for review.',
                      );
                    } catch (error) {
                      setSupportError(
                        error instanceof Error
                          ? error.message
                          : 'Couldn’t send the report.',
                      );
                    }
                  }}
                >
                  Report this idea
                </button>
              </div>
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
              details. No account is needed. A browser cookie remembers support;
              drafts stay in this tab. Temporary hashed network identifiers help
              limit spam.
            </p>
            <p>
              Support counts are not a representative poll. This is an
              independent project, not a City of Waterloo service.
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
