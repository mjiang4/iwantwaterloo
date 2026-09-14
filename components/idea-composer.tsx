'use client';
import { useRef, useState, useEffect, type SyntheticEvent } from 'react';
import { ArrowUp, X, TreeDeciduous, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CONNECTIONS, ideaTitle, type Idea } from '@/lib/garden';
import { TagPicker } from './tag-picker';
import { readSignature, saveSignature } from '@/lib/signature';
import type { PlantInput } from './garden-app';

export function Choice({
  value,
  onChange,
  label,
  items,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  items: { value: string; label: string }[];
  id?: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v !== null) onChange(v);
      }}
      items={items}
    >
      <SelectTrigger id={id} className="choice" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="choice-menu">
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function IdeaComposer({
  onShare,
  onPrivacy,
  onGarden,
}: {
  onShare: (input: PlantInput) => Promise<Idea>;
  onPrivacy: () => void;
  onGarden: (idea?: Idea) => void;
}) {
  const [text, setText] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [place, setPlace] = useState('');
  const [connection, setConnection] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [remember, setRemember] = useState(false);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [shared, setShared] = useState<Idea | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const honeypot = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const submitting = useRef(false);
  const [draftReady, setDraftReady] = useState(false);
  const submission = useRef<{ key: string; payload: string } | null>(null);
  useEffect(() => {
    const signature = readSignature();
    setRemember(Boolean(signature));
    setDisplayName(signature);
    try {
      const draft = JSON.parse(
        sessionStorage.getItem('waterloo-idea-draft') || 'null',
      );
      if (draft && typeof draft.text === 'string') {
        setText(draft.text.slice(0, 1400));
        setTags(
          Array.isArray(draft.tags)
            ? draft.tags
                .filter((t: unknown) => typeof t === 'string')
                .slice(0, 3)
            : [],
        );
        setPlace(
          typeof draft.place === 'string' ? draft.place.slice(0, 90) : '',
        );
        setConnection(
          CONNECTIONS.includes(draft.connection) ? draft.connection : '',
        );
        setDisplayName(
          typeof draft.displayName === 'string'
            ? draft.displayName.slice(0, 60)
            : '',
        );
        if (
          typeof draft.submission?.key === 'string' &&
          typeof draft.submission?.payload === 'string'
        )
          submission.current = draft.submission;
      }
    } catch {}
    setDraftReady(true);
  }, []);
  useEffect(() => {
    if (!draftReady) return;
    try {
      if (
        shared ||
        (!text && !tags.length && !place && !connection && !displayName)
      )
        sessionStorage.removeItem('waterloo-idea-draft');
      else
        sessionStorage.setItem(
          'waterloo-idea-draft',
          JSON.stringify({
            text,
            tags,
            place,
            connection,
            displayName,
            submission: submission.current,
          }),
        );
    } catch {}
  }, [draftReady, text, tags, place, connection, displayName, shared]);
  useEffect(() => {
    if (draftReady) saveSignature(remember ? displayName : '');
  }, [draftReady, remember, displayName]);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (text.trim().length < 5) {
      setError('Add a little more detail.');
      textarea.current?.focus();
      return;
    }
    submitting.current = true;
    setSaving(true);
    setError('');
    try {
      const input = {
        title: ideaTitle(text),
        description: text.trim(),
        tags,
        place,
        connection,
        displayName,
        consent: true,
        website: honeypot.current?.value || '',
      };
      const payload = JSON.stringify(input);
      if (submission.current?.payload !== payload)
        submission.current = { key: crypto.randomUUID(), payload };
      try {
        sessionStorage.setItem(
          'waterloo-idea-draft',
          JSON.stringify({
            text,
            tags,
            place,
            connection,
            displayName,
            submission: submission.current,
          }),
        );
      } catch {}
      const idea = await onShare({
        ...input,
        submissionKey: submission.current!.key,
      });
      submission.current = null;
      setShared(idea);
      setText('');
      setPlace('');
      setConnection('');
      if (!remember) setDisplayName('');
      setTags([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t share. Try again.');
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  function another() {
    setShared(null);
    setFocused(true);
    requestAnimationFrame(() => textarea.current?.focus());
  }

  return (
    <section className="compose-section" aria-labelledby="compose-heading">
      <h1 id="compose-heading">
        What would make
        <br />
        <span>Waterloo better?</span>
      </h1>
      <div
        className={`compose-shell ${focused ? 'is-focused' : ''} ${shared ? 'is-shared' : ''}`}
      >
        {shared ? (
          <div className="share-success" role="status">
            <span className="success-symbol">
              <TreeDeciduous size={28} strokeWidth={1.6} />
            </span>
            <h2>Your idea is in the garden.</h2>
            <div className="success-actions">
              <Button variant="ghost" onClick={() => onGarden(shared)}>
                See your tree
              </Button>
              <Button onClick={another}>Add another</Button>
            </div>
          </div>
        ) : (
          <form
            ref={form}
            onSubmit={submit}
            onFocus={() => setFocused(true)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
            }}
          >
            <label className="sr-only" htmlFor="new-idea">
              Your idea for Waterloo
            </label>
            <p id="idea-guidance" className="compose-guidance">
              Share a change and why it matters.
            </p>
            <Textarea
              ref={textarea}
              id="new-idea"
              className="idea-input"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (error) setError('');
              }}
              minLength={5}
              maxLength={1400}
              required
              placeholder="Your idea…"
              rows={3}
              disabled={saving || !draftReady}
              onKeyDown={(e) => {
                if (
                  (e.metaKey || e.ctrlKey) &&
                  e.key === 'Enter' &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  form.current?.requestSubmit();
                }
              }}
              aria-describedby={`idea-guidance sharing-notice${error ? ' compose-error' : ''}`}
            />
            <div className="signature-field">
              <label htmlFor="idea-signature">
                Signature <span>optional · public</span>
              </label>
              <Input
                id="idea-signature"
                maxLength={60}
                value={displayName}
                placeholder="Alex, 19, CS student"
                autoComplete="off"
                disabled={saving || !draftReady}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              {(displayName || remember) && (
                <label className="remember-signature">
                  <input
                    type="checkbox"
                    checked={remember}
                    disabled={saving || !draftReady}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  Remember on this device
                </label>
              )}
            </div>
            <details className="idea-context">
              <summary>
                Place & connection <span>optional</span>
              </summary>
              <div className="context-fields">
                <label htmlFor="idea-place">Place</label>
                <Input
                  id="idea-place"
                  maxLength={90}
                  placeholder="Where in Waterloo?"
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                  disabled={saving || !draftReady}
                />
                <label htmlFor="idea-connection">Connection to Waterloo</label>
                <Choice
                  id="idea-connection"
                  label="Connection to Waterloo"
                  value={connection}
                  onChange={setConnection}
                  items={[
                    { value: '', label: 'Prefer not to say' },
                    ...CONNECTIONS.map((c) => ({ value: c, label: c })),
                  ]}
                />
              </div>
            </details>
            <TagPicker
              value={tags}
              onChange={setTags}
              disabled={saving || !draftReady}
            />
            <div className="compose-actions compose-post-action">
              <Button
                type="submit"
                className="share-button"
                disabled={saving || text.trim().length < 5}
                aria-busy={saving}
              >
                {saving ? 'Posting…' : 'Post idea'}
                {!saving && <ArrowUp size={17} />}
              </Button>
            </div>
            <div className="honeypot" aria-hidden="true">
              <label htmlFor="garden-website">Website</label>
              <input
                ref={honeypot}
                id="garden-website"
                tabIndex={-1}
                autoComplete="off"
              />
            </div>
          </form>
        )}
      </div>
      {!shared && (
        <div className="compose-footnote">
          <span id="sharing-notice">
            Public ideas. No sign-in.{' '}
            <button onClick={onPrivacy}>Privacy</button>
          </span>
          <button className="tree-context" onClick={() => onGarden()}>
            <Sprout size={13} />1 idea = 1 tree
          </button>
          {text.length > 1200 && <span>{text.length}/1400</span>}
        </div>
      )}
      {error && (
        <p className="form-error" id="compose-error" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError('')}>
            <X size={14} />
          </button>
        </p>
      )}
    </section>
  );
}
