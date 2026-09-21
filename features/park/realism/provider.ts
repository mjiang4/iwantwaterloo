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
