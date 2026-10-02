import { notifyModerators } from '@/server/moderation-notifications';
import { screenSubmission } from '@/server/moderation';
import { listIdeas } from '@/server/idea-list';
import { validateIdea } from '@/server/idea-input';
import { database } from '@/db/raw';
import {
  identity,
  requireVisitor,
  response,
  readBody,
  failure,
  InputError,
} from '@/lib/server';
import { IDEA_SELECT, ideaFromRow } from '@/server/idea-records';
import { limitWrites } from '@/lib/rate-limit';
export async function GET(request: Request) {
  const { id } = await identity(request);
  try {
    return response(request, id, await listIdeas(new URL(request.url), id));
  } catch (error) {
    return failure(request, id, error);
  }
}
export async function POST(request: Request) {
  const { id } = await identity(request);
  try {
    await requireVisitor(request);
    const data = validateIdea(await readBody(request)),
      db = database(),
      ideaId = crypto.randomUUID(),
      now = Date.now();
    const { submissionKey, ...fields } = data;
    async function previous() {
      if (!submissionKey) return null;
      // Compare with the original submission, not the latest author update.
      const original = await db
        .prepare(
          'SELECT id,title,description,question,place,display_name AS displayName FROM ideas WHERE submission_key=? AND visitor_id=?',
        )
        .bind(submissionKey, id)
        .first<Record<string, unknown>>();
      if (!original) return null;
      if (
        original.title !== fields.title ||
        original.description !== fields.description ||
        original.question !== fields.question ||
        original.place !== fields.place ||
        original.displayName !== fields.displayName
      )
        throw new InputError(
          'This submission changed. Edit the idea and try again.',
          409,
        );
      // The author's receipt, including a submission still awaiting review.
      const row = await db
        .prepare(IDEA_SELECT + ' WHERE i.id=?')
        .bind(id, original.id)
        .first<Record<string, unknown>>();
      return row ? ideaFromRow(row) : null;
    }
    const saved = await previous();
    if (saved) return response(request, id, { idea: saved });
    await limitWrites(request, id, 'ideas');
    const screening = await screenSubmission(
      [fields.title, fields.description, fields.question, fields.displayName]
        .filter(Boolean)
        .join('\n'),
    );
    const result = await db
      .prepare(
        'INSERT INTO ideas (id,title,description,question,category,place,display_name,created_at,visitor_id,submission_key,moderation_state,moderation_reason) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM ideas WHERE visitor_id=? AND created_at>?) < 5 ON CONFLICT(submission_key) DO NOTHING',
      )
      .bind(
        ideaId,
        fields.title,
        fields.description,
        fields.question,
        'other', // Required by the retained legacy database column.
        fields.place,
        fields.displayName,
        now,
        id,
        submissionKey,
        screening.state,
        screening.reason,
        id,
        now - 600000,
      )
      .run();
    if (!result.meta.changes) {
      const saved = await previous();
      if (saved) return response(request, id, { idea: saved });
      throw new InputError(
        'You’ve shared a few ideas. Try again in 10 minutes.',
        429,
        600,
      );
    }
    if (screening.state === 'pending') await notifyModerators();
    return response(
      request,
      id,
      {
        idea: {
          id: ideaId,
          moderationState: screening.state,
          ...fields,
          displayName: fields.displayName || undefined,
          plot: Number(result.meta.last_row_id) + 5,
          createdAt: now,
          waters: 0,
          watered: false,
          commentCount: 0,
          owned: true,
          version: 0,
          creditedCount: 0,
          reviewCount: 0,
          example: false,
        },
      },
      201,
    );
  } catch (error) {
    return failure(request, id, error);
  }
}
