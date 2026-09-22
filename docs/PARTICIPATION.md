# Developing ideas together

Implemented on `codex/waterloo-park` for the isolated development preview. Production promotion is a separate decision.

## Visitor flow

- Post an idea with an optional byline. “Ask people a question” reveals one optional field; otherwise a useful default is supplied.
- An idea’s question appears in its tree card, permanent page, and link preview. Share uses the title, question, and “Help shape this idea.”
- Add a detail, place, concern, or offer of help. No account or attribution is required. Reply drafts and retry keys survive closing the panel.
- The originating browser can develop its idea, explain what changed, and include up to ten other people’s contributions. Their text and optional bylines appear with the update.
- The original and every revision remain readable under “What changed.” Flowers mark revisions, credited contributions, and organizer responses; likes still grow the tree.
- “Find an idea” and “Next idea” interleave fresh ideas, existing conversations, and developing proposals across groves. Filter offers Discover, New, Needs input, Taking shape, Most liked, and Random.

## Organizer rhythm

Open `/organizer` (`/admin` redirects there in preview). Hosted preview uses the existing Sites owner check; local preview accepts the existing operator key. There is no new password or public administrator role.

Review three ideas each week: choose an unreviewed idea or an overdue follow-up, read its contributions, and publish a concrete response. The desk counts distinct ideas reviewed in the preceding seven days. This is a private workflow target, not an automatic promise to visitors. No responses, notifications, or endorsements are generated automatically.

Responses appear on each idea and at `/updates`, explicitly marked as community-organizer responses rather than city decisions. Status choices are reviewed, looking for help, trying it out, and what we learned. These record what the organizer actually reports.

The desk reports ideas receiving outside input, author-credited contributions, developed ideas, authors returning after a day, and contributions made through shared links. Browser counts are not unique people. Credit is an observable acknowledgment, not an automated quality score. Shared-link attribution describes the URL used to contribute, not a causal conversion estimate; no browsing history or per-view analytics is stored.

## Code and data

- `lib/participation.ts`: shared question, contribution kinds, status labels, and bounded flower rules.
- `server/participation.ts`: validated append-only revisions and public activity projection.
- `server/idea-records.ts`: the current proposal, ownership flag, and progress counts for every surface.
- `features/ideas/idea-participation.tsx`: author update form and participation composition.
- `features/ideas/idea-activity.tsx`: original proposal, snapshots, and contributor credit.
- `features/organizer/desk.tsx`: protected review queue and aggregate metrics.

D1 remains the only database. `ideas` retains the immutable original and initial question. `idea_updates` stores full proposal snapshots, the change note, and credited comment IDs. `organizer_reviews` stores actual responses. Replies remain in `comments`, with a contribution kind and a coarse source (`garden` or `share`).

An update is one conditional SQL insert. A unique `(idea_id, version)` constraint and an expected version prevent concurrent overwrites. Submission keys make unchanged retries idempotent. Credit is checked in that same statement: comments must be visible, on this idea, and from another browser. Hidden comments are excluded from history credit and flower counts. Visitor IDs and retry keys never appear in public responses.

The new migration is `0006_participation`. Index 0005 is reserved for the development Site’s already-applied identity migration. Staging preserves that migration unchanged and merges the ordered journal. Do not rename or replace applied migrations. Preview scenario/undo snapshots include the new data and remain compatible with older snapshots.

Flowers use the existing six instanced draw batches, with at most 12 flowers per tree and 24 trees per grove. No rendering library or continuous animation was added. Photographic mode preserves Google imagery rather than modifying its real trees; progress remains visible in idea details.

## Validation and limits

`npm run check` includes actual D1 tests for author isolation, concurrent updates, response-loss retries, credit validation/moderation, organizer authorization, preview undo, and mixed discovery. `node tests/e2e/participation.mjs` tests the full flow in desktop Chromium and mobile WebKit using a disposable preview database. `npm run test:browser` also runs existing garden, motion, and realism regression checks.

Author ownership is tied to the original browser cookie. Clearing it or switching devices loses editing access; cross-device account/recovery is not implemented. Organizer endpoints deliberately fail closed outside the isolated preview. Production organizer authorization must be configured and tested before promoting this feature.

## Later, after observing use

- Opt-in follow notifications and secure cross-device author recovery.
- A short usability session: can a first-time visitor discover a relevant question, answer it, and find their contribution afterward?
- Better exposure measurement only if the current coarse counts prove insufficient.
- A reviewed contribution becoming a small real-world trial, with a published outcome.
