'use client';

// Client half of the Turnstile check. It is inert until a sitekey is provisioned: with no
// sitekey it renders no widget and returns no token, and the server verification is the
// matching no-op. The sitekey is discovered once from /api/visitor (it is public), cached,
// and reused. Each call renders a short-lived managed widget, because Turnstile tokens are
// single-use.

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

type TurnstileApi = {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'error-callback'?: () => void;
      'timeout-callback'?: () => void;
      'expired-callback'?: () => void;
      appearance?: string;
      size?: string;
    },
  ) => string;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let sitekey: string | null = null;
let sitekeyPromise: Promise<string> | null = null;
let scriptPromise: Promise<void> | null = null;

async function discoverSitekey(): Promise<string> {
  if (sitekey !== null) return sitekey;
  if (!sitekeyPromise)
    sitekeyPromise = (async () => {
      try {
        const res = await fetch('/api/visitor', {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        const data = (await res.json()) as { turnstileSitekey?: string };
        sitekey = data.turnstileSitekey || '';
      } catch {
        sitekey = '';
      }
      return sitekey;
    })().catch(() => {
      sitekeyPromise = null;
      return '';
    });
  return sitekeyPromise;
}

function loadScript(): Promise<void> {
  if (typeof document === 'undefined') return Promise.reject();
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise)
    scriptPromise = new Promise<void>((resolve, reject) => {
      const el = document.createElement('script');
      el.src = SCRIPT;
      el.async = true;
      el.defer = true;
      el.addEventListener('load', () => resolve());
      el.addEventListener('error', () => {
        scriptPromise = null;
        reject(new Error('Turnstile script failed to load.'));
      });
      document.head.appendChild(el);
    });
  return scriptPromise;
}

/**
 * Resolve a one-time Turnstile token, or undefined when the check is not provisioned,
 * the script is blocked, or it does not resolve within the timeout. Callers send the token
 * (when present) as `turnstileToken`; the server treats a missing token as a hard failure
 * only once the secret is configured.
 */
export async function getTurnstileToken(): Promise<string | undefined> {
  if (typeof window === 'undefined') return undefined;
  const key = await discoverSitekey();
  if (!key) return undefined;
  try {
    await loadScript();
  } catch {
    return undefined;
  }
  const api = window.turnstile;
  if (!api) return undefined;
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.bottom = '12px';
  container.style.right = '12px';
  container.style.zIndex = '2147483647';
  document.body.appendChild(container);
  return new Promise<string | undefined>((resolve) => {
    let widget: string | undefined;
    let settled = false;
    const finish = (token?: string) => {
      if (settled) return;
      settled = true;
      if (widget) {
        try {
          api.remove(widget);
        } catch {}
      }
      container.remove();
      resolve(token);
    };
    const timer = setTimeout(() => finish(undefined), 20000);
    try {
      widget = api.render(container, {
        sitekey: key,
        appearance: 'interaction-only',
        callback: (token: string) => {
          clearTimeout(timer);
          finish(token);
        },
        'error-callback': () => {
          clearTimeout(timer);
          finish(undefined);
        },
        'timeout-callback': () => {
          clearTimeout(timer);
          finish(undefined);
        },
        'expired-callback': () => {
          clearTimeout(timer);
          finish(undefined);
        },
      });
    } catch {
      clearTimeout(timer);
      finish(undefined);
    }
  });
}
