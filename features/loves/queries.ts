'use client';
import { useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJSON } from '@/lib/client';
import type { EchoState, Love, LoveInput, LovesPage } from './model';

export const LOVES_KEY = ['loves'] as const;

export function useLoves(enabled = true) {
  return useQuery({
    queryKey: LOVES_KEY,
    queryFn: ({ signal }) => requestJSON<LovesPage>('/api/loves', { signal }),
    enabled,
    staleTime: 30_000,
  });
}

export async function postLove(input: LoveInput) {
  return requestJSON<{ love: Love }>('/api/loves', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** "Me too": optimistic, one request per love at a time, rolls back on failure. */
export function useLoveEcho() {
  const client = useQueryClient();
  const locks = useRef(new Set<string>());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const patch = useCallback(
    (id: string, fields: EchoState) =>
      client.setQueryData<LovesPage>(LOVES_KEY, (data) =>
        data
          ? {
              loves: data.loves.map((love) =>
                love.id === id ? { ...love, ...fields } : love,
              ),
            }
          : data,
      ),
    [client],
  );
  const echo = useCallback(
    async (love: Love) => {
      if (locks.current.has(love.id)) return;
      locks.current.add(love.id);
      setPending(new Set(locks.current));
      setError('');
      const previous = {
        id: love.id,
        echoes: love.echoes,
        echoed: love.echoed,
      };
      const echoed = !love.echoed;
      await client.cancelQueries({ queryKey: LOVES_KEY });
      patch(love.id, {
        id: love.id,
        echoed,
        echoes: Math.max(0, love.echoes + (echoed ? 1 : -1)),
      });
      try {
        const saved = await requestJSON<EchoState>('/api/loves/echo', {
          method: 'PUT',
          body: JSON.stringify({ loveId: love.id, echoed }),
        });
        patch(love.id, saved);
      } catch (e) {
        patch(love.id, previous);
        setError(e instanceof Error ? e.message : 'Couldn’t save that.');
      } finally {
        locks.current.delete(love.id);
        setPending(new Set(locks.current));
      }
    },
    [client, patch],
  );
  return { echo, pending, error };
}
