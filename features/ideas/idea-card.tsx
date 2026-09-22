'use client';
import { Heart, MessageCircle } from 'lucide-react';
import { ideaTags, type Idea } from '@/lib/garden';
import { questionFor, progressLabel } from '@/lib/participation';
import { useFreshHighlight } from '@/components/use-fresh-highlight';
export function SupportButton({
  idea,
  onSupport,
  pending,
  large = false,
}: {
  idea: Idea;
  onSupport: (idea: Idea) => void;
  pending: boolean;
  large?: boolean;
}) {
  return (
    <button
      className={`support-button ${large ? 'support-large' : ''}`}
      data-supported={idea.watered}
      aria-pressed={idea.watered}
      aria-label={`${idea.watered ? 'Remove support for' : 'Support'} ${idea.title}. ${idea.waters} supports`}
      aria-disabled={pending}
      onClick={() => {
        if (!pending) onSupport(idea);
      }}
    >
      <Heart
        size={large ? 18 : 15}
        fill={idea.watered ? 'currentColor' : 'none'}
      />
      {large && <span>{idea.watered ? 'Supported' : 'Support'}</span>}
      <span>{idea.waters}</span>
    </button>
  );
}
export function IdeaCard({
  idea,
  onRead,
  onSupport,
  pending,
  fresh,
  onSeen,
}: {
  idea: Idea;
  onRead: (idea: Idea) => void;
  onSupport: (idea: Idea) => void;
  pending: boolean;
  fresh: boolean;
  onSeen: () => void;
}) {
  const { ref: cueRef, highlighted } = useFreshHighlight<HTMLElement>(
    fresh,
    onSeen,
  );
  return (
    <article
      ref={cueRef}
      className={`idea-card ${highlighted ? 'is-fresh' : ''}`}
    >
      <button className="idea-open" onClick={() => onRead(idea)}>
        <span className="idea-topic">
          {ideaTags(idea)
            .map((t) => `#${t}`)
            .join(' ') || 'Idea'}
        </span>
        <h3>{idea.title}</h3>
        <span className="card-question">{questionFor(idea)}</span>
        {idea.displayName && (
          <span className="card-signature">{idea.displayName}</span>
        )}
      </button>
      <div className="idea-card-bottom">
        <span className={idea.example ? 'example-badge' : 'idea-place'}>
          {idea.example ? 'Example' : progressLabel(idea)}
        </span>
        <div className="idea-card-signals">
          {Boolean(idea.commentCount) && (
            <span aria-label={`${idea.commentCount} replies`}>
              <MessageCircle size={14} />
              {idea.commentCount}
            </span>
          )}
          <SupportButton idea={idea} onSupport={onSupport} pending={pending} />
        </div>
      </div>
    </article>
  );
}
