'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

const storageKey = 'waterloo-introduction-seen';
export function useGardenIntroduction() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      // Hydrate a device preference only after the server-rendered page mounts.
      // oxlint-disable-next-line react/react-compiler
      setOpen(localStorage.getItem(storageKey) !== 'yes');
    } catch {
      setOpen(true);
    }
  }, []);
  function dismiss() {
    setOpen(false);
    try {
      localStorage.setItem(storageKey, 'yes');
    } catch {
      /* Storage is optional. */
    }
  }
  function show() {
    setOpen(true);
    requestAnimationFrame(() =>
      document.getElementById('garden-introduction')?.focus(),
    );
  }
  return { open, dismiss, show };
}
export function GardenWelcome({ onDismiss }: { onDismiss: () => void }) {
  return (
    <aside
      id="garden-introduction"
      tabIndex={-1}
      className="garden-welcome"
      aria-label="How the garden works"
    >
      <div>
        <p>
          <strong>Your ideas belong here.</strong>
        </p>
        <p>
          Each idea plants a tree. Likes help it grow. Tap a tree to join the
          conversation.
        </p>
      </div>
      <Button variant="ghost" onClick={onDismiss}>
        Got it
      </Button>
    </aside>
  );
}
