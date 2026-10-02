'use client';
import { useState } from 'react';
import { SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ideaBody, hasDerivedTitle, type Idea } from '@/lib/garden';
import { requestJSON as api } from '@/lib/client';
import { IdeaShare } from '@/components/idea-share';
import { IdeaDiscussion } from '@/components/idea-discussion';
import { SupportButton } from './idea-card';

export function IdeaDetails({
  idea,
  onSupport,
  pending,
  error,
}: {
  idea: Idea;
  onSupport: (idea: Idea) => void;
  pending: boolean;
  error: string;
}) {
  const [reportMessage, setReportMessage] = useState('');
  return (
    <div className="idea-detail">
      {idea.example && <span className="example-badge">Example</span>}
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
      <IdeaDiscussion key={idea.id} idea={idea} />
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
