'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { requestJSON } from '@/lib/client';
import { REVIEW_STATUSES, questionFor } from '@/lib/participation';
import { submissionFor, type Submission } from '@/lib/submission';
import type { Idea } from '@/lib/garden';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { IdeaActivity } from '@/features/ideas/idea-activity';
type Metrics = {
  reviewedThisWeek: number;
  ideasWithContributions: number;
  creditedContributions: number;
  developedIdeas: number;
  sharedContributions: number;
  returningAuthors: number;
  totalIdeas: number;
};
function ReviewForm({ idea, onSaved }: { idea: Idea; onSaved: () => void }) {
  const [body, setBody] = useState(''),
    [status, setStatus] = useState('reviewed'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const submission = useRef<Submission | null>(null),
    lock = useRef(false);
  async function publish(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    const value = { ideaId: idea.id, body, status };
    submission.current = submissionFor(value, submission.current);
    try {
      await requestJSON('/api/admin/reviews', {
        method: 'POST',
        body: JSON.stringify({
          ...value,
          submissionKey: submission.current.key,
        }),
      });
      onSaved();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Couldn’t publish this response.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <form className="organizer-response" onSubmit={publish}>
      <h2>{idea.title}</h2>
      <p>{idea.description}</p>
      <p className="revision-question">{questionFor(idea)}</p>
      <a href={`/ideas/${idea.id}`} target="_blank" rel="noreferrer">
        Read contributions ↗
      </a>
      <label htmlFor="review-status">Progress</label>
      <select
        id="review-status"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        disabled={busy}
      >
        {REVIEW_STATUSES.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
      <label htmlFor="review-body">Your response</label>
      <Textarea
        id="review-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required
        minLength={10}
        maxLength={1000}
        rows={4}
        disabled={busy}
        placeholder="What did you learn, and what happens next?"
      />
      <p className="participation-hint">
        Published as a community organizer, not a city decision.
      </p>
      {error && <p role="alert">{error}</p>}
      <Button type="submit" disabled={busy || body.trim().length < 10}>
        {busy ? 'Publishing…' : 'Publish response'}
      </Button>
      <IdeaActivity idea={idea} />
    </form>
  );
}
function Desk() {
  const [key, setKey] = useState(''),
    [selected, setSelected] = useState<Idea | null>(null),
    [message, setMessage] = useState(''),
    [signingIn, setSigningIn] = useState(false);
  const query = useQuery({
    queryKey: ['review-queue'],
    queryFn: ({ signal }) =>
      requestJSON<{ ideas: Idea[]; metrics: Metrics }>('/api/admin/reviews', {
        signal,
      }),
    retry: false,
  });
  async function login(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSigningIn(true);
    setMessage('');
    try {
      await requestJSON('/api/admin/session', {
        method: 'POST',
        body: JSON.stringify({ key }),
      });
      setKey('');
      await query.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Couldn’t sign in.');
    } finally {
      setSigningIn(false);
    }
  }
  const metrics = query.data?.metrics;
  return (
    <main className="organizer-page">
      <Link prefetch={false} className="shared-brand" href="/">
        i want / waterloo
      </Link>
      <header>
        <span className="eyebrow">Organizer</span>
        <h1>Keep ideas moving.</h1>
        <p>Review three ideas each week. Say what happens next.</p>
      </header>
      {query.isPending && <p>Loading your queue…</p>}
      {query.isError && (
        <div className="organizer-signin">
          <p role="alert">{query.error.message}</p>
          <Button variant="ghost" onClick={() => void query.refetch()}>
            Retry
          </Button>
          <form onSubmit={login}>
            <label htmlFor="operator-key">Preview key</label>
            <Input
              id="operator-key"
              type="password"
              autoComplete="current-password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              required
            />
            <Button disabled={signingIn} type="submit">
              {signingIn ? 'Signing in…' : 'Open organizer desk'}
            </Button>
          </form>
          <p className="participation-hint">
            The hosted preview recognizes its signed-in owner automatically.
          </p>
        </div>
      )}
      {metrics && (
        <>
          <section className="weekly-review" aria-label="Weekly review">
            <div>
              <strong>{metrics.reviewedThisWeek}/3</strong>
              <span>ideas reviewed in the last 7 days</span>
            </div>
            <progress value={Math.min(3, metrics.reviewedThisWeek)} max={3} />
            <Link prefetch={false} href="/updates">
              See published responses →
            </Link>
          </section>
          <div className="organizer-layout">
            <section className="review-queue">
              <h2>Next to review</h2>
              <p className="participation-hint">
                Unreviewed ideas first, then the oldest response.
              </p>
              {!query.data?.ideas.length && (
                <p>The garden is ready for its first idea.</p>
              )}
              {query.data?.ideas.map((idea) => (
                <button
                  className="review-queue-item"
                  key={idea.id}
                  aria-pressed={selected?.id === idea.id}
                  onClick={() => setSelected(idea)}
                >
                  <strong>{idea.title}</strong>
                  <span>
                    {idea.commentCount || 0} contributions ·{' '}
                    {idea.reviewCount ? 'Follow up' : 'First response'}
                  </span>
                </button>
              ))}
            </section>
            <section className="review-editor">
              {selected ? (
                <ReviewForm
                  key={selected.id}
                  idea={selected}
                  onSaved={() => {
                    setSelected(null);
                    setMessage(
                      'Response published. It is now visible on the idea and Updates.',
                    );
                    void query.refetch();
                  }}
                />
              ) : (
                <p className="participation-hint">Choose an idea to respond.</p>
              )}
            </section>
          </div>
          <details className="participation-metrics">
            <summary>Participation, beyond likes</summary>
            <dl>
              {[
                [
                  metrics.ideasWithContributions,
                  'Ideas with input from another browser',
                ],
                [
                  metrics.creditedContributions,
                  'Contributions credited by an author',
                ],
                [metrics.developedIdeas, 'Ideas developed by their authors'],
                [
                  metrics.returningAuthors,
                  'Authors who updated after at least a day',
                ],
                [
                  metrics.sharedContributions,
                  'Contributions from shared links',
                ],
              ].map(([value, label]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <p className="participation-hint">
              All-time counts. Browsers are not unique people. Shared-link
              counts reflect the link used to contribute; no browsing history is
              stored.
            </p>
          </details>
        </>
      )}
      {message && <output className="participation-success">{message}</output>}
    </main>
  );
}
export function OrganizerDesk() {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <Desk />
    </QueryClientProvider>
  );
}
