'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Flag } from 'lucide-react';
import { Button } from './ui/button';
type Report = {
  id: string;
  kind: 'idea' | 'reply' | 'love';
  body: string;
  displayName: string | null;
  reports: number;
  reason: string | null;
};
/** Visible ideas, replies and loves that visitors reported, most-reported first. */
export function ReportQueue({ onHandled }: { onHandled?: () => void }) {
  const [items, setItems] = useState<Report[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const current = ++generation.current;
    try {
      const r = await fetch('/api/manage/reports', { cache: 'no-store' });
      if (!r.ok) throw new Error('Couldn’t load reports.');
      const data = (await r.json()) as { items: Report[] };
      if (current !== generation.current) return;
      setItems(data.items);
      setError('');
    } catch (e) {
      if (current === generation.current)
        setError(e instanceof Error ? e.message : 'Please try again.');
    }
  }, []);
  useEffect(() => {
    // Initial state comes from the asynchronous reports endpoint.
    // oxlint-disable-next-line react/react-compiler
    void load();
    return () => {
      // Invalidate outstanding requests; this ref is a sequence, not a DOM node.
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
    };
  }, [load]);
  async function handle(item: Report, action: 'hide' | 'dismiss') {
    setBusy(true);
    setError('');
    generation.current++;
    try {
      const r = await fetch('/api/manage/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, kind: item.kind, action }),
      });
      if (!r.ok && r.status !== 409) throw new Error('Couldn’t save this.');
      await load();
      onHandled?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }
  const count = items?.length ?? null;
  return (
    <section className="admin-review" aria-label="Reported contributions">
      <div
        className={
          count ? 'admin-review-banner has-pending' : 'admin-review-banner'
        }
      >
        <Flag size={20} aria-hidden="true" />
        <output>
          {count === null
            ? 'Checking for reports…'
            : count === 0
              ? 'No open reports.'
              : `${count} reported ${count === 1 ? 'contribution' : 'contributions'}`}
        </output>
        {Boolean(count) && (
          <Button
            variant="outline"
            aria-expanded={expanded}
            aria-controls="report-items"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Close reports' : 'Review reports'}
          </Button>
        )}
        <Button variant="ghost" disabled={busy} onClick={() => void load()}>
          Refresh
        </Button>
      </div>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {expanded && (
        <div id="report-items">
          {items?.map((item) => (
            <article className="admin-idea" key={item.kind + ':' + item.id}>
              <p className="admin-idea-body">{item.body}</p>
              <p className="admin-meta">
                {item.displayName ? item.displayName + ' · ' : ''}
                {item.kind} · {item.reports}{' '}
                {item.reports === 1 ? 'report' : 'reports'}
                {item.reason ? ' · “' + item.reason + '”' : ''}
              </p>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void handle(item, 'hide')}
              >
                Hide
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void handle(item, 'dismiss')}
              >
                Dismiss report
              </Button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
