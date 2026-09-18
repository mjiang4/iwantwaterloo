export type CheckResult = { name: string; passed: boolean; detail: string };
type Http = typeof fetch;
type CheckPayload = {
  error?: string;
  id: string;
  ideaKey: string;
  idea: { id: string; displayName?: string };
  ideas: { id: string }[];
  waters: number;
  watered: boolean;
  comment: { id: string };
  comments: { parentId: string }[];
};
export async function runPreviewChecks(
  http: Http = fetch,
  update: (results: CheckResult[]) => void = () => {},
  privateHost = false,
) {
  const results: CheckResult[] = [];
  async function call(
    path: string,
    method = 'GET',
    body?: unknown,
    anonymous = false,
  ) {
    const response = await http(path, {
      method,
      credentials: anonymous ? 'omit' : 'same-origin',
      cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    return {
      status: response.status,
      data: (await response.json()) as CheckPayload,
    };
  }
  const started = await call('/api/admin/checks', 'POST', { action: 'begin' });
  if (started.status !== 200)
    throw new Error(started.data.error || 'Could not start checks.');
  function expect(condition: unknown, message: string) {
    if (!condition) throw new Error(message);
  }
  async function check(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      results.push({ name, passed: true, detail: 'Passed' });
      update([...results]);
    } catch (error) {
      results.push({
        name,
        passed: false,
        detail: (error instanceof Error ? error.message : 'Failed').slice(
          0,
          300,
        ),
      });
      update([...results]);
      throw error;
    }
  }
  let ideaId = '',
    parentId = '';
  const idea = {
    title: 'Preview browser check',
    description: 'Temporary data for the preview browser checks.',
    tags: ['preview-check'],
    place: '',
    connection: 'Studying in Waterloo',
    displayName: '',
    consent: true,
    submissionKey: started.data.ideaKey,
  };
  try {
    await check(
      privateHost ? 'Visitor access' : 'Anonymous access',
      async () => {
        const [ideas, tags] = await Promise.all([
          call('/api/ideas', 'GET', undefined, !privateHost),
          call('/api/tags', 'GET', undefined, !privateHost),
        ]);
        expect(
          ideas.status === 200 &&
            Array.isArray(ideas.data.ideas) &&
            tags.status === 200,
          'Public browsing failed.',
        );
      },
    );
    await check('Input validation', async () => {
      const bad = await call('/api/ideas', 'POST', { ...idea, consent: false });
      expect(bad.status === 400, 'An invalid submission was accepted.');
    });
    await check('Share an idea', async () => {
      const saved = await call('/api/ideas', 'POST', idea);
      expect(
        saved.status === 201,
        saved.data.error || 'The idea could not be saved.',
      );
      ideaId = saved.data.idea.id;
      expect(
        !saved.data.idea.displayName,
        'An anonymous submission gained a name.',
      );
    });
    await check('Safe submission retry', async () => {
      const retry = await call('/api/ideas', 'POST', idea);
      expect(
        retry.status === 200 && retry.data.idea.id === ideaId,
        'Retry created another idea.',
      );
    });
    await check('Find the saved idea', async () => {
      const direct = await call(`/api/ideas?id=${ideaId}`);
      expect(
        direct.data.ideas?.[0]?.id === ideaId,
        'Direct idea lookup failed.',
      );
      const tagged = await call('/api/ideas?tag=preview-check');
      expect(
        tagged.data.ideas?.some((i: { id: string }) => i.id === ideaId),
        'Tag lookup failed.',
      );
    });
    await check('Like and undo', async () => {
      for (const watered of [true, true, false]) {
        const saved = await call('/api/support', 'PUT', { ideaId, watered });
        expect(
          saved.status === 200 &&
            saved.data.waters === (watered ? 1 : 0) &&
            saved.data.watered === watered,
          'Like or undo did not persist correctly.',
        );
      }
    });
    await check('Replies and safe retry', async () => {
      const root = await call('/api/comments', 'POST', {
        ideaId,
        parentId: '',
        body: 'Could we try this near the library?',
        displayName: 'River',
        submissionKey: crypto.randomUUID(),
      });
      expect(root.status === 201, root.data.error || 'Could not save a reply.');
      parentId = root.data.comment.id;
      const body = {
          ideaId,
          parentId,
          body: 'An evening pilot would be useful.',
          displayName: '',
          submissionKey: crypto.randomUUID(),
        },
        reply = await call('/api/comments', 'POST', body),
        retry = await call('/api/comments', 'POST', body);
      expect(
        reply.status === 201 &&
          reply.data.comment.id === retry.data.comment?.id,
        'Reply retry was not safe.',
      );
      const thread = await call(`/api/comments?ideaId=${ideaId}`);
      expect(
        thread.data.comments?.length === 2 &&
          thread.data.comments[1].parentId === parentId,
        'Nested replies were not returned.',
      );
    });
    await check('Report an idea', async () => {
      const report = await call('/api/reports', 'POST', {
        ideaId,
        reason: 'Temporary preview check',
      });
      expect(report.status === 201, report.data.error || 'Reporting failed.');
    });
  } catch {
    /* Failed steps are shown; cleanup still runs. */
  }
  {
    const finish = await call('/api/admin/checks', 'POST', {
      action: 'finish',
      id: started.data.id,
      results,
    });
    if (finish.status !== 200)
      throw new Error(
        finish.data.error || 'Checks finished, but fixture cleanup failed.',
      );
  }
  return results;
}
