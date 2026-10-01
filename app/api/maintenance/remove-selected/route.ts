import { database } from '@/db/raw';

// Owner-approved, expiring operation. No caller-controlled targets or SQL.
const approvedContent = [["fe451543-03f3-4c3c-9e1c-cf2450759414", "Build a water pipeline to fix the Waterloo hairline and support economic growth in the region.\n\nWaterloo has the hardest water in North America, because our drinking water comes from deep underground wells that flow through mineral-rich rocks. That's why many students often lose hair when they shower!\n\nFurthermore, groundwater is limited in supply. Waterloo is already Ontario's most efficient water system, and earlier this year, a lack of water supply paused all construction activity in the region. It is severely detrimental towards long-term growth.\n\nAs Mayor of Waterloo, I will make sure Waterloo will get a pipeline, so that we never run out of water."]];
const headers = { 'Cache-Control': 'no-store' };
export async function POST(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  if (
    Date.now() > 1790904291452 ||
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
    digest !== '00f0ed3926b575fceca6fcdf0cf720c8a142a8593d18c3da4f7869a8e4474c7d'
  )
    return new Response(null, { status: 404, headers });
  const db = database();
  const description = approvedContent[0][1];
  const revisedDescription = description.replace('so that we never run out of water.', 'to make sure we never run out of good, soft water.').replace('get a pipeline, to make', 'get a pipeline to make');
  const visitor = 'b27f2587-d11c-49ea-ab29-45eedc412309';
  const records = await db.prepare('SELECT id FROM ideas WHERE visitor_id=? AND description IN (?,?)').bind(visitor, description, revisedDescription).all<{ id: string }>();
  const ids = records.results.map(row => row.id);
  if (!ids.length) return Response.json({ removed: 0 }, { headers });
  if (ids.length > 20) return Response.json({ error: 'Too many matches; review required.' }, { status: 409, headers });
  const placeholders = ids.map(() => '?').join(',');
  const statements = [
    db
      .prepare(
        `DELETE FROM reports WHERE idea_id IN (${placeholders}) OR comment_id IN (SELECT id FROM comments WHERE idea_id IN (${placeholders}))`,
      )
      .bind(...ids, ...ids),
    db.prepare(`DELETE FROM comments WHERE idea_id IN (${placeholders})`).bind(...ids),
    db.prepare(`DELETE FROM supports WHERE idea_id IN (${placeholders})`).bind(...ids),
    db.prepare(`DELETE FROM ideas WHERE id IN (${placeholders})`).bind(...ids),
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
