'use client';
import { useEffect, useState } from 'react';
import { Button } from './ui/button';
type Item = {
  id: string;
  kind: string;
  body: string;
  displayName: string | null;
  reason: string | null;
};
export function ModerationQueue() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  async function load() {
    const r = await fetch('/api/manage/review', { cache: 'no-store' });
    if (!r.ok) throw new Error('Couldn’t load submissions awaiting review.');
    const data = (await r.json()) as { items: Item[] };
    setItems(data.items);
  }
  useEffect(() => {
    let active = true;
    fetch('/api/manage/review', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok)
          throw new Error('Couldn’t load submissions awaiting review.');
        return (await r.json()) as { items: Item[] };
      })
      .then((data) => {
        if (active) setItems(data.items);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function review(item: Item, action: string) {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/manage/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, kind: item.kind, action }),
      });
      if (!r.ok) throw new Error('Couldn’t save this review.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Submissions awaiting review">
      <h2>Awaiting review</h2>
      {error && <p role="alert">{error}</p>}
      <Button
        variant="ghost"
        disabled={busy}
        onClick={() => void load().catch((e) => setError(e.message))}
      >
        Refresh
      </Button>
      {loading && <p>Loading…</p>}
      {!loading && !items.length && !error && <p>Nothing awaiting review.</p>}
      {items.map((item) => (
        <article className="admin-idea" key={item.id}>
          <p className="admin-idea-body">{item.body}</p>
          <p className="admin-meta">
            {item.displayName ? item.displayName + ' · ' : ''}
            {item.kind} · {item.reason}
          </p>
          <Button disabled={busy} onClick={() => void review(item, 'approve')}>
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
    </section>
  );
}
