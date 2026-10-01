import { database } from '@/db/raw';
import { readBody, InputError } from '@/lib/server';
import {
  adminJSON,
  adminFailure,
  normalizeEmail,
  allowed,
  loginLimit,
  digest,
  randomToken,
  LINK_SECONDS,
} from '@/server/admin-auth';
import { emailConfigured, sendAdminLink } from '@/server/admin-email';
export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    const email = normalizeEmail(body?.email);
    if (!emailConfigured())
      throw new InputError('Admin sign-in is not configured yet.', 503);
    await loginLimit(request, email);
    if (await allowed(email)) {
      const token = randomToken(),
        hash = await digest(token),
        now = Date.now(),
        db = database();
      await db.batch([
        db.prepare('DELETE FROM admin_tokens WHERE expires_at<=?').bind(now),
        db
          .prepare(
            "INSERT INTO admin_tokens(hash,email,kind,expires_at) VALUES (?,?,'link',?)",
          )
          .bind(hash, email, now + LINK_SECONDS * 1000),
      ]);
      try {
        await sendAdminLink(email, token, hash);
      } catch (error) {
        await db
          .prepare('DELETE FROM admin_tokens WHERE hash=?')
          .bind(hash)
          .run();
        throw error;
      }
    }
    return adminJSON({
      ok: true,
      message: 'If this email has admin access, a sign-in link is on its way.',
    });
  } catch (error) {
    return adminFailure(error);
  }
}
