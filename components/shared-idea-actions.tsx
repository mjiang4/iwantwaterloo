'use client';
import { useState } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import type { Idea } from '@/lib/garden';
import { requestJSON } from '@/lib/client';
import { useIdeaSupport } from '@/features/ideas/use-support';
import { SupportButton } from '@/features/ideas/idea-card';
import { IdeaShare } from './idea-share';
import { IdeaDiscussion } from './idea-discussion';

function Actions({ idea }: { idea: Idea }) {
  const state = useQuery({
    queryKey: ['shared-idea', idea.id],
    queryFn: ({ signal }) =>
      requestJSON<{ ideas: Idea[] }>(`/api/ideas?id=${idea.id}`, { signal }),
    refetchInterval: 20000,
  });
  const current = state.data?.ideas[0] || idea;
  const { support, pending, error } = useIdeaSupport();
  return (
    <>
      <div className="shared-actions">
        <SupportButton
          idea={current}
          onSupport={support}
          pending={pending.has(idea.id) || !state.data?.ideas.length}
          large
        />
        <IdeaShare idea={current} />
      </div>
      {(error || state.isError) && (
        <div role="alert">
          {error || 'Couldn’t load likes.'}{' '}
          <button onClick={() => void state.refetch()}>Retry</button>
        </div>
      )}
      <IdeaDiscussion key={idea.id} idea={current} />
    </>
  );
}
export function SharedIdeaActions({ idea }: { idea: Idea }) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <Actions idea={idea} />
    </QueryClientProvider>
  );
}
