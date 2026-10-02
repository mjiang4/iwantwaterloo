'use client';
/* oxlint-disable react/react-compiler -- Hydrate the first-visit device preference after SSR. */
import { useEffect, useState } from 'react';
import { X, ArrowRight } from 'lucide-react';
const storageKey = 'waterloo-park-tour-seen-v2';
export function useGardenIntroduction() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      setOpen(localStorage.getItem(storageKey) !== 'yes');
    } catch {
      setOpen(true);
    }
  }, []);
  function dismiss() {
    setOpen(false);
    try {
      localStorage.setItem(storageKey, 'yes');
    } catch {}
  }
  function show() {
    setOpen(true);
    requestAnimationFrame(() =>
      document.getElementById('garden-introduction')?.focus(),
    );
  }
  return { open, dismiss, show };
}
export function GardenWelcome({
  onDismiss,
  onExplore,
  onPlant,
  hasIdeas,
}: {
  onDismiss: () => void;
  onExplore: () => void;
  onPlant: () => void;
  hasIdeas: boolean;
}) {
  return (
    <aside
      id="garden-introduction"
      tabIndex={-1}
      className="garden-welcome"
      aria-label="How the park works"
    >
      <button
        className="tour-skip"
        aria-label="Skip introduction"
        onClick={onDismiss}
      >
        <X size={16} />
      </button>
      <strong>Explore ideas for Waterloo.</strong>
      <p>
        {hasIdeas
          ? 'Each glowing tree holds an idea for Waterloo.'
          : 'Plant the first idea for Waterloo.'}
      </p>
      <button className="tour-next" onClick={hasIdeas ? onExplore : onPlant}>
        {hasIdeas ? 'Explore an idea' : 'Plant the first idea'}
        <ArrowRight size={16} />
      </button>
    </aside>
  );
}
