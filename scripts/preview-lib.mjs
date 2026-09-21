import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { parseEnv } from 'node:util';
import path from 'node:path';
export const root = path.resolve(import.meta.dirname, '..');
export const previewRoot = path.join(root, '.preview');
export const origin =
  'http://localhost:' + (process.env.WATERLOO_PREVIEW_PORT || '3001');
export async function settings() {
  const file = path.join(root, '.env.preview');
  try {
    return validate(parseEnv(await readFile(file, 'utf8')));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const value = {
    PREVIEW_ID: 'preview-' + randomUUID(),
    PREVIEW_DB_ID: randomUUID(),
    PREVIEW_ADMIN_SECRET: randomBytes(32).toString('hex'),
    RATE_LIMIT_SECRET: randomBytes(32).toString('hex'),
  };
  await writeFile(
    file,
    Object.entries(value)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + '\n',
    { mode: 0o600, flag: 'wx' },
  );
  return value;
}
function validate(value) {
  if (
    !/^preview-[a-f0-9-]{36}$/.test(value.PREVIEW_ID) ||
    !/^[a-f0-9-]{36}$/.test(value.PREVIEW_DB_ID) ||
    value.PREVIEW_DB_ID === '00000000-0000-4000-8000-000000000000' ||
    !['PREVIEW_ADMIN_SECRET', 'RATE_LIMIT_SECRET'].every((k) =>
      /^[a-f0-9]{64}$/.test(value[k] || ''),
    )
  )
    throw new Error(
      'Invalid .env.preview settings. Keep the generated preview identity and 64-character keys.',
    );
  return value;
}
export async function fingerprint() {
  const hash = createHash('sha256');
  async function walk(dir) {
    for (const entry of (
      await readdir(path.join(root, dir), { withFileTypes: true })
    ).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) {
        hash.update(file);
        hash.update(await readFile(path.join(root, file)));
      }
    }
  }
  for (const dir of [
    'app',
    'assets',
    'components',
    'features',
    'hooks',
    'server',
    'styles',
    'lib',
    'db',
    'drizzle',
    'public',
  ])
    await walk(dir);
  for (const file of [
    'package.json',
    'package-lock.json',
    'vite.config.ts',
    'next.config.ts',
    'tsconfig.json',
  ]) {
    hash.update(file);
    hash.update(await readFile(path.join(root, file)));
  }
  return hash.digest('hex');
}
