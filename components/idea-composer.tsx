'use client';
import { useRef, useState, useEffect, type SyntheticEvent } from 'react';
import { ArrowUp, X, TreeDeciduous, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ideaTitle, type Idea } from '@/lib/garden';
import { WritingExample } from './writing-example';
import { submissionFor, type Submission } from '@/lib/submission';
import { readSignature, saveSignature } from '@/lib/signature';
import { DEFAULT_QUESTION } from '@/lib/participation';
import type { PlantInput } from '@/features/ideas/model';

export function IdeaComposer({
  onShare,
  onGarden,
}: {
  onShare: (input: PlantInput) => Promise<Idea>;
  onGarden: (idea?: Idea) => void;
}) {
  const [text, setText] = useState('');
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
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
  const submission = useRef<Submission | null>(null);
  useEffect(() => {
    const signature = readSignature();
    // Hydrate browser-only signature and draft after SSR.
    // oxlint-disable-next-line react/react-compiler
    setRemember(Boolean(signature));
    setDisplayName(signature);
    try {
      const draft = JSON.parse(
        sessionStorage.getItem('waterloo-idea-draft') || 'null',
      );
      if (draft && typeof draft.text === 'string') {
        setText(draft.text.slice(0, 1400));
        if (typeof draft.question === 'string')
          setQuestion(draft.question.slice(0, 180));
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
      if (shared || (!text && !displayName))
        sessionStorage.removeItem('waterloo-idea-draft');
      else
        sessionStorage.setItem(
          'waterloo-idea-draft',
          JSON.stringify({
            text,
            question,
            displayName,
            submission: submission.current,
          }),
        );
    } catch {}
  }, [draftReady, text, question, displayName, shared]);
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
        question,
        description: text.trim(),
        tags: [],
        place: '',
        connection: '',
        displayName,
        consent: true,
        website: honeypot.current?.value || '',
      };
      submission.current = submissionFor(input, submission.current);
      try {
        sessionStorage.setItem(
          'waterloo-idea-draft',
          JSON.stringify({
            text,
            question,
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
      setQuestion(DEFAULT_QUESTION);
      if (!remember) setDisplayName('');
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
          <div className="share-success" aria-live="polite">
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
          <form ref={form} onSubmit={submit}>
            <label className="sr-only" htmlFor="new-idea">
              Your idea for Waterloo
            </label>
            <p id="idea-guidance" className="sr-only">
              Share a change and why it matters.
            </p>
            <Textarea
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
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
              placeholder="Share a change and why it matters."
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
              aria-describedby={`idea-guidance${error ? ' compose-error' : ''}`}
            />
            <WritingExample />
            <details className="composer-question">
              <summary>Ask people a question</summary>
              <label htmlFor="idea-question" className="sr-only">
                Your open question
              </label>
              <Input
                id="idea-question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={180}
                disabled={saving}
              />
            </details>
            <div className="signature-field">
              <label htmlFor="idea-signature">
                About you <span className="sr-only">(optional)</span>
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
