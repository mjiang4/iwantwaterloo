export function createButterflyVisit() {
  return { taps: 0, seen: false, elapsed: -1 };
}
export type ButterflyVisit = ReturnType<typeof createButterflyVisit>;
export const butterflyDuration = 5;
export function inviteButterfly(visit: ButterflyVisit, eligible: boolean) {
  if (!eligible || visit.seen) return;
  visit.taps = Math.min(3, visit.taps + 1);
  if (visit.taps === 3) {
    visit.seen = true;
    visit.elapsed = 0;
  }
}
export function advanceButterfly(
  visit: ButterflyVisit,
  delta: number,
  eligible: boolean,
) {
  if (!eligible) visit.elapsed = -1;
  if (visit.elapsed < 0) return -1;
  visit.elapsed += Number.isFinite(delta)
    ? Math.min(0.05, Math.max(0, delta))
    : 0;
  if (visit.elapsed >= butterflyDuration) {
    visit.elapsed = -1;
    return -1;
  }
  return visit.elapsed / butterflyDuration;
}
