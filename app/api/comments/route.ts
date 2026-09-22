import { database } from '@/db/raw';
import {
  failure,
  identity,
  requireVisitor,
  InputError,
  readBody,
  response,
} from '@/lib/server';
import { CONTRIBUTION_KINDS } from '@/lib/participation';
import { limitWrites } from '@/lib/rate-limit';

function text(value: unknown, name: string, max: number, min = 0) {
  if (value !== undefined && typeof value !== 'string')
    throw new InputError(`Please check ${name}.`);
  const clean = String(value ?? '').trim();
  if (clean.length < min || clean.length > max)
    throw new InputError(`${name} must be ${min}–${max} characters.`);
  return clean;
}

export async function GET(request: Request) {
  const { id } = identity(request);
  try {
    const ideaId = new URL(request.url).searchParams.get('ideaId') || '';
    const page = Math.max(
      0,
      Math.min(
        1000,
        Math.floor(Number(new URL(request.url).searchParams.get('page')) || 0),
      ),
    );
    if (!/^[a-f0-9-]{36}$/.test(ideaId))
      throw new InputError('Idea not found.', 404);
    const db = database();
    const idea = await db
      .prepare('SELECT id FROM ideas WHERE id=?')
      .bind(ideaId)
      .first();
    if (!idea) throw new InputError('Idea not found.', 404);
    const rows = await db
      .prepare(
        "SELECT c.id,c.idea_id AS ideaId,c.parent_id AS parentId,c.kind,c.body,coalesce(c.display_name,'') AS displayName,c.created_at AS createdAt,EXISTS(SELECT 1 FROM idea_updates u,json_each(u.credits) credit WHERE u.idea_id=c.idea_id AND credit.value=c.id) AS incorporated,c.visitor_id=(SELECT visitor_id FROM ideas WHERE id=c.idea_id) AS byAuthor FROM comments c WHERE c.idea_id=? AND moderation_state='visible' ORDER BY created_at,id LIMIT 21 OFFSET ?",
      )
      .bind(ideaId, page * 20)
      .all();
    return response(request, id, {
      comments: rows.results.slice(0, 20),
      nextPage: rows.results.length > 20 ? page + 1 : null,
    });
  } catch (error) {
    return failure(request, id, error);
  }
}

export async function POST(request: Request) {
  const { id } = identity(request);
  try {
    requireVisitor(request);
    const raw = await readBody(request);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new InputError('Write a reply first.');
    const value = raw as Record<string, unknown>;
    const ideaId = text(value.ideaId, 'Idea', 36, 36);
    const parentId = text(value.parentId, 'Reply', 36);
    const body = text(value.body, 'Reply', 1000, 2);
    const displayName = text(value.displayName, 'Name', 60);
    const kind = text(value.kind, 'Contribution', 20) || 'detail';
    const source = value.source === 'share' ? 'share' : 'garden';
    if (!CONTRIBUTION_KINDS.some((item) => item.id === kind))
      throw new InputError('Choose a contribution type.');
    const submissionKey = text(value.submissionKey, 'Submission', 36, 36);
    if (
      !/^[a-f0-9-]{36}$/.test(ideaId) ||
      !/^[a-f0-9-]{36}$/.test(submissionKey) ||
      (parentId && !/^[a-f0-9-]{36}$/.test(parentId))
    )
      throw new InputError('Please retry this reply.');
    const db = database();
    async function findPrevious() {
      const previous = await db
        .prepare(
          "SELECT id,idea_id AS ideaId,parent_id AS parentId,kind,body,coalesce(display_name,'') AS displayName,created_at AS createdAt FROM comments WHERE submission_key=? AND visitor_id=?",
        )
        .bind(submissionKey, id)
        .first();
      if (previous) {
        if (
          previous.ideaId !== ideaId ||
          previous.parentId !== (parentId || null) ||
          previous.body !== body ||
          previous.kind !== kind ||
          previous.displayName !== displayName
        )
          throw new InputError(
            'This reply changed. Edit it and try again.',
            409,
          );
        return previous;
      }
      return null;
    }
    const previous = await findPrevious();
    if (previous) return response(request, id, { comment: previous });
    const idea = await db
      .prepare('SELECT id FROM ideas WHERE id=?')
      .bind(ideaId)
      .first();
    if (!idea) throw new InputError('Idea not found.', 404);
    if (parentId) {
      const parent = await db
        .prepare(
          "SELECT id FROM comments WHERE id=? AND idea_id=? AND moderation_state='visible'",
        )
        .bind(parentId, ideaId)
        .first();
      if (!parent)
        throw new InputError('That reply is no longer available.', 409);
    }
    await limitWrites(request, id, 'comments');
    const commentId = crypto.randomUUID();
    const now = Date.now();
    const inserted = await db
      .prepare(
        'INSERT INTO comments (id,idea_id,parent_id,body,display_name,created_at,visitor_id,submission_key,kind,source) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(submission_key) DO NOTHING',
      )
      .bind(
        commentId,
        ideaId,
        parentId || null,
        body,
        displayName || null,
        now,
        id,
        submissionKey,
        kind,
        source,
      )
      .run();
    if (!inserted.meta.changes) {
      const saved = await findPrevious();
      if (!saved)
        throw new InputError('Please retry with a new submission.', 409);
      return response(request, id, { comment: saved });
    }
    return response(
      request,
      id,
      {
        comment: {
          id: commentId,
          ideaId,
          parentId: parentId || null,
          body,
          kind,
          displayName,
          createdAt: now,
        },
      },
      201,
    );
  } catch (error) {
    return failure(request, id, error);
  }
}
