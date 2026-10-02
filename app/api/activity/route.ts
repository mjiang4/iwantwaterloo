import {
  identity,
  requireVisitor,
  readBody,
  response,
  failure,
} from '@/lib/server';
import { limitWrites } from '@/lib/rate-limit';
import { activityFor, appendUpdate, uuid } from '@/server/participation';
import { findIdea } from '@/server/idea-records';
export async function GET(request: Request) {
  const { id } = await identity(request);
  try {
    const params = new URL(request.url).searchParams;
    const page = Math.max(
      0,
      Math.min(1000, Math.floor(Number(params.get('page')) || 0)),
    );
    return response(
      request,
      id,
      await activityFor(uuid(params.get('ideaId')), page),
    );
  } catch (error) {
    return failure(request, id, error);
  }
}
export async function POST(request: Request) {
  const { id } = await identity(request);
  try {
    await requireVisitor(request);
    const raw = await readBody(request);
    const { ideaId, moderationState } = await appendUpdate(raw, id, () =>
      limitWrites(request, id, 'comments'),
    );
    return response(request, id, {
      idea: await findIdea(ideaId, id),
      moderationState,
    });
  } catch (error) {
    return failure(request, id, error);
  }
}
