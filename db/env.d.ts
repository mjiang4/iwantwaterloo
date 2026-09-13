/// <reference types="vite/client" />
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    RATE_LIMIT_SECRET?: string;
  }
}
