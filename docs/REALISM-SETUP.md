# Photographic realism (experimental)

Realism streams Google's Photorealistic 3D Tiles into the existing Three.js scene.
It is an optional view, with the same ideas, likes and submission flow. The light
park remains the default. No production deployment is part of this experiment.

## Connect the imagery

1. In [Google Cloud Console](https://console.cloud.google.com/), choose a project
   with billing enabled and enable **Map Tiles API**.
2. Create an API key. Restrict it to **Websites** and **Map Tiles API**. For this
   local preview, allow `http://localhost:3002/*` and `http://127.0.0.1:3002/*`.
   Set suitable API quotas in the project. Add any remote preview domain only
   when you intend to enable imagery there.
3. Set these values in the ignored `.env.local` file at the repository root:

   ```dotenv
   VITE_GOOGLE_MAPS_BROWSER_KEY=your_restricted_browser_key
   VITE_GOOGLE_MAPS_ELEVATION=300
   ```

4. Run `WATERLOO_PREVIEW_PORT=3002 npm run preview`. The running preview also
   rebuilds when `.env.local` changes. Visit `http://localhost:3002`, select
   **Realism**, then **Enter realism**.

This key is intentionally public browser configuration. Vite writes only the
Maps key and reference elevation to `park-provider.json`. Do not put an admin
credential or unrestricted server key here, and do not commit `.env.local`.
For an ordinary `npm run build`, changing this file requires a fresh build.

[Google's authentication instructions](https://developers.google.com/maps/documentation/tile/get-api-key)
and [usage guidance](https://developers.google.com/maps/documentation/tile/usage-and-billing)
cover project setup and service costs. Nothing contacts Google until someone
explicitly enables Realism.

## Hosted development preview

The existing Waterloo Development Preview has its own Site and database. Configure
`VITE_GOOGLE_MAPS_BROWSER_KEY` in that Site's runtime environment settings, then
redeploy. The `/api/park-provider` endpoint exposes only this intentionally public
browser key and the reference elevation. Other environment values remain private.
Hosted settings take precedence over the local build's fallback configuration.

In Google Cloud, allow this website referrer for the preview key:

```text
https://waterloo-development-preview.helloimjerry.chatgpt.site/*
```

Do not add production referrers until choosing to release Realism publicly. Do not
copy `.env.local` into the staged Site source or commit it.

## What still needs live verification

Automated integration
tests use original synthetic geometry and intercepted requests, not Google
imagery. They verify the rendering integration, not Waterloo's photographic
appearance or performance on physical phones.

Waterloo Park imagery is available, but capture freshness and sharpness vary.
Check Silver Lake, Perimeter Institute and the railway corridor at close range. If detailed
terrain cannot load, the app returns to light mode. Image quality and capture
age depend on the available data; this is not guaranteed to match every Google
Earth view.

The reference height is approximately **300 metres above the WGS84 ellipsoid**,
not mean sea level. Verify the camera's height and the independently mapped
landmark labels against the live tiles; adjust this one reference value if
necessary. Community trees sample the visible surface only for their current
rendering positions. No sampled heights are stored or exported.

The photographed scene has captured lighting and stationary objects. Real-time
sun/night previews and the simulated moving ION remain features of the modeled
park. Submissions and likes animate the same six instanced tree batches in every mode;
Realism offsets trees, flowers and touch targets to the streamed surface.
Photographed trees remain part of the background imagery and cannot become
individual editable trees. The modeled park starts with **zero decorative trees**.

## Park boundary and waterfront

`features/park/bounds.json` bounds the park plus roughly 60 metres of immediate
context, including Perimeter and the ION corridor. `ParkExtentPlugin` rejects
out-of-area tile branches while retaining intersecting ancestors. Four material
clipping planes trim boundary-spanning tiles. Inside the boundary, the camera
still controls refinement; the plugin does not prefetch the entire rectangle.
Sibling loading and ancestor fallback are disabled together: the latter otherwise
forces sibling downloads in this renderer version. Fast pans may briefly expose
unloaded tiles; the lightweight park remains visible during initial loading.
Camera travel and zoom are bounded separately.

The photographic waterfront appears to predate the redevelopment. The city’s
[2022 capital report](https://www.waterloo.ca/media/x2npn4nh/capital-report-2022.pdf)
records the new boardwalks and a December 2022 north-shore opening, with final
landscaping in spring 2023. The September 2026 OSM extract already contains the
new pedestrian areas. Blender now fills these plaza/boardwalk polygons instead
of drawing their boundaries as narrow paths. This corrects the **modeled** park;
it does not change Google's capture. Do not claim photographic paths are current.

Existing idea plots are retained verbatim when regenerating assets. Landscape
changes do not reseed ideas or change their stored spatial slots.

## Performance and data handling

- The tile renderer is lazy loaded only after opt-in; no tiles are bundled,
  prefetched, exported, placed in service-worker storage, or saved to a database.
- Mobile budgets: 4 concurrent downloads per origin, 2 decode jobs, 2 Draco
  workers, 128 MiB target tile cache. Desktop uses 8 downloads and 256 MiB.
  Start at screen-space error 32, then refine to 12, 6 and (desktop) 3 when
  pending work settles and the cache is below 72% of its byte budget. Cache limits are eviction targets,
  not a hard ceiling on total browser/GPU memory. Metadata/mesh entry caps are
  2,048 mobile and 4,096 desktop: Google may require hundreds of tiny JSON
  tilesets before reaching a mesh, so a 256-entry cap can block loading entirely.
- Texture anisotropy is capped at 4× on mobile and 8× on desktop (or hardware limits).
- DPR is capped at 1.5 on mobile, 2 on desktop in Realism, and 1 on limited GPUs.
  A settled photographic view renders on demand.
  Controls and short feedback animations request frames. Hidden tabs stop tile
  updates; switching to light mode disposes the tile renderer and its decoder.
- Google Maps attribution stays visible. **Data sources** displays the full
  attribution of the visible tiles and separately credits community overlays.
  Google's terms/privacy are linked there and in the site's privacy dialog.

Relevant files: `features/park/realism/`, `features/park/quality-picker.tsx`,
`components/garden-scene.tsx`, `vite.config.ts`. Tests:
`tests/realism.mjs`, `tests/e2e/realism.mjs` and the original synthetic fixture
in `tests/helpers/photographic-fixture.mjs`.

References: [3D Tiles overview](https://developers.google.com/maps/documentation/tile/3d-tiles-overview),
[coverage](https://developers.google.com/maps/coverage),
[renderer guidance](https://developers.google.com/maps/documentation/tile/use-renderer),
[attribution and usage policies](https://developers.google.com/maps/documentation/tile/policies),
[3D Tiles Renderer](https://github.com/NASA-AMMOS/3DTilesRendererJS).
