'use client';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  readSubmission,
  submissionFor,
  type Submission,
} from '@/lib/submission';
import type { Love, LoveLandmark, LovesPage } from './model';
import { LOVES_KEY, postLove } from './queries';
import { LOVE_PLACES, type LoveSpot } from './places';

const MAX = 200;
/** Tab-local draft and retry key, like idea drafts: survives closing the dialog. */
const DRAFT_KEY = 'waterloo-love-draft';

type Draft = { body: string; name: string; submission: Submission | null };
function readDraft(): Draft {
  try {
    const raw = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || '{}');
    return {
      body: typeof raw.body === 'string' ? raw.body : '',
      name: typeof raw.name === 'string' ? raw.name : '',
      submission: readSubmission(raw.submission),
    };
  } catch {
    return { body: '', name: '', submission: null };
  }
}
function saveDraft(draft: Draft | null) {
  try {
    if (draft) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch {}
}

/**
 * Write a love for a tapped spot, or choose a named place (keyboard, no WebGL,
 * list view). An unchanged draft keeps its submission key across
 * retries, so a lost response cannot post it twice.
 */
export function LoveComposer({
  spot,
  onClose,
  onPosted,
}: {
  spot: LoveSpot | null;
  onClose: () => void;
  onPosted: (love: Love) => void;
}) {
  const client = useQueryClient();
  // Mounted only while open, so the tab's unfinished love is read once here.
  const [initial] = useState(readDraft);
  const [body, setBody] = useState(initial.body);
  const [name, setName] = useState(initial.name);
  const [place, setPlace] = useState<LoveLandmark | ''>('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  // Screening held the love: thank the author; it blooms once a moderator approves.
  const [held, setHeld] = useState(false);
  const [submission, setSubmission] = useState<Submission | null>(
    initial.submission,
  );
  const choosing = spot !== null && 'choose' in spot;

  useEffect(() => {
    if (spot && (body || name)) saveDraft({ body, name, submission });
  }, [spot, body, name, submission]);

  async function post() {
    if (!spot) return;
    const text = body.trim();
    if (text.length < 3) {
      setError('Write a few words about what you love.');
      return;
    }
    const chosen = choosing ? LOVE_PLACES.find((p) => p.id === place) : null;
    if (choosing && !chosen) {
      setError('Choose where in the park it is.');
      return;
    }
    const where = chosen
      ? { x: chosen.x, z: chosen.z, landmark: chosen.id }
      : (spot as { x: number; z: number; landmark?: LoveLandmark });
    const payload = {
      body: text,
      x: where.x,
      z: where.z,
      landmark: where.landmark,
      displayName: name.trim() || undefined,
    };
    const next = submissionFor(payload, submission);
    setSubmission(next);
    setPending(true);
    setError('');
    try {
      const { love } = await postLove({ ...payload, submissionKey: next.key });
      setBody('');
      setName('');
      setPlace('');
      setSubmission(null);
      saveDraft(null);
      if (love.moderationState === 'pending') {
        setHeld(true);
        return;
      }
      client.setQueryData<LovesPage>(LOVES_KEY, (data) => ({
        loves: [love, ...(data?.loves ?? []).filter((l) => l.id !== love.id)],
      }));
      onPosted(love);
    } catch (e) {
      // Keep the draft and its key so retrying cannot duplicate the love.
      setError(
        e instanceof Error ? e.message : 'Couldn’t save that. Try again.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={spot !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent className="love-composer">
        {held ? (
          <>
            <DialogTitle>Thanks—your love is awaiting review.</DialogTitle>
            <DialogDescription>
              It will bloom in the park once a moderator has read it.
            </DialogDescription>
            <div className="love-composer-actions">
              <Button type="button" onClick={onClose}>
                Done
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogTitle>What do you love here?</DialogTitle>
            <DialogDescription>
              {choosing
                ? 'A small thing counts. It will bloom near the place you choose.'
                : 'A small thing counts. It will bloom where you tapped.'}
            </DialogDescription>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void post();
              }}
            >
              {choosing && (
                <>
                  <label htmlFor="love-place">Where is it?</label>
                  <select
                    id="love-place"
                    value={place}
                    required
                    onChange={(event) =>
                      setPlace(event.target.value as LoveLandmark | '')
                    }
                  >
                    <option value="">Choose a place in the park</option>
                    {LOVE_PLACES.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <label className="sr-only" htmlFor="love-body">
                What you love
              </label>
              <textarea
                id="love-body"
                value={body}
                maxLength={MAX}
                rows={3}
                placeholder="The boardwalk at sunset, when half of Uptown is out walking."
                aria-describedby="love-count"
                onChange={(event) => setBody(event.target.value)}
              />
              <div className="love-composer-row">
                <label htmlFor="love-name">Your name · optional</label>
                <span id="love-count" className="love-composer-count">
                  {body.length}/{MAX}
                </span>
              </div>
              <input
                id="love-name"
                value={name}
                maxLength={60}
                autoComplete="name"
                onChange={(event) => setName(event.target.value)}
              />
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <div className="love-composer-actions">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onClose}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button type="submit" className="love-post" disabled={pending}>
                  {pending ? 'Planting…' : 'Plant this love'}
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
