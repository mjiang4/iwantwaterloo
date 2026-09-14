import { database } from '@/db/raw';
import { readBody, InputError } from '@/lib/server';
import {
  requirePreview,
  requireAdmin,
  loginAttempt,
  verifyOperatorKey,
  hash,
  token,
  sessionToken,
  createSession,
  adminCookie,
  adminResponse,
  adminError,
} from '@/lib/preview-auth';
export async function POST(request: Request) {
  try {
    await requirePreview(request);
    const body = await readBody(request);
    if (!body || typeof body !== 'object')
      throw new InputError('Enter your preview key.');
    await loginAttempt(request);
    if (body.ticket) {
      if (
        typeof body.ticket !== 'string' ||
        !/^[a-f0-9]{64}$/.test(body.ticket)
      )
        throw new InputError('This sign-in link is invalid or expired.', 401);
      const result = await database()
        .prepare(
          "DELETE FROM preview_sessions WHERE token_hash=? AND kind='ticket' AND expires_at>?",
        )
        .bind(await hash(body.ticket), Date.now())
        .run();
      if (!result.meta.changes)
        throw new InputError('This sign-in link is invalid or expired.', 401);
      return createSession(request);
    }
    if (!(await verifyOperatorKey(body.key)))
      throw new InputError('That preview key is not valid.', 401);
    if (body.issueLink === true) {
      const value = token();
      await database()
        .prepare(
          'INSERT INTO preview_sessions(token_hash,kind,expires_at) VALUES (?,?,?)',
        )
        .bind(await hash(value), 'ticket', Date.now() + 600000)
        .run();
      return adminResponse({ ticket: value });
    }
    return createSession(request);
  } catch (error) {
    return adminError(error);
  }
}
export async function DELETE(request: Request) {
  try {
    await requireAdmin(request);
    await readBody(request);
    await database()
      .prepare('DELETE FROM preview_sessions WHERE token_hash=?')
      .bind(await hash(sessionToken(request)))
      .run();
    return adminResponse({ ok: true }, 200, [adminCookie(request, '', 0)]);
  } catch (error) {
    return adminError(error);
  }
}
