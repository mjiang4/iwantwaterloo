import { env } from 'cloudflare:workers';
import { database } from '@/db/raw';
import { readBody, InputError } from '@/lib/server';
import {
  adminJSON,
  adminFailure,
  normalizeEmail,
  allowed,
  digest,
  OWNER_EMAILS,
  audit,
  loginLimit,
} from '@/server/admin-auth';
import { validatePassword, passwordHash } from '@/server/admin-password';
export async function POST(request: Request) {
  try {
    const body = await readBody(request),
      email = normalizeEmail(body?.email),
      password = validatePassword(body?.password);
    await loginLimit(request, email);
    if (typeof body?.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token))
      throw new InputError('This setup link is invalid or expired.', 401);
    const hash = await digest(body.token),
      db = database(),
      now = Date.now();
    const bootstrap =
      OWNER_EMAILS.includes(email) &&
      hash === env.ADMIN_BOOTSTRAP_HASH &&
      Number(env.ADMIN_BOOTSTRAP_EXPIRES) > now;
    const invite = await db
      .prepare(
        "SELECT email FROM admin_tokens WHERE hash=? AND kind='password-setup' AND expires_at>?",
      )
      .bind(hash, now)
      .first<{ email: string }>();
    if (!bootstrap && (invite?.email !== email || !(await allowed(email))))
      throw new InputError('This setup link is invalid or expired.', 401);
    const encoded = await passwordHash(password);
    const insert = bootstrap
      ? db
          .prepare(
            'INSERT INTO admin_passwords(email,password_hash,updated_at) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM admin_tokens WHERE hash=?) AND NOT EXISTS(SELECT 1 FROM admin_passwords) ON CONFLICT(email) DO NOTHING',
          )
          .bind(email, encoded, now, hash)
      : db
          .prepare(
            "INSERT INTO admin_passwords(email,password_hash,updated_at) SELECT email,?,? FROM admin_tokens WHERE hash=? AND email=? AND kind='password-setup' AND expires_at>? ON CONFLICT(email) DO NOTHING",
          )
          .bind(encoded, now, hash, email, now);
    const consume = bootstrap
      ? db
          .prepare(
            "INSERT INTO admin_tokens(hash,email,kind,expires_at) VALUES (?,?,'bootstrap-used',?) ON CONFLICT(hash) DO NOTHING",
          )
          .bind(hash, email, Number(env.ADMIN_BOOTSTRAP_EXPIRES))
      : db
          .prepare(
            "DELETE FROM admin_tokens WHERE hash=? AND kind='password-setup'",
          )
          .bind(hash);
    const result = await db.batch([insert, consume]);
    if (!result[0].meta.changes)
      throw new InputError(
        'A password is already set or this link was used. Sign in instead.',
        409,
      );
    await audit(email, 'set-password', email).run();
    return adminJSON({ ok: true });
  } catch (error) {
    return adminFailure(error);
  }
}
