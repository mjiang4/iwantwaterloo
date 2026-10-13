'use client';
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Flower2, X } from 'lucide-react';
import type { Idea, GardenComment } from '@/lib/garden';
import { questionFor } from '@/lib/participation';
import { requestJSON } from '@/lib/client';
import { submissionFor, type Submission } from '@/lib/submission';
import { IdeaDiscussion } from '@/components/idea-discussion';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { IdeaActivity } from './idea-activity';

function UpdateEditor({
  idea,
  credits,
  onCredits,
  onClose,
  onSaved,
}: {
  idea: Idea;
  credits: GardenComment[];
  onCredits: (credits: GardenComment[]) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [description, setDescription] = useState(idea.description);
  const [question, setQuestion] = useState(questionFor(idea));
  const [note, setNote] = useState('');
  const [canRetry, setCanRetry] = useState(false);
  const [version, setVersion] = useState(idea.version || 0);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const submission = useRef<Submission | null>(null),
    lock = useRef(false);
  const client = useQueryClient();
  const stale = version !== (idea.version || 0);
  async function save(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || (stale && !submission.current)) return;
    lock.current = true;
    setBusy(true);
    setError('');
    const input = {
      ideaId: idea.id,
      version,
      description,
      question,
      note,
      credits: credits.map((c) => c.id),
    };
    submission.current = submissionFor(input, submission.current);
    setCanRetry(true);
    try {
      const saved = await requestJSON<{ idea: Idea }>('/api/activity', {
        method: 'POST',
        body: JSON.stringify({
          ...input,
          submissionKey: submission.current.key,
        }),
      });
      client.setQueryData(['idea', idea.id], { ideas: [saved.idea] });
      await Promise.all(
        [
          'ideas',
          'garden',
          'activity',
          'comments',
          'shared-idea',
          'discovery',
        ].map((key) => client.invalidateQueries({ queryKey: [key] })),
      );
      onSaved();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Couldn’t save this update.',
      );
      void client.invalidateQueries({ queryKey: ['idea', idea.id] });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      className="idea-update-form"
      onSubmit={save}
      aria-label="Update your idea"
    >
      <div className="activity-meta">
        <h3>Develop your idea</h3>
        <button
          className="icon-button"
          type="button"
          aria-label="Cancel update"
          disabled={busy}
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </div>
      <label htmlFor="update-proposal">The idea</label>
      <Textarea
        id="update-proposal"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        minLength={5}
        maxLength={1400}
        required
        disabled={busy}
        rows={5}
      />
      <label htmlFor="update-question">Ask for help</label>
      <Input
        id="update-question"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        minLength={5}
        maxLength={180}
        required
        disabled={busy}
      />
      <label htmlFor="update-note">What changed?</label>
      <Textarea
        id="update-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What did you learn or add?"
        minLength={5}
        maxLength={500}
        required
        disabled={busy}
        rows={2}
      />
      {credits.length > 0 && (
        <fieldset className="credit-selection">
          <legend>Give credit</legend>
          {credits.map((comment) => (
            <label key={comment.id}>
              <input
                type="checkbox"
                checked
                onChange={() =>
                  onCredits(credits.filter((c) => c.id !== comment.id))
                }
                disabled={busy}
              />
              <span>
                {comment.body}
                {comment.displayName && <small>{comment.displayName}</small>}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <p className="participation-hint">
        The original and earlier versions stay visible.
      </p>
      {stale && (
        <div role="alert" className="update-conflict">
          <p>A newer version is available. Your draft is still here.</p>
          <details>
            <summary>Compare with latest</summary>
            <p>{idea.description}</p>
            <p>{questionFor(idea)}</p>
          </details>
          <Button
            variant="ghost"
            type="button"
            onClick={() => setVersion(idea.version || 0)}
          >
            I’ve reviewed it; use my draft
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <Button
        type="submit"
        disabled={busy || (stale && !canRetry) || note.trim().length < 5}
      >
        {busy ? 'Saving…' : 'Publish update'}
      </Button>
    </form>
  );
}
export function IdeaParticipation({ idea }: { idea: Idea }) {
  const [editing, setEditing] = useState(false),
    [credits, setCredits] = useState<GardenComment[]>([]),
    [message, setMessage] = useState('');
  const editor = useRef<HTMLDivElement>(null);
  function credit(comment: GardenComment) {
    setCredits((current) =>
      current.some((c) => c.id === comment.id)
        ? current
        : [...current, comment].slice(0, 10),
    );
    setEditing(true);
    setMessage('');
    requestAnimationFrame(() => {
      editor.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
      editor.current?.querySelector('textarea')?.focus();
    });
  }
  return (
    <div className="idea-participation">
      {idea.owned && (
        <div className="author-tools">
          <button
            type="button"
            onClick={() => {
              setEditing(!editing);
              setMessage('');
            }}
          >
            <Pencil size={15} />
            Update your idea
          </button>
          <span>This browser owns it.</span>
        </div>
      )}
      <div ref={editor}>
        {editing && idea.owned && (
          <UpdateEditor
            idea={idea}
            credits={credits}
            onCredits={setCredits}
            onClose={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              setCredits([]);
              setMessage('Updated. Your idea is taking shape.');
            }}
          />
        )}
      </div>
      {message && (
        <output className="participation-success">
          <Flower2 size={18} />
          {message}
        </output>
      )}
      <IdeaDiscussion key={idea.id} idea={idea} onCredit={credit} />
      <IdeaActivity idea={idea} />
    </div>
  );
}
