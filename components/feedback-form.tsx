'use client';
import { useRef, useState, type SyntheticEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { requestJSON } from '@/lib/client';
import { submissionFor, type Submission } from '@/lib/submission';

export function FeedbackForm() {
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const submission = useRef<Submission | null>(null);
  const locked = useRef(false);
  const website = useRef<HTMLInputElement>(null);
  async function send(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    setSaving(true);
    setError('');
    submission.current = submissionFor(
      { body: body.trim() },
      submission.current,
    );
    try {
      await requestJSON('/api/feedback', {
        method: 'POST',
        body: JSON.stringify({
          body: body.trim(),
          submissionKey: submission.current.key,
          website: website.current?.value || '',
        }),
      });
      setSent(true);
      setBody('');
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Couldn’t send. Please try again.',
      );
    } finally {
      locked.current = false;
      setSaving(false);
    }
  }
  if (sent)
    return (
      <div aria-live="polite" className="feedback-success">
        <h2>Thanks for helping improve this.</h2>
        <p>Your feedback is queued for GitHub.</p>
        <a href="https://github.com/mjiang4/iwantwaterloo/issues">
          View website feedback
        </a>
      </div>
    );
  return (
    <form onSubmit={send} className="feedback-form">
      <label htmlFor="website-feedback">Your feedback</label>
      <Textarea
        id="website-feedback"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="What could work better?"
        minLength={10}
        maxLength={2000}
        rows={6}
        required
        disabled={saving}
        aria-describedby="feedback-notice"
      />
      <p id="feedback-notice">
        Feedback will be public on GitHub. Please don’t include private details.
      </p>
      <div className="honeypot" aria-hidden="true">
        <label htmlFor="feedback-website">Website</label>
        <input
          ref={website}
          id="feedback-website"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      {error && <p role="alert">{error}</p>}
      <Button
        type="submit"
        disabled={saving || body.trim().length < 10}
        aria-busy={saving}
      >
        {saving ? 'Sending…' : 'Send feedback'}
      </Button>
    </form>
  );
}
