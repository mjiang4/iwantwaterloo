/** Only a browser-restricted Maps key belongs in this public configuration. */
export type ParkProvider = { googleMapsKey: string; elevation: number };
export function parseParkProvider(value: unknown): ParkProvider {
  const source =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const key =
    typeof source.googleMapsKey === 'string' ? source.googleMapsKey.trim() : '';
  return {
    googleMapsKey: /^[A-Za-z0-9_-]{20,200}$/.test(key) ? key : '',
    elevation:
      typeof source.elevation === 'number' &&
      source.elevation >= 100 &&
      source.elevation <= 600
        ? source.elevation
        : 300,
  };
}

/** Hosted settings take precedence; local builds may provide the static fallback. */
export async function loadParkProvider(
  signal: AbortSignal,
): Promise<ParkProvider> {
  const options = { signal, cache: 'no-store' as const };
  const runtime = await fetch('/api/park-provider', options);
  if (!runtime.ok) throw new Error('Imagery configuration is unavailable.');
  const provider = parseParkProvider(await runtime.json());
  if (provider.googleMapsKey) return provider;
  const local = await fetch('/park-provider.json', options);
  if (!local.ok) return provider;
  return parseParkProvider(await local.json());
}
