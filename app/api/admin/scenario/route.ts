import { requireAdmin, adminResponse, adminError } from '@/lib/preview-auth';
import { changePreview, previewStatus } from '@/lib/preview-data';
import { readBody } from '@/lib/server';
export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    await changePreview(await readBody(request));
    return adminResponse(await previewStatus());
  } catch (error) {
    return adminError(error);
  }
}
