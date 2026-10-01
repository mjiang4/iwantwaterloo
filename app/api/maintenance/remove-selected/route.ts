import { database } from '@/db/raw';

// Owner-approved, expiring operation. No caller-controlled targets or SQL.
const targets = [["8957f646-df81-48df-a8ca-0ecddaf8c9f8", "Build a water pipeline, so we can fix the Waterloo hairline and support economic growth in the region.\n\nWaterloo has the hardest water in North America, because our drinking water comes from deep underground wells that flow through mineral-rich rocks. That's why many students often lose hair when they shower!\n\nFurthermore, groundwater is limited in supply. Waterloo is already Ontario's most efficient water system, and earlier this year, a lack of water supply paused all construction activity in the region. It is severely detrimental towards long-term growth.\n\nAs Mayor of Waterloo, I will make sure Waterloo will get a pipeline, so that we never run out of water."]];
const headers = { 'Cache-Control': 'no-store' };
export async function POST(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  if (
    Date.now() > 1790899994682 ||
    !/^Bearer [a-f0-9]{64}$/.test(authorization)
  )
    return new Response(null, { status: 404, headers });
  const digest = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(authorization.slice(7)),
      ),
    ),
    (n) => n.toString(16).padStart(2, '0'),
  ).join('');
  if (
    digest !==
    '7d7a0ab5f769413b1ad48f53cf241eb9db92e456d4d212c5c556703d9e8c3be4'
  )
    return new Response(null, { status: 404, headers });
  const db = database();
  for (const [id, description] of targets) {
    const record = await db
      .prepare('SELECT description FROM ideas WHERE id=?')
      .bind(id)
      .first<{ description: string }>();
    if (record && record.description !== description)
      return Response.json(
        { error: 'Target content changed; nothing deleted.' },
        { status: 409, headers },
      );
  }
  const ids = targets.map(([id]) => id);
  const statements = [
    db
      .prepare(
        'DELETE FROM reports WHERE idea_id IN (?) OR comment_id IN (SELECT id FROM comments WHERE idea_id IN (?))',
      )
      .bind(...ids, ...ids),
    db.prepare('DELETE FROM comments WHERE idea_id IN (?)').bind(...ids),
    db.prepare('DELETE FROM supports WHERE idea_id IN (?)').bind(...ids),
    db.prepare('DELETE FROM ideas WHERE id IN (?)').bind(...ids),
  ];
  const results = await db.batch(statements);
  return Response.json(
    {
      removed: results[3].meta.changes,
      relatedRemoved: results.slice(0, 3).map((r) => r.meta.changes),
    },
    { headers },
  );
}
