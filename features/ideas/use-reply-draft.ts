'use client';
import { useEffect, useRef, useState } from 'react';
import { readSignature } from '@/lib/signature';
import {
  readSubmission,
  submissionFor,
  type Submission,
} from '@/lib/submission';

type ReplyTarget = { id: string; displayName: string };
type Draft = { body: string; name: string; parent: ReplyTarget | null };
const emptyDraft: Draft = { body: '', name: '', parent: null };

export function useReplyDraft(ideaId: string) {
  const storageKey = 'waterloo-reply-draft:' + ideaId;
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [ready, setReady] = useState(false);
  const submission = useRef<Submission | null>(null);
  useEffect(() => {
    let next = { ...emptyDraft, name: readSignature() };
    try {
      const stored = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      if (stored && typeof stored.body === 'string') {
        next = {
          body: stored.body.slice(0, 1000),
          name: typeof stored.name === 'string' ? stored.name.slice(0, 60) : '',
          parent:
            typeof stored.parent?.id === 'string'
              ? {
                  id: stored.parent.id,
                  displayName:
                    typeof stored.parent.displayName === 'string'
                      ? stored.parent.displayName.slice(0, 60)
                      : '',
                }
              : null,
        };
        submission.current = readSubmission(stored.submission);
      }
    } catch {
      /* Storage is optional; the form remains usable. */
    }
    // Restore the tab's draft after SSR, before enabling the form.
    // oxlint-disable-next-line react/react-compiler
    setDraft(next);
    setReady(true);
  }, [storageKey]);
  useEffect(() => {
    if (!ready) return;
    try {
      if (!draft.body && !draft.parent) sessionStorage.removeItem(storageKey);
      else
        sessionStorage.setItem(
          storageKey,
          JSON.stringify({ ...draft, submission: submission.current }),
        );
    } catch {
      /* A storage quota failure must not prevent participation. */
    }
  }, [draft, ready, storageKey]);
  function prepare(value: unknown) {
    submission.current = submissionFor(value, submission.current);
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ ...draft, submission: submission.current }),
      );
    } catch {
      /* The in-memory retry key still protects this attempt. */
    }
    return submission.current.key;
  }
  function clear() {
    submission.current = null;
    setDraft((current) => ({ ...emptyDraft, name: current.name }));
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* Optional storage. */
    }
  }
  return { draft, setDraft, ready, prepare, clear };
}
