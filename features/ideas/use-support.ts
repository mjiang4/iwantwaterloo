'use client';
import { useCallback, useRef, useState } from 'react';
import {
  useQueryClient,
  type QueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { requestJSON } from '@/lib/client';
import type { Idea } from '@/lib/garden';
import type { IdeasPage, GardenPage, SupportState } from './model';

function patchSupport(client: QueryClient, id: string, fields: SupportState) {
  const patch = (ideas: Idea[]) =>
    ideas.map((idea) => (idea.id === id ? { ...idea, ...fields } : idea));
  client.setQueriesData<InfiniteData<IdeasPage>>(
    { queryKey: ['ideas'] },
    (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              ideas: patch(page.ideas),
            })),
          }
        : data,
  );
  client.setQueriesData<GardenPage>({ queryKey: ['garden'] }, (data) =>
    data ? { ...data, ideas: patch(data.ideas) } : data,
  );
  client.setQueryData<{ ideas: Idea[] }>(['shared-idea', id], (data) =>
    data ? { ...data, ideas: patch(data.ideas) } : data,
  );
}

export function useIdeaSupport({
  onChange,
  onLiked,
}: {
  onChange?: (id: string, fields: SupportState) => void;
  onLiked?: (idea: Idea, previousLikes: number) => void;
} = {}) {
  const client = useQueryClient();
  const locks = useRef(new Set<string>());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const support = useCallback(
    async (idea: Idea) => {
      if (locks.current.has(idea.id)) return;
      locks.current.add(idea.id);
      setPending(new Set(locks.current));
      setError('');
      const previous = { waters: idea.waters, watered: idea.watered };
      const apply = (fields: SupportState) => {
        patchSupport(client, idea.id, fields);
        onChange?.(idea.id, fields);
      };
      try {
        await Promise.all(
          ['ideas', 'garden', 'shared-idea'].map((key) =>
            client.cancelQueries({ queryKey: [key] }),
          ),
        );
        apply({
          waters: Math.max(0, idea.waters + (idea.watered ? -1 : 1)),
          watered: !idea.watered,
        });
        const updated = await requestJSON<SupportState>('/api/support', {
          method: 'PUT',
          body: JSON.stringify({ ideaId: idea.id, watered: !idea.watered }),
        });
        apply(updated);
        if (!idea.watered && updated.watered)
          onLiked?.({ ...idea, ...updated }, idea.waters);
      } catch (failure) {
        apply(previous);
        setError(
          failure instanceof Error
            ? failure.message
            : 'Couldn’t save your like. Try again.',
        );
      } finally {
        locks.current.delete(idea.id);
        setPending(new Set(locks.current));
        void Promise.all(
          ['ideas', 'garden', 'shared-idea'].map((key) =>
            client.invalidateQueries({ queryKey: [key] }),
          ),
        );
      }
    },
    [client, onChange, onLiked],
  );
  return { support, pending, error, setError };
}
