'use client';
import { useRef, useState } from 'react';
import { Share2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Idea } from '@/lib/garden';
export function IdeaShare({ idea }: { idea: Pick<Idea, 'id' | 'title'> }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function share() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage('');
    const url = new URL(
      `/ideas/${encodeURIComponent(idea.id)}`,
      location.origin,
    ).href;
    try {
      if (navigator.share)
        await navigator.share({ title: idea.title, text: idea.title, url });
      else {
        await navigator.clipboard.writeText(url);
        setMessage('Link copied');
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError'))
        setMessage('Couldn’t share. Open the idea to copy its address.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="idea-share">
      <Button onClick={share} disabled={busy} aria-label="Share idea">
        {message === 'Link copied' ? <Check size={16} /> : <Share2 size={16} />}
        {message === 'Link copied' ? message : 'Share idea'}
      </Button>
      <output
        className={message === 'Link copied' ? 'sr-only' : 'share-feedback'}
      >
        {message}
      </output>
    </div>
  );
}
export function PlantReceipt({
  idea,
  onDone,
}: {
  idea: Idea;
  onDone: () => void;
}) {
  return (
    <section className="plant-receipt" aria-label="Your posted idea">
      <output className="receipt-status">Your idea is in the garden.</output>
      <p className="receipt-text">{idea.description}</p>
      {idea.displayName && (
        <p className="receipt-signature">{idea.displayName}</p>
      )}
      <div className="receipt-actions">
        <IdeaShare idea={idea} />
        <Button variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>
    </section>
  );
}
