'use client';
import { useState } from 'react';
import { SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ideaTags, ideaBody, hasDerivedTitle, type Idea } from '@/lib/garden';
import { requestJSON as api } from '@/lib/client';
import { IdeaShare } from '@/components/idea-share';
import { IdeaParticipation } from './idea-participation';
import { useCurrentIdea } from './use-current-idea';
import { SupportButton } from './idea-card';

export function IdeaDetails({
  idea: initial,
  onTag,
  onSupport,
  pending,
  error,
}: {
  idea: Idea;
  onTag: (tag: string) => void;
  onSupport: (idea: Idea) => void;
  pending: boolean;
  error: string;
}) {
  const { idea } = useCurrentIdea(initial);
  const [reportMessage, setReportMessage] = useState('');
  return (
    <div className="idea-detail">
      <span className="detail-topic">
        {ideaTags(idea).map((t) => (
          <button
            type="button"
            className="detail-tag"
            key={t}
            onClick={() => onTag(t)}
          >
            #{t}
          </button>
        ))}
        {idea.example && <span className="example-badge">Example</span>}
      </span>
      <SheetTitle
        className={hasDerivedTitle(idea) ? 'sr-only' : 'detail-title'}
      >
        {idea.title}
      </SheetTitle>
      {Boolean(ideaBody(idea)) && (
        <p
          className={`detail-body${hasDerivedTitle(idea) ? ' full-idea' : ''}`}
        >
          {ideaBody(idea)}
        </p>
      )}
      <SheetDescription className="detail-meta">
        {idea.place || 'Waterloo'}
        {idea.connection ? ` · ${idea.connection}` : ''}
      </SheetDescription>
      {idea.displayName && <p className="idea-signature">{idea.displayName}</p>}
      <div className="detail-actions">
        <SupportButton
          idea={idea}
          onSupport={onSupport}
          pending={pending}
          large
        />
        <IdeaShare idea={idea} />
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <IdeaParticipation key={idea.id} idea={idea} />
      <button
        type="button"
        className="report-idea"
        onClick={async () => {
          try {
            await api('/api/reports', {
              method: 'POST',
              body: JSON.stringify({
                ideaId: idea.id,
                reason: 'Please review this idea.',
              }),
            });
            setReportMessage('Thanks. This idea was flagged for review.');
          } catch (error) {
            setReportMessage(
              error instanceof Error
                ? error.message
                : 'Couldn’t send the report.',
            );
          }
        }}
      >
        Report this idea
      </button>
      <output className="discussion-message">{reportMessage}</output>
    </div>
  );
}
