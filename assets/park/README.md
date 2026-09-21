# Waterloo Park model

The park boundary, paths, waterways, and building footprints come from OpenStreetMap. Blender creates a compact landscape for the browser; React Three Fiber adds idea trees and interactions.

- `osm.json`: original Overpass extract, timestamp retained in `osm3s`.
- `map.json`: derived coordinates, landmarks, and 24 stable idea plots.
- `waterloo-park.blend`: editable Blender scene.
- `../../public/park/waterloo-park.glb`: exported browser model, under 2 MB.
- `../../scripts/park/build_landscape.py`: reproducible generator, tested in Blender 5.2.1 LTS. It uses a fixed random seed and no Python dependencies beyond Blender.

From the repository root, with Blender installed:

```sh
blender --background --python scripts/park/build_landscape.py
npx oxfmt assets/park/map.json
```

Generation can take several minutes. Commit the script, source model, metadata, and exported asset together. Generated vegetation is decorative; it is not a survey of individual trees. Untagged building heights and surfaces are approximations, and there is no surveyed elevation. The result is a stylized geographic model, not a photogrammetric reconstruction.

The glTF batches static objects into 12 material groups. New likes modify the separate instanced idea trees; they never rebuild this asset. The shipped asset budget and lake normals are checked by `tests/park.mjs`.

## Data credit

© [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). OSM and the derived geographic data here are available under the [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/). Retain attribution in the interface and retain this source notice when distributing the model or data.

Park boundary: [way 216873421](https://www.openstreetmap.org/way/216873421).

Overpass extraction: ways with highway, natural, waterway, building, leisure, or railway tags in bounding box `43.463,-80.542,43.471,-80.523`, with full geometry. This includes context outside the boundary; the generator restricts the rendered model to the park area.
