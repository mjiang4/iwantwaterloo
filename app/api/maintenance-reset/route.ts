import { env } from 'cloudflare:workers';
import { database } from '@/db/raw';
// Temporary owner-authorized reset. Removed immediately after use.
export async function POST(request: Request) {
  const secret = (env as typeof env & { MAINTENANCE_RESET_SECRET?: string })
    .MAINTENANCE_RESET_SECRET;
  if (!secret || request.headers.get('Authorization') !== `Bearer ${secret}`)
    return new Response(null, { status: 404 });
  const db = database();
  const result = await db.batch([
    db.prepare('DELETE FROM supports'),
    db.prepare('DELETE FROM ideas'),
  ]);
  return Response.json(
    {
      likesRemoved: result[0].meta.changes,
      ideasRemoved: result[1].meta.changes,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
