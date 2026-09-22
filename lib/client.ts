const publicWrites = new Set([
  '/api/ideas',
  '/api/activity',
  '/api/comments',
  '/api/support',
  '/api/reports',
]);
let visitorReady: Promise<void> | null = null;

/** One bootstrap per tab, coordinated across tabs where Web Locks is available. */
async function ensureVisitor() {
  if (!visitorReady) {
    const initialize = async () => {
      await fetchJSON('/api/visitor', { method: 'POST', body: '{}' });
      const check = await fetchJSON<{ ready: boolean }>('/api/visitor');
      if (!check.ready)
        throw new Error(
          'Allow cookies for this site to keep your ideas and likes.',
        );
    };
    visitorReady = (async () => {
      if (typeof navigator !== 'undefined' && navigator.locks)
        await navigator.locks.request('waterloo-visitor', initialize);
      else await initialize();
    })().catch((error: unknown) => {
      visitorReady = null;
      throw error;
    });
  }
  await visitorReady;
}

export async function requestJSON<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  if (
    publicWrites.has(path) &&
    init?.method &&
    !['GET', 'HEAD'].includes(init.method.toUpperCase())
  ) {
    await ensureVisitor();
  }
  return fetchJSON<T>(path, init);
}

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const signal = init?.signal
    ? AbortSignal.any([controller.signal, init.signal])
    : controller.signal;
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json');
  try {
    const res = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      signal,
      headers,
    });
    let data: T & { error?: string };
    try {
      data = await res.json();
    } catch (error) {
      if (signal.aborted) throw error;
      throw new Error('The site is temporarily unavailable. Please try again.');
    }
    if (!res.ok)
      throw new Error(
        data.error || 'Couldn’t complete this request. Please try again.',
      );
    return data;
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    if (controller.signal.aborted)
      throw new Error('The connection timed out. Please try again.');
    if (error instanceof TypeError)
      throw new Error('Couldn’t connect. Check your connection and try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
