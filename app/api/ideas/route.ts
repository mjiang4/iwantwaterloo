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
  const { id } = identity(request);
  try {
    return response(request, id, await listIdeas(new URL(request.url), id));
  } catch (error) {
    return failure(request, id, error);
  }
}
export async function POST(request: Request) {
  const { id } = identity(request);
  try {
    requireVisitor(request);
    const data = validateIdea(await readBody(request)),
      db = database(),
      ideaId = crypto.randomUUID(),
      now = Date.now();
    const { submissionKey, ...fields } = data;
    async function previous() {
      if (!submissionKey) return null;
      const row = await db
        .prepare(IDEA_SELECT + ' WHERE submission_key=? AND i.visitor_id=?')
        .bind(id, submissionKey, id)
        .first<Record<string, unknown>>();
      if (!row) return null;
      if (
        row.title !== fields.title ||
        row.description !== fields.description ||
        row.place !== fields.place ||
        row.displayName !== fields.displayName
      )
        throw new InputError(
          'This submission changed. Edit the idea and try again.',
          409,
        );
      return ideaFromRow(row);
    }
    const saved = await previous();
    if (saved) return response(request, id, { idea: saved });
    await limitWrites(request, id, 'ideas');
    const screening = await screenSubmission(
      [fields.title, fields.description, fields.displayName]
        .filter(Boolean)
        .join('\n'),
    );
    const result = await db
      .prepare(
        'INSERT INTO ideas (id,title,description,category,place,display_name,created_at,visitor_id,submission_key,moderation_state,moderation_reason) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM ideas WHERE visitor_id=? AND created_at>?) < 5 ON CONFLICT(submission_key) DO NOTHING',
      )
      .bind(
        ideaId,
        fields.title,
        fields.description,
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
          example: false,
        },
      },
      201,
    );
  } catch (error) {
    return failure(request, id, error);
  }
}
