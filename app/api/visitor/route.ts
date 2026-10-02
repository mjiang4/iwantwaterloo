import { failure, identity, readBody, response } from '@/lib/server';
import { verifyTurnstile } from '@/lib/turnstile';
import { turnstileSitekey } from '@/lib/config';

export async function GET(request: Request) {
  const visitor = await identity(request);
  return response(request, visitor.id, {
    ready: visitor.existing,
    turnstileSitekey: turnstileSitekey(),
  });
}

/** Establish browser ownership before any contribution is sent. Reads never replace cookies. */
export async function POST(request: Request) {
  const visitor = await identity(request);
  try {
    const body = await readBody(request);
    await verifyTurnstile(request, body?.turnstileToken);
    return response(request, visitor.id, { ready: true });
  } catch (error) {
    return failure(request, visitor.id, error);
  }
}
