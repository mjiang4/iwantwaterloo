import { openSync } from 'node:fs';
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import {
  root,
  previewRoot,
  origin,
  settings,
  fingerprint,
} from './preview-lib.mjs';
const env = {
  ...process.env,
  WRANGLER_SEND_METRICS: 'false',
  WRANGLER_WRITE_LOGS: 'false',
  MINIFLARE_REGISTRY_PATH: path.join(previewRoot, 'registry'),
  CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
};
const wrangler = path.join(root, 'node_modules/wrangler/bin/wrangler.js');
const statePath = path.join(previewRoot, 'state');
let active = null,
  worker = null,
  stopping = false,
  lastFingerprint = '',
  building = false;
await mkdir(previewRoot, { recursive: true });
try {
  const prior = JSON.parse(
    await readFile(path.join(previewRoot, 'runtime.json'), 'utf8'),
  );
  if (prior.runnerPid) {
    try {
      process.kill(prior.runnerPid, 0);
      throw new Error(
        `The production preview is already running at ${origin}/.`,
      );
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const config = await settings();
const logFd = openSync(path.join(previewRoot, 'build.log'), 'a', 0o600);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function command(executable, args) {
  const child = spawn(executable, args, {
    cwd: root,
    env,
    stdio: ['ignore', logFd, logFd],
  });
  const [code] = await once(child, 'exit');
  if (code !== 0)
    throw new Error(`${path.basename(executable)} exited with code ${code}`);
}
async function status(state) {
  if (active)
    await writeFile(
      path.join(active.directory, 'client/__preview/build-status.json'),
      JSON.stringify({ state, updatedAt: new Date().toISOString() }),
    );
}
async function stopWorker() {
  if (!worker) return;
  const current = worker;
  worker = null;
  try {
    process.kill(-current.pid, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
  if (current.exitCode === null)
    await Promise.race([once(current, 'exit'), delay(5000)]);
  if (current.exitCode === null)
    try {
      process.kill(-current.pid, 'SIGKILL');
    } catch {}
}
async function start(candidate) {
  worker = spawn(
    process.execPath,
    [
      wrangler,
      'dev',
      '--config',
      candidate.wrangler,
      '--local',
      '--ip',
      '127.0.0.1',
      '--port',
      new URL(origin).port,
      '--persist-to',
      statePath,
    ],
    {
      cwd: candidate.directory,
      env,
      stdio: ['ignore', logFd, logFd],
      detached: true,
    },
  );
  for (let i = 0; i < 80; i++) {
    if (worker.exitCode !== null)
      throw new Error('Preview server exited before becoming ready.');
    try {
      const r = await fetch(origin + '/api/ideas', {
        signal: AbortSignal.timeout(1000),
      });
      if (r.ok) {
        const version = await fetch(origin + '/__preview/build.json', {
          signal: AbortSignal.timeout(1000),
          cache: 'no-store',
        });
        if (
          !version.ok ||
          (await version.json()).revision !== candidate.build.revision
        ) {
          await delay(500);
          continue;
        }
        const admin = await fetch(origin + '/api/admin', {
          signal: AbortSignal.timeout(1000),
        });
        if (admin.status === 401) return;
      }
    } catch {}
    await delay(500);
  }
  throw new Error('Preview did not become ready.');
}
async function rebuild(sourceHash) {
  building = true;
  await status('building');
  try {
    console.log('Building the production preview…');
    await command(process.execPath, [
      path.join(root, 'node_modules/typescript/bin/tsc'),
      '--noEmit',
    ]);
    await command('npm', ['run', 'build']);
    if (stopping) return;
    if ((await fingerprint()) !== sourceHash) {
      console.log(
        'Source changed during the build; rebuilding the newer revision.',
      );
      return;
    }
    const directory = path.join(
      previewRoot,
      'builds',
      sourceHash.slice(0, 12) + '-' + Date.now().toString(36),
    );
    await cp(path.join(root, 'dist'), directory, { recursive: true });
    await mkdir(path.join(directory, 'client/__preview'), { recursive: true });
    const git = (...args) =>
      spawnSync('git', args, { cwd: root, encoding: 'utf8' }).stdout?.trim() ||
      '';
    const build = {
      revision: sourceHash,
      commit: git('rev-parse', '--short', 'HEAD'),
      branch: git('branch', '--show-current'),
      dirty: !!git('status', '--porcelain'),
      builtAt: new Date().toISOString(),
    };
    const original = JSON.parse(
      await readFile(path.join(directory, 'server/wrangler.json'), 'utf8'),
    );
    // Only local bindings are allowed. Never copy hosted bindings or secrets into this config.
    const runtime = {
      name: 'waterloo-production-preview',
      main: 'index.js',
      no_bundle: true,
      compatibility_date: original.compatibility_date,
      compatibility_flags: original.compatibility_flags,
      rules: original.rules,
      assets: { directory: '../client' },
      d1_databases: [
        {
          binding: 'DB',
          database_name: 'waterloo-preview',
          database_id: config.PREVIEW_DB_ID,
          migrations_dir: path.join(root, 'drizzle'),
        },
      ],
      vars: {
        GARDEN_ENV: 'preview',
        PREVIEW_ID: config.PREVIEW_ID,
        PREVIEW_ORIGIN: origin,
        PREVIEW_BUILD: JSON.stringify(build),
      },
    };
    const wranglerConfig = path.join(directory, 'server/wrangler.json');
    await writeFile(wranglerConfig, JSON.stringify(runtime, null, 2));
    await writeFile(
      path.join(directory, 'server/.dev.vars'),
      `PREVIEW_ADMIN_SECRET=${config.PREVIEW_ADMIN_SECRET}\nRATE_LIMIT_SECRET=${config.RATE_LIMIT_SECRET}\n`,
      { mode: 0o600 },
    );
    await writeFile(
      path.join(directory, 'client/robots.txt'),
      'User-agent: *\nDisallow: /\n',
    );
    await writeFile(
      path.join(directory, 'client/_headers'),
      '/*\n  X-Robots-Tag: noindex, nofollow\n/__preview/*\n  Cache-Control: no-store\n',
    );
    const dbArgs = [
      '--config',
      wranglerConfig,
      '--local',
      '--persist-to',
      statePath,
    ];
    await command(process.execPath, [
      wrangler,
      'd1',
      'migrations',
      'apply',
      'DB',
      ...dbArgs,
    ]);
    await command(process.execPath, [
      wrangler,
      'd1',
      'execute',
      'DB',
      ...dbArgs,
      '--command',
      `INSERT INTO preview_identity(id,value) SELECT 1,'${config.PREVIEW_ID}' WHERE NOT EXISTS(SELECT 1 FROM preview_identity) AND NOT EXISTS(SELECT 1 FROM ideas);`,
    ]);
    await mkdir(path.join(directory, 'client/__preview'), { recursive: true });
    await writeFile(
      path.join(directory, 'client/__preview/build.json'),
      JSON.stringify(build),
    );
    const previous = active,
      candidate = { directory, wrangler: wranglerConfig, build };
    await stopWorker();
    try {
      await start(candidate);
      active = candidate;
    } catch (error) {
      await stopWorker();
      if (previous) {
        await start(previous);
        active = previous;
      }
      throw error;
    }
    lastFingerprint = sourceHash;
    await status('ready');
    await writeFile(
      path.join(previewRoot, 'runtime.json'),
      JSON.stringify({
        runnerPid: process.pid,
        origin,
        statePath,
        config: active.wrangler,
        build,
      }),
      { mode: 0o600 },
    );
    console.log(`Preview ready: ${origin}/ · ${sourceHash.slice(0, 8)}`);
  } catch (error) {
    await status('failed');
    console.error(
      `Preview update failed: ${error.message}. ${active ? 'The previous working build is still available.' : ''}`,
    );
    lastFingerprint = sourceHash;
    if (!active) throw error;
  } finally {
    building = false;
  }
}
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await stopWorker();
  await writeFile(
    path.join(previewRoot, 'runtime.json'),
    JSON.stringify({ runnerPid: null, origin }),
    { mode: 0o600 },
  );
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
await rebuild(await fingerprint());
while (!stopping) {
  await delay(2000);
  if (building) continue;
  const next = await fingerprint();
  if (next !== lastFingerprint) await rebuild(next);
}
