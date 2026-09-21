"""Build the Waterloo Park glTF from a checked-in OSM extract. Run with Blender.
Coordinates are real; foliage, building heights without tags, and surfaces are stylized.
"""

import json
import math
import random

import bpy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = json.loads((ROOT / "assets/park/osm.json").read_text())
random.seed(2461)
SCALE = 30
CENTER = (43.4672, -80.5325)


def xy(p):
    return (
        (p["lon"] - CENTER[1]) * 111320 * math.cos(math.radians(CENTER[0])) / SCALE,
        (p["lat"] - CENTER[0]) * 111320 / SCALE,
    )


def inside(p, poly):
    x, y = p
    yes = False
    for i, a in enumerate(poly):
        b = poly[i - 1]
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (
            b[1] - a[1]
        ) + a[0]:
            yes = not yes
    return yes


def distance(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    t = max(
        0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy or 1))
    )
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)


def mat(name, color, roughness=1):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get("Principled BSDF")
    bs.inputs["Base Color"].default_value = (*color, 1)
    bs.inputs["Roughness"].default_value = roughness
    return m


mats = {
    n: mat(n, c)
    for n, c in {
        "lawn": (0.27, 0.43, 0.22),
        "sand": (0.66, 0.61, 0.43),
        "path": (0.63, 0.61, 0.52),
        "wood": (0.30, 0.22, 0.13),
        "bark": (0.19, 0.14, 0.09),
        "water": (0.08, 0.30, 0.36),
        "roof": (0.24, 0.28, 0.26),
        "building": (0.66, 0.62, 0.52),
        "rail": (0.33, 0.35, 0.31),
        "leaf0": (0.16, 0.32, 0.15),
        "leaf1": (0.25, 0.40, 0.17),
        "leaf2": (0.31, 0.47, 0.23),
    }.items()
}


def mesh(name, verts, faces, material):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(mats[material])
    return ob


def upward(points):
    # OSM ring winding varies. Keep ground, lake and roof normals facing up.
    points = points[:-1] if points[0] == points[-1] else points
    area = sum(
        a[0] * b[1] - b[0] * a[1] for a, b in zip(points, points[1:] + points[:1])
    )
    return points if area > 0 else list(reversed(points))


def polygon(name, points, z, material):
    points = upward(points)
    return mesh(
        name, [(x, y, z) for x, y in points], [list(range(len(points)))], material
    )


