# Code review — September 18, 2026

Reviewed local branch `codex/personal-submissions` at `ed92efd`. This is a historical review of that checkout, not verification of the currently deployed site. Evidence and line numbers below refer to that revision.

**Implementation update:** `codex/contributor-refactor` addresses CR-001 through CR-006, introduces isolated checks and contributor documentation, and completes the focused module and stylesheet cleanup. See [the current tracker](ISSUES.md) for verified changes and deferred schema/moderation work. The original findings and validation below are retained as the review record; they do not describe the updated branch. Production has not been changed by this refactor.

The project has a sensible stack and useful separation around rendering and preview isolation. Keep those. Its main weaknesses are incomplete failure handling, inconsistent data contracts, and a development workflow that depends too much on the original maintainer's machine. Fix these before undertaking a broad reorganization.

High standards are useful; abstraction for its own sake is not. A new contributor should be able to run the app, follow one submission from form to database, and make a small change with trustworthy checks.

## Findings requiring fixes

All findings below are P2: concrete problems worth fixing in normal development. None establishes an immediate production incident.

### CR-001 · Retrying a timed-out comment can publish it twice

**Evidence:** [idea-discussion.tsx, line 63](../components/idea-discussion.tsx#L63) creates a new submission key on every attempt. [client.ts, line 6](../lib/client.ts#L6) times requests out after 15 seconds.

If the server saves a reply but its response never arrives, the form keeps the text. Clicking Add reply again sends the same comment with a different key, so the server treats it as a new contribution. The disabled button only prevents clicks during the pending request.

**Change:** Keep one key for an unchanged payload through retries. Rotate it when the submitted content changes or the submission finishes. The [idea composer, line 139](../components/idea-composer.tsx#L139) already uses this pattern; extract the small piece that both forms need. Preserve the reply draft when its view closes or a request fails.

**Acceptance:** Save a reply, drop the response, retry the unchanged draft, and verify exactly one stored comment.

### CR-002 · The comments endpoint has a concurrent retry race

**Evidence:** [comments route, line 73](../app/api/comments/route.ts#L73) checks for a submission key, then performs a plain insert at line 107. A unique index exists, but the insert does not handle its conflict.

Two requests with the same key can both find no previous row. One succeeds; the other hits the uniqueness constraint and returns 503. I reproduced this with the actual handler and migrations against an isolated SQLite adapter.

**Change:** Use a conflict-safe insert and reread the saved result, including the existing payload comparison. The ideas endpoint already demonstrates this approach. Separate awaited database calls do not make the operation atomic; [D1 documents transactions for batches](https://developers.cloudflare.com/d1/worker-api/d1-database/), but a batch alone also needs appropriate conflict handling.

**Acceptance:** Concurrent identical submissions both return the same saved comment. Reusing a key with different content returns 409.

### CR-003 · A successful first-submission retry can lose browser ownership

**Evidence:** [server.ts, line 26](../lib/server.ts#L26) generates an identity when the request has no visitor cookie. The cookie is sent on mutation responses. [ideas route, line 158](../app/api/ideas/route.ts#L158) returns an already-saved submission using the identity of the retrying request.

When a first-time visitor's submission succeeds but the response and cookie are lost, their retry gets a new identity. The saved idea is returned successfully, but remains owned by the first identity. “Yours” then excludes it. I reproduced this sequence. Concurrent first writes from a browser without a cookie present the same general identity problem.

**Change:** Establish one browser identity before allowing writes, with a coordinated initialization request. Define retry recovery explicitly; do not let callers claim arbitrary existing visitor IDs. Keep this anonymous and browser-local—accounts are not required to fix it.

**Acceptance:** After a lost first response and retry, the idea appears in Yours. Test simultaneous first likes and verify both remain associated with the browser.

### CR-004 · Failed discussion loading looks like an empty conversation

**Evidence:** [idea-discussion.tsx, line 108](../components/idea-discussion.tsx#L108) displays “Add a detail or ask a question” whenever loading has stopped and there are no comments. It does not check `result.isError`.

A failed comments request therefore tells users that the conversation is empty. Loading another page also has no explicit failure treatment. Separately, the legacy idea-link fetch in [garden-app.tsx, line 326](../components/garden-app.tsx#L326) has no rejection handler.

**Change:** Distinguish loading, empty, failed, and successfully loaded states. Keep any existing replies visible on refresh failure and offer retry. Add an error path to direct-link loading.

**Acceptance:** Initial failure, refresh failure, and pagination failure each produce accurate feedback without discarding drafts or loaded comments.

### CR-005 · Integration tests can write to one environment and clean another

**Evidence:** [delight-api.mjs, line 5](../tests/delight-api.mjs#L5) accepts any `TEST_BASE_URL`, including a public site. Its cleanup at line 91 always opens a hardcoded local SQLite file. [public-api.mjs, line 8](../tests/public-api.mjs#L8) and [idea-order.mjs, line 5](../tests/idea-order.mjs#L5) also depend on that machine-specific database path.

Running the delight suite against a remote URL would create public fixtures that its cleanup cannot remove. On a fresh clone, the other suites can fail because the expected database file is missing or differs from the server's database. The public API suite has a localhost guard; the delight suite does not.

**Change:** Provide a test harness that starts its own server and disposable database, applies migrations, and tears both down. Reject nonlocal targets before any mutation and verify a test database identity. Tests must obtain their database location from that harness, not a copied Miniflare filename.

**Acceptance:** One documented command works in a clean checkout. Supplying a production URL fails before making a write. Failure cleanup affects only the test database.

### CR-006 · Reports accept inconsistent targets

**Evidence:** [reports route, line 26](../app/api/reports/route.ts#L26) validates the comment when a comment ID is present, but inserts both caller-provided IDs at line 44. A valid comment plus an unrelated or nonexistent idea ID is accepted. I reproduced this.

The current UI normally sends only one target, but the API contract permits contradictory records that a future moderation interface could misinterpret.

**Change:** Accept exactly one target: an idea or a comment. Resolve a comment's parent idea on the server if needed. Add matching database constraints where practical, after checking existing records.

**Acceptance:** Reject missing or ambiguous targets; accept valid idea and comment reports; prevent mismatched relationships.

## Changes that would make contributing easier

### Establish a reliable development workflow first

The README explains the product well but has no fresh-clone setup. `npm run lint` currently fails with **48 diagnostics**: 30 outside `components/ui`, 18 inside it. Not every diagnostic is a functional bug; some are rule-policy questions. There is no standard `test`, `typecheck`, or combined `check` script and no checked-in GitHub Actions workflow.

Add a short **CONTRIBUTING.md** covering supported Node version, installation, local database setup, migrations, preview, tests, and the PR process. Local contribution should work without the owner's hosting credentials. Document environment variables with safe examples and distinguish local setup from deployment.

The remote staging script also assumes an ignored, pre-provisioned checkout and a particular Site ID ([preview-stage.mjs, line 8](../scripts/preview-stage.mjs#L8)). Label this as maintainer tooling and document provisioning; do not present it as a command every contributor can run.

Make lint pass by fixing defects and deliberately configuring rules, including treatment of vendored UI. Add CI after the checks are reproducible. Include the build, type checking, lint, unit tests, and isolated API tests.

### Split the main component by responsibility

[garden-app.tsx](../components/garden-app.tsx) is 933 lines. Its size matters because it contains API types, query construction, filtering, selection, likes, multiple cache updates, animation handoff, dialogs, and most page markup.

Start with three extractions:

1. **Idea contracts and queries:** move `PlantInput` out of the page component; give query keys and response types one home.
2. **Idea mutations:** share submission/like behavior and cache updates through small hooks, keeping animation callbacks explicit.
3. **Filters and idea details:** move their UI and local state into focused components.

Keep the page responsible for composition and coordination. Avoid extracting every ten-line helper. Do not introduce a general service framework or a second global state library.

A reasonable direction is `features/ideas`, `features/garden`, and `server`, while retaining `components/ui` for generic primitives. Move files when working on their responsibility rather than reorganizing everything in one PR.

### Make database and API contracts explicit

The ideas API repeats long SQL projections, and [line 97](../app/api/ideas/route.ts#L97) casts mapped rows to `Idea[]`. Meanwhile, database `display_name` is nullable but `Idea.displayName` is optional string. A cast hides that disagreement.

Use a small typed data-access module for idea queries and row-to-response mapping. Normalize nulls deliberately. Keep SQL close to the behavior it implements. Raw SQL is reasonable here; adopting an ORM throughout is not a prerequisite. The unused [Drizzle runtime helper](../db/index.ts) should either become the supported approach or be removed so contributors see one clear path.

Also schedule two data-model improvements:

- **Persist garden positions explicitly.** Positions and grove pages currently derive from `rowid + 5`. Hidden SQLite rowids are not a stable application identifier across every maintenance operation; [SQLite documents this limitation](https://www.sqlite.org/rowidtable.html). Introduce an explicit plot value while preserving current positions. Document the reserved offset and replace repeated grove-size literals with one definition.
- **Record authored versus generated titles.** [hasDerivedTitle](../lib/garden.ts#L205) infers the storage format by comparing against today's excerpt algorithm. Changing that algorithm can change how old ideas display. Use an explicit format/title mode when next evolving the schema, with fixtures for older ideas.

### Make CSS readable before changing its behavior

[globals.css](../app/globals.css) has about 38 KB in only 191 lines, with 32 `!important` declarations. Successive overrides of the signature field appear at lines 146, 179, 181, and 184–188. It is unnecessarily difficult to determine which declaration controls the result.

First format the stylesheet in a standalone PR with no intended visual changes. Then consolidate obsolete rules, group styles by component, and introduce a small set of type, spacing, and color variables. Consider CSS modules for components with substantial styling.

This supports the existing readability issue, **IW-001**. Verify desktop zoom, mobile keyboard behavior, focus visibility, and reduced motion after consolidation. Small labels are a product concern to test, not an excuse to declare a blanket accessibility rule.

### Reduce misleading surface area

There are 60 UI component files, while the custom application directly imports nine UI modules. That is not proof that the other 51 are unused—some are transitive dependencies. Trace the imports, remove confirmed unused scaffolding and dependencies, and make the distinction between vendor primitives and product components clear.

Give the HTTP helper an honest contract: [client.ts](../lib/client.ts) accepts any `RequestInit`, but spreads `headers` as if it were always a plain object and replaces a supplied abort signal. Normalize headers with `Headers` and combine cancellation, or narrow the accepted options. Existing plain-object callers are not evidence of a current headers failure.

### Give documentation and operations clear ownership

The older planning documents mix historical decisions with current claims. For example, [GARDEN-IMPLEMENTATION.md](GARDEN-IMPLEMENTATION.md) still describes growth capped at 25 likes, while the current implementation grows beyond that.

Create a short **ARCHITECTURE.md** describing the actual submission-to-database-to-tree flow, data ownership, preview isolation, and where to change each behavior. Mark older plans as historical and link current documents. Keep [ISSUES.md](ISSUES.md) as the current backlog.

Reports are stored, but this repository has no production report-review or moderation workflow; preview admin endpoints deliberately reject production. A manual external process may exist, but it is not documented here. Before expanding public discussion, define who reviews reports and how they act on them. A small protected queue or documented operational procedure is sufficient; the preview environment should remain separate.

## What to preserve

- Bound SQL parameters, request-origin checks, bounded request bodies, rate limiting, and sanitized public errors.
- Conflict-safe idea insertion and explicit support state instead of a blind toggle.
- Preview controls that require the correct environment, origin, and separately provisioned database identity.
- Deterministic tree shapes and growth functions, bounded instanced decorations, lazy 3D loading, reduced-motion handling, and offscreen rendering suspension.
- Anonymous participation and a useful non-WebGL interface.

There is no demonstrated need for another graphics framework, physics engine, microservice, or generalized repository abstraction.

## Suggested PR order

1. Isolate the API test environment and add regressions for retry, identity, and target validation.
2. Fix CR-001 through CR-006 in small, focused changes.
3. Establish passing checks, CI, CONTRIBUTING.md, and current architecture documentation.
4. Extract idea contracts, queries, and mutations; consolidate repeated SQL mapping.
5. Format and simplify CSS separately from visual changes; address IW-001 with browser checks.
6. Remove confirmed unused scaffolding and archive stale plans. Schedule schema and moderation work explicitly.

## Validation and limits

- TypeScript: `npx tsc --noEmit --incremental false` passed.
- Existing growth/discovery tests: **8 passed**.
- Lint: failed with **48 diagnostics**.
- Additional isolated reproductions confirmed ownership loss on retry, the concurrent comment conflict, and mismatched report targets.
- Reproductions used the actual route handlers and committed migrations with an in-memory SQLite adapter. Rate limiting was stubbed; this is not a full Cloudflare runtime concurrency test.
- Reviewed custom application components, routes, shared libraries, database schema/migrations, preview scripts, tests, configuration, and documentation. Vendored UI was assessed through usage and lint rather than a line-by-line audit of every primitive.
- Did not mutate production or existing preview data, deploy changes, rerun the full production build, perform a dependency vulnerability audit, or measure physical-device performance. Existing database-coupled integration suites were not run.
