import { database } from '@/db/raw';
import { InputError } from '@/lib/server';
import { screenSubmission } from '@/server/moderation';
import { notifyModerators } from '@/server/moderation-notifications';
import { ideaTitle } from '@/lib/garden';
import {
  REVIEW_STATUSES,
  type IdeaActivity,
  type ActivityPage,
  type Credit,
} from '@/lib/participation';

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new InputError('Please check the form.');
  return value as Record<string, unknown>;
}
export function field(value: unknown, label: string, max: number, min = 0) {
  if (value !== undefined && typeof value !== 'string')
    throw new InputError(`Please check ${label}.`);
  const clean = String(value ?? '').trim();
  if (clean.length < min || clean.length > max)
    throw new InputError(`${label} must be ${min}–${max} characters.`);
  return clean;
}
export function uuid(value: unknown, label = 'Idea') {
  const id = field(value, label, 36, 36);
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)
  )
    throw new InputError(`Please check ${label}.`);
  return id;
}
export function updateInput(raw: unknown) {
  const value = object(raw);
  const ideaId = uuid(value.ideaId);
  const submissionKey = uuid(value.submissionKey, 'Submission');
  const description = field(value.description, 'Idea', 1400, 5);
  const question = field(value.question, 'Question', 180, 5);
  const note = field(value.note, 'What changed', 500, 5);
  if (!Number.isSafeInteger(value.version) || Number(value.version) < 0)
    throw new InputError('Refresh this idea before updating it.');
  if (!Array.isArray(value.credits) || value.credits.length > 10)
    throw new InputError('Credit up to 10 contributions.');
  const credits = [
    ...new Set(value.credits.map((id) => uuid(id, 'Contribution'))),
  ].sort();
  return {
    ideaId,
    submissionKey,
    description,
    title: ideaTitle(description),
    question,
    note,
    credits: JSON.stringify(credits),
    version: Number(value.version),
  };
}

/** Updates per idea; the history is public and each one is screened and reviewable. */
const MAX_UPDATES = 50;

/**
 * Append an author update. Updates replace the idea's public text, so they are
 * screened like new ideas: a held update stays private until a moderator
 * approves it, and the public keeps seeing the last visible version.
 * `beforeWrite` runs once a genuinely new update is about to be stored (rate limits).
 */
export async function appendUpdate(
  raw: unknown,
  visitorId: string,
  beforeWrite: () => Promise<void>,
): Promise<{ ideaId: string; moderationState: 'visible' | 'pending' }> {
  const input = updateInput(raw);
  const db = database();
  const previous = async () => {
    const row = await db
      .prepare(
        'SELECT visitor_id,idea_id,description,question,note,credits,moderation_state FROM idea_updates WHERE submission_key=?',
      )
      .bind(input.submissionKey)
      .first();
    if (!row) return null;
    if (
      row.visitor_id !== visitorId ||
      row.idea_id !== input.ideaId ||
      row.description !== input.description ||
      row.question !== input.question ||
      row.note !== input.note ||
      row.credits !== input.credits
    )
      throw new InputError('This update changed. Edit it and try again.', 409);
    return {
      ideaId: input.ideaId,
      moderationState:
        row.moderation_state === 'visible'
          ? ('visible' as const)
          : ('pending' as const),
    };
  };
  const saved = await previous();
  if (saved) return saved;
  const owner = await db
    .prepare(
      "SELECT visitor_id,(SELECT count(*) FROM idea_updates WHERE idea_id=ideas.id) AS updates FROM ideas WHERE id=? AND moderation_state='visible'",
    )
    .bind(input.ideaId)
    .first();
  if (!owner) throw new InputError('Idea not found.', 404);
  if (owner.visitor_id !== visitorId)
    throw new InputError(
      'Only the browser that posted this idea can update it.',
      403,
    );
  if (Number(owner.updates) >= MAX_UPDATES)
    throw new InputError('This idea has reached its update limit.', 409);
  await beforeWrite();
  const screening = await screenSubmission(
    [input.description, input.question, input.note].join('\n'),
  );
  // One conditional insert is the transaction: a stale tab cannot overwrite a newer
  // visible revision. Credit is checked in the same statement, including moderation
  // state. Versions number past held updates so retries and history stay unique.
  const inserted = await db
    .prepare(`INSERT INTO idea_updates
    (id,idea_id,version,title,description,question,note,credits,visitor_id,submission_key,created_at,moderation_state,moderation_reason)
    SELECT ?,id,coalesce((SELECT max(version) FROM idea_updates WHERE idea_id=ideas.id),0)+1,?,?,?,?,?,?,?,?,?,?
    FROM ideas WHERE id=? AND visitor_id=? AND moderation_state='visible'
    AND coalesce((SELECT max(version) FROM idea_updates WHERE idea_id=ideas.id AND moderation_state='visible'),0)=?
    AND (SELECT count(*) FROM comments c WHERE c.idea_id=ideas.id AND c.moderation_state='visible'
      AND c.visitor_id!=? AND c.id IN (SELECT value FROM json_each(?)))=json_array_length(?)
    ON CONFLICT DO NOTHING`)
    .bind(
      crypto.randomUUID(),
      input.title,
      input.description,
      input.question,
      input.note,
      input.credits,
      visitorId,
      input.submissionKey,
      Date.now(),
      screening.state,
      screening.reason,
      input.ideaId,
      visitorId,
      input.version,
      visitorId,
      input.credits,
      input.credits,
    )
    .run();
  if (!inserted.meta.changes) {
    const retried = await previous();
    if (retried) return retried;
    throw new InputError(
      'This idea or a credited contribution changed. Refresh the idea, then review your update.',
      409,
    );
  }
  if (screening.state === 'pending') await notifyModerators();
  return { ideaId: input.ideaId, moderationState: screening.state };
}

