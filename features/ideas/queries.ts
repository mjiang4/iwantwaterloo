'use client';
import { useInfiniteQuery } from '@tanstack/react-query';
import { requestJSON } from '@/lib/client';
import type { IdeasPage } from './model';
import type { IdeaFilters } from './use-idea-filters';

export function useIdeas({
  tag,
  debouncedQuery: query,
  connection,
  sort,
  shuffle,
  mine,
}: IdeaFilters) {
  return useInfiniteQuery({
    queryKey: ['ideas', tag, query, connection, sort, shuffle, mine],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      requestJSON<IdeasPage>(
        '/api/ideas?' +
          new URLSearchParams({
            tag,
            q: query,
            connection,
            sort,
            seed: String(shuffle),
            mine: mine ? '1' : '0',
            page: String(pageParam),
          }),
        { signal },
      ),
    getNextPageParam: (page) => page.nextPage,
    placeholderData: (previous, previousQuery) =>
      sort === 'random' &&
      previousQuery?.queryKey[4] === 'random' &&
      previousQuery.queryKey[1] === tag &&
      previousQuery.queryKey[2] === query &&
      previousQuery.queryKey[3] === connection &&
      previousQuery.queryKey[6] === mine
        ? previous
        : undefined,
    staleTime: 15000,
    refetchInterval: 20000,
  });
}
