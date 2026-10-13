import {
  cp,
  mkdir,
  readFile,
  writeFile,
  rm,
  symlink,
  lstat,
} from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { root, previewRoot, fingerprint } from './preview-lib.mjs';

// Stage user source only. Publishing is a separate Sites operation; this script has no credentials.
const target = path.join(previewRoot, 'remote');
const manifest = JSON.parse(
  await readFile(path.join(target, '.openai/hosting.json'), 'utf8'),
);
const production = JSON.parse(
  await readFile(path.join(root, '.openai/hosting.json'), 'utf8'),
);
if (
  manifest.project_id !== 'appgprj_6aa73178e83881919d915f3b02f89700' ||
  manifest.project_id === production.project_id
)
  throw new Error(
    'Expected the separate Waterloo development Site. Refusing to stage production.',
  );
const journalPath = 'drizzle/meta/_journal.json';
const previewMigration = '0005_preview_identity';
const identitySQL = await readFile(
  path.join(target, 'drizzle', previewMigration + '.sql'),
  'utf8',
);
const stagedJournal = JSON.parse(
  await readFile(path.join(target, journalPath), 'utf8'),
);
const identityEntry = stagedJournal.entries.find(
  (entry) => entry.tag === previewMigration,
);
const sourceJournal = JSON.parse(
  await readFile(path.join(root, journalPath), 'utf8'),
);
if (
  !identityEntry ||
  sourceJournal.entries.some((entry) => entry.idx === identityEntry.idx)
)
  throw new Error(
    'Migration 0005 is reserved for the already-applied preview identity. Use the next index.',
  );
const revision = await fingerprint();
const list = spawnSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: root, encoding: 'utf8' },
);
if (list.status !== 0) throw new Error('Cannot read the source checkout.');
const files = [...new Set(list.stdout.split('\0').filter(Boolean))];
// Replace source directories, including deleted files. Runtime data and Site identity stay separate.
for (const directory of [
  'app',
  'components',
  'features',
  'hooks',
  'server',
  'styles',
  'lib',
  'db',
  'drizzle',
  'public',
  'docs',
  'scripts',
  'tests',
])
  await rm(path.join(target, directory), { force: true, recursive: true });
for (const file of files) {
  if (
    file.startsWith('.openai/') ||
    file.startsWith('.preview/') ||
    file.startsWith('.env') ||
    file.startsWith('.dev.vars')
  )
    continue;
  const source = path.join(root, file);
  const stat = await lstat(source).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!stat?.isFile()) continue;
  await mkdir(path.dirname(path.join(target, file)), { recursive: true });
  await cp(source, path.join(target, file));
}
sourceJournal.entries.push(identityEntry);
sourceJournal.entries.sort((a, b) => a.idx - b.idx);
await writeFile(
  path.join(target, journalPath),
  JSON.stringify(sourceJournal, null, 2) + '\n',
);
await writeFile(
  path.join(target, 'drizzle', previewMigration + '.sql'),
  identitySQL,
);
const modules = path.join(target, 'node_modules');
const modulesStat = await lstat(modules).catch(() => null);
if (modulesStat?.isSymbolicLink()) await rm(modules);
if (!modulesStat || modulesStat.isSymbolicLink())
  await symlink('../../node_modules', modules);
await writeFile(
  path.join(target, 'public/robots.txt'),
  'User-agent: *\nDisallow: /\n',
);
await writeFile(
  path.join(previewRoot, 'staged-source.json'),
  JSON.stringify({
    revision,
    stagedAt: new Date().toISOString(),
    projectId: manifest.project_id,
  }),
  { mode: 0o600 },
);
console.log(
  `Development source staged: ${revision.slice(0, 12)}. Build and publish this separate Site through Sites.`,
);
