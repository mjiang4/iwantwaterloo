// A device-local autofill preference; the published signature is stored on each idea.
const KEY = 'waterloo-public-signature';
export function readSignature(): string {
  try {
    return (localStorage.getItem(KEY) || '').slice(0, 60);
  } catch {
    return '';
  }
}
export function saveSignature(value: string) {
  try {
    if (value.trim()) localStorage.setItem(KEY, value.slice(0, 60));
    else localStorage.removeItem(KEY);
  } catch {
    /* Posting still works when browser storage is unavailable. */
  }
}
