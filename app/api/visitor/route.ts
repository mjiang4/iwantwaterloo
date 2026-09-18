import { failure, identity, readBody, response } from '@/lib/server';

export function GET(request: Request) {
  const visitor = identity(request);
  return response(request, visitor.id, { ready: visitor.existing });
}

/** Establish browser ownership before any contribution is sent. Reads never replace cookies. */
export async function POST(request: Request) {
  const visitor = identity(request);
  try {
    await readBody(request);
    return response(request, visitor.id, { ready: true });
  } catch (error) {
    return failure(request, visitor.id, error);
  }
}
