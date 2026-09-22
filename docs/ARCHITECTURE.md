# Architecture

Current development structure, September 21, 2026. Deployment is separate from the contents of a branch.

## Stack and boundaries

React 19 and Vinext provide the interface and server routes. TanStack Query manages fetched data. React Three Fiber, Three.js, and Drei render the garden. Cloudflare Workers runs the server; D1 stores contributions. Drizzle describes the schema and generates migrations; runtime database access uses prepared SQL.

| Location                                           | Responsibility                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| `app/api/`                                         | HTTP validation, authorization, rate limits, and responses                     |
| `server/idea-records.ts`                           | Shared SQL projection and explicit database-to-API mapping                     |
| `features/ideas/`                                  | Input/response contracts, queries, filters, likes, detail UI, and reply drafts |
| `components/garden-app.tsx`                        | Coordinate navigation, selection, and planting/like animations                 |
| `components/idea-composer.tsx`                     | Main writing form and posting feedback                                         |
| `components/idea-discussion.tsx`                   | Replies and recoverable discussion states                                      |
| `components/garden-explorer.tsx`                   | Grove navigation, selection, motion preferences, and renderer fallback         |
| `components/garden-scene.tsx`, `garden-forest.tsx` | Scene and bounded instanced geometry                                           |
| `lib/garden-visuals.ts`, `garden-discovery.ts`     | Deterministic growth, targeting, and interaction rules                         |
| `lib/client.ts`, `server.ts`, `submission.ts`      | Request handling, browser identity, validation, retry keys                     |
| `components/ui/`                                   | Shared vendor primitives actually used by the application                      |
| `app/globals.css`, `styles/participation.css`      | Shared theme, garden styles, and participation UI                              |
| `scripts/`                                         | Local preview and maintainer staging                                           |
| `tests/`                                           | Unit, isolated API, and compiled browser checks                                |

The `codex/waterloo-park` experiment adds `features/park/` for time, theme browsing and wildlife, `styles/park.css` for the immersive interface, and an OSM/Blender asset pipeline in `scripts/park/` and `assets/park/`. See [the park notebook](PARK-NOTEBOOK.md) for constraints and source attribution.

## From an idea to a tree

1. The composer holds a tab-local draft. Optional attribution is one string; it is not a verified identity.
2. `submissionFor` associates an unchanged payload with one UUID. Retrying keeps that key.
3. Before a public write, the client establishes an HttpOnly anonymous visitor cookie through `/api/visitor`. Initialization is coordinated within a tab and through Web Locks across supported tabs. Reads do not replace cookies.
4. The ideas route validates the request and origin, enforces limits, and inserts with conflict handling. A duplicate key returns the saved idea; different content under that key is rejected.
5. Queries refresh and the page passes a single planting moment to the garden. The same idea data remains readable without WebGL.

Comments follow the same retry principle and retain their drafts across closing a discussion. Likes send the desired state, not an ambiguous toggle. One shared mutation hook updates cached lists, garden data, and shared idea pages, rolls back failures, and requests the garden animation after confirmation.

## State ownership

- **D1:** ideas, immutable revisions, credited contributions, organizer responses, likes, replies, reports, abuse counters, and isolated preview controls.
- **TanStack Query:** fetched lists, groves, shared ideas, and comments.
- **React:** open panels, selected ideas, pending actions, and short animation events.
- **sessionStorage:** unfinished idea/reply drafts and retry receipts.
- **localStorage:** explicitly remembered attribution, introduction dismissal, and display preferences.
- **Cookie:** anonymous browser ownership. “Yours” means this browser, not an account or a verified person.

Public response mapping normalizes SQLite booleans and nullable names. It must never include visitor IDs or submission keys.

## Rendering budget

Keep growth math deterministic and independent of rendering. Each grove is bounded; trunks, foliage, branches, and flowers are instanced. Pause, reduced motion, hidden documents, and offscreen state limit animation work. Avoid adding a physics engine or full-screen effects without a measured need and mobile checks.

## Environment boundaries

The compiled local preview uses a generated identity, separate database, and preview-only secrets. Preview admin endpoints fail closed outside that identity. They are regression tooling, not a production moderation service.

API tests run actual handlers in disposable Miniflare Workers. Browser tests use the full compiled application and a fresh temporary database. Neither can target production. CI has no deployment step.

## Current limitations

Garden placement still uses legacy SQLite rowids plus a reserved offset. Titles from older records are interpreted through a compatibility heuristic. Replacing either needs a data migration that preserves existing behavior; these are recorded separately in the backlog.

Reports are stored, but production moderation is an operator responsibility until a protected interface is implemented. See [operations](OPERATIONS.md). A successful report means it was saved, not that a review has happened.

## Participation

The current idea projection overlays the latest immutable revision on the original. Revisions credit existing contributions; authenticated organizer responses remain distinct from author updates. See [participation](PARTICIPATION.md) for the data model, weekly review workflow, discovery rules, and production authorization boundary.
