import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID, randomBytes } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rejectExternalTarget } from './api-harness.mjs';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const run = promisify(execFile);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs the compiled application against a new database, never .preview/state. */
export async function startTestSite() {
  rejectExternalTarget();
  const directory = await mkdtemp(path.join(tmpdir(), 'waterloo-browser-'));
  const port = Number(process.env.WATERLOO_TEST_PORT || 3173);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Invalid test port.');
  const origin = 'http://127.0.0.1:' + port;
  const marker = randomUUID();
  let child;
  let output = '';
  const env = {
    ...process.env,
    WRANGLER_SEND_METRICS: 'false',
    WRANGLER_WRITE_LOGS: 'false',
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
    MINIFLARE_REGISTRY_PATH: path.join(directory, 'registry'),
  };
  async function dispose() {
    if (child && child.exitCode === null) {
      const ended = new Promise((resolve) => child.once('exit', resolve));
      child.kill('SIGTERM');
      await Promise.race([ended, delay(4000)]);
      if (child.exitCode === null) {
        child.kill('SIGKILL');
        await ended;
      }
    }
    await rm(directory, { recursive: true, force: true });
  }
  try {
    await cp(path.join(root, 'dist'), path.join(directory, 'dist'), {
      recursive: true,
    });
    const server = path.join(directory, 'dist/server');
    const configPath = path.join(server, 'wrangler.json');
    const original = JSON.parse(await readFile(configPath, 'utf8'));
    const config = {
      name: 'waterloo-browser-test',
      main: 'index.js',
      no_bundle: true,
      compatibility_date: original.compatibility_date,
      compatibility_flags: original.compatibility_flags,
      rules: original.rules,
      assets: { directory: '../client' },
      d1_databases: [
        {
          binding: 'DB',
          database_name: 'waterloo-browser-test',
          database_id: randomUUID(),
          migrations_dir: path.join(root, 'drizzle'),
        },
      ],
      vars: {
        GARDEN_ENV: 'test',
        RATE_LIMIT_SECRET: randomBytes(32).toString('hex'),
      },
    };
    await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
    await writeFile(path.join(directory, 'dist/client/__test-run.txt'), marker);
    const wrangler = path.join(root, 'node_modules/wrangler/bin/wrangler.js');
    const common = [
      '--config',
      configPath,
      '--local',
      '--persist-to',
      path.join(directory, 'state'),
    ];
    await run(
      process.execPath,
      [wrangler, 'd1', 'migrations', 'apply', 'DB', ...common],
      { cwd: directory, env },
    );
    child = spawn(
      process.execPath,
      [wrangler, 'dev', ...common, '--ip', '127.0.0.1', '--port', String(port)],
      { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    child.stdout.on('data', (chunk) => {
      output = (output + chunk).slice(-64000);
    });
    child.stderr.on('data', (chunk) => {
      output = (output + chunk).slice(-64000);
    });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null)
        throw new Error('Test server exited: ' + output);
      try {
        const response = await fetch(origin + '/__test-run.txt', {
          signal: AbortSignal.timeout(500),
        });
        // A process already using this port must never receive test submissions.
        if (response.ok && (await response.text()) === marker)
          return { origin, dispose };
      } catch {
        /* Wait only for this new worker. */
      }
      await delay(200);
    }
    throw new Error('Isolated test server did not become ready: ' + output);
  } catch (error) {
    await dispose();
    throw error;
  }
}
