import { database } from '@/db/raw';
import {
  identity,
  requireVisitor,
  readBody,
  InputError,
  response,
  failure,
} from '@/lib/server';
import { limitWrites } from '@/lib/rate-limit';
import { screen } from '@/server/moderation';

export async function POST(request: Request) {
  const { id } = await identity(request);
  try {
    await requireVisitor(request);
    const raw = await readBody(request);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new InputError('Please add your feedback.');
    const value = raw as Record<string, unknown>;
    const body = typeof value.body === 'string' ? value.body.trim() : '';
    const key =
      typeof value.submissionKey === 'string' ? value.submissionKey : '';
    if (body.length < 10 || body.length > 2000)
      throw new InputError('Please use 10–2,000 characters.');
    // Feedback is private (not public), so pending == allow for storage; only hard
    // matches are refused.
    if (screen(body).action === 'reject')
      throw new InputError('This can’t be posted. Please rephrase.', 422);
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        key,
      )
    )
      throw new InputError('Please refresh and try again.');
    if (value.website)
      throw new InputError('Please leave the website field empty.');
    const db = database();
    const existing = await db
      .prepare(
        'SELECT id, body FROM website_feedback WHERE visitor_id=? AND submission_key=?',
      )
      .bind(id, key)
      .first<{ id: string; body: string }>();
    if (existing) {
      if (existing.body !== body)
        throw new InputError(
          'This submission was already used. Please refresh and try again.',
          409,
        );
      return response(request, id, { id: existing.id, queued: true });
    }
    await limitWrites(request, id, 'feedback');
    await db
      .prepare(
        'INSERT INTO website_feedback (id, body, visitor_id, submission_key, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(visitor_id, submission_key) DO NOTHING',
      )
      .bind(crypto.randomUUID(), body, id, key, Date.now())
      .run();
    const saved = await db
      .prepare(
        'SELECT id, body FROM website_feedback WHERE visitor_id=? AND submission_key=?',
      )
      .bind(id, key)
      .first<{ id: string; body: string }>();
    if (!saved) throw new Error('Feedback was not saved');
    if (saved.body !== body)
      throw new InputError(
        'This submission was already used. Please refresh and try again.',
        409,
      );
    return response(request, id, { id: saved.id, queued: true }, 201);
  } catch (error) {
    return failure(request, id, error);
  }
}
