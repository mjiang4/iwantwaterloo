# I want / Waterloo — interaction plan

Status: proposal only · September 13, 2026

No features in this document have been implemented. The live site remains unchanged. `main` holds the current production source plus the existing GitHub license; `dev` adds this plan. Future implementation stays on development branches until explicitly approved for release.

## Direction

Make sharing an idea feel easy and rewarding. The garden makes participation visible, but writing, reading and responding must work just as well without opening it. Keep the quiet palette, generous space and light motion. Use short labels and reveal detail only when requested.

React Three Fiber is the React renderer for Three.js. We describe a tree as React components; Three.js draws its geometry and materials through WebGL. Our current motion uses small spring calculations and timed movement, rather than a full physics engine. UI feedback uses CSS transitions and keyframes. Keep that approach unless measured limitations justify more machinery.

## Proposed experience

### 1. Likes grow flowers

One idea remains one tree. Likes add small flowers around its base, then a little more foliage. New ideas begin with a complete, attractive tree; zero likes must not look like failure.

Proposed milestones, to tune in a prototype:

| Likes | Appearance |
| --- | --- |
| 0 | Base tree |
| 1–3 | 1–3 small blooms |
| 4–9 | 5 blooms |
| 10–24 | 8 blooms and one small leafy branch |
| 25+ | 12 blooms and two small leafy branches |

These are capped visual stages, not one mesh per like forever. All trees retain a comparable height and footprint. The exact like count stays in the idea detail. Keep New and Random easy to reach so popularity does not monopolize attention.

On a successful like, animate only newly added growth, once, for roughly 350–500 ms. Existing growth stays still. Update the heart immediately; if saving fails, restore its state and show a short retry message. Undoing a like removes excess growth gently, without a celebratory animation. Reloads and background refreshes must not replay every tree's growth.

Flower arrangement and colour come from a stable idea-ID seed. No scattering changes on refresh. Keep three or four muted colours and leave clear space around the tree marker. Likes represent browser-based support, not verified people or votes.

### 2. Planting feedback

Keep the composer as the primary interaction. After saving, show a tiny sprout settling into place next to the confirmation and offer “See your tree”. Do not force a camera journey or load the 3D garden just to confirm submission.

When the visitor chooses to view the tree, reveal its stable position with a brief, restrained growth animation. No confetti, full-screen effects or sound by default. Reduced-motion mode shows the completed tree immediately.

### 3. Optional names

Add “Your name · optional” under Details. Blank means no byline, avatar, anonymous badge or empty placeholder. Named submissions show a small clickable byline inside the idea detail, keeping list cards quiet.

Recommended first scope: clicking the byline opens a compact author card for that submission. It contains the chosen name and this contribution. Names are self-entered, not verified identities. Do not group separate people just because they type the same name. Do not expose visitor identifiers or connect previously unnamed submissions to a later public name.

A persistent contributor page with multiple ideas needs a deliberate identity and ownership design. Defer it with account management. Open decision: should a first author card offer an optional website, or remain name-only? Default to name-only. If links are added later, validate protocols and never render arbitrary HTML.

Implementation outline: nullable display-name field on ideas and replies; trim and cap at 60 characters; plain-text rendering. Public copy beside the optional field: “Shown publicly.” Do not require email or sign-in.

### 4. Replies and shared participation

Start with asynchronous collaboration: open an idea, read a short discussion, and choose “Add to this idea”. Example:

> We should have more housing.
>
> Could we allow more family-sized apartments near transit?
>
> Especially around universities, with space for families too.

Support comments and replies to comments. Keep visual indentation to one level on mobile; deeper responses use “Replying to…” in the same thread. Load the first 20 comments, with more on demand. Show comment counts in idea details; no discussion bubbles floating around the whole garden.

A reply does not plant a separate tree or automatically count as a like. This keeps the visual meaning clear: ideas are trees, support adds flowers, discussion develops the suggestion. Names remain optional under the same rules.

“Multiplayer” first means everyone sees saved contributions. Use the existing query-refresh approach, only while the relevant view is visible. Announce “New replies” without moving the reader or discarding their draft. Defer live cursors, typing indicators, presence and WebSockets until there is a demonstrated need.

Before public release: include a report action, server-side rate limits, input limits, retry-safe submission IDs, pagination and a private way for the operator to hide abusive content. Do not ship a public administration endpoint. If private moderation is not ready, keep replies on the development branch.

Data outline: comments reference an idea and optionally a parent comment, with body, optional display name, timestamp, moderation state and private ownership/submission identifiers. Validate that parent and child belong to the same idea. Public responses exclude private identifiers; hidden content must be excluded consistently from lists and counts.

### 5. Header

Change the wordmark to “i want / waterloo”. Keep it a small home link, with no extra subtitle. Test it at narrow phone widths and avoid repeating the same phrase immediately in the composer heading. Accessible name: “I want Waterloo”.

## Other small improvements worth exploring

| Idea | Benefit | Constraint |
| --- | --- | --- |
| Share an individual idea | Makes it easy to invite a response | Copy a stable link; no account required |
| Gentle card-to-detail transition | Helps visitors retain their place | Short opacity/position change; no layout jump |
| A small shuffle motion | Makes Random feel intentional | Animate the control, not the entire grid |
| Return to your newly shared idea | Gives a clear sense of completion | Highlight once; never hijack scrolling |
| Subtle tree variation | Gives each contribution a recognizable form | A few shared low-poly shapes, deterministically chosen |

Prioritize planting feedback and individual links. Defer seasonal effects, particles and extra scenery: they add less value to suggesting ideas.

## Mobile performance plan

These are proposed acceptance budgets, not measurements of the current site.

- Keep 24 trees per grove and cap each at 12 blooms and two branch additions. Paginate the data as well as the scene.
- Reuse geometries and materials. Batch repeated flowers with Three.js InstancedMesh; avoid separate React components, lights, shadows or HTML labels for every petal. Instancing reduces draw calls for repeated geometry/materials ([Three.js documentation](https://threejs.org/docs/pages/InstancedMesh.html)).
- Start with no more than four extra draw calls for all flower colours combined and two for branch additions per visible grove. Check actual renderer statistics; do not assume batching occurred.
- Allocate positions and instance buffers when data changes. No per-frame array creation or React state updates for individual flowers. Animate only active transitions, then stop updating them.
- Preserve lazy loading of the garden, pixel-ratio limits, reduced-motion support, a visible pause control and suspension when hidden/offscreen. Demand-render whenever motion is paused. Keep flowers static between interactions.
- Use the existing spring approach; add no physics or animation dependency for this scope. No real-time flower shadows or postprocessing. Make a low-detail fallback available without changing idea counts or functions.
- Test 24 maximally decorated trees on an older iPhone and a midrange Android device: target sustained 30 fps or better during navigation, with smooth input and scrolling. Compare p95 frame time, draw calls and memory with the undecorated baseline. Investigate sustained frame-time regression above 10%.
- Repeatedly switch groves and open/close details to check that GPU resources and listeners are released. Verify the main composer remains usable while the 3D bundle loads or fails.

## Suggested implementation order

1. Header, optional names and individual idea links.
2. Planting feedback and capped flower/branch growth; measure on mobile before adding polish.
3. Comments, nested reply behaviour and reporting, with private moderation ready before release.
4. Reassess real-time collaboration after observing actual participation.

For each stage, review a development preview first. Check keyboard and touch interaction, reduced motion, submission failures, retry behaviour, stable tree positions and privacy of unnamed contributions. Keep current New / Most liked / Random modes. Do not reset existing ideas or deploy automatically as part of this plan.
