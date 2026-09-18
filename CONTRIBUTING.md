# Contributing

Ideas for Waterloo belong on [the site](https://iwantwaterloo.com). Bug reports, design suggestions, and improvements to the project are welcome through [GitHub issues](https://github.com/mjiang4/iwantwaterloo/issues) and pull requests.

## Run locally

Use Node.js 22.13 or newer and npm.

```sh
npm ci
npm run preview
```

Open [localhost:3001](http://localhost:3001). This compiles the actual application, creates a separate local D1 database, applies migrations, and generates local preview credentials. No Cloudflare account or production credentials are needed. Changes rebuild automatically; refresh after “Preview ready.” A failed rebuild keeps the previous working version.

Stop the process with Ctrl+C. Keep `.preview/state` and `.env.preview` if you want to retain local ideas when moving the checkout. Neither belongs in Git. `npm run dev` is a lower-level HMR command; the compiled preview is the supported complete setup.

## Check a change

```sh
npm run check
npm run build
```

The first command runs TypeScript, lint, formatting checks, and unit/API tests. API tests create disposable Workers and D1 databases, apply the committed migrations, and dispose of their data. They never use your preview database or an external test URL. No running server or owner credentials are required.

For UI changes:

```sh
npx playwright install chromium webkit
npm run test:browser
```

On Linux, use `npx playwright install --with-deps chromium webkit`. Browser tests start the compiled app on loopback port 3173 with a temporary database and verify a per-run marker before submitting anything. Screenshots are saved under ignored `outputs/browser-checks`. Use `WATERLOO_TEST_PORT` to choose another port; `TEST_BASE_URL` is deliberately rejected. To run Chromium only, set `WATERLOO_TEST_BROWSERS=chromium`.

For styles and copy, also check an actual phone when possible. Browser emulation does not reproduce every keyboard, GPU, or assistive-technology behavior.

## Find the right code

Read [the architecture guide](docs/ARCHITECTURE.md) for the submission flow and module responsibilities. [ISSUES.md](docs/ISSUES.md) is the current product backlog. Older plans are historical, not release status.

Keep changes focused. Use the existing components and visual language. Prefer one short prompt over extra required fields. Handle empty, loading, failure, retry, and reduced-motion states alongside the happy path.

Run `npm run format` before submitting. Avoid mixing broad formatting changes with unrelated behavior changes. Add regression tests for failures that could lose data, duplicate contributions, or cross environment boundaries.

## Database changes

Update `db/schema.ts`, run `npm run db:generate`, and inspect the new SQL and metadata under `drizzle/`. Never rewrite an applied migration. Test both a new database and an upgrade containing existing ideas. Use prepared SQL with bound values; keep read-model mapping in `server/idea-records.ts`.

Plot positions currently depend on legacy rowids. Do not delete/reimport rows as a routine cleanup. A migration to explicit positions needs a separate preservation plan.

## Environment and deployment

Local preview settings are generated in `.env.preview`: database identity, preview identity, and random preview/rate-limit secrets. The launcher supplies the preview origin and build metadata. Never copy these settings into production.

`.openai/hosting.json` declares logical bindings and the registered Site. Sites manages production resources. Publishing is a maintainer action, separate from contributor tests. `preview:stage` also requires a separately provisioned private Site checkout; see [preview documentation](docs/PREVIEW-ADMIN.md).

Do not commit credentials, database files, screenshots of real private data, personal notes, or conversation exports.

## Open a pull request

Describe the problem, the resulting behavior, and the checks you ran. Include screenshots for visible changes and mention migration or accessibility considerations when relevant. A small, understandable improvement is welcome; it does not need to solve the whole backlog.

## Tooling dependency pins

The esbuild, ws, and sharp overrides select patched releases while retaining the existing stable Cloudflare toolchain. They cover local tooling, not extra browser libraries. When updating that toolchain, check whether upstream dependencies make the overrides unnecessary. Verify the build, tests, migration generator, and npm audit before removing them.
