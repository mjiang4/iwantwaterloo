'use client';
import { useCallback, useEffect, useState } from 'react';

// Consume the cue only when it is visible. The application remembers consumption
// across tab changes; this component owns just the short-lived presentation.
export function useFreshHighlight<T extends HTMLElement>(
  eligible: boolean,
  onSeen: () => void,
) {
  const [highlighted, setHighlighted] = useState(false);
  // A callback ref also observes Drei's HTML portals, which mount after their
  // scene component effects have run.
  const ref = useCallback(
    (element: T | null) => {
      if (!eligible || !element) return;
      let visible = false,
        consumed = false;
      const reveal = () => {
        if (!visible || document.hidden || consumed) return;
        consumed = true;
        setHighlighted(true);
        onSeen();
      };
      const observer = new IntersectionObserver(
        ([entry]) => {
          visible = entry.isIntersecting;
          reveal();
        },
        { threshold: 0.5 },
      );
      observer.observe(element);
      document.addEventListener('visibilitychange', reveal);
      return () => {
        observer.disconnect();
        document.removeEventListener('visibilitychange', reveal);
      };
    },
    [eligible, onSeen],
  );
  useEffect(() => {
    if (!highlighted) return;
    const timer = setTimeout(() => setHighlighted(false), 2400);
    return () => clearTimeout(timer);
  }, [highlighted]);
  return { ref, highlighted };
}
