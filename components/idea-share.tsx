'use client';
import { useRef, useState } from 'react';
import { Share2, Check, Copy, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
} from '@/components/ui/popover';
import type { Idea } from '@/lib/garden';
export function IdeaShare({ idea }: { idea: Pick<Idea, 'id' | 'title'> }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const [nativeShare, setNativeShare] = useState(false);
  const lock = useRef(false);
  async function share(copy: boolean) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage('');
    try {
      if (copy) {
        await navigator.clipboard.writeText(url);
        setMessage('Link copied');
      } else {
        await navigator.share({ title: idea.title, text: idea.title, url });
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError'))
        setMessage('Couldn’t share. You can copy the link below.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="idea-share">
      <Popover
        onOpenChange={(open) => {
          if (open) {
            setUrl(
              new URL(`/ideas/${encodeURIComponent(idea.id)}`, location.origin)
                .href,
            );
            setNativeShare(typeof navigator.share === 'function');
            setMessage('');
          }
        }}
      >
        <PopoverTrigger render={<Button />} aria-label="Share idea">
          <Share2 size={16} /> Share idea
        </PopoverTrigger>
        <PopoverContent align="start" className="idea-share-menu">
          <PopoverTitle className="sr-only">Share idea</PopoverTitle>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void share(true)}
          >
            {message === 'Link copied' ? (
              <Check size={16} />
            ) : (
              <Copy size={16} />
            )}
            {message === 'Link copied' ? message : 'Copy link'}
          </Button>
          <a
            className="idea-share-email"
            href={`mailto:?subject=${encodeURIComponent(idea.title)}&body=${encodeURIComponent(`${idea.title}\n\n${url}`)}`}
          >
            <Mail size={16} /> Email
          </a>
          {nativeShare && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void share(false)}
            >
              <Share2 size={16} /> More options
            </Button>
          )}
          <output
            className={
              message.startsWith('Couldn’t') ? 'share-feedback' : 'sr-only'
            }
          >
            {message}
          </output>
          {message.startsWith('Couldn’t') && (
            <input
              aria-label="Idea link"
              readOnly
              value={url}
              onFocus={(e) => e.target.select()}
            />
          )}
        </PopoverContent>
      </Popover>
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
