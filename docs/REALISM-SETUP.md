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

## What still needs live verification

**A real key has not been configured in this checkout.** Automated integration
tests use original synthetic geometry and intercepted requests, not Google
imagery. They verify the rendering integration, not Waterloo's photographic
appearance or performance on physical phones.

Google lists Canada as covered, but detailed Waterloo Park coverage has not
been verified. With an authorized key, check Silver Lake, Perimeter Institute,
the railway corridor and surrounding buildings at close range. If detailed
terrain cannot load, the app returns to light mode. Image quality and capture
age depend on the available data; this is not guaranteed to match every Google
Earth view.

The reference height is approximately **300 metres above the WGS84 ellipsoid**,
not mean sea level. Verify the camera's height and the independently mapped
landmark labels against the live tiles; adjust this one reference value if
necessary. Idea markers sample the visible surface only for their current
rendering positions. No sampled heights are stored or exported.

The photographed scene has captured lighting and stationary objects. Real-time
sun/night previews and the simulated moving ION remain features of the modeled
park. Likes animate a separate idea marker in Realism; they cannot change trees
inside a photograph.

## Performance and data handling

- The tile renderer is lazy loaded only after opt-in; no tiles are bundled,
  prefetched, exported, placed in service-worker storage, or saved to a database.
- Mobile budgets: 4 concurrent downloads per origin, 2 decode jobs, 2 Draco
  workers, 128 MiB target tile cache, screen-space error target 18. Desktop uses
  8 downloads, 256 MiB and error target 8. Cache limits are eviction targets,
  not a hard ceiling on total browser/GPU memory.
- DPR remains capped at 1.5. A settled photographic view renders on demand.
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
