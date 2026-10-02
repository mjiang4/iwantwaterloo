import { DEFAULT_QUESTION } from '@/lib/participation';
import { InputError } from '@/lib/server';
import { isIdeaPlace } from '@/lib/idea-places';

export function validateIdea(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new InputError('Please complete the idea form.');
  const v = raw as Record<string, unknown>;
  function field(name: string, max: number, min = 0) {
    if (v[name] !== undefined && typeof v[name] !== 'string')
      throw new InputError(`Please check ${name}.`);
    const t = String(v[name] ?? '').trim();
    if (t.length < min || t.length > max)
      throw new InputError(
        `${name === 'title' ? 'Title' : name === 'description' ? 'Idea' : name} must be ${min}–${max} characters.`,
      );
    return t;
  }
  const title = field('title', 90, 5),
    description = field('description', 1400, 5),
    place = field('place', 90),
    displayName = field('displayName', 60),
    question = field('question', 180) || DEFAULT_QUESTION;
  if (question.length < 5)
    throw new InputError('Ask a short question, at least 5 characters.');
  // Place is public but unscreened, so it is a choice from a fixed list, not free text.
  if (place && !isIdeaPlace(place)) throw new InputError('Choose a city.');
  if (v.consent !== true)
    throw new InputError('Confirm sharing with visitors.');
  if (v.website)
    throw new InputError('We could not plant this idea. Please try again.');
  const submissionKey = field('submissionKey', 36);
  if (
    submissionKey &&
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      submissionKey,
    )
  )
    throw new InputError('Please retry this idea.');
  return {
    title,
    description,
    question,
    submissionKey: submissionKey || null,
    place,
    displayName: displayName || null,
  };
}
