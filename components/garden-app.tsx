'use client';
import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { BarChart3, Download, Heart, Info, Minus, Pause, Play, Plus, RotateCcw, Search, Shuffle, SlidersHorizontal, Sprout, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CATEGORIES, CONNECTIONS, EXAMPLES, categoryFor, filterIdeas, type Idea } from '@/lib/garden';
import { Choice, IdeaComposer } from './idea-composer';
import { useGardenTools } from './garden-tools';
const GardenScene = lazy(() => import('./garden-scene'));
export type PlantInput = { title: string; description: string; category: string; place: string; connection: string; consent: boolean; website?: string };
type Page = { ideas: Idea[]; examples: Idea[]; total: number; nextPage: number | null };
type Stats = { ideas: number; browsers: number; waters: number; categories: { category: string; count: number }[]; connections: { connection: string; count: number }[] };
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const data = await res.json() as T & { error?: string };
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
  return data;
}
function useMedia(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => { const m = matchMedia(query); setMatches(m.matches); const change = () => setMatches(m.matches); m.addEventListener('change', change); return () => m.removeEventListener('change', change); }, [query]);
  return matches;
}
function IconButton({ label, onClick, children, pressed, disabled }: { label: string; onClick: () => void; children: ReactNode; pressed?: boolean; disabled?: boolean }) {
  return <Tooltip><TooltipTrigger render={<button type="button" className="icon-button" aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick} />}>{children}</TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}
class SceneBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? <div className="scene-fallback">3D unavailable. Use the idea list.</div> : this.props.children; }
}
function SupportButton({ idea, onSupport, pending, large = false }: { idea: Idea; onSupport: (idea: Idea) => void; pending: boolean; large?: boolean }) {
  return <button className={`support-button ${large ? 'support-large' : ''}`} data-supported={idea.watered} aria-pressed={idea.watered} aria-label={`${idea.watered ? 'Remove support for' : 'Support'} ${idea.title}. ${idea.waters} supports`} aria-disabled={pending} onClick={() => { if (!pending) onSupport(idea); }}><Heart size={large ? 18 : 15} fill={idea.watered ? 'currentColor' : 'none'} />{large && <span>{idea.watered ? 'Supported' : 'Support'}</span>}<span>{idea.waters}</span></button>;
}
function IdeaCard({ idea, onRead, onSupport, pending }: { idea: Idea; onRead: (idea: Idea) => void; onSupport: (idea: Idea) => void; pending: boolean }) {
  const c = categoryFor(idea.category);
  return <article className="idea-card">
    <button className="idea-open" onClick={() => onRead(idea)}><span className="idea-topic">{c.short}</span><h3>{idea.title}</h3></button>
    <div className="idea-card-bottom"><span className={idea.example ? 'example-badge' : 'idea-place'}>{idea.example ? 'Example' : idea.place || 'Waterloo'}</span><SupportButton idea={idea} onSupport={onSupport} pending={pending} /></div>
  </article>;
}
function Overview({ onCategory }: { onCategory: (category: string) => void }) {
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => api<Stats>('/api/stats'), staleTime: 15000 });
  const s = stats.data;
  return <section className="overview"><div className="overview-heading"><h1>Overview</h1><a className="quiet-button" href="/api/export"><Download size={16} />Export</a></div>
    {stats.isError ? <p className="form-error">Couldn’t load. <button onClick={() => stats.refetch()}>Retry</button></p> : <>
      <div className="stat-grid">{[{ label: 'Ideas', value: s?.ideas }, { label: 'Browsers', value: s?.browsers }, { label: 'Supports', value: s?.waters }].map(item => <div key={item.label}><strong>{item.value ?? '—'}</strong><span>{item.label}</span></div>)}</div>
      <div className="overview-columns"><section><h2>Topics</h2>{CATEGORIES.map(c => <button className="overview-row" key={c.id} onClick={() => onCategory(c.id)}><span>{c.short}</span><span>{s?.categories.find(x => x.category === c.id)?.count ?? 0}</span></button>)}</section><section><h2>Connections</h2>{s?.connections.length ? s.connections.map(c => <div className="overview-row" key={c.connection}><span>{c.connection}</span><span>{c.count}</span></div>) : <p className="empty-copy">None yet.</p>}</section></div>
    </>}
    <p className="overview-note">Examples excluded. Browser counts are not unique people. Connections are self-described.</p>
  </section>;
}
function Garden() {
  const client = useQueryClient();
  const [view, setView] = useState('ideas');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [connection, setConnection] = useState('all');
  const [sort, setSort] = useState('newest');
  const [showExamples, setShowExamples] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState<Idea | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [motion, setMotion] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [reset, setReset] = useState(0);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [supportError, setSupportError] = useState('');
  const locks = useRef(new Set<string>());
  const small = useMedia('(max-width:760px)');
  const reduced = useMedia('(prefers-reduced-motion:reduce)');
  useEffect(() => { let enabled = true; try { enabled = localStorage.getItem('garden-motion') !== 'off'; } catch {} setMotion(!matchMedia('(prefers-reduced-motion:reduce)').matches && enabled); }, []);
  useEffect(() => { if (reduced) setMotion(false); }, [reduced]);
  useEffect(() => { const timer = setTimeout(() => setDebouncedQuery(query), 200); return () => clearTimeout(timer); }, [query]);
  const list = useInfiniteQuery({ queryKey: ['ideas', category, debouncedQuery, connection, sort], initialPageParam: 0, queryFn: ({ pageParam }) => api<Page>(`/api/ideas?${new URLSearchParams({ category, q: debouncedQuery, connection, sort, page: String(pageParam) })}`), getNextPageParam: page => page.nextPage, staleTime: 15000 });
  const ideas = useMemo(() => {
    const real = list.data?.pages.flatMap(p => p.ideas) || [];
    const examples = list.data?.pages[0].examples || (!list.data ? filterIdeas(EXAMPLES, category, debouncedQuery, connection, sort) : []);
    return filterIdeas([...real, ...(showExamples ? examples : [])], category, debouncedQuery, connection, sort);
  }, [list.data, showExamples, category, debouncedQuery, connection, sort]);
  const total = (list.data?.pages[0].total || 0) + (showExamples ? (list.data?.pages[0].examples.length ?? filterIdeas(EXAMPLES, category, debouncedQuery, connection).length) : 0);
  const filtered = category !== 'all' || connection !== 'all' || sort !== 'newest' || !showExamples;
  const clearFilters = useCallback(() => { setCategory('all'); setQuery(''); setConnection('all'); setSort('newest'); setShowExamples(true); }, []);
  const onFailure = useCallback(() => setSceneFailed(true), []);
  const selectIdea = useCallback((idea: Idea) => { setSelected(idea); setSupportError(''); }, []);
  const share = useCallback(async (input: PlantInput) => {
    const { idea } = await api<{ idea: Idea }>('/api/ideas', { method: 'POST', body: JSON.stringify(input) });
    clearFilters();
    setView('ideas');
    await Promise.all([client.invalidateQueries({ queryKey: ['ideas'] }), client.invalidateQueries({ queryKey: ['stats'] })]);
    return idea;
  }, [client, clearFilters]);
  const patchIdea = useCallback((id: string, fields: Pick<Idea, 'waters' | 'watered'>) => {
    client.setQueriesData<InfiniteData<Page>>({ queryKey: ['ideas'] }, data => data ? { ...data, pages: data.pages.map(page => ({ ...page, ideas: page.ideas.map(i => i.id === id ? { ...i, ...fields } : i), examples: page.examples.map(i => i.id === id ? { ...i, ...fields } : i) })) } : data);
    setSelected(i => i?.id === id ? { ...i, ...fields } : i);
  }, [client]);
  const support = useCallback(async (idea: Idea) => {
    if (locks.current.has(idea.id)) return;
    locks.current.add(idea.id); setPending(new Set(locks.current)); setSupportError('');
    const previous = { waters: idea.waters, watered: idea.watered };
    patchIdea(idea.id, { waters: Math.max(0, idea.waters + (idea.watered ? -1 : 1)), watered: !idea.watered });
    try {
      const data = await api<{ id: string; waters: number; watered: boolean }>('/api/support', { method: 'PUT', body: JSON.stringify({ ideaId: idea.id, watered: !idea.watered }) });
      patchIdea(data.id, data); void client.invalidateQueries({ queryKey: ['stats'] });
    } catch (e) { patchIdea(idea.id, previous); setSupportError(e instanceof Error ? e.message : 'Couldn’t save support. Try again.'); }
    finally { locks.current.delete(idea.id); setPending(new Set(locks.current)); }
  }, [client, patchIdea]);
  useGardenTools({ plant: async input => { const idea = await share(input); setSelected(idea); return idea; }, explore: (q, c) => { setQuery(q); setDebouncedQuery(q); setCategory(c); setSearchOpen(Boolean(q)); setView('ideas'); } });
  function focusComposer() { setView('ideas'); requestAnimationFrame(() => { document.getElementById('new-idea')?.focus(); document.getElementById('compose-heading')?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'center' }); }); }
  function toggleMotion() { setMotion(v => { try { localStorage.setItem('garden-motion', v ? 'off' : 'on'); } catch {} return !v; }); }
  return <TooltipProvider delay={250}><Tabs value={view} onValueChange={v => setView(String(v))} className="garden-app">
    <a className="skip-link" href="#new-idea">Suggest an idea</a>
    <header className="site-header"><a className="brand" href="/" aria-label="Waterloo Ideas home"><Sprout size={23} strokeWidth={1.8} /><span>waterloo<span className="brand-divider">/</span><span className="brand-muted">ideas</span></span></a><div className="header-actions"><span className="preview-label">Private preview</span><IconButton label="Overview" onClick={() => setView(view === 'insights' ? 'ideas' : 'insights')} pressed={view === 'insights'}><BarChart3 size={18} /></IconButton><IconButton label="About and privacy" onClick={() => setAboutOpen(true)}><Info size={18} /></IconButton></div></header>
    <main>
      <div hidden={view === 'insights'}><IdeaComposer onShare={share} onRead={selectIdea} onPrivacy={() => setAboutOpen(true)} /></div>
      <div className="explore-section">
        <div className="explore-toolbar"><TabsList className="view-tabs"><TabsTrigger value="ideas">Ideas <span>{total}</span></TabsTrigger><TabsTrigger value="garden">Garden</TabsTrigger>{view === 'insights' && <TabsTrigger value="insights">Overview</TabsTrigger>}</TabsList>
          {view !== 'insights' && <div className="explore-tools"><IconButton label="Search ideas" onClick={() => setSearchOpen(v => !v)} pressed={searchOpen}><Search size={18} /></IconButton><Popover open={filterOpen} onOpenChange={setFilterOpen}><PopoverTrigger className={`icon-button ${filtered ? 'has-filter' : ''}`} aria-label="Filter ideas"><SlidersHorizontal size={18} /></PopoverTrigger><PopoverContent className="filter-popover" align="end"><PopoverTitle className="popover-heading">Filter ideas</PopoverTitle><label>Topic</label><Choice label="Filter topic" value={category} onChange={setCategory} items={[{ value: 'all', label: 'All topics' }, ...CATEGORIES.map(c => ({ value: c.id, label: c.short }))]} /><label>Connection</label><Choice label="Filter connection" value={connection} onChange={setConnection} items={[{ value: 'all', label: 'Everyone' }, ...CONNECTIONS.map(c => ({ value: c, label: c }))]} /><label>Sort</label><Choice label="Sort ideas" value={sort} onChange={setSort} items={[{ value: 'newest', label: 'Newest' }, { value: 'watered', label: 'Most supported' }]} /><label className="checkbox-row"><Checkbox checked={showExamples} onCheckedChange={setShowExamples} />Show examples</label><div className="filter-actions"><Button variant="ghost" onClick={clearFilters}>Reset</Button><Button onClick={() => setFilterOpen(false)}>Done</Button></div></PopoverContent></Popover></div>}
        </div>
        {searchOpen && view !== 'insights' && <div className="search-wrap"><Search size={17} /><Input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search ideas" aria-label="Search ideas" /><IconButton label="Clear search" onClick={() => { setQuery(''); setSearchOpen(false); }}><X size={16} /></IconButton></div>}
        {filtered && view !== 'insights' && <div className="active-filter"><span>{category === 'all' ? 'Filtered' : categoryFor(category).short}</span><button aria-label="Clear filters" onClick={clearFilters}><X size={13} /></button></div>}
        {list.isError && view !== 'insights' && <p className="form-error" role="alert">Couldn’t load community ideas. <button onClick={() => list.refetch()}>Retry</button></p>}
        {supportError && !selected && <p className="form-error" role="alert">{supportError}</p>}
        <TabsContent value="ideas" className="view-panel"><section className="ideas-grid" aria-label="Ideas for Waterloo">{ideas.map(idea => <IdeaCard key={idea.id} idea={idea} onRead={selectIdea} onSupport={support} pending={pending.has(idea.id)} />)}{!ideas.length && <div className="empty-state"><p>No ideas yet.</p><Button variant="ghost" onClick={filtered || query ? clearFilters : focusComposer}>{filtered || query ? 'Clear filters' : 'Add the first'}</Button></div>}</section>{list.hasNextPage && <Button variant="ghost" className="load-more" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>{list.isFetchingNextPage ? 'Loading…' : 'More ideas'}</Button>}</TabsContent>
        <TabsContent value="garden" className="view-panel"><div className="garden-stage"><div className="scene"><SceneBoundary onFailure={onFailure}><Suspense fallback={<div className="scene-fallback">Loading garden…</div>}>{sceneFailed ? <div className="scene-fallback"><Button variant="ghost" onClick={() => setView('ideas')}>View ideas</Button></div> : <GardenScene ideas={ideas} selected={selected?.id || null} onSelect={id => { const idea = ideas.find(i => i.id === id); if (idea) selectIdea(idea); }} motion={motion} zoom={zoom} reset={reset} onFailure={onFailure} />}</Suspense></SceneBoundary></div><div className="garden-controls"><IconButton label="Zoom in" onClick={() => setZoom(z => Math.min(1.4, z + .15))} disabled={zoom >= 1.4}><Plus size={16} /></IconButton><IconButton label="Zoom out" onClick={() => setZoom(z => Math.max(.7, z - .15))} disabled={zoom <= .7}><Minus size={16} /></IconButton><IconButton label="Reset view" onClick={() => { setZoom(1); setReset(n => n + 1); }}><RotateCcw size={16} /></IconButton><IconButton label={motion ? 'Pause motion' : 'Play motion'} onClick={toggleMotion}>{motion ? <Pause size={16} /> : <Play size={16} />}</IconButton><IconButton label="Random idea" disabled={!ideas.length} onClick={() => selectIdea(ideas[Math.floor(Math.random() * ideas.length)])}><Shuffle size={16} /></IconButton></div></div>{total > 24 && <button className="garden-limit" onClick={() => setView('ideas')}>View all {total} ideas</button>}</TabsContent>
        <TabsContent value="insights" className="view-panel"><Overview onCategory={c => { clearFilters(); setCategory(c); setView('ideas'); }} /></TabsContent>
      </div>
    </main>
    <Sheet open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}><SheetContent side={small ? 'bottom' : 'right'} className="idea-sheet">{selected && <div className="idea-detail"><span className="detail-topic">{categoryFor(selected.category).short}{selected.example && <span className="example-badge">Example</span>}</span><SheetTitle className="detail-title">{selected.title}</SheetTitle><SheetDescription className="detail-meta">{selected.place || 'Waterloo'}{selected.connection ? ` · ${selected.connection}` : ''}</SheetDescription>{selected.description !== selected.title && <p className="detail-body">{selected.description}</p>}<div className="detail-actions"><SupportButton idea={selected} onSupport={support} pending={pending.has(selected.id)} large /></div>{supportError && <p className="form-error" role="alert">{supportError}</p>}</div>}</SheetContent></Sheet>
    <Dialog open={aboutOpen} onOpenChange={setAboutOpen}><DialogContent className="about-dialog"><DialogTitle>Waterloo Ideas</DialogTitle><DialogDescription>Share suggestions for Waterloo. Everyone is welcome.</DialogDescription><p>Ideas and optional details are visible to visitors. Avoid personal information. An anonymous browser identifier remembers support; no name or email is required.</p><p>Examples are labelled. Counts are not a representative poll. This private preview is not a City of Waterloo service.</p><Button onClick={() => setAboutOpen(false)}>Got it</Button></DialogContent></Dialog>
  </Tabs></TooltipProvider>;
}
export default function GardenApp() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } } }));
  return <QueryClientProvider client={client}><Garden /></QueryClientProvider>;
}
