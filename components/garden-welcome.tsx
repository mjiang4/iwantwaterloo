'use client';
/* oxlint-disable react/react-compiler -- Hydrate the first-visit device preference after SSR. */
import { useEffect, useState } from 'react';
import { X, ArrowRight } from 'lucide-react';
const storageKey = 'waterloo-park-tour-seen';
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
const steps = [
  ['Ideas grow here.', 'Tap a marked tree to explore an idea.'],
  ['Help a good idea grow.', 'Like it, or add your perspective.'],
  ['Make room for your idea.', 'Plant one. Watch it take root.'],
];
export function GardenWelcome({ onDismiss }: { onDismiss: () => void }) {
  const [step, setStep] = useState(0);
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
      <div className="tour-dots" aria-label={`Step ${step + 1} of 3`}>
        {steps.map((_, i) => (
          <i key={i} data-active={i === step} />
        ))}
      </div>
      <div aria-live="polite">
        <strong>{steps[step][0]}</strong>
        <p>{steps[step][1]}</p>
      </div>
      <button
        className="tour-next"
        onClick={() => (step === 2 ? onDismiss() : setStep(step + 1))}
      >
        {step === 2 ? 'Explore' : 'Next'}
        <ArrowRight size={15} />
      </button>
    </aside>
  );
}
