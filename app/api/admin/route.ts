import { requireAdmin, adminResponse, adminError } from '@/lib/preview-auth';
import { previewStatus } from '@/lib/preview-data';
export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    return adminResponse(await previewStatus());
  } catch (error) {
    return adminError(error);
  }
}
