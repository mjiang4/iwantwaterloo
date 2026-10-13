'use client';
import { useRef, useState, useEffect, type SyntheticEvent } from 'react';
import { ArrowRight, X, TreeDeciduous, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ideaTitle, type Idea } from '@/lib/garden';
import { submissionFor, type Submission } from '@/lib/submission';
import { readSignature, saveSignature } from '@/lib/signature';
import { DEFAULT_QUESTION } from '@/lib/participation';
import { isIdeaPlace, type IdeaPlace } from '@/lib/idea-places';
import { IdeaPlacePicker } from './idea-place-picker';
import type { PlantInput } from '@/features/ideas/model';

export function IdeaComposer({
  onShare,
  onGarden,
}: {
  onShare: (input: PlantInput) => Promise<Idea>;
  onGarden: (idea?: Idea) => void;
}) {
  const [place, setPlace] = useState<IdeaPlace>('Waterloo');
  const [text, setText] = useState('');
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [displayName, setDisplayName] = useState('');
  const [remember, setRemember] = useState(false);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState('');
  const [confirmShort, setConfirmShort] = useState(false);
  const detailPrompt = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirmShort) detailPrompt.current?.focus();
  }, [confirmShort]);
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
        if (isIdeaPlace(draft.place)) setPlace(draft.place);
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
            place,
            displayName,
            submission: submission.current,
          }),
        );
    } catch {}
  }, [draftReady, text, question, place, displayName, shared]);
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
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const postAnyway =
      submitter instanceof HTMLButtonElement &&
      submitter.value === 'post-anyway';
    if (text.trim().length < 40 && !postAnyway) {
      setConfirmShort(true);
      detailPrompt.current?.focus();
      return;
    }
    setConfirmShort(false);
    submitting.current = true;
    setSaving(true);
    setError('');
    try {
      const input = {
        title: ideaTitle(text),
        question,
        description: text.trim(),
        place,
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
            place,
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
            <h2>
              {shared.moderationState === 'pending'
                ? 'Thanks—your idea is awaiting review.'
                : 'Your idea is in the garden.'}
            </h2>
            <div className="success-actions">
              <Button
                variant="ghost"
                onClick={() =>
                  onGarden(
                    shared.moderationState === 'pending' ? undefined : shared,
                  )
                }
              >
                {shared.moderationState === 'pending'
                  ? 'Browse the garden'
                  : 'See your tree'}
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
              Share your ideas. Be as detailed as you can!
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
                setConfirmShort(false);
                if (error) setError('');
              }}
              minLength={5}
              maxLength={1400}
              required
              placeholder={`I want ${place} to…`}
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
                Name <span className="sr-only">(optional)</span>
              </label>
              <Input
                id="idea-signature"
                maxLength={60}
                value={displayName}
                placeholder="Alex, longtime local"
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
            <IdeaPlacePicker
              value={place}
              onChange={setPlace}
              disabled={saving || !draftReady}
            />
            {confirmShort && (
              <fieldset
                className="short-idea-prompt"
                aria-labelledby="short-idea-heading"
              >
                <p id="short-idea-heading">Want to add a little more detail?</p>
                <p className="short-idea-hint">
                  A place or example helps others understand.
                </p>
                <div>
                  <Button
                    ref={detailPrompt}
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setConfirmShort(false);
                      textarea.current?.focus();
                    }}
                  >
                    Keep writing
                  </Button>
                  <Button type="submit" name="shortIdea" value="post-anyway">
                    Post anyway
                  </Button>
                </div>
              </fieldset>
            )}
            {!confirmShort && (
              <div className="compose-actions compose-post-action">
                <Button
                  type="submit"
                  className="share-button"
                  disabled={saving || text.trim().length < 5}
                  aria-busy={saving}
                >
                  {!saving && <Sprout size={18} aria-hidden="true" />}
                  {saving ? 'Planting…' : 'Plant your idea'}
                </Button>
              </div>
            )}
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
        <button
          type="button"
          className="browse-suggestions"
          onClick={() => onGarden()}
        >
          See what others suggest <ArrowRight size={16} aria-hidden="true" />
        </button>
      )}
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
