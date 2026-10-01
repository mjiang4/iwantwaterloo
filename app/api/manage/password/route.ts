import { database } from '@/db/raw';
import { readBody, InputError } from '@/lib/server';
import {
  adminJSON,
  adminFailure,
  requireModerator,
  sessionCookie,
  audit,
  loginLimit,
} from '@/server/admin-auth';
import {
  storedPassword,
  verifyPassword,
  passwordHash,
  validatePassword,
} from '@/server/admin-password';
export async function POST(request: Request) {
  try {
    const email = await requireModerator(request),
      body = await readBody(request);
    const next = validatePassword(body?.password);
    await loginLimit(request, email);
    if (
      typeof body?.currentPassword !== 'string' ||
      body.currentPassword.length > 128 ||
      !(await verifyPassword(body.currentPassword, await storedPassword(email)))
    )
      throw new InputError('Current password is incorrect.', 403);
    const db = database();
    await db.batch([
      db
        .prepare(
          'UPDATE admin_passwords SET password_hash=?,updated_at=? WHERE email=?',
        )
        .bind(await passwordHash(next), Date.now(), email),
      db.prepare('DELETE FROM admin_tokens WHERE email=?').bind(email),
      audit(email, 'change-password', email),
    ]);
    return adminJSON({ ok: true }, 200, sessionCookie(request, '', 0));
  } catch (error) {
    return adminFailure(error);
  }
}
