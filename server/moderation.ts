/**
 * Deterministic content screening for public text (ideas, comments) and website feedback.
 *
 * This is a local civic campaign site, not a global platform: the goal is to stop obvious
 * slurs and explicit sexual content, not to build a perfect classifier. Two curated lists
 * drive the outcome:
 *
 *   - HARD  -> 'reject'  : slurs and hardcore sexual terms. The write is refused (422).
 *   - SOFT  -> 'pending' : general profanity / borderline terms. The write is stored but
 *                          held out of public reads until a moderator approves it.
 *   - no match -> 'allow'.
 *
 * Obfuscation handling, and avoiding the "Scunthorpe problem":
 *   - Text is normalized (lowercased, diacritics stripped, common leetspeak mapped) before
 *     matching, so "sh1t", "f4ggot", and accented spellings are caught.
 *   - Each term is matched with a leading word boundary, repeatable letters (so "fuuuck"
 *     and "niiiger" match), small inter-letter gaps (so "f u c k" and "f.u.c.k" match),
 *     a short curated inflection suffix (so "fucking"/"bitches" match), and a trailing
 *     word boundary. The leading boundary is why "Scunthorpe", "class", "assassin",
 *     "pass", and "cucumber" are NOT flagged: the term never starts at a word boundary in
 *     those words.
 *
 * Tradeoff: because both boundaries are required, a slur jammed into another word with no
 * separator (e.g. "fuckthis" as one solid token) is not caught. That is the deliberate
 * price of near-zero false positives on ordinary civic language.
 */

export type ScreenResult = {
  action: 'allow' | 'pending' | 'reject';
  matched?: string;
};

// Map common leetspeak / symbol substitutions to letters before matching.
const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '6': 'g',
  '7': 't',
  '8': 'b',
  '9': 'g',
  '@': 'a',
  $: 's',
  '!': 'i',
  '|': 'i',
  '+': 't',
  '(': 'c',
};

function normalize(text: string) {
  return Array.from(
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, ''), // strip combining marks (diacritics)
  )
    .map((ch) => LEET[ch] ?? ch)
    .join('');
}

// Hard list: slurs and explicit sexual terms. A match rejects the submission outright.
// Kept intentionally compact and readable; each entry is a base form (inflections and
// light obfuscation are handled by the matcher, not by listing every variant).
const HARD = [
  'nigger',
  'nigga',
  'faggot',
  'fag',
  'retard',
  'chink',
  'spic',
  'kike',
  'wetback',
  'gook',
  'tranny',
  'coon',
  'cunt',
  'cock',
  'pussy',
  'blowjob',
  'cumshot',
  'handjob',
  'rape',
  'molest',
  'pedophile',
  'paedophile',
  'childporn',
];

// Soft list: general profanity / borderline terms. A match holds the submission for
// moderator review instead of publishing it immediately.
const SOFT = [
  'fuck',
  'shit',
  'bitch',
  'bastard',
  'asshole',
  'dickhead',
  'dick',
  'piss',
  'slut',
  'whore',
  'douche',
  'prick',
  'wanker',
  'twat',
];

// Curated English inflection suffixes allowed after a matched term. Deliberately small so
// it does not re-open the Scunthorpe problem (e.g. no bare "a"/"as" that would let the
// trailing boundary slip past "assassin").
const SUFFIX = '(?:s|es|ed|er|ers|ing|in|y|ies)?';
// Non-alphanumeric gap allowed between letters (handles "f u c k", "f.u.c.k").
const GAP = '[^a-z0-9]{0,2}';

function compile(term: string) {
  const letters = Array.from(term).map((l) => `${l}+`);
  return new RegExp(`(?<![a-z0-9])${letters.join(GAP)}${SUFFIX}(?![a-z0-9])`);
}

const HARD_PATTERNS = HARD.map((term) => [term, compile(term)] as const);
const SOFT_PATTERNS = SOFT.map((term) => [term, compile(term)] as const);

/** Screen a block of user text. Empty/whitespace text always allows. */
export function screen(text: string): ScreenResult {
  const normalized = normalize(text);
  if (!normalized.trim()) return { action: 'allow' };
  for (const [term, pattern] of HARD_PATTERNS)
    if (pattern.test(normalized)) return { action: 'reject', matched: term };
  for (const [term, pattern] of SOFT_PATTERNS)
    if (pattern.test(normalized)) return { action: 'pending', matched: term };
  return { action: 'allow' };
}
