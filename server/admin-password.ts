import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { database } from '@/db/raw';
import { InputError } from '@/lib/server';
// OWASP scrypt profile: 16 MiB memory, five parallelization rounds.
const options = { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 };
function derive(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, 32, options, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}
export function validatePassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128)
    throw new InputError(
      'Use a password or passphrase with 8–128 characters.',
    );
  return value;
}
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt-v1:${salt}:${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string | null) {
  const parts = encoded?.split(':');
  const valid =
    parts?.length === 3 &&
    parts[0] === 'scrypt-v1' &&
    /^[a-f0-9]{32}$/.test(parts[1]) &&
    /^[a-f0-9]{64}$/.test(parts[2]);
  // Do the same expensive work for an unknown account to avoid a cheap timing oracle.
  const salt = valid ? parts[1] : '00000000000000000000000000000000';
  const actual = await derive(password, salt);
  const expected = Buffer.from(valid ? parts[2] : '0'.repeat(64), 'hex');
  return timingSafeEqual(actual, expected) && Boolean(valid);
}
export async function storedPassword(email: string) {
  const row = await database()
    .prepare('SELECT password_hash FROM admin_passwords WHERE email=?')
    .bind(email)
    .first<{ password_hash: string }>();
  return row?.password_hash || null;
}
