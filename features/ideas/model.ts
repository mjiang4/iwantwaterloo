import type { Idea } from '@/lib/garden';

export type PlantInput = {
  title: string;
  description: string;
  category?: string;
  tags?: string[];
  place: string;
  connection: string;
  consent: boolean;
  website?: string;
  submissionKey?: string;
  displayName?: string;
};
export type IdeasPage = {
  ideas: Idea[];
  examples: Idea[];
  total: number;
  nextPage: number | null;
};
export type SupportState = Pick<Idea, 'waters' | 'watered'>;
export type GardenPage = IdeasPage & {
  grovePages: number[];
  examplesTotal: number;
};
