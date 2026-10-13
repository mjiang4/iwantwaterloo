'use client';
import { useSyncExternalStore } from 'react';

/**
 * Phones open a stripped-down park (no city, shadows or fireflies, 1x
 * resolution) to save battery and data; "Transform me" switches to the full
 * version laptops get. The choice is remembered for later visits.
 */
const KEY = 'waterloo-park-full';
const listeners = new Set<() => void>();
let full: boolean | null = null;

/** A touch screen whose shorter side is phone-sized: tablets get the full park. */
export function isPhone() {
  return (
    matchMedia('(pointer: coarse)').matches &&
    Math.min(screen.width, screen.height) < 600
  );
}

function read() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return saved === 'yes';
  } catch {}
  return !isPhone();
}

export function setParkFull(value: boolean) {
  full = value;
  try {
    localStorage.setItem(KEY, value ? 'yes' : 'no');
  } catch {}
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The server renders the full park; the stripped-down choice applies on the client. */
export function useParkFull() {
  return useSyncExternalStore(
    subscribe,
    () => (full ??= read()),
    () => true,
  );
}

const noSubscription = () => () => {};
export function useIsPhone() {
  return useSyncExternalStore(noSubscription, isPhone, () => false);
}
