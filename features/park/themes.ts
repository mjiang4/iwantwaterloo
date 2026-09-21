import type { Idea } from '@/lib/garden';
/** Broad browsing suggestions, not claims about author intent or political identity. */
export const parkThemes = [
  {
    id: 'places',
    label: 'Places',
    color: '#b9dab6',
    words:
      /park|public space|library|libraries|plaza|gather|community|waterloo square|third place|rain|seating|café|cafe/i,
  },
  {
    id: 'homes',
    label: 'Homes',
    color: '#efca9e',
    words: /hous|homes|rent|apartment|affordable|density|zoning/i,
  },
  {
    id: 'movement',
    label: 'Moving',
    color: '#a7dadd',
    words:
      /bike|cycling|cyclist|transit|bus\b|train|walk|traffic|transport|crossing|sidewalk|ION\b/i,
  },
  {
    id: 'possibility',
    label: 'Possibilities',
    color: '#d6bff3',
    words:
      /learn|student|build|business|startup|research|create|maker|education|workshop|science|art\b|music/i,
  },
] as const;
export function ideaTheme(idea: Pick<Idea, 'title' | 'description' | 'tags'>) {
  // Title is the strongest signal; location/context in details must not override it.
  const priority = [parkThemes[1], parkThemes[2], parkThemes[0], parkThemes[3]];
  const title = priority.find((theme) => theme.words.test(idea.title));
  const details = [idea.description, ...(idea.tags || [])].join(' ');
  return (
    title ||
    priority.find((theme) => theme.words.test(details)) ||
    parkThemes[3]
  );
}