def ribbon(name, points, width, z, material):
    verts = []
    faces = []
    for a, b in zip(points, points[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        d = math.hypot(dx, dy)
        if d < 0.001 or not inside(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), park):
            continue
        nx, ny = -dy / d * width / 2, dx / d * width / 2
        j = len(verts)
        verts.extend(
            [
                (a[0] + nx, a[1] + ny, z),
                (a[0] - nx, a[1] - ny, z),
                (b[0] - nx, b[1] - ny, z),
                (b[0] + nx, b[1] + ny, z),
            ]
        )
        faces.append([j, j + 1, j + 2, j + 3])
    return mesh(name, verts, faces, material)


def prism(name, pts, h, material):
    pts = upward(pts)
    n = len(pts)
    v = [(x, y, z) for z in (0.10, h + 0.10) for x, y in pts]
    faces = [list(range(n, 2 * n))]
    for i in range(n):
        faces.append([i, (i + 1) % n, (i + 1) % n + n, i + n])
    return mesh(name, v, faces, material)


features = []
for e in DATA["elements"]:
    if e.get("geometry"):
        features.append((e, [xy(p) for p in e["geometry"]]))
park = next(p for e, p in features if e["id"] == 216873421)
# A shallow, beveled park edge gives the map readable relief without pretending to survey elevation.
prism("Park earth", park, -0.25, "sand")
polygon("Waterloo Park", park, 0.10, "lawn")
lakes = []
paths = []
buildings = []
woods = []
landmarks = []
retained = []
for e, p in features:
    t = e.get("tags", {})
    center = (sum(x for x, y in p) / len(p), sum(y for x, y in p) / len(p))
    if not any(inside(q, park) for q in p) and not inside(center, park):
        continue
    name = t.get("name", str(e["id"]))
    retained.append(e)
    if t.get("natural") == "water":
        lakes.append(p)
        polygon(name, p, 0.13, "water")
        ribbon("shore", p, 0.12, 0.115, "sand")
        if t.get("name") == "Silver Lake":
            landmarks.append(
                {"name": "Silver Lake", "position": [center[0], 0.2, -center[1]]}
            )
    elif t.get("natural") == "wood":
        woods.append(p)
    elif t.get("natural") == "sand":
        polygon("sand", p, 0.112, "sand")
    elif t.get("building"):
        h = (
            float(
                t.get(
                    "height", str(float(t.get("building:levels", "1")) * 3.5)
                ).split()[0]
            )
            / SCALE
        )
        h = min(2, max(0.16, h))
        prism(name, p, h, "building")
        polygon(name + " roof", p, h + 0.115, "roof")
        buildings.append(p)
        if t.get("name") in [
            "Park Inn Concession",
            "First School House in Waterloo",
            "Grist Mill",
        ]:
            landmarks.append(
                {
                    "name": t["name"]
                    .replace(" Concession", "")
                    .replace("First School House in Waterloo", "Log School House"),
                    "position": [center[0], h + 0.25, -center[1]],
                }
            )
    elif t.get("railway") in ["rail", "light_rail"]:
        ribbon("rail corridor", p, 0.19, 0.12, "rail")
        ribbon("rails", p, 0.036, 0.135, "sand")
        paths.append(p)
    elif t.get("highway") in [
        "footway",
        "path",
        "cycleway",
        "pedestrian",
        "steps",
        "service",
    ]:
        width = 0.16 if t.get("highway") != "service" else 0.23
        ribbon(name, p, width, 0.12, "wood" if t.get("bridge") == "yes" else "path")
        paths.append(p)
    elif t.get("waterway") == "stream":
        ribbon(name, p, 0.16, 0.115, "water")
        paths.append(p)
    elif t.get("leisure") in ["pitch", "playground"]:
        polygon(
            name,
            p,
            0.114,
            "sand" if t.get("sport") in ["baseball", "beachvolleyball"] else "lawn",
        )


# Real map coordinates retained in a compact derived database under ODbL.
# Sculpted foliage is intentionally not a tree census. Clearings are left beside paths for ideas.
def valid(p, margin=0.3):
    return (
        inside(p, park)
        and not any(inside(p, q) for q in lakes + buildings)
        and not any(
            distance(p, a, b) < margin for line in paths for a, b in zip(line, line[1:])
        )
    )


points = []
for _ in range(12000):
    p = (
        random.uniform(min(x for x, y in park), max(x for x, y in park)),
        random.uniform(min(y for x, y in park), max(y for x, y in park)),
    )
    if not valid(p, 0.20):
        continue
    woodland = any(inside(p, poly) for poly in woods)
    if not woodland and random.random() > 0.12:
        continue
    if any(math.dist(p, q) < (0.38 if woodland else 0.7) for q in points):
        continue
    points.append(p)
    if len(points) >= 440:
        break
for i, (x, y) in enumerate(points):
    height = random.uniform(0.40, 0.85)
    r = random.uniform(0.19, 0.31)
    bpy.ops.mesh.primitive_cone_add(
        vertices=6,
        radius1=0.027,
        radius2=0.012,
        depth=height,
        location=(x, y, 0.1 + height / 2),
    )
    bpy.context.object.data.materials.append(mats["bark"])
    for j in range(3):
        bpy.ops.mesh.primitive_ico_sphere_add(
            subdivisions=1,
            radius=1,
            location=(
                x + random.uniform(-r * 0.5, r * 0.5),
                y + random.uniform(-r * 0.5, r * 0.5),
                0.1 + height * (0.65 + j * 0.13),
            ),
        )
        ob = bpy.context.object
        ob.scale = (r, r, height * 0.30)
        ob.data.materials.append(mats["leaf" + str(i % 3)])
        for face in ob.data.polygons:
            face.use_smooth = True
# 24 stable idea plots in readable clearings near the eastern paths/lake. No existing idea locations are mutated.
plots = []
candidates = []
for _ in range(20000):
    p = (random.uniform(1, 17), random.uniform(-5, 8))
    if not valid(p, 0.27):
        continue
    if (
        min(
            (distance(p, a, b) for line in paths for a, b in zip(line, line[1:])),
            default=999,
        )
        > 1.6
    ):
        continue
    if any(math.dist(p, q) < 0.65 for q in points):
        continue
    candidates.append(p)
# Spread along the lake and north meadow; stable spatial slots persist independently of sort/likes.
for p in sorted(candidates, key=lambda p: math.hypot(p[0] - 9, p[1] - 1)):
    if all(math.dist(p, q) > 1.6 for q in plots):
        plots.append(p)
    if len(plots) == 24:
        break
assert len(plots) == 24
metadata = {
    "center": CENTER,
    "metersPerUnit": SCALE,
    "attribution": "© OpenStreetMap contributors",
    "license": "https://www.openstreetmap.org/copyright",
    "source": "https://www.openstreetmap.org/way/216873421",
    "retrievedAt": DATA["osm3s"]["timestamp_osm_base"],
    "plots": [[round(x, 4), round(-y, 4)] for x, y in plots],
    "landmarks": landmarks,
    "decorativeTreeCount": len(points),
}
(ROOT / "assets/park/map.json").write_text(json.dumps(metadata, indent=2))
# Join geometry by material to bound draw calls. Keep geometry without lighting/cameras.
for material in mats.values():
    objs = [
        o
        for o in bpy.context.scene.objects
        if o.type == "MESH" and material in list(o.data.materials)
    ]
    if not objs:
        continue
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    bpy.context.object.name = material.name
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / "assets/park/waterloo-park.blend"))
bpy.ops.export_scene.gltf(
    filepath=str(ROOT / "public/park/waterloo-park.glb"),
    export_format="GLB",
    export_cameras=False,
    export_lights=False,
    export_yup=True,
)
print(
    "PARK_ASSET",
    json.dumps(
        {
            "plots": len(plots),
            "trees": len(points),
            "landmarks": landmarks,
            "bytes": (ROOT / "public/park/waterloo-park.glb").stat().st_size,
        }
    ),
)
