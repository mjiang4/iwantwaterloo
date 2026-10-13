/** Public contract for a love: never includes visitor ids or retry keys. */
export type Love = {
  id: string;
  /** Only the author ever receives a love that is awaiting review. */
  moderationState?: 'visible' | 'pending';
  body: string;
  x: number;
  z: number;
  landmark?: string;
  displayName?: string;
  createdAt: number;
  echoes: number;
  echoed: boolean;
  owned: boolean;
};
export type LoveInput = {
  body: string;
  x: number;
  z: number;
  landmark?: string;
  displayName?: string;
  submissionKey: string;
};
export type LovesPage = { loves: Love[] };
export type EchoState = Pick<Love, 'id' | 'echoes' | 'echoed'>;

export const LOVE_LANDMARKS = [
  'silver-lake',
  'grist-mill',
  'log-school-house',
  'park-inn',
  'perimeter',
  'ion',
] as const;
export type LoveLandmark = (typeof LOVE_LANDMARKS)[number];
