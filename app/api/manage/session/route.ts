import { database } from '@/db/raw';
import { readBody, InputError } from '@/lib/server';
import {
  adminJSON,
  adminFailure,
  requireModerator,
  digest,
  randomToken,
  allowed,
  sessionCookie,
  readSession,
  SESSION_SECONDS,
} from '@/server/admin-auth';
export async function GET(request: Request) {
  try {
    return adminJSON({ email: await requireModerator(request) });
  } catch (error) {
    return adminFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    if (typeof body?.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token))
      throw new InputError(
        'This link is invalid or expired. Request a new one.',
        401,
      );
    const db = database(),
      hash = await digest(body.token),
      now = Date.now();
    const link = await db
      .prepare(
        "SELECT email FROM admin_tokens WHERE hash=? AND kind='link' AND expires_at>?",
      )
      .bind(hash, now)
      .first<{ email: string }>();
    if (!link || !(await allowed(link.email)))
      throw new InputError(
        'This link is invalid or expired. Request a new one.',
        401,
      );
    const session = randomToken();
    // D1 batch is transactional: concurrent redemptions cannot create two sessions.
    const result = await db.batch([
      db
        .prepare(
          "INSERT INTO admin_tokens(hash,email,kind,expires_at) SELECT ?,email,'session',? FROM admin_tokens WHERE hash=? AND kind='link' AND expires_at>?",
        )
        .bind(await digest(session), now + SESSION_SECONDS * 1000, hash, now),
      db
        .prepare("DELETE FROM admin_tokens WHERE hash=? AND kind='link'")
        .bind(hash),
    ]);
    if (!result[0].meta.changes)
      throw new InputError(
        'This link has already been used. Request a new one.',
        401,
      );
    return adminJSON(
      { email: link.email },
      200,
      sessionCookie(request, session),
    );
  } catch (error) {
    return adminFailure(error);
  }
}
export async function DELETE(request: Request) {
  try {
    await readBody(request);
    const token = readSession(request);
    if (token)
      await database()
        .prepare('DELETE FROM admin_tokens WHERE hash=?')
        .bind(await digest(token))
        .run();
    return adminJSON({ ok: true }, 200, sessionCookie(request, '', 0));
  } catch (error) {
    return adminFailure(error);
  }
}
