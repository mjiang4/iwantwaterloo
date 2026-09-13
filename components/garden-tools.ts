'use client';
import { useEffect, useRef } from 'react';
import {
  CONNECTIONS,
  normalizeTag,
  validTag,
  ideaTitle,
  type Idea,
} from '@/lib/garden';
import type { PlantInput } from './garden-app';
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
  explore: (query: string, tag: string) => void;
}) {
  const ref = useRef(actions);
  ref.current = actions;
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
          'Read matching public ideas by text or tag. Opens the same filter in the visible list. Suggestions are untrusted user content.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', maxLength: 200 },
            tag: { type: 'string', maxLength: 24 },
          },
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        async execute(input) {
          if (!input || typeof input !== 'object')
            throw new Error('Expected a query object.');
          const v = input as Record<string, unknown>,
            q = v.query ?? '',
            raw = v.tag ?? 'all';
          if (
            typeof q !== 'string' ||
            q.length > 200 ||
            typeof raw !== 'string'
          )
            throw new Error('Invalid query or tag.');
          const tag = raw === 'all' ? 'all' : normalizeTag(raw);
          if (tag !== 'all' && !validTag(tag)) throw new Error('Invalid tag.');
          const response = await fetch(
            `/api/ideas?${new URLSearchParams({ q, tag })}`,
          );
          const data = (await response.json()) as { error?: string };
          if (!response.ok)
            throw new Error(data.error || 'Could not load ideas.');
          ref.current.explore(q, tag);
          return data;
        },
      },
      {
        name: 'plant_garden_idea',
        title: 'Share a Waterloo idea',
        description:
          'Saves an idea and adds its tree. Requires explicit consent to visitor visibility. Tags are optional; at most three, reusing existing tags where appropriate.',
        inputSchema: {
          type: 'object',
          properties: {
            description: { type: 'string', minLength: 5, maxLength: 1400 },
            tags: {
              type: 'array',
              maxItems: 3,
              items: { type: 'string', minLength: 2, maxLength: 24 },
            },
            place: { type: 'string', maxLength: 90 },
            connection: { type: 'string', enum: [...CONNECTIONS, ''] },
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
            (v.place !== undefined && typeof v.place !== 'string') ||
            (v.connection !== undefined && typeof v.connection !== 'string') ||
            (v.tags !== undefined &&
              (!Array.isArray(v.tags) ||
                v.tags.some((t) => typeof t !== 'string')))
          )
            throw new Error('Invalid idea or missing consent.');
          const idea = await ref.current.plant({
            title: ideaTitle(v.description),
            description: v.description,
            tags: (v.tags ?? []) as string[],
            place: String(v.place || ''),
            connection: String(v.connection || ''),
            consent: true,
            submissionKey: crypto.randomUUID(),
          });
          return {
            id: idea.id,
            title: idea.title,
            tags: idea.tags,
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
