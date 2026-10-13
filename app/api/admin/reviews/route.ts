import { database } from '@/db/raw';
import { requireAdmin, adminResponse, adminError } from '@/lib/preview-auth';
import { readBody } from '@/lib/server';
import { appendReview } from '@/server/participation';
import { IDEA_SELECT, ideaFromRow } from '@/server/idea-records';
export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const db = database(),
      since = Date.now() - 7 * 86400000;
    const [queue, metrics] = await db.batch<Record<string, unknown>>([
      db
        .prepare(
          `${IDEA_SELECT} ORDER BY coalesce((SELECT max(created_at) FROM organizer_reviews r WHERE r.idea_id=i.id),0),i.created_at,i.id LIMIT 30`,
        )
        .bind(''),
      db
        .prepare(`SELECT
        (SELECT count(DISTINCT idea_id) FROM organizer_reviews WHERE created_at>=?) AS reviewedThisWeek,
        (SELECT count(DISTINCT c.idea_id) FROM comments c JOIN ideas i ON i.id=c.idea_id WHERE c.visitor_id!=i.visitor_id AND c.moderation_state='visible') AS ideasWithContributions,
        (SELECT count(*) FROM comments c WHERE c.moderation_state='visible' AND EXISTS(SELECT 1 FROM idea_updates u,json_each(u.credits) credit WHERE credit.value=c.id AND u.idea_id=c.idea_id)) AS creditedContributions,
        (SELECT count(DISTINCT idea_id) FROM idea_updates) AS developedIdeas,
        (SELECT count(*) FROM comments c JOIN ideas i ON i.id=c.idea_id WHERE c.source='share' AND c.moderation_state='visible' AND c.visitor_id!=i.visitor_id) AS sharedContributions,
        (SELECT count(DISTINCT u.visitor_id) FROM idea_updates u JOIN ideas i ON i.id=u.idea_id WHERE u.created_at>=i.created_at+86400000) AS returningAuthors,
        (SELECT count(*) FROM ideas) AS totalIdeas`)
        .bind(since),
    ]);
    return adminResponse({
      ideas: queue.results.map(ideaFromRow),
      metrics: metrics.results[0],
    });
  } catch (error) {
    return adminError(error);
  }
}
export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    await appendReview(await readBody(request));
    return adminResponse({ ok: true });
  } catch (error) {
    return adminError(error);
  }
}
