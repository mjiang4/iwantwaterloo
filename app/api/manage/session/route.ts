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
// Retired magic links cannot authenticate after switching to passwords.
export async function POST() {
  return adminJSON({ error: 'Sign in with your email and password.' }, 401);
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
