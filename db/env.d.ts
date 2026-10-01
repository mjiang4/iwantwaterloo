/// <reference types="vite/client" />
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ADMIN_BOOTSTRAP_HASH?: string;
    ADMIN_BOOTSTRAP_EXPIRES?: string;
    RESEND_API_KEY?: string;
    ADMIN_EMAIL_FROM?: string;
    ADMIN_ORIGIN?: string;
    RATE_LIMIT_SECRET?: string;
    GARDEN_ENV?: string;
    PREVIEW_ID?: string;
    PREVIEW_ORIGIN?: string;
    PREVIEW_ADMIN_SECRET?: string;
    PREVIEW_BUILD?: string;
    PREVIEW_AUTH?: string;
    PREVIEW_OWNER_EMAIL?: string;
  }
}
