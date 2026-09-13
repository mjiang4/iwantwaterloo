'use client';
import { useRef, useState, type FormEvent } from 'react';
import { ArrowUp, Check, Plus, X, TreeDeciduous, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { CONNECTIONS, ideaTitle, type Idea } from '@/lib/garden';
import {TagPicker} from './tag-picker';
import type { PlantInput } from './garden-app';

export function Choice({ value, onChange, label, items, id }: { value: string; onChange: (v: string) => void; label: string; items: { value: string; label: string }[]; id?: string }) {
  return <Select value={value} onValueChange={v => { if (v !== null) onChange(v); }} items={items}>
    <SelectTrigger id={id} className="choice" aria-label={label}><SelectValue /></SelectTrigger>
    <SelectContent className="choice-menu">{items.map(i => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
  </Select>;
}

export function IdeaComposer({ onShare, onPrivacy, onGarden }: { onShare: (input: PlantInput) => Promise<Idea>; onPrivacy: () => void; onGarden: (idea?: Idea) => void }) {
  const [text, setText] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [place, setPlace] = useState('');
  const [connection, setConnection] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [shared, setShared] = useState<Idea | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const honeypot = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const submitting = useRef(false);
  const hasDetails = Boolean(place || connection);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    if (text.trim().length < 5) { setError('Add a little more detail.'); textarea.current?.focus(); return; }
    submitting.current = true;
    setSaving(true);
    setError('');
    try {
      const idea = await onShare({ title: ideaTitle(text), description: text.trim(), tags, place, connection, consent: true, website: honeypot.current?.value || '' });
      setShared(idea);
      setText('');
      setPlace('');
      setConnection('');
      setTags([]);
      setDetailsOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t share. Try again.'); }
    finally { submitting.current = false; setSaving(false); }
  }

  function another() { setShared(null); setFocused(true); requestAnimationFrame(() => textarea.current?.focus()); }

  return <section className="compose-section" aria-labelledby="compose-heading">
    <h1 id="compose-heading">What would make<br /><span>Waterloo better?</span></h1>
    <div className={`compose-shell ${focused ? 'is-focused' : ''} ${shared ? 'is-shared' : ''}`}>
      {shared ? <div className="share-success" role="status">
        <span className="success-symbol"><TreeDeciduous size={28} strokeWidth={1.6} /></span>
        <h2>Idea shared.</h2>
        <p>Your idea added a tree.</p>
        <div className="success-actions"><Button variant="ghost" onClick={() => onGarden(shared)}>See your tree</Button><Button onClick={another}>Add another</Button></div>
      </div> : <form ref={form} onSubmit={submit} onFocus={() => setFocused(true)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }}>
        <label className="sr-only" htmlFor="new-idea">Your idea for Waterloo</label>
        <Textarea ref={textarea} id="new-idea" className="idea-input" value={text} onChange={e => { setText(e.target.value); if (error) setError(''); }} minLength={5} maxLength={1400} required placeholder="Your idea…" rows={3} disabled={saving} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); form.current?.requestSubmit(); } }} aria-describedby={error ? 'compose-error' : 'sharing-notice'} />
        <div className="compose-actions">
          <div className="compose-options">
            <TagPicker value={tags} onChange={setTags} disabled={saving} />
            <Popover open={detailsOpen} onOpenChange={setDetailsOpen}>
              <PopoverTrigger className={`details-trigger ${hasDetails ? 'has-details' : ''}`} disabled={saving}><Plus size={15} />Details{hasDetails && <Check size={12} />}</PopoverTrigger>
              <PopoverContent className="details-popover" align="start" sideOffset={12}>
                <PopoverTitle className="popover-heading">Optional details</PopoverTitle>
                <label htmlFor="idea-place">Place</label><Input id="idea-place" maxLength={90} placeholder="Where in Waterloo?" value={place} onChange={e => setPlace(e.target.value)} />
                <label htmlFor="idea-connection">Connection to Waterloo</label><Choice id="idea-connection" label="Connection to Waterloo" value={connection} onChange={setConnection} items={[{ value: '', label: 'Prefer not to say' }, ...CONNECTIONS.map(c => ({ value: c, label: c }))]} />
                <Button variant="ghost" className="details-done" onClick={() => setDetailsOpen(false)}>Done</Button>
              </PopoverContent>
            </Popover>
          </div>
          <Button type="submit" className="share-button" disabled={saving || text.trim().length < 5} aria-busy={saving}>{saving ? 'Sharing…' : 'Share idea'}{!saving && <ArrowUp size={17} />}</Button>
        </div>
        <div className="honeypot" aria-hidden="true"><label htmlFor="garden-website">Website</label><input ref={honeypot} id="garden-website" tabIndex={-1} autoComplete="off" /></div>
      </form>}
    </div>
    {!shared && <div className="compose-footnote"><span id="sharing-notice">Visible to visitors. <button onClick={onPrivacy}>Privacy</button></span><button className="tree-context" onClick={() => onGarden()}><Sprout size={13}/>1 idea = 1 tree</button>{text.length > 1200 && <span>{text.length}/1400</span>}</div>}
    {error && <p className="form-error" id="compose-error" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError('')}><X size={14} /></button></p>}
  </section>;
}
