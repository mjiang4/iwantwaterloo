import { parseParkProvider } from '@/features/park/realism/provider';

/** This is explicitly public browser configuration, never a general environment endpoint. */
export function GET() {
  return Response.json(
    parseParkProvider({
      googleMapsKey: process.env.VITE_GOOGLE_MAPS_BROWSER_KEY,
      elevation: Number(process.env.VITE_GOOGLE_MAPS_ELEVATION || 300),
    }),
    {
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
}
