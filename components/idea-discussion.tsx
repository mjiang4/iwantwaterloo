'use client';

import { useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Flag, MessageCircle, Reply, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useReplyDraft } from '@/features/ideas/use-reply-draft';
import { WritingExample } from './writing-example';
import { requestJSON } from '@/lib/client';
import type { GardenComment, Idea } from '@/lib/garden';

type CommentsPage = { comments: GardenComment[]; nextPage: number | null };

export function IdeaDiscussion({ idea }: { idea: Idea }) {
  const client = useQueryClient();
  const { draft, setDraft, ready, prepare, clear } = useReplyDraft(idea.id);
  const { body, name, parent: replyingTo } = draft;
  const setBody = (body: string) =>
    setDraft((current) => ({ ...current, body }));
  const setName = (name: string) =>
    setDraft((current) => ({ ...current, name }));
  const setReplyingTo = (parent: { id: string; displayName: string } | null) =>
    setDraft((current) => ({ ...current, parent }));
  const submitting = useRef(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const result = useInfiniteQuery({
    queryKey: ['comments', idea.id],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      requestJSON<CommentsPage>(
        `/api/comments?ideaId=${idea.id}&page=${pageParam}`,
        { signal },
      ),
    getNextPageParam: (page) => page.nextPage,
    refetchInterval: 20000,
  });
  const comments = useMemo(
    () => result.data?.pages.flatMap((page) => page.comments) || [],
    [result.data],
  );
  const names = useMemo(
    () =>
      new Map(
        comments.map((comment) => [
          comment.id,
          comment.displayName || 'a neighbour',
        ]),
      ),
    [comments],
  );

  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (body.trim().length < 2 || submitting.current || !ready) return;
    submitting.current = true;
    setSaving(true);
    setMessage('');
    try {
      const input = {
        ideaId: idea.id,
        parentId: replyingTo?.id || '',
        body: body.trim(),
        displayName: name.trim(),
      };
      await requestJSON('/api/comments', {
        method: 'POST',
        body: JSON.stringify({ ...input, submissionKey: prepare(input) }),
      });
      clear();
      setMessage('Your reply joined the conversation.');
      await client.invalidateQueries({ queryKey: ['comments', idea.id] });
      void client.invalidateQueries({ queryKey: ['ideas'] });
      void client.invalidateQueries({ queryKey: ['garden'] });
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Couldn’t add your reply.',
      );
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  async function report(commentId: string) {
    try {
      await requestJSON('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          commentId,
          reason: 'Please review this reply.',
        }),
      });
      setMessage('Thanks. This reply was flagged for review.');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Couldn’t send the report.',
      );
    }
  }

  return (
    <section className="discussion" aria-labelledby="discussion-heading">
      <div className="discussion-heading">
        <h3 id="discussion-heading">
          <MessageCircle size={17} /> Conversation
        </h3>
        <span>{comments.length || idea.commentCount || 0}</span>
      </div>
      {result.isPending && (
        <p className="discussion-empty">Listening for replies…</p>
      )}
      {result.isError && (
        <div className="discussion-error" role="alert">
          <p>
            {result.isFetchNextPageError
              ? 'Couldn’t load more replies.'
              : comments.length
                ? 'Couldn’t refresh replies.'
                : 'Couldn’t load replies.'}
          </p>
          <Button
            variant="ghost"
            onClick={() =>
              result.isFetchNextPageError
                ? result.fetchNextPage()
                : result.refetch()
            }
          >
            Retry
          </Button>
        </div>
      )}
      {!result.isPending && !result.isError && !comments.length && (
        <p className="discussion-empty">Add a detail or ask a question.</p>
      )}
      <div className="comment-list">
        {comments.map((comment) => (
          <article
            key={comment.id}
            className={`comment ${comment.parentId ? 'is-reply' : ''}`}
          >
            {comment.parentId && (
              <span className="reply-context">
                Replying to{' '}
                {names.get(comment.parentId) || 'an earlier comment'}
              </span>
            )}
            <div className="comment-meta">
              <strong>
                {comment.displayName && <span>{comment.displayName}</span>}
              </strong>
              <time dateTime={new Date(comment.createdAt).toISOString()}>
                {new Date(comment.createdAt).toLocaleDateString()}
              </time>
            </div>
            <p>{comment.body}</p>
            <div className="comment-actions">
              <button disabled={saving} onClick={() => setReplyingTo(comment)}>
                <Reply size={13} /> Reply
              </button>
              <button onClick={() => void report(comment.id)}>
                <Flag size={12} /> Report
              </button>
            </div>
          </article>
        ))}
      </div>
      {result.hasNextPage && (
        <Button
          className="more-replies"
          variant="ghost"
          disabled={result.isFetchingNextPage}
          onClick={() => result.fetchNextPage()}
        >
          {result.isFetchingNextPage ? 'Loading…' : 'More replies'}
        </Button>
      )}
      <form className="reply-form" onSubmit={submit}>
        {replyingTo && (
          <div className="replying-banner">
            <span>Replying to {replyingTo.displayName || 'a neighbour'}</span>
            <button
              type="button"
              disabled={saving}
              onClick={() => setReplyingTo(null)}
            >
              Cancel
            </button>
          </div>
        )}
        <Textarea
          disabled={saving || !ready}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          minLength={2}
          maxLength={1000}
          placeholder={'What would make this idea work better?'}
          aria-label="Your reply"
        />
        <WritingExample reply />
        <div className="reply-footer">
          <Input
            disabled={saving || !ready}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            placeholder="About you"
            aria-label="About you (optional, shown with your reply)"
          />
          <Button
            type="submit"
            disabled={saving || !ready || body.trim().length < 2}
          >
            {saving ? 'Adding…' : 'Add reply'}
            <Send size={14} />
          </Button>
        </div>
      </form>
      {message && <output className="discussion-message">{message}</output>}
    </section>
  );
}
