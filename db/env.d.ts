/// <reference types="vite/client" />
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
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
