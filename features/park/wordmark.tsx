'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Flower2, Sprout } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';

export type WordmarkVerb = 'want' | 'love';

/**
 * "i want / waterloo" is also the way in: the verb is the control. Choosing
 * "love" plants something good that already exists; "want" plants an idea.
 * While a love is being placed the wordmark reads "i love / waterloo".
 */
export function Wordmark({
  verb,
  onLove,
  onWant,
}: {
  verb: WordmarkVerb;
  onLove: () => void;
  onWant: () => void;
}) {
  const [open, setOpen] = useState(false);
  const choose = (then: () => void) => () => {
    setOpen(false);
    then();
  };
  return (
    <div className="brand wordmark" data-verb={verb}>
      <Sprout size={23} strokeWidth={1.8} aria-hidden="true" />
      <span aria-hidden="true">i</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className="wordmark-verb"
          aria-label={`Plant: i ${verb}…`}
        >
          {/* Keyed so the word settles in when it changes. */}
          <span key={verb} className="wordmark-word">
            {verb}
          </span>
          <ChevronDown size={14} aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent className="plant-chooser" align="start" sideOffset={10}>
          <PopoverTitle className="sr-only">
            What would you like to plant?
          </PopoverTitle>
          <button
            type="button"
            className="plant-choice is-love"
            onClick={choose(onLove)}
          >
            <Flower2 size={20} aria-hidden="true" />
            <span>
              <strong>I love…</strong>
              <small>
                Something good in Waterloo. It blooms where you tap.
              </small>
            </span>
          </button>
          <button
            type="button"
            className="plant-choice is-idea"
            onClick={choose(onWant)}
          >
            <Sprout size={20} aria-hidden="true" />
            <span>
              <strong>I want…</strong>
              <small>An idea to change something. It grows into a tree.</small>
            </span>
          </button>
        </PopoverContent>
      </Popover>
      <span className="brand-divider" aria-hidden="true">
        /
      </span>
      <Link prefetch={false} className="brand-muted" href="/">
        waterloo
      </Link>
    </div>
  );
}
