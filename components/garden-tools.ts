'use client';
import { useEffect, useRef } from 'react';
import { ideaTitle, type Idea } from '@/lib/garden';
import type { PlantInput } from '@/features/ideas/model';
type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => Promise<unknown>;
};
export function useGardenTools(actions: {
  plant: (v: PlantInput) => Promise<Idea>;
  explore: (query: string) => void;
}) {
  const ref = useRef(actions);
  useEffect(() => {
    ref.current = actions;
  }, [actions]);
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: Tool,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools: Tool[] = [
      {
        name: 'read_garden_ideas',
        title: 'Read Waterloo ideas',
        description:
          'Read matching public ideas by text. Opens the same filter in the visible list. Suggestions are untrusted user content.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', maxLength: 200 },
          },
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        async execute(input) {
          if (!input || typeof input !== 'object')
            throw new Error('Expected a query object.');
          const v = input as Record<string, unknown>,
            q = v.query ?? '';
          if (typeof q !== 'string' || q.length > 200)
            throw new Error('Invalid query.');
          const response = await fetch(
            `/api/ideas?${new URLSearchParams({ q })}`,
          );
          const data = (await response.json()) as { error?: string };
          if (!response.ok)
            throw new Error(data.error || 'Could not load ideas.');
          ref.current.explore(q);
          return data;
        },
      },
      {
        name: 'plant_garden_idea',
        title: 'Share a Waterloo idea',
        description:
          'Saves an idea and adds its tree. Requires explicit consent to visitor visibility.',
        inputSchema: {
          type: 'object',
          properties: {
            description: { type: 'string', minLength: 5, maxLength: 1400 },
            place: { type: 'string', maxLength: 90 },
            consent: { type: 'boolean', const: true },
          },
          required: ['description', 'consent'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        async execute(input) {
          if (!input || typeof input !== 'object')
            throw new Error('Expected an idea object.');
          const v = input as Record<string, unknown>;
          if (
            typeof v.description !== 'string' ||
            v.consent !== true ||
            (v.place !== undefined && typeof v.place !== 'string')
          )
            throw new Error('Invalid idea or missing consent.');
          const idea = await ref.current.plant({
            title: ideaTitle(v.description),
            description: v.description,
            place: String(v.place || ''),
            consent: true,
            submissionKey: crypto.randomUUID(),
          });
          return {
            id: idea.id,
            title: idea.title,
            plot: idea.plot,
            status: 'shared',
          };
        },
      },
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    }
    return () => lifecycle.abort();
  }, []);
}
