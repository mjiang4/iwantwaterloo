export const IDEA_PLACES = [
  'Waterloo',
  'Kitchener',
  'Cambridge',
  'Waterloo Region',
] as const;
export type IdeaPlace = (typeof IDEA_PLACES)[number];
export function isIdeaPlace(value: unknown): value is IdeaPlace {
  return (
    typeof value === 'string' && IDEA_PLACES.some((place) => place === value)
  );
}
