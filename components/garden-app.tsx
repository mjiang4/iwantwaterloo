'use client';
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
  Search,
  SlidersHorizontal,
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
import {
  CONNECTIONS,
  ideaTags,
  filterIdeas,
  SUGGESTED_TAGS,
  type Idea,
} from '@/lib/garden';
import { Choice, IdeaComposer } from './idea-composer';
import { useGardenTools } from './garden-tools';
import { GardenExplorer } from './garden-explorer';
import { useTags } from './tag-picker';
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
}: {
  idea: Idea;
  onRead: (idea: Idea) => void;
  onSupport: (idea: Idea) => void;
  pending: boolean;
}) {
  return (
    <article className="idea-card">
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
        <SupportButton idea={idea} onSupport={onSupport} pending={pending} />
      </div>
    </article>
  );
}
function Garden() {
  const client = useQueryClient();
  const [view, setView] = useState('ideas');
  const [tag, setTag] = useState('all');
  const [tagSearch, setTagSearch] = useState('');
  const tagChoices = useTags(tagSearch);
  const browseTags = useTags();
  const [gardenFocus, setGardenFocus] = useState<Idea | null>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [connection, setConnection] = useState('all');
  const [sort, setSort] = useState('newest');
  const [shuffle, setShuffle] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState<Idea | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [supportError, setSupportError] = useState('');
  const locks = useRef(new Set<string>());
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
    staleTime: 15000,
    refetchInterval: 20000,
  });
  const ideas = useMemo(() => {
    const real = list.data?.pages.flatMap((p) => p.ideas) || [];
    return filterIdeas(real, 'all', debouncedQuery, connection, sort, tag);
  }, [list.data, tag, debouncedQuery, connection, sort]);
  const total = list.data?.pages[0].total || 0;
  const filtered = tag !== 'all' || connection !== 'all';
  const clearFilters = useCallback(() => {
    setTag('all');
    setTagSearch('');
    setQuery('');
    setConnection('all');
    setSort('newest');
  }, []);
  const selectIdea = useCallback((idea: Idea) => {
    setSelected(idea);
    setSupportError('');
  }, []);
  const share = useCallback(
    async (input: PlantInput) => {
      const { idea } = await api<{ idea: Idea }>('/api/ideas', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      clearFilters();
      setView('ideas');
      void Promise.all([
        client.invalidateQueries({ queryKey: ['ideas'] }),
        client.invalidateQueries({ queryKey: ['tags'] }),
        client.invalidateQueries({ queryKey: ['garden'] }),
      ]).catch(() => {});
      return idea;
    },
    [client, clearFilters],
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
    [client, patchIdea],
  );
  useGardenTools({
    plant: async (input) => {
      const idea = await share(input);
      setSelected(idea);
      return idea;
    },
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
          <a className="brand" href="/" aria-label="Waterloo Ideas home">
            <Sprout size={23} strokeWidth={1.8} />
            <span>
              waterloo<span className="brand-divider">/</span>
              <span className="brand-muted">ideas</span>
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
                      <Input
                        id="filter-tag-search"
                        value={tagSearch}
                        onChange={(e) => setTagSearch(e.target.value)}
                        placeholder="Find a tag…"
                      />
                      <div className="tag-options filter-tag-options">
                        <button
                          type="button"
                          aria-pressed={tag === 'all'}
                          onClick={() => setTag('all')}
                        >
                          All
                        </button>
                        {(
                          tagChoices.data?.tags ||
                          SUGGESTED_TAGS.map((tag) => ({ tag, count: 0 }))
                        ).map((t) => (
                          <button
                            type="button"
                            key={t.tag}
                            aria-pressed={tag === t.tag}
                            onClick={() => setTag(t.tag)}
                          >
                            #{t.tag}
                          </button>
                        ))}
                      </div>
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
            {view === 'ideas' && (
              <div className="idea-sort" role="group" aria-label="Sort ideas">
                {[
                  ['newest', 'New'],
                  ['watered', 'Most liked'],
                  ['random', 'Random'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={sort === value}
                    onClick={() => {
                      setSort(value);
                      if (value === 'random')
                        setShuffle(
                          (current) =>
                            (current + 1 + Math.floor(Math.random() * 61)) % 64,
                        );
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
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
                <span>{tag === 'all' ? 'Filtered' : `#${tag}`}</span>
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
              <div className="browse-tags" aria-label="Browse tags">
                {(
                  browseTags.data?.tags ||
                  SUGGESTED_TAGS.map((tag) => ({ tag, count: 0 }))
                )
                  .slice(0, 8)
                  .map((t) => (
                    <button
                      type="button"
                      key={t.tag}
                      aria-pressed={tag === t.tag}
                      onClick={() =>
                        setTag((v) => (v === t.tag ? 'all' : t.tag))
                      }
                    >
                      #{t.tag}
                    </button>
                  ))}
              </div>
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
            <TabsContent value="garden" className="view-panel" id="garden-view">
              <GardenExplorer
                tag={tag}
                query={debouncedQuery}
                connection={connection}
                focusIdea={gardenFocus}
                onRead={selectIdea}
                onList={() => setView('ideas')}
              />
            </TabsContent>
          </div>
        </main>
        <Sheet
          open={!!selected}
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
        >
          <SheetContent
            side={small ? 'bottom' : 'right'}
            className="idea-sheet"
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
                        setSelected(null);
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
                </div>
                {supportError && (
                  <p className="form-error" role="alert">
                    {supportError}
                  </p>
                )}
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
              Ideas, tags and optional details are public. Avoid sharing private
              contact details. No account is needed. A browser cookie remembers
              support; drafts stay in this tab. Temporary hashed network
              identifiers help limit spam.
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
