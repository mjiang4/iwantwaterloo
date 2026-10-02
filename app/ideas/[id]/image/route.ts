import { findIdea } from '@/server/idea-records';
import { renderQuoteImage } from '@/server/quote-image';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/.test(id)) return new Response(null, { status: 404 });
  const idea = await findIdea(id);
  if (!idea)
    return new Response(null, {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  return renderQuoteImage(idea);
}
