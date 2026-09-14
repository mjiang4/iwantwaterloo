> Current direction: seasons are removed in favor of permanent green foliage. Preview opens the actual site; the test dashboard is removed. Likes update the garden immediately, continue growing after 25 likes, and animate a short stretch. Earlier seasonal/dashboard items below are historical.

# Remaining work — Waterloo

Updated September 13, 2026. This is a code-based status check of the local cloud-import branch. The public Site remains unchanged; a separate private development preview is being prepared. This checklist supersedes the earlier blanket claim that the plan is implemented.

## Current status

| Feature | Status | Remaining work |
| --- | --- | --- |
| i want / waterloo header | Implemented locally | Final mobile review |
| Optional names on ideas | Implemented locally | Verify blank names never produce identity placeholders |
| Optional names on replies | Partial | Remove “A neighbour” as an unnamed byline; use neutral reply context without inventing an identity |
| Individual idea links and sharing | Implemented locally | Test native sharing and clipboard failure paths on mobile |
| Comments and nested replies | Implemented locally | Private moderation; preserve draft and submission key across failed retries; non-disruptive new-reply notices |
| Growing saplings, flowers and branches | Implemented locally | Six shared tree/flower batches; capped growth; like/undo, pause and full-grove browser checks completed. Physical iPhone/Android profiling remains |
| Planting confirmation / See your tree | Implemented locally | Review animation and camera handoff on touch devices |
| Sorting inside Filter | Updated locally in this pass | New, Most liked, Random; Reshuffle appears only when Random is chosen |
| Tag autocomplete | Updated locally in this pass | Search-first suggestions, up to five matches plus one create option; no permanent tag catalogue |
| Admin mode | Preview/testing studio implemented | Protected scenarios, growth controls, Undo and visitor checks. Production moderation, report queue and search still pending |
| Local testing environment | Implemented | Same source, compiled production build, isolated database and automatic rebuilds at port 3001; ordinary hot reload at port 3000 |
| Continuously updated test environment | Partial | Local compiled preview rebuilds automatically. A separate private remote preview supports phone testing. Automatic CI checks and remote deployment per push remain pending |
| Seasons | Implemented locally | Four palettes; Waterloo calendar default or saved manual choice; at most 18 ambient points. Physical-device review remains |
| Day/night interaction | Implemented locally | Saved day/night switch, soft lighting transition, warm windows and eight small night glows |
| Additional Easter eggs | Implemented locally | A short pond ripple and goose response; keyboard/touch controls; static responses with motion disabled |
| Live multiplayer presence | Not implemented | Comments refresh periodically; no live cursors, presence, typing indicators or real-time shared events |
| Persistent contributor profiles | Deferred | Explicit identity/ownership model before grouping contributions across submissions |

## What “test mode” means

The test environment must run the same application code, dependencies, schema migrations and build process as production. It is a separate deployment/environment, not a second implementation or a simplified demo.

- Establish a baseline from the exact production revision, then apply development changes to that same codebase.
- Run each candidate revision in test before releasing that exact revision to production. Test naturally differs from the currently live revision while a change is under review.
- Keep database contents, storage, credentials and administrative access isolated. Production data must never be reset or written by test tools. Use synthetic fixtures in test only.
- Refresh the preview after development updates; run build and automated API checks on each push/PR. Browser smoke tests cover submission, tags, filtering, direct links, replies and garden rendering. “Continuous” means repeated validation of each revision, not endlessly generating submissions.
- Display the tested revision and last check result in test-only operator tooling. Mark preview pages as test and exclude them from indexing.
- Promotion to production remains explicit. A passing preview is not permission to deploy.
- The ordinary localhost server hot reloads local edits; the new preview typechecks and rebuilds those edits into a separate compiled runtime. Run checks is deliberate. Neither environment automatically fetches GitHub/cloud commits or deploys remote changes. See [Preview admin](PREVIEW-ADMIN.md).

## Release blockers and polish still needed

1. **Private moderation:** reporting exists but there is no operator interface to act on reports. Resolve this before releasing public replies.
2. **Reply reliability:** the API accepts retry keys, but the current composer generates a new key on every submission attempt. A lost response followed by retry can duplicate a reply. Keep the key with the unchanged draft. Drafts also need per-idea persistence.
3. **Anonymous means no byline:** remove the reply author's fallback name. Keep reply-to context understandable without assigning a pseudonym.
4. **Physical-device profiling:** flower petals and centres now use two instanced draws across all 24 trees; branch additions use two more. Maximum decorations and 48px targets have been checked in the desktop browser at phone width. Measure sustained frame times and memory on an older iPhone and a midrange Android before claiming the mobile performance budget is met. See [Garden implementation](GARDEN-IMPLEMENTATION.md).
5. **Motion review:** pause/offscreen suspension, like/undo and grove controls have local browser coverage. Finish physical touch-device checks and OS-level reduced-motion QA; failed likes retain the existing rollback path.
6. **Reading stability:** incoming comments should offer “New replies” without moving the reader or losing unfinished text. Validate pagination and long threads.
7. **Test automation:** isolated compiled previews, setup/cleanup and guarded admin integration checks are implemented. Repeatable CI and automatic remote candidate updates remain pending.

## Delight backlog

These ideas remain part of the product roadmap; they are scheduled after reliable participation and moderation, not discarded.

- **Seasons:** implemented with palette changes and capped particles. More detailed leaf shapes remain optional.
- **Day/night:** implemented with saved preferences, readable controls, warm windows and small soft glows.
- **Easter eggs:** pond and goose interactions are implemented. A rare butterfly is implemented locally: three eligible pond taps invite one five-second visit per page session.
- **Interaction polish:** implemented locally: a 180ms detail transition, shuffle-control feedback with stable loading cards, and visible-once highlights for a new idea and its tree.
- **Shared presence:** explore later, with opt-in identity and bounded network/rendering costs. Do not show fake participant counts or pretend simulated visitors are real.

All effects should be optional, brief, capped, and compatible with pause/reduced-motion controls. Keep the suggestion box usable without WebGL; no new heavy physics engine is required by these concepts.

## Next order

1. Finish the compact sorting/tag controls (this pass).
2. Implement private administration and fix reply reliability/anonymity.
3. Establish the identical-code test workflow and mobile performance checks.
4. Review the implemented garden changes on physical mobile devices; keep any further decorative effects within the measured budget.
5. Review an exact candidate revision before any production promotion.
