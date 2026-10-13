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
    const account = await database()
      .prepare(
        'SELECT EXISTS(SELECT 1 FROM admin_passwords WHERE email=?1) AS hasPassword,(SELECT added_by FROM garden_admins WHERE email=?1) AS addedBy',
      )
      .bind(email)
      .first<{ hasPassword: number; addedBy: string | null }>();
    if (account?.hasPassword) return adminJSON({ ok: true });
    // A setup link creates the account's password, so whoever holds it becomes that
    // admin. Only an owner may issue one for an owner, or for someone another admin
    // added; otherwise any admin could claim an unclaimed owner or pending invite.
    const actorIsOwner = OWNER_EMAILS.includes(actor);
    if (
      !actorIsOwner &&
      (OWNER_EMAILS.includes(email) || account?.addedBy !== actor)
    )
      throw new InputError(
        'Ask an owner to send this person a setup link.',
        403,
      );
    const token = randomToken();
    // A new link replaces any earlier one, so only the latest link works.
    await database().batch([
      database()
        .prepare(
          "DELETE FROM admin_tokens WHERE email=? AND kind='password-setup'",
        )
        .bind(email),
      database()
        .prepare(
          "INSERT INTO admin_tokens(hash,email,kind,expires_at) VALUES (?,?,'password-setup',?)",
        )
        .bind(await digest(token), email, Date.now() + 86400000),
      audit(actor, 'issue-setup-link', email),
    ]);
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
