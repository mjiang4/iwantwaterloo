/**
 * Deterministic content screening for public text (ideas, comments) and website feedback.
 *
 * This is a local civic campaign site, not a global platform: the goal is to stop obvious
 * slurs and explicit sexual content WITHOUT refusing ordinary civic language. Outcomes:
 *
 *   - HARD  -> 'reject'  : slurs and hardcore sexual terms. The write is refused (422).
 *   - SOFT  -> 'pending' : general profanity / borderline terms. The write is stored but
 *                          held out of public reads until a moderator approves it.
 *   - no match -> 'allow'.
 *
 * Obfuscation handling, and avoiding the "Scunthorpe problem":
 *   - Text is normalized (lowercased, diacritics stripped, common leetspeak mapped).
 *   - Each term matches with a leading word boundary, repeatable letters (so "fuuuck"
 *     matches), small inter-letter gaps (so "f u c k" / "f.u.c.k" match), and a trailing
 *     word boundary. The leading boundary is why "Scunthorpe", "class", "assassin" are
 *     never flagged.
 *   - Suffixes are PER TERM. Long unambiguous terms (fuck, shit, bitch) accept inflections
 *     (fucking, bitches). Short/ambiguous stems (spic, fag, cock, coon, gook, kike, chink,
 *     dick, piss, cunt) accept NO suffix, so "spicy", "cocky", "cocker", "Fagin", "chinks"
 *     are not refused.
 *   - An allowlist of known-good words/phrases is removed before matching, covering stems
 *     that are still substrings of place names or common words (e.g. "Coon Rapids",
 *     "pussy willow").
 *   - "rape"/"molest" are NOT bare hard terms (they appear in civic text such as "rape
 *     crisis centre"); only clearly abusive multiword phrasings are rejected.
 *
 * Best-effort only: trivial evasions (f*ck with the symbol unmapped, fvck, Cyrillic
 * lookalikes, no-separator concatenations like "fuckthis") will pass. Do not oversell it.
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

// Short/ambiguous stems: exact word only (no inflection suffix), because their suffixed
// forms are ordinary words (spicy, cocky, dickies, chinks, Fagin, ...).
const AMBIGUOUS = new Set([
  'spic',
  'fag',
  'cock',
  'coon',
  'gook',
  'kike',
  'chink',
  'dick',
  'piss',
  'cunt',
]);

// Hard list: slurs and explicit sexual terms. A match rejects the submission outright.
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
  'pedophile',
  'paedophile',
  'childporn',
];

// Soft list: general profanity / borderline terms. A match holds for moderator review.
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

// Known-good words/phrases removed before matching so an ambiguous stem inside them cannot
// trip. Phrases (with spaces) are matched as a unit. Longest first.
const ALLOWLIST = [
  'coon rapids',
  'pussy willows',
  'pussy willow',
  'cockney',
  'cocker',
  'spices',
  'spiced',
  'spicy',
  'spice',
  'cocky',
  'fagin',
  'dickies',
  'chinks',
];
const ALLOWLIST_RE = new RegExp(
  `(?<![a-z0-9])(?:${ALLOWLIST.join('|')})(?![a-z0-9])`,
  'g',
);

// Curated English inflection suffixes for unambiguous long terms. Deliberately small so it
// does not re-open the Scunthorpe problem (no bare "a"/"as").
const SUFFIX = '(?:s|es|ed|er|ers|ing|in|y|ies)?';
// Non-alphanumeric gap allowed between letters (handles "f u c k", "f.u.c.k").
const GAP = '[^a-z0-9]{0,2}';

function compile(term: string) {
  const letters = Array.from(term).map((l) => `${l}+`);
  const suffix = AMBIGUOUS.has(term) ? '' : SUFFIX;
  return new RegExp(`(?<![a-z0-9])${letters.join(GAP)}${suffix}(?![a-z0-9])`);
}

const HARD_PATTERNS = HARD.map((term) => [term, compile(term)] as const);
const SOFT_PATTERNS = SOFT.map((term) => [term, compile(term)] as const);

// "rape"/"molest" only as explicitly abusive multiword phrasings, so civic uses
// ("rape crisis centre", "rape prevention", "child molestation support") pass.
const HARD_PHRASES: ReadonlyArray<readonly [string, RegExp]> = [
  [
    'rape',
    /(?<![a-z0-9])rap(?:e|ed|es|ing)[^a-z0-9]+(?:you|him|her|them|kids?|child(?:ren)?)(?![a-z0-9])/,
  ],
  [
    'molest',
    /(?<![a-z0-9])molest(?:s|ed|ing)?[^a-z0-9]+(?:you|him|her|them|kids?|child(?:ren)?|people|someone)(?![a-z0-9])/,
  ],
];

/** Screen a block of user text. Empty/whitespace text always allows. */
export function screen(text: string): ScreenResult {
  const normalized = normalize(text).replace(ALLOWLIST_RE, ' ');
  if (!normalized.trim()) return { action: 'allow' };
  for (const [term, pattern] of HARD_PATTERNS)
    if (pattern.test(normalized)) return { action: 'reject', matched: term };
  for (const [term, pattern] of HARD_PHRASES)
    if (pattern.test(normalized)) return { action: 'reject', matched: term };
  for (const [term, pattern] of SOFT_PATTERNS)
    if (pattern.test(normalized)) return { action: 'pending', matched: term };
  return { action: 'allow' };
}
