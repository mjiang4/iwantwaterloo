'use client';
import { useRef, useState } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import type { Idea } from '@/lib/garden';
import { requestJSON } from '@/lib/client';
import { IdeaShare } from './idea-share';
import { IdeaDiscussion } from './idea-discussion';
function Actions({ idea }: { idea: Idea }) {
  const client = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const key = ['shared-idea', idea.id];
  const state = useQuery({
    queryKey: key,
    queryFn: () => requestJSON<{ ideas: Idea[] }>(`/api/ideas?id=${idea.id}`),
    refetchInterval: 20000,
  });
  const current = state.data?.ideas[0] || idea;
  async function support() {
    if (lock.current || !state.data) return;
    lock.current = true;
    setSaving(true);
    setError('');
    try {
      const updated = await requestJSON<{ waters: number; watered: boolean }>(
        '/api/support',
        {
          method: 'PUT',
          body: JSON.stringify({ ideaId: idea.id, watered: !current.watered }),
        },
      );
      client.setQueryData(key, { ideas: [{ ...current, ...updated }] });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Couldn’t like this idea.',
      );
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  return (
    <>
      <div className="shared-actions">
        <button
          className="support-button support-large"
          aria-pressed={current.watered}
          aria-label={`${current.watered ? 'Unlike' : 'Like'} idea`}
          disabled={saving || !state.data?.ideas.length}
          onClick={support}
        >
          <Heart size={18} fill={current.watered ? 'currentColor' : 'none'} />
          {current.watered ? 'Liked' : 'Like'}{' '}
          <span aria-live="polite">{current.waters}</span>
        </button>
        <IdeaShare idea={idea} />
      </div>
      {(error || state.isError) && (
        <div>
          <output>{error || 'Couldn’t load likes.'} </output>
          <button onClick={() => void state.refetch()}>Retry</button>
        </div>
      )}
      <IdeaDiscussion idea={current} />
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
