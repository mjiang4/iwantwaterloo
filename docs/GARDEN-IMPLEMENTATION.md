> Historical planning document. For current code and outstanding work, see [Architecture](ARCHITECTURE.md) and [Issues](ISSUES.md).

# Garden changes — local development

September 13, 2026. Branch: `codex/review-and-enhance-website-features`. Unpublished.

## Behaviour

- New ideas start as saplings. Height grows on a logarithmic curve to 1.5× the starting size at 25 likes; foliage fills out gradually. Flower milestones are 1–3, 5, 8 and 12. One branch appears at 10 likes and two at 25. Undo reduces growth; counts above 25 allocate no extra decoration.
- Tree shape, colour variation and flower positions use a stable idea-ID seed. Existing trees load at their saved growth. The just-submitted tree receives one brief planting transition when first viewed; it is consumed in application state, so changing tabs does not replay it.
- Trunks/canopies can be tapped directly. Separate 48px markers stay the same size at every growth stage and zoom. Overlapping markers combine into a compact picker containing every represented idea. Keyboard users can open the same markers and picker.
- Five icon controls: zoom in/out, reset, motion and day/night. Trees and ground stay green; previously saved season preferences are ignored.
- Night uses cooler ambient lighting, warm windows and eight small shader-based glows. The eight night glows share one draw; there are no seasonal particles. This is a local glow shader, not a full-screen bloom/composer pass.
- The pond has a roughly 850ms ripple; the goose has a roughly 600ms response. One shared event slot prevents event accumulation. No audio or perpetual interaction timers.
- Device reduced-motion settings disable animation. The pause control settles growth/lighting and stops ambient movement; pond/goose interactions retain static feedback. The canvas uses demand rendering while paused and suspends offscreen or in a hidden document. The main idea list/composer remains available without WebGL.

## Rendering

The existing React Three Fiber / Three.js / Drei stack is retained. No new dependency was added.

- Trees, canopies, branches, branch leaves, petals and flower centres use six instanced meshes for a grove of 24 ideas. Petal colours share one material through instance colours. Flowers have one shared flat, six-lobed geometry and cast no shadows.
- Only canopy transforms update continuously. Flower and branch buffers update during growth, undo, planting , then remain unchanged.
- Repeated meadow details, bridge planks and windows are also instanced.
- Pixel ratio is capped at 1.5; shadows use a 512px map. Drei's performance monitor switches to pixel ratio 1, no dynamic shadows, no particles and a stationary tram when sustained performance falls below the configured threshold. It retains all trees, counts and interaction controls.
- Development builds expose local counters in `canvas.dataset.renderStats` for frame activity, draw calls, triangles and instance counts. No network telemetry is sent. This diagnostic component is omitted from production builds.

## Validation

- TypeScript, production build, focused lint and four geometry/interaction unit tests.
- Existing public API, discussion API and ordering integration suites against the isolated localhost database.
- Browser checks at 390px and 1280px: seasonal/day-night controls, full grove, nearby picker, opening details, liking/undo, fixed 48px targets, pause and offscreen suspension. A fresh local submission opened its own tree; its first like added exactly one flower and centre in the renderer counters. All temporary fixtures were then removed.
- A 24-tree grove at maximum decoration contained 288 petals, 288 centres, 48 branches and 48 branch crowns. The full scene measured 134 steady draw calls / 35,386 triangles at night on this desktop browser; a running ripple added one draw. The 24-sapling baseline measured 130 draw calls / 21,082 triangles. Full decoration adds four draws. These counts include scenery and shadow passes, not just the forest.
- Paused frame counters stayed unchanged between observations. A garden below the viewport reported suspended rendering and resumed on return.

These are local browser checks, not a physical-phone benchmark. Sustained frame time, memory, battery use and OS-level reduced-motion testing on older iPhone and midrange Android hardware remain release checks. Existing moderation and reply-reliability blockers remain in [Remaining work](REMAINING-WORK.md).

