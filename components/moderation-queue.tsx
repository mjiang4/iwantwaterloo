'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from './ui/button';
type Item = {
  id: string;
  kind: string;
  body: string;
  displayName: string | null;
  reason: string | null;
};
export function ModerationQueue({ onReviewed }: { onReviewed?: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const current = ++generation.current;
    try {
      const r = await fetch('/api/manage/review', { cache: 'no-store' });
      if (!r.ok) throw new Error('Couldn’t load submissions awaiting review.');
      const data = (await r.json()) as { items: Item[]; total: number };
      if (current !== generation.current) return;
      setItems(data.items);
      setTotal(data.total);
      setError('');
    } catch (e) {
      if (current === generation.current)
        setError(e instanceof Error ? e.message : 'Please try again.');
    }
  }, []);
  useEffect(() => {
    // Initial state comes from the asynchronous review endpoint.
    // oxlint-disable-next-line react/react-compiler
    void load();
    const refresh = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const interval = setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      // Invalidate outstanding requests; this ref is a sequence, not a DOM node.
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [load]);
  async function review(item: Item, action: string) {
    setBusy(true);
    setError('');
    generation.current++;
    try {
      const r = await fetch('/api/manage/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, kind: item.kind, action }),
      });
      if (!r.ok) throw new Error('Couldn’t save this review.');
      await load();
      onReviewed?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-review" aria-label="Submissions awaiting review">
      <div
        className={
          total ? 'admin-review-banner has-pending' : 'admin-review-banner'
        }
      >
        <Bell size={20} aria-hidden="true" />
        <output>
          {total === null
            ? 'Checking for submissions…'
            : total === 0
              ? 'Nothing awaiting review.'
              : `${total} ${total === 1 ? 'submission' : 'submissions'} awaiting review`}
        </output>
        {Boolean(total) && (
          <Button
            variant="outline"
            aria-expanded={expanded}
            aria-controls="moderation-items"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Close review' : 'Review submissions'}
          </Button>
        )}
        <Button variant="ghost" disabled={busy} onClick={() => void load()}>
          Refresh
        </Button>
      </div>
      {error && (
        <p className="admin-error" role="alert">
          {error} The count may be out of date.
        </p>
      )}
      {expanded && (
        <div id="moderation-items">
          {total !== null && total > items.length && (
            <p>
              Showing the oldest {items.length} of {total}. More appear as you
              review.
            </p>
          )}
          {items.map((item) => (
            <article className="admin-idea" key={item.kind + ':' + item.id}>
              <p className="admin-idea-body">{item.body}</p>
              <p className="admin-meta">
                {item.displayName ? item.displayName + ' · ' : ''}
                {item.kind} · {item.reason}
              </p>
              <Button
                disabled={busy}
                onClick={() => void review(item, 'approve')}
              >
                Approve
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void review(item, 'dismiss')}
              >
                Keep hidden
              </Button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
