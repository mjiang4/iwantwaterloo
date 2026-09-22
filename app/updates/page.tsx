import Link from 'next/link';
import { database } from '@/db/raw';
import { REVIEW_STATUSES } from '@/lib/participation';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Organizer responses · I want Waterloo' };
async function loadUpdates() {
  let rows: {
    id: string;
    ideaId: string;
    title: string;
    body: string;
    status: string;
    createdAt: number;
  }[] = [];
  let failed = false;
  try {
    const result = await database()
      .prepare(
        `SELECT r.id,r.idea_id AS ideaId,coalesce((SELECT title FROM idea_updates u WHERE u.idea_id=i.id ORDER BY version DESC LIMIT 1),i.title) AS title,r.body,r.status,r.created_at AS createdAt FROM organizer_reviews r JOIN ideas i ON i.id=r.idea_id ORDER BY r.created_at DESC,r.id DESC LIMIT 30`,
      )
      .all<(typeof rows)[number]>();
    rows = result.results;
  } catch (error) {
    console.error(
      'Organizer responses unavailable',
      error instanceof Error ? error.message : 'Unknown',
    );
    failed = true;
  }
  return { rows, failed };
}
export default async function UpdatesPage() {
  const { rows, failed } = await loadUpdates();
  return (
    <main className="shared-idea-page organizer-updates">
      <Link prefetch={false} className="shared-brand" href="/">
        i want / waterloo
      </Link>
      <h1>Ideas taking shape.</h1>
      <p className="updates-intro">
        Responses from the community organizer. Not city decisions.
      </p>
      {failed ? (
        <p role="alert">
          Couldn’t load responses.{' '}
          <Link prefetch={false} href="/updates">
            Try again
          </Link>
        </p>
      ) : !rows.length ? (
        <p className="updates-empty">
          No organizer responses yet. When an idea gets a response, you’ll find
          it here.
        </p>
      ) : (
        <ol className="activity-list">
          {rows.map((row) => (
            <li key={row.id}>
              <div className="activity-meta">
                <strong>
                  {REVIEW_STATUSES.find((s) => s.id === row.status)?.label ||
                    'Organizer response'}
                </strong>
                <time dateTime={new Date(row.createdAt).toISOString()}>
                  {new Date(row.createdAt).toLocaleDateString('en-CA', {
                    timeZone: 'America/Toronto',
                  })}
                </time>
              </div>
              <h2>
                <Link prefetch={false} href={`/ideas/${row.ideaId}`}>
                  {row.title}
                </Link>
              </h2>
              <p>{row.body}</p>
              <Link prefetch={false} href={`/ideas/${row.ideaId}`}>
                Build on this →
              </Link>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