export async function activityFor(
  ideaId: string,
  page: number,
): Promise<ActivityPage> {
  const db = database();
  const [originals, events] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        "SELECT title,description,question,created_at AS createdAt FROM ideas WHERE id=? AND moderation_state='visible'",
      )
      .bind(ideaId),
    db
      .prepare(`SELECT id,'author' AS kind,created_at AS createdAt,note,'' AS status,version,title,description,question FROM idea_updates WHERE idea_id=? AND moderation_state='visible'
      UNION ALL SELECT id,'organizer',created_at,body,status,0,'','','' FROM organizer_reviews WHERE idea_id=?
      ORDER BY createdAt DESC,id DESC LIMIT 21 OFFSET ?`)
      .bind(ideaId, ideaId, page * 20),
  ]);
  const original = originals.results[0];
  if (!original) throw new InputError('Idea not found.', 404);
  const rows = events.results.slice(0, 20);
  const credited = await db
    .prepare(`SELECT v.id AS updateId,c.id,coalesce(c.display_name,'') AS displayName,c.body
    FROM idea_updates v,json_each(v.credits) credit JOIN comments c ON c.id=credit.value
    WHERE v.idea_id=? AND v.id IN (SELECT value FROM json_each(?)) AND c.idea_id=v.idea_id AND c.moderation_state='visible'`)
    .bind(
      ideaId,
      JSON.stringify(
        rows.filter((row) => row.kind === 'author').map((row) => row.id),
      ),
    )
    .all<Credit & { updateId: string }>();
  return {
    original: {
      title: String(original.title),
      description: String(original.description),
      question: String(original.question),
      createdAt: Number(original.createdAt),
    },
    activities: rows.map(
      (row) =>
        ({
          id: String(row.id),
          kind: row.kind === 'author' ? 'author' : 'organizer',
          createdAt: Number(row.createdAt),
          note: String(row.note),
          status: String(row.status),
          version: Number(row.version),
          title: String(row.title),
          description: String(row.description),
          question: String(row.question),
          credits: credited.results
            .filter((c) => c.updateId === row.id)
            .map(({ id, displayName, body }) => ({ id, displayName, body })),
        }) satisfies IdeaActivity,
    ),
    nextPage: events.results.length > 20 ? page + 1 : null,
  };
}
export async function appendReview(raw: unknown) {
  const value = object(raw),
    ideaId = uuid(value.ideaId),
    key = uuid(value.submissionKey, 'Submission');
  const body = field(value.body, 'Response', 1000, 10),
    status = field(value.status, 'Status', 30, 1);
  if (!REVIEW_STATUSES.some((s) => s.id === status))
    throw new InputError('Choose a review status.');
  const db = database();
  const previous = async () => {
    const row = await db
      .prepare(
        'SELECT idea_id,body,status FROM organizer_reviews WHERE submission_key=?',
      )
      .bind(key)
      .first();
    if (
      row &&
      (row.idea_id !== ideaId || row.body !== body || row.status !== status)
    )
      throw new InputError(
        'This response changed. Edit it and try again.',
        409,
      );
    return row;
  };
  if (await previous()) return;
  const inserted = await db
    .prepare(
      "INSERT INTO organizer_reviews(id,idea_id,body,status,submission_key,created_at) SELECT ?,id,?,?,?,? FROM ideas WHERE id=? AND moderation_state='visible' ON CONFLICT(submission_key) DO NOTHING",
    )
    .bind(crypto.randomUUID(), body, status, key, Date.now(), ideaId)
    .run();
  if (!inserted.meta.changes && !(await previous()))
    throw new InputError('Idea not found.', 404);
}
