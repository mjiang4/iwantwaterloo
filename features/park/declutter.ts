'use client';
import { useEffect, type RefObject } from 'react';

/**
 * Keeps scene labels from covering each other or the idea markers.
 * Idea markers are interactive targets and are never hidden; every other label
 * yields to anything above it in this list. Works on rendered boxes, so it
 * covers every label type without coupling their components together.
 */
const FIXED = [
  // The marker's visible dot, not its larger invisible tap area: captions sit
  // beneath markers in stacking order, so the tap target always stays usable.
  '.plant-marker .marker-face',
  '.plant-tooltip',
  // Interface panels over the scene: labels never tuck underneath them.
  '.garden-idea-dock',
  '.garden-love-dock',
  '.explore-toolbar',
  '.park-discovery',
  '.garden-controls',
  '.park-location',
  '.love-placement',
  '.park-transform',
].join(', ');
const YIELDING = [
  '.love-caption.is-selected',
  '.park-landmark-key',
  '.love-caption:not(.is-selected)',
  '.park-landmark',
];
const GAP = 6;
/**
 * Callouts (love captions) try these placements around their anchor before
 * giving up, like map labels: close in first, then a step further out.
 */
const PLACEMENTS = [
  'above',
  'right',
  'left',
  'below',
  'above-far',
  'right-far',
  'left-far',
  'below-far',
  'above-farther',
] as const;

type Box = { l: number; t: number; r: number; b: number };
const inside = (a: Box, frame: Box) =>
  a.l >= frame.l + GAP &&
  a.r <= frame.r - GAP &&
  a.t >= frame.t + GAP &&
  a.b <= frame.b - GAP;
const overlaps = (a: Box, b: Box) =>
  a.l < b.r + GAP && b.l < a.r + GAP && a.t < b.b + GAP && b.t < a.b + GAP;
const box = (el: Element): Box | null => {
  const r = el.getBoundingClientRect();
  return r.width && r.height
    ? { l: r.left, t: r.top, r: r.right, b: r.bottom }
    : null;
};

export function declutter(root: HTMLElement) {
  const placed: Box[] = [];
  const frame = box(root);
  // Obstacles can live anywhere on the page (the dock bar is outside the garden section).
  root.ownerDocument.querySelectorAll(FIXED).forEach((el) => {
    const b = box(el);
    if (b) placed.push(b);
  });
  for (const selector of YIELDING) {
    root.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      // Opacity never changes layout, so a hidden label is still measurable
      // and reappears as soon as there is room.
      const candidates = el.dataset.placement ? PLACEMENTS : [null];
      for (const placement of candidates) {
        if (placement) el.dataset.placement = placement;
        const b = box(el);
        // A callout that would run off the edge tries its next placement.
        const fits = !placement || !frame || (b && inside(b, frame));
        if (b && fits && !placed.some((p) => overlaps(p, b))) {
          el.dataset.occluded = 'false';
          if (el.dataset.focusable) el.tabIndex = 0;
          placed.push(b);
          return;
        }
      }
      el.dataset.occluded = 'true';
      // A hidden interactive label should not receive keyboard focus either.
      if (el instanceof HTMLButtonElement) {
        el.dataset.focusable = 'true';
        el.tabIndex = -1;
      }
    });
  }
}

/**
 * What would change the layout: each label's projected position (the inline
 * transform the scene writes; reading it forces no layout), which panels are
 * open, and the viewport size.
 */
/** Labels the scene positions; their wrapper's transform moves with the camera. */
const MOVING = '.plant-marker, .love-caption, .park-landmark';
function signature(root: HTMLElement) {
  let key = `${innerWidth}x${innerHeight}`;
  root.querySelectorAll<HTMLElement>(MOVING).forEach((el) => {
    key += '|' + (el.parentElement?.style.transform ?? '') + el.className;
  });
  for (const panel of [
    '.garden-idea-dock',
    '.garden-love-dock',
    '.love-placement',
    '.park-transform',
  ])
    key += root.ownerDocument.querySelector(panel) ? '1' : '0';
  return key;
}

/** Checks a few times a second while the garden is visible; lays out only on change. */
export function useDeclutter(
  root: RefObject<HTMLElement | null>,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return;
    let frame = 0,
      last = '';
    const run = () => {
      frame = 0;
      const el = root.current;
      if (!el || document.hidden) return;
      // Skip the layout pass entirely unless a label moved or a panel changed.
      const now = signature(el);
      if (now === last) return;
      last = now;
      declutter(el);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(run);
    };
    const id = setInterval(schedule, 180);
    addEventListener('resize', schedule);
    schedule();
    return () => {
      clearInterval(id);
      removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
    };
  }, [root, active]);
}