Visual fixtures are temporary and local only. Do not seed, reset or deploy production as part of garden testing.

## Optional polish — September 13 development pass

- Idea details fade and move only 8px over 180ms. Content stays mounted through closing, then keyboard focus returns to the opener. Phone panels use the same transition from below.
- Reshuffle animates only its small icon for 320ms. Previous cards remain while the next random order loads; ordinary cards no longer animate as a whole grid. A short screen-reader status reports success or failure.
- The newly submitted idea receives one border highlight when first visible. Its tree marker receives a brief ring and “Your tree” cue, including clustered markers. Cues last 2.4 seconds, survive marker regrouping, and do not replay when switching tabs. The tree's 48px hit area stays unchanged. HTML portal attachment is handled with a callback ref.
- Three pond taps invite one five-second butterfly per page session. It uses two instanced wings and one small body: two draws only while visible, no shadows, lights, textures or pointer interception. A single visit record persists across garden tab changes. Night, paused motion, hidden/offscreen rendering and reduced quality suppress or cancel it. No recurring timer or per-frame React state updates were added.
- Reduced-motion CSS removes detail movement and shuffle/ring animation; new contributions retain a static cue. The scene's existing device preference gate suppresses butterfly motion.

Validation: compiled production preview; TypeScript; focused lint on new motion/highlight modules; seven growth/target/discovery tests. Browser checks cover the 390px layout, stable 48px targets, visible planting cue, no replay after returning to a tab, random-order changes with existing cards retained, pause and error logs. Device-level reduced-motion settings and sustained physical-phone performance still need hardware QA.

## Evergreen growth and direct preview

Supersedes the original growth milestones: height starts at 0.78 and approaches 2.13 smoothly. Every additional finite integer like increases height beyond the former 25-like limit; flowers and branches remain bounded at 12 and 2. The first like adds over 40% height. Each observed increase also produces an 850ms stretch, up to 18%, then settles at the new size. Undo and failed saves restore size without a positive pulse; reduced motion snaps directly to the final size. Six instanced batches are retained.

Both list and garden query caches update optimistically and roll back together on failure. Select a tree to show one compact title/like row below the scene; liking there keeps the tree visible. The title opens full details. Tree and cluster targets remain 48px; like and dismiss controls are at least 44px.

The preview dashboard is removed. Preview runs the working copy's real application with separate runtime resources. See [Development preview](PREVIEW-ADMIN.md).

## Visible submission and like feedback

- Successful submissions now open the garden automatically. Likes from cards or details also reveal their tree after the server accepts the like; failed saves do not trigger a celebration. Detail panels close before the garden scrolls into view.
- One transient event selects the correct grove and frames that tree at 2.4× the overview zoom. The planting/growth clock waits for camera framing and at least 75% of the canvas to be visible. Hidden tabs suspend rendering.
- Planting rises to 124% of the saved size in the first 350ms, then settles over the remaining second. Likes stretch up to 134%, then settle at their new persistent size. One expanding ground ring accompanies the moment; existing instanced tree meshes are reused. No particle burst, full-screen bloom, new dependency or per-frame React state is involved.
- Other markers hide during the moment. Single-tree markers are small dots with unchanged 48px hit areas; groups show a stacked icon and count. Marker placement follows actual canopy height. The planted tree retains a short “Your tree” cue afterward.
- Pond overlay buttons are removed. Clicking the water or goose itself still triggers their subtle reactions. Day/night and the butterfly remain.
- Paused/reduced motion frames the tree without animated camera movement and applies its saved size immediately. Preview and production remain isolated.

The focused view shows only the selected tree and hides tall buildings, so another tree or building cannot obscure its growth. The Garden control returns to the full grove. This reduces work while close up and uses the same instance batches. A frame is explicitly requested when camera framing becomes ready, including demand-rendered paused mode.
