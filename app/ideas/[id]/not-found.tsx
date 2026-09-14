import Link from 'next/link';
export default function IdeaNotFound() {
  return (
    <main className="shared-idea-page">
      <h1>This idea isn’t here.</h1>
      <Link prefetch={false} className="shared-garden-link" href="/">
        Explore the garden →
      </Link>
    </main>
  );
}
