# Waterloo Park model

The park boundary, paths, waterways, and building footprints come from OpenStreetMap. Blender creates a compact landscape for the browser; React Three Fiber adds idea trees and interactions.

- `osm.json`: original Overpass extract, timestamp retained in `osm3s`.
- `map.json`: derived coordinates, landmarks, and 24 stable idea plots.
- `waterloo-park.blend`: editable Blender scene.
- `../../public/park/waterloo-park.glb`: exported browser model, under 2 MB.
- `../../scripts/park/build_landscape.py`: reproducible generator, tested in Blender 5.2.1 LTS. Its geometry is deterministic and needs no Python dependencies beyond Blender.

From the repository root, with Blender installed:

```sh
blender --background --python scripts/park/build_landscape.py
npx oxfmt assets/park/map.json
```

Generation can take several minutes. Commit the script, source model, metadata, and exported asset together. The landscape contains no decorative trees: only submitted ideas create trees. Stable idea plots survive asset regeneration. Untagged building heights and surfaces are approximations, and there is no surveyed elevation. The result is a stylized geographic model, not a photogrammetric reconstruction.

The glTF batches static objects into 8 material groups. New likes modify the separate instanced idea trees; they never rebuild this asset. The shipped asset budget and lake normals are checked by `tests/park.mjs`.

## Data credit

© [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). OSM and the derived geographic data here are available under the [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/). Retain attribution in the interface and retain this source notice when distributing the model or data.

Park boundary: [way 216873421](https://www.openstreetmap.org/way/216873421).

Overpass extraction: ways with highway, natural, waterway, building, leisure, or railway tags in bounding box `43.463,-80.542,43.471,-80.523`, with full geometry. This includes context outside the boundary; the generator restricts the rendered model to the park area.

## Optional detail and landmarks

Run the detail generator after the base generator:

```sh
blender --background --python scripts/park/build_detail.py
npx oxfmt assets/park/map.json assets/park/landmarks.json
```

It replaces the base model's generic Perimeter extrusion, exports `perimeter.glb` and `ion-track.glb`, and creates `waterloo-park-detail.glb` plus the editable `waterloo-park-detail.blend`. `landmarks.json` contains the shared train route, landmark coordinates and measured download size. The original base `.blend` remains an input to this second step. The compressed browser model is under 1 MB; Blender's source file is larger and is never downloaded by the site.

Light mode downloads under 1 MB of landscape/landmark models. The detailed model uses Draco compression, at most 32 static material batches and fewer than 550,000 triangles. The decoder is hosted locally in `public/draco`; neither it nor the detailed model is requested until the visitor confirms the warning. High fidelity adds nearby mapped building volumes, estimated glazing, path furniture, procedural grass and a 256-pixel planar reflection. Shadows increase from 1024 to 2048; DPR remains capped at 1.5. These are bounded rendering costs, not a frame-rate guarantee.

Perimeter uses [OSM way 240741299](https://www.openstreetmap.org/way/240741299), with charcoal paneling and irregular glazing informed by the [original architects' project](https://saucierperrotte.com/en/projects/institut-perimeter-pour-la-physique-theorique/). Its height, facade details and interior courtyards are an observational approximation. Nearby buildings have mapped footprints; heights without source tags and window placement are estimates. Mapped pedestrian areas are filled surfaces, including the Silver Lake plaza and boardwalks. This is a geographic reconstruction, not a photographic scan or a survey of the current park.

The five-module ION illustration follows the mapped rail centreline in `landmarks.json`. It moves at an illustrative steady speed and pauses with the atmosphere. It does not show vehicle locations, schedules or a live transit feed. Rail and boardwalk reference: [Grand River Transit](https://www.grt.ca/about-grt/plans-and-projects/active-transportation-projects/). Waterfront lighting reference: [BEGA's Waterloo Park project](https://www.bega-us.com/projects/waterloo-park). Reference photos were inspected but are not redistributed.

Changing display quality keeps the same idea data and selected tree. Download/decoding failure leaves Light usable and retryable; graphics-context loss falls back to a new Light renderer. The loader caches downloaded geometry for the session so repeat switches avoid another download. Rendering pauses in a hidden tab and honors reduced-motion preferences in both modes.
