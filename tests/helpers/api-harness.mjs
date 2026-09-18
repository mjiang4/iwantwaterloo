import { Miniflare } from 'miniflare';
import { build } from 'esbuild';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID, randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const origin = 'http://waterloo.test';
let bundle;
export function rejectExternalTarget() {
  if (process.env.TEST_BASE_URL) {
    throw new Error(
      'Tests own an isolated worker and database. Remove TEST_BASE_URL; external targets are never used.',
    );
  }
}

/** No persisted files, external URLs, owner credentials, or existing databases. */
export async function createApiHarness({ preview = false } = {}) {
  rejectExternalTarget();
  bundle ||= build({
    entryPoints: [path.join(root, 'tests/helpers/api-worker.ts')],
    absWorkingDir: root,
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    external: ['cloudflare:workers'],
    define: { 'import.meta.env.DEV': 'false' },
  });
  const result = await bundle;
  const previewId = 'preview-' + randomUUID();
  const secret = randomBytes(32).toString('hex');
  const mf = new Miniflare({
    modules: true,
    script: result.outputFiles[0].text,
    compatibilityDate: '2026-05-15',
    compatibilityFlags: ['nodejs_compat'],
    d1Databases: { DB: 'test-' + randomUUID() },
    d1Persist: false,
    bindings: {
      GARDEN_ENV: preview ? 'preview' : 'test',
      RATE_LIMIT_SECRET: secret,
      ...(preview
        ? {
            PREVIEW_ID: previewId,
            PREVIEW_ORIGIN: origin,
            PREVIEW_ADMIN_SECRET: secret,
          }
        : {}),
    },
  });
  try {
    const db = await mf.getD1Database('DB');
    for (const file of (await readdir(path.join(root, 'drizzle')))
      .filter((name) => name.endsWith('.sql'))
      .sort()) {
      const sql = await readFile(path.join(root, 'drizzle', file), 'utf8');
      for (const statement of sql
        .split('--> statement-breakpoint')
        .map((text) => text.trim())
        .filter(Boolean)) {
        await db.prepare(statement).run();
      }
    }
    if (preview)
      await db
        .prepare('INSERT INTO preview_identity (id,value) VALUES (1,?)')
        .bind(previewId)
        .run();
    async function request(
      url,
      {
        method = 'GET',
        body,
        cookie = '',
        requestOrigin = origin,
        headers = {},
      } = {},
    ) {
      if (!url.startsWith('/') || url.startsWith('//'))
        throw new Error('Test requests must use a relative application path.');
      const init = {
        method,
        headers: {
          ...headers,
          ...(cookie ? { Cookie: cookie } : {}),
          ...(body !== undefined
            ? { 'Content-Type': 'application/json', Origin: requestOrigin }
            : {}),
        },
      };
      if (body !== undefined) init.body = JSON.stringify(body);
      const response = await mf.dispatchFetch(origin + url, init);
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        /* Non-JSON error pages remain inspectable. */
      }
      return { response, data, text };
    }
    async function browser() {
      const result = await request('/api/visitor', {
        method: 'POST',
        body: {},
      });
      const cookie = result.response.headers.get('set-cookie')?.split(';')[0];
      if (!cookie) throw new Error('Visitor bootstrap failed.');
      return {
        cookie,
        request: (url, options = {}) => request(url, { cookie, ...options }),
      };
    }
    return {
      db,
      browser,
      request,
      secret,
      origin,
      dispose: () => mf.dispose(),
    };
  } catch (error) {
    await mf.dispose();
    throw error;
  }
}
export function ideaPayload(overrides = {}) {
  return {
    title: 'A covered place to meet',
    description: 'A covered seating area near the library for rainy days.',
    tags: [],
    place: '',
    connection: '',
    displayName: '',
    consent: true,
    submissionKey: randomUUID(),
    ...overrides,
  };
}
