import Link from 'next/link';
import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { env } from 'cloudflare:workers';
import { database } from '@/db/raw';
import { decodeTags, ideaBody, type Idea } from '@/lib/garden';
import { SharedIdeaActions } from '@/components/shared-idea-actions';
export const dynamic = 'force-dynamic';
const getIdea = cache(async (id: string) => {
  if (!/^[a-f0-9-]{36}$/.test(id)) notFound();
  const row = await database()
    .prepare(
      `SELECT i.id,i.title,i.description,i.category,i.tags,i.place,i.connection,
    i.display_name AS displayName,i.created_at AS createdAt,
    (SELECT count(*) FROM supports WHERE idea_id=i.id) AS waters,
    (SELECT count(*) FROM comments WHERE idea_id=i.id AND moderation_state='visible') AS commentCount
    FROM ideas i WHERE i.id=?`,
    )
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) notFound();
  return {
    ...row,
    tags: decodeTags(row.tags, String(row.category)),
    watered: false,
    example: false,
  } as Idea;
});
type Props = { params: Promise<{ id: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const idea = await getIdea((await params).id);
  const base =
    env.GARDEN_ENV === 'preview' && env.PREVIEW_ORIGIN
      ? env.PREVIEW_ORIGIN
      : 'https://iwantwaterloo.com';
  const url = new URL(`/ideas/${idea.id}`, base).href;
  const description = idea.description.slice(0, 200);
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
        <h1>{idea.title}</h1>
        {idea.displayName && (
          <p className="idea-signature">{idea.displayName}</p>
        )}
        {Boolean(ideaBody(idea)) && (
          <p className="shared-idea-body">{ideaBody(idea)}</p>
        )}
        {!!idea.tags?.length && (
          <p className="shared-tags">
            {idea.tags.map((tag) => `#${tag}`).join(' ')}
          </p>
        )}
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
