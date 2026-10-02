export const GROVE_SIZE = 48;
export type Idea = {
  moderationState?: 'visible' | 'pending';
  id: string;
  title: string;
  description: string;
  place: string;
  createdAt: number;
  waters: number;
  watered: boolean;
  example: boolean;
  plot?: number;
  displayName?: string;
  commentCount?: number;
};
export type GardenComment = {
  id: string;
  ideaId: string;
  parentId: string | null;
  body: string;
  displayName: string;
  createdAt: number;
};
// Keep the full suggestion; derive a compact card title without a second field.
export function ideaTitle(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  const first = clean.match(/^(.+?[.!?])(?:\s|$)/)?.[1];
  if (first && first.length >= 5 && first.length <= 90) return first;
  if (clean.length <= 90) return clean;
  const fragment = clean.slice(0, 89);
  const boundary = fragment.lastIndexOf(' ');
  return (
    (boundary > 45 ? fragment.slice(0, boundary) : fragment).trimEnd() + '…'
  );
}

export function hasDerivedTitle(idea: Pick<Idea, 'title' | 'description'>) {
  return idea.title === ideaTitle(idea.description);
}

// Preserve the original text when the heading is only a generated excerpt.
export function ideaBody(idea: Pick<Idea, 'title' | 'description'>) {
  if (hasDerivedTitle(idea)) return idea.description;
  return idea.description.startsWith(idea.title)
    ? idea.description.slice(idea.title.length).trim()
    : idea.description;
}
