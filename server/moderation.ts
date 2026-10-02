import { env } from 'cloudflare:workers';

export type Screening = { state: 'visible' | 'pending'; reason: string | null };
// Conservative review thresholds, not probabilities. Never delete automatically.
// Generic violence, illicit activity, and self-harm mentions can be civic discussion.
const thresholds: Record<string, number> = {
  sexual: 0.9,
  'sexual/minors': 0.5,
  harassment: 0.95,
  'harassment/threatening': 0.8,
  hate: 0.95,
  'hate/threatening': 0.8,
  'violence/graphic': 0.9,
  'illicit/violent': 0.8,
  'self-harm/instructions': 0.8,
};
export function interpretModeration(payload: unknown): Screening {
  const result = (
    payload as {
      results?: {
        categories?: Record<string, boolean>;
        category_scores?: Record<string, number>;
      }[];
    }
  )?.results?.[0];
  if (!result?.categories || !result.category_scores)
    throw new Error('Invalid screening result');
  const reasons: string[] = [];
  for (const [category, threshold] of Object.entries(thresholds)) {
    const score = result.category_scores[category];
    if (
      typeof result.categories[category] !== 'boolean' ||
      typeof score !== 'number' ||
      !Number.isFinite(score) ||
      score < 0 ||
      score > 1
    )
      throw new Error('Invalid screening score');
    if (result.categories[category] && score >= threshold)
      reasons.push(category);
  }
  return {
    state: reasons.length ? 'pending' : 'visible',
    reason: reasons.length ? reasons.join(', ') : null,
  };
}
export async function screenSubmission(text: string): Promise<Screening> {
  try {
    if (!env.OPENAI_API_KEY) throw new Error('Screening unavailable');
    const response = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: text }),
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error('Screening unavailable');
    return interpretModeration(await response.json());
  } catch {
    // Preserve the submission without exposing it publicly or logging its text.
    return {
      state: 'pending',
      reason: 'Screening unavailable — please review manually.',
    };
  }
}
