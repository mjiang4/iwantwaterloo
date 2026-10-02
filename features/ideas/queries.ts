'use client';
import { useInfiniteQuery } from '@tanstack/react-query';
import { requestJSON } from '@/lib/client';
import type { IdeasPage } from './model';
import type { IdeaFilters } from './use-idea-filters';

export function useIdeas({
  place,
  debouncedQuery: query,
  sort,
  shuffle,
  mine,
}: IdeaFilters) {
  return useInfiniteQuery({
    queryKey: ['ideas', { query, sort, shuffle, mine, place }],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      requestJSON<IdeasPage>(
        '/api/ideas?' +
          new URLSearchParams({
            place,
            q: query,
            sort,
            seed: String(shuffle),
            mine: mine ? '1' : '0',
            page: String(pageParam),
          }),
        { signal },
      ),
    getNextPageParam: (page) => page.nextPage,
    placeholderData: (previous, previousQuery) => {
      const prior = previousQuery?.queryKey[1] as
        | { query: string; sort: string; mine: boolean; place: string }
        | undefined;
      return sort === 'random' &&
        prior?.sort === 'random' &&
        prior.query === query &&
        prior.mine === mine &&
        prior.place === place
        ? previous
        : undefined;
    },
    staleTime: 15000,
    refetchInterval: 20000,
  });
}
