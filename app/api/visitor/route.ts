import { failure, identity, readBody, response } from '@/lib/server';
import { verifyTurnstile } from '@/lib/turnstile';
import { turnstileSitekey } from '@/lib/config';
import { limitVisitor } from '@/lib/rate-limit';

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
    // Rate-limit per IP before the Turnstile call, so neither cookie minting nor the
    // siteverify request can be hammered.
    if (!visitor.existing) await limitVisitor(request);
    await verifyTurnstile(request, body?.turnstileToken);
    // This is the one legitimate establishment response, so issue the signed cookie even
    // though the incoming request had none.
    return response(request, visitor.id, { ready: true }, 200, undefined, true);
  } catch (error) {
    return failure(request, visitor.id, error);
  }
}
