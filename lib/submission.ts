/** A retry keeps its key; editing the payload starts a new submission. */
export type Submission = { key: string; payload: string };

export function submissionFor(
  value: unknown,
  previous: Submission | null,
): Submission {
  const payload = JSON.stringify(value);
  return previous?.payload === payload
    ? previous
    : { key: crypto.randomUUID(), payload };
}

export function readSubmission(value: unknown): Submission | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.key === 'string' &&
    typeof candidate.payload === 'string'
    ? { key: candidate.key, payload: candidate.payload }
    : null;
}
