'use client';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Flower2 } from 'lucide-react';
import { requestJSON } from '@/lib/client';
import { REVIEW_STATUSES, type ActivityPage } from '@/lib/participation';
import type { Idea } from '@/lib/garden';
import { Button } from '@/components/ui/button';
export function IdeaActivity({ idea }: { idea: Idea }) {
  const result = useInfiniteQuery({
    queryKey: ['activity', idea.id],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      requestJSON<ActivityPage>(
        `/api/activity?ideaId=${idea.id}&page=${pageParam}`,
        { signal },
      ),
    getNextPageParam: (page) => page.nextPage,
    refetchInterval: 20000,
  });
  const activities =
    result.data?.pages.flatMap((page) => page.activities) || [];
  const original = result.data?.pages[0].original;
  return (
    <details className="idea-history">
      <summary>
        <Flower2 size={17} aria-hidden="true" />
        What changed
        {Boolean((idea.version || 0) + (idea.reviewCount || 0)) && (
          <span>{(idea.version || 0) + (idea.reviewCount || 0)}</span>
        )}
      </summary>
      <p className="participation-hint">
        Flowers mark updates, organizer responses, and credited contributions.
      </p>
      {result.isPending && <p>Loading updates…</p>}
      {result.isError && (
        <div role="alert">
          Couldn’t load updates.{' '}
          <Button variant="ghost" onClick={() => void result.refetch()}>
            Retry
          </Button>
        </div>
      )}
      <ol className="activity-list">
        {activities.map((event) => (
          <li key={event.id}>
            <div className="activity-meta">
              <strong>
                {event.kind === 'organizer'
                  ? REVIEW_STATUSES.find((s) => s.id === event.status)?.label ||
                    'Organizer response'
                  : 'Author update'}
              </strong>
              <time dateTime={new Date(event.createdAt).toISOString()}>
                {new Date(event.createdAt).toLocaleDateString()}
              </time>
            </div>
            <p>{event.note}</p>
            {event.kind === 'organizer' && (
              <span className="participation-hint">
                Community organizer · not a city decision
              </span>
            )}
            {event.credits.length > 0 && (
              <div className="activity-credits">
                {event.credits.map((credit) => (
                  <blockquote key={credit.id}>
                    <p>{credit.body}</p>
                    {credit.displayName && <cite>{credit.displayName}</cite>}
                    <span>Included in this update</span>
                  </blockquote>
                ))}
              </div>
            )}
            {event.kind === 'author' && (
              <details className="revision-snapshot">
                <summary>Read this version</summary>
                <p>{event.description}</p>
                <p className="revision-question">{event.question}</p>
              </details>
            )}
          </li>
        ))}
      </ol>
      {result.hasNextPage && (
        <Button
          variant="ghost"
          disabled={result.isFetchingNextPage}
          onClick={() => void result.fetchNextPage()}
        >
          Earlier updates
        </Button>
      )}
      {original && (
        <details className="revision-snapshot original-idea">
          <summary>Original idea</summary>
          <p>{original.description}</p>
          <p className="revision-question">{original.question}</p>
        </details>
      )}
    </details>
  );
}
