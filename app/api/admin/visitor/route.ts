import {
  requireAdmin,
  adminResponse,
  adminError,
  visitorCookie,
} from '@/lib/preview-auth';
import { readBody } from '@/lib/server';
export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    await readBody(request);
    return adminResponse({ ok: true }, 200, [
      visitorCookie(request, crypto.randomUUID()),
    ]);
  } catch (error) {
    return adminError(error);
  }
}
