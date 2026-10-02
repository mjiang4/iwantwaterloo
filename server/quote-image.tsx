import { ImageResponse } from 'cf-workers-og/workerd';
import type { Idea } from '@/lib/garden';

// Keep the preview legible; the linked page always contains the full idea.
export function quoteExcerpt(text: string, limit = 280) {
  const characters = Array.from(text.replace(/\s+/gu, ' ').trim());
  if (characters.length <= limit) return characters.join('');
  const excerpt = characters.slice(0, limit).join('');
  const lastSpace = excerpt.lastIndexOf(' ');
  return `${lastSpace > excerpt.length * 0.75 ? excerpt.slice(0, lastSpace) : excerpt}…`;
}

export function quoteCard(idea: Pick<Idea, 'description' | 'displayName'>) {
  const quote = quoteExcerpt(idea.description);
  const attribution = idea.displayName?.trim();
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: '#f8f7ef',
        color: '#23452f',
        padding: '44px 72px',
        fontFamily: 'Roboto',
      }}
    >
      <div
        style={{
          display: 'flex',
          height: 104,
          fontSize: 152,
          lineHeight: 1,
          color: '#789568',
        }}
      >
        “
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            fontSize: quote.length > 180 ? 42 : quote.length > 100 ? 50 : 64,
            lineHeight: 1.2,
            overflowWrap: 'anywhere',
          }}
        >
          {quote}
        </div>
        {attribution && (
          <div style={{ fontSize: 26, marginTop: 28, color: '#60745b' }}>
            {quoteExcerpt(attribution, 90)}
          </div>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 28,
          fontSize: 22,
          color: '#60745b',
        }}
      >
        <div>iwantwaterloo.com</div>
        <div>Browse more ideas →</div>
      </div>
    </div>
  );
}

export function renderQuoteImage(
  idea: Pick<Idea, 'description' | 'displayName'>,
) {
  return ImageResponse.create(quoteCard(idea), {
    width: 1200,
    height: 630,
    headers: {
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
