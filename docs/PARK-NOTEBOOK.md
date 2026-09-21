# Waterloo Park experiment

Branch: `codex/waterloo-park`. Development only. The public site remains the approved September 20 release.

## Direction

An open, full-screen park is the primary interface. Arrive above Silver Lake, explore trees with concise idea previews, open a conversation, and plant an idea. Keep recognizable geography, natural sunlight, water and foliage. Atmosphere serves discovery; it must not obscure suggestions.

## Decisions

- Model mapped Waterloo Park geometry from OpenStreetMap; cite and retain ODbL attribution. Heights and vegetation are artistic approximations, not a survey or live weather feed.
- Build static geometry with Blender and export glTF. Instance repeated trees and plants; no physics or full-screen bloom pipeline.
- Follow actual solar position at Waterloo coordinates and America/Toronto time. Offer day/night previews with an obvious return to live time.
- Keep ideas readable in a list and on keyboard-accessible tree targets. Decorative trees never pretend to represent ideas.
- Use at most three brief, dismissible discovery cues. Never gate participation with the tour.
- Preserve anonymous participation, optional About you, server persistence and retry-safe writes.
- Seed preview only after design is working, using paraphrased ideas supported by both Granola notes and transcripts. Keep raw source material and provenance in ignored local work files; do not publish private meeting text.

## Open design notes

- [ ] Compare soft cluster previews with a long list of labels in dense groves.
- [ ] Topic grouping should help browsing without requiring authors to tag ideas. Make any inference legible and reversible.
- [ ] Celebrate opening contribution guidance immediately; distinguish that from a verified accepted GitHub contribution. Do not pretend a click is a merged PR.
- [ ] Reward useful participation with a small ripple or light trail, not points or competitive scores.
- [ ] Review the real park model with someone who knows the recent Silver Lake works.
- [ ] Test physical phones and screen readers before considering release.

## References

- https://www.waterloo.ca/parks-and-trails/waterloo-park/
- https://www.openstreetmap.org/way/216873421
- https://www.openstreetmap.org/copyright
- https://github.com/mourner/suncalc
- https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html

## Implemented in this experiment

- Blender model from the mapped park, including Silver Lake, trails, railway corridor and landmark footprints.
- SunCalc solar direction, Waterloo local time, twilight, star field, water highlights, two geese and a small night firefly effect. Stars and the moon are decorative; this is not an astronomical sky map or live weather simulation.
- Full-screen park, a three-step dismissible introduction, optional theme picker, clustered touch targets, and the existing list, search, sort and discussions.
- Camera focus and bounded spring growth for planting/likes. Reduced motion skips movement; the user can pause atmosphere. Rendering stops in a hidden tab and pauses behind idea discussions.
- Contribution guidance with issue/PR links and a brief colour cascade. This acknowledges opening contribution links; verification of actual merged contributions remains future work.
- Five attributed, transcript-supported drafts in this worktree's local preview database. Draft provenance is in ignored `work/park-seed-provenance.md`; no transcripts or personal meeting notes belong in Git.

## Running this branch

```sh
npm ci
WATERLOO_PREVIEW_PORT=3002 npm run preview
```

Open `http://localhost:3002`. This runner compiles the application, watches for changes, and uses its own local database and generated credentials in `.preview` / `.env.preview`. It does not call or reset the public site's database. Those files are ignored. Private draft seeds are intentionally not installed for other contributors.

## Performance and design constraints

The base glTF is about 1.78 MB. Static geometry has 12 material batches; the idea forest uses six instanced batches for at most 24 ideas per grove. DPR is capped at 1.5 (1 on low-capability contexts), shadow maps at 1024, atmosphere requests about 30 frames/second, and there is no physics or postprocessing bloom dependency. Shadows add rendering passes; these batch counts are not total frame draw calls or a measured phone frame rate.

Themes are simple, local keyword suggestions for the current grove. Titles take precedence over contextual details, original text is never altered, and “All ideas” clears the lens. This is not an AI classifier, a moderation rule, or a persistent categorization of people. More sophisticated grouping and contributor verification remain editable design questions.

Before release, test a physical older iPhone/Android, VoiceOver/TalkBack, a busy grove, and slow networks. Review the accuracy of landmark heights and park landscaping with a local resident. Browser emulation helps find layout and interaction problems but cannot establish real-device battery use or GPU performance.

## Verification

- TypeScript, lint, formatting, and all 19 unit/API tests pass.
- Compiled browser tests pass in desktop Chromium, mobile Chromium, and mobile WebKit, including posting, ownership, replies, lost-response retries, likes, sorting, and text enlargement.
- Touch exploration was inspected in portrait and landscape on both engines.
- Additional browser checks cover animated planting/like completion, theme selection, contribution guidance, and recovering from a failed glTF download.
- The previous pond-butterfly interaction is not part of this scene. Geese and fireflies currently provide ambient wildlife.

Run `npm run check` and `npm run test:browser`. Stop the preview watcher before running the browser build: both commands currently use `dist`. Restart the preview afterwards.
