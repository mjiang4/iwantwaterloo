import { env } from 'cloudflare:workers';
import { database } from '@/db/raw';
import { readBody, InputError } from '@/lib/server';
import {
  adminJSON,
  adminFailure,
  requireModerator,
  normalizeEmail,
  OWNER_EMAILS,
  audit,
  randomToken,
  digest,
} from '@/server/admin-auth';
export async function GET(request: Request) {
  try {
    await requireModerator(request);
    const rows = await database()
      .prepare('SELECT email FROM garden_admins ORDER BY email')
      .all<{ email: string }>();
    return adminJSON({
      admins: [
        ...OWNER_EMAILS.map((email) => ({ email, owner: true })),
        ...rows.results
          .filter((r) => !OWNER_EMAILS.includes(r.email))
          .map((r) => ({ email: r.email, owner: false })),
      ],
    });
  } catch (error) {
    return adminFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await requireModerator(request),
      body = await readBody(request),
      email = normalizeEmail(body?.email);
    if (!OWNER_EMAILS.includes(email))
      await database().batch([
        database()
          .prepare(
            'INSERT INTO garden_admins(email,added_by,created_at) VALUES (?,?,?) ON CONFLICT(email) DO NOTHING',
          )
          .bind(email, actor, Date.now()),
        audit(actor, 'add-admin', email),
      ]);
    const hasPassword = await database()
      .prepare('SELECT email FROM admin_passwords WHERE email=?')
      .bind(email)
      .first();
    if (hasPassword) return adminJSON({ ok: true });
    const token = randomToken();
    await database()
      .prepare(
        "INSERT INTO admin_tokens(hash,email,kind,expires_at) VALUES (?,?,'password-setup',?)",
      )
      .bind(await digest(token), email, Date.now() + 86400000)
      .run();
    const url = new URL(
      '/admin',
      env.ADMIN_ORIGIN || 'https://iwantwaterloo.com',
    );
    url.hash = new URLSearchParams({ setup: token, email }).toString();
    return adminJSON({ ok: true, setupUrl: url.href });
  } catch (error) {
    return adminFailure(error);
  }
}
export async function DELETE(request: Request) {
  try {
    const actor = await requireModerator(request),
      body = await readBody(request),
      email = normalizeEmail(body?.email);
    if (OWNER_EMAILS.includes(email))
      throw new InputError('Owner access cannot be removed.');
    if (email === actor)
      throw new InputError('Ask another admin to remove your access.');
    await database().batch([
      database().prepare('DELETE FROM garden_admins WHERE email=?').bind(email),
      database().prepare('DELETE FROM admin_tokens WHERE email=?').bind(email),
      database()
        .prepare('DELETE FROM admin_passwords WHERE email=?')
        .bind(email),
      audit(actor, 'remove-admin', email),
    ]);
    return adminJSON({ ok: true });
  } catch (error) {
    return adminFailure(error);
  }
}
