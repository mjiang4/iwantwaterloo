'use client';
import { useQuery } from '@tanstack/react-query';
import { requestJSON } from '@/lib/client';
import type { Idea } from '@/lib/garden';
export function useCurrentIdea(initial: Idea) {
  const result = useQuery({
    queryKey: ['idea', initial.id],
    queryFn: ({ signal }) =>
      requestJSON<{ ideas: Idea[] }>(`/api/ideas?id=${initial.id}`, { signal }),
    refetchInterval: 20000,
  });
  return { idea: result.data?.ideas[0] || initial, result };
}
