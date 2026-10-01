import { database } from '@/db/raw';

// Owner-approved, expiring operation. No caller-controlled targets or SQL.
const targets = [
  ['e6406c86-dacd-40fc-ac66-6605eb6e5cd0', 'More g'],
  [
    '91fbb898-e9a7-4e2e-9eb3-ad97e69e7234',
    'I want to see more companies investing into putting offices and headquarters into this city',
  ],
];
const headers = { 'Cache-Control': 'no-store' };
export async function POST(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  if (
    Date.now() > 1790897524259 ||
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
    'fafd6661530727d7be00f6677f89ba8fb84c832270d6529cb9fb108624de61f8'
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
        'DELETE FROM reports WHERE idea_id IN (?, ?) OR comment_id IN (SELECT id FROM comments WHERE idea_id IN (?, ?))',
      )
      .bind(...ids, ...ids),
    db.prepare('DELETE FROM comments WHERE idea_id IN (?, ?)').bind(...ids),
    db.prepare('DELETE FROM supports WHERE idea_id IN (?, ?)').bind(...ids),
    db.prepare('DELETE FROM ideas WHERE id IN (?, ?)').bind(...ids),
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
