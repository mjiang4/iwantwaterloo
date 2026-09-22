import Link from 'next/link';
import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { env } from 'cloudflare:workers';
import { findIdea } from '@/server/idea-records';
import { questionFor } from '@/lib/participation';
import { SharedIdeaActions } from '@/components/shared-idea-actions';
export const dynamic = 'force-dynamic';
const getIdea = cache(async (id: string) => {
  if (!/^[a-f0-9-]{36}$/.test(id)) notFound();
  const idea = await findIdea(id);
  if (!idea) notFound();
  return idea;
});
type Props = { params: Promise<{ id: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const idea = await getIdea((await params).id);
  const base =
    env.GARDEN_ENV === 'preview' && env.PREVIEW_ORIGIN
      ? env.PREVIEW_ORIGIN
      : 'https://iwantwaterloo.com';
  const url = new URL(`/ideas/${idea.id}`, base).href;
  const description = `${questionFor(idea)} Help shape this idea.`;
  return {
    title: `${idea.title} · I want Waterloo`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: idea.title,
      description,
      url,
      type: 'article',
      images: [],
    },
    twitter: { card: 'summary', title: idea.title, description, images: [] },
  };
}
export default async function IdeaPage({ params }: Props) {
  const idea = await getIdea((await params).id);
  return (
    <main className="shared-idea-page">
      <Link prefetch={false} className="shared-brand" href="/">
        i want / waterloo
      </Link>
      <article>
        <SharedIdeaActions idea={idea} />
      </article>
      <Link
        prefetch={false}
        className="shared-garden-link"
        href={`/?idea=${idea.id}`}
      >
        See this idea in the garden →
      </Link>
    </main>
  );
}
