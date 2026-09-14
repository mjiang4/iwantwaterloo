'use client';
import Link from 'next/link';
export default function IdeaError({ reset }: { reset: () => void }) {
  return (
    <main className="shared-idea-page">
      <h1>Couldn’t load this idea.</h1>
      <p>Please try again in a moment.</p>
      <button onClick={reset}>Try again</button>
      <Link prefetch={false} className="shared-garden-link" href="/">
        Back to the garden
      </Link>
    </main>
  );
}
