import type { Idea } from './garden';

export const DEFAULT_QUESTION = 'What would make this work well in Waterloo?';
export const CONTRIBUTION_KINDS = [
  {
    id: 'detail',
    label: 'A detail',
    prompt: 'A detail or example that would help…',
  },
  {
    id: 'place',
    label: 'A place',
    prompt: 'Where could this work, and why there?',
  },
  {
    id: 'concern',
    label: 'A concern',
    prompt: 'What should we consider, and what might help?',
  },
  { id: 'help', label: 'I can help', prompt: 'What could you help with?' },
] as const;
export type ContributionKind = (typeof CONTRIBUTION_KINDS)[number]['id'];
export const REVIEW_STATUSES = [
  { id: 'reviewed', label: 'Organizer reviewed' },
  { id: 'needs-help', label: 'Looking for help' },
  { id: 'trying', label: 'Trying it out' },
  { id: 'learned', label: 'What we learned' },
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]['id'];
export type Credit = { id: string; displayName: string; body: string };
export type IdeaActivity = {
  id: string;
  kind: 'author' | 'organizer';
  createdAt: number;
  note: string;
  status: string;
  version: number;
  title: string;
  description: string;
  question: string;
  credits: Credit[];
};
export type ActivityPage = {
  original: {
    title: string;
    description: string;
    question: string;
    createdAt: number;
  };
  activities: IdeaActivity[];
  nextPage: number | null;
};
export function questionFor(idea: Pick<Idea, 'question'>) {
  return idea.question || DEFAULT_QUESTION;
}
export function progressLabel(idea: Idea) {
  if (idea.reviewStatus)
    return (
      REVIEW_STATUSES.find((s) => s.id === idea.reviewStatus)?.label ||
      'Organizer reviewed'
    );
  if (idea.version) return 'Taking shape';
  return idea.commentCount ? 'Build on this' : 'Be the first to help';
}
// Flowers are bounded, independent of popularity, and explainable in the history.
export function milestoneFlowers(
  idea: Pick<Idea, 'creditedCount' | 'version' | 'reviewCount'>,
) {
  return Math.min(
    12,
    (idea.creditedCount || 0) * 2 +
      Math.min(3, idea.version || 0) +
      Math.min(3, idea.reviewCount || 0),
  );
}
