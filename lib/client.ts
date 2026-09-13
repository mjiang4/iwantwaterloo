export async function requestJSON<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      signal: controller.signal,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
    let data: T & { error?: string };
    try {
      data = await res.json();
    } catch {
      throw new Error('The site is temporarily unavailable. Please try again.');
    }
    if (!res.ok)
      throw new Error(
        data.error || 'Couldn’t complete this request. Please try again.',
      );
    return data;
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error('The connection timed out. Please try again.');
    if (error instanceof TypeError)
      throw new Error('Couldn’t connect. Check your connection and try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
