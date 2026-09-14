import { database } from '@/db/raw';
import {
  requireAdmin,
  adminResponse,
  adminError,
  visitorCookie,
} from '@/lib/preview-auth';
import { readBody, InputError } from '@/lib/server';
function cleanup(where: string, args: (string | number)[]) {
  const ids = `SELECT i.id FROM ideas i JOIN preview_checks c ON i.submission_key=c.idea_key AND i.visitor_id=c.visitor_id WHERE ${where}`;
  return ['reports', 'comments', 'supports']
    .map((table) =>
      database()
        .prepare(`DELETE FROM ${table} WHERE idea_id IN (${ids})`)
        .bind(...args),
    )
    .concat(
      database()
        .prepare(`DELETE FROM ideas WHERE id IN (${ids})`)
        .bind(...args),
    );
}
export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const body = await readBody(request),
      db = database(),
      now = Date.now();
    if (body?.action === 'begin') {
      const stale = now - 120000;
      await db.batch([
        ...cleanup("c.status!='running' OR c.created_at<?", [stale]),
        db
          .prepare(
            "UPDATE preview_checks SET status='interrupted' WHERE status='running' AND created_at<?",
          )
          .bind(stale),
      ]);
      const id = crypto.randomUUID(),
        ideaKey = crypto.randomUUID(),
        visitor = crypto.randomUUID();
      const result = await db
        .prepare(
          "INSERT INTO preview_checks(id,idea_key,visitor_id,created_at,status,results) SELECT ?,?,?,?,'running','[]' WHERE NOT EXISTS(SELECT 1 FROM preview_checks WHERE status='running')",
        )
        .bind(id, ideaKey, visitor, now)
        .run();
      if (!result.meta.changes)
        throw new InputError(
          'Checks are already running in this preview.',
          409,
        );
      return adminResponse({ id, ideaKey }, 200, [
        visitorCookie(request, visitor),
      ]);
    }
    if (
      body?.action === 'finish' &&
      typeof body.id === 'string' &&
      /^[a-f0-9-]{36}$/.test(body.id) &&
      Array.isArray(body.results) &&
      body.results.length > 0 &&
      body.results.length <= 20
    ) {
      const results = body.results.map((r: Record<string, unknown>) => {
        if (
          !r ||
          typeof r.name !== 'string' ||
          r.name.length > 100 ||
          typeof r.passed !== 'boolean' ||
          typeof r.detail !== 'string' ||
          r.detail.length > 300
        )
          throw new InputError('Invalid check results.');
        return { name: r.name, passed: r.passed, detail: r.detail };
      });
      if (
        !(await db
          .prepare('SELECT id FROM preview_checks WHERE id=?')
          .bind(body.id)
          .first())
      )
        throw new InputError('Check run not found.', 404);
      const status = results.every((r: { passed: boolean }) => r.passed)
        ? 'passed'
        : 'failed';
      await db.batch([
        ...cleanup('c.id=?', [body.id]),
        db
          .prepare('UPDATE preview_checks SET status=?,results=? WHERE id=?')
          .bind(status, JSON.stringify(results), body.id),
      ]);
      return adminResponse({ ok: true, status });
    }
    throw new InputError('Choose a check action.');
  } catch (error) {
    return adminError(error);
  }
}
