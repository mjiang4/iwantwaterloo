"""Derive recognisable landmarks and an opt-in detailed model from the base Blender scene.
Uses only local OSM geometry and original procedural meshes. No reference photos are shipped.
Run: blender --background --python scripts/park/build_detail.py
"""

import bpy
import json
import math
import random
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
DATA = json.loads((ROOT / "assets/park/osm.json").read_text())
MAP = json.loads((ROOT / "assets/park/map.json").read_text())
random.seed(1846)
bpy.ops.wm.open_mainfile(filepath=str(ROOT / "assets/park/waterloo-park.blend"))


def xy(p):
    return (
        (p["lon"] - MAP["center"][1])
        * 111320
        * math.cos(math.radians(MAP["center"][0]))
        / 30,
        (p["lat"] - MAP["center"][0]) * 111320 / 30,
    )


def material(name, color, metal=0, rough=0.8, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get("Principled BSDF")
    bs.inputs["Base Color"].default_value = (*color, 1)
    bs.inputs["Metallic"].default_value = metal
    bs.inputs["Roughness"].default_value = rough
    if emission:
        bs.inputs["Emission Color"].default_value = (*color, 1)
        bs.inputs["Emission Strength"].default_value = emission
    return m


mats = {
    "pi-charcoal": material("pi-charcoal", (0.07, 0.086, 0.093), 0.6, 0.42),
    "pi-folds": material("pi-folds", (0.13, 0.16, 0.17), 0.55, 0.42),
    "pi-frame": material("pi-frame", (0.63, 0.65, 0.62), 0.65, 0.3),
    "pi-glass": material("pi-glass", (0.13, 0.24, 0.3), 0.7, 0.17),
    "pi-window-warm": material("pi-window-warm", (0.54, 0.39, 0.22), 0.3, 0.35, 0.10),
    "concrete-detail": material("concrete-detail", (0.5, 0.48, 0.42)),
    "timber-detail": material("timber-detail", (0.25, 0.19, 0.12)),
    "rail-steel": material("rail-steel", (0.34, 0.36, 0.35), 0.65, 0.3),
    "lamp-glow": material("lamp-glow", (0.94, 0.73, 0.37), 0.1, 0.5, 1.4),
}
batches = {}


def face(mat, vertices, faces):
    v, f = batches.setdefault(mat, ([], []))
    offset = len(v)
    v.extend(vertices)
    f.extend([[offset + i for i in face] for face in faces])


def box(mat, center, size, angle=0):
    x, y, z = center
    sx, sy, sz = [q / 2 for q in size]
    c, s = math.cos(angle), math.sin(angle)
    pts = [
        (x + a * c - b * s, y + a * s + b * c, z + d)
        for d in (-sz, sz)
        for a, b in [(-sx, -sy), (sx, -sy), (sx, sy), (-sx, sy)]
    ]
    face(
        mat,
        pts,
        [
            [0, 3, 2, 1],
            [4, 5, 6, 7],
            [0, 1, 5, 4],
            [1, 2, 6, 5],
            [2, 3, 7, 6],
            [3, 0, 4, 7],
        ],
    )


def rod(mat, a, b, r, sides=6):
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    u = d.cross(Vector((0, 0, 1)))
    if u.length < 0.01:
        u = d.cross(Vector((1, 0, 0)))
    u.normalize()
    v = d.cross(u)
    pts = [
        tuple(
            p
            + r
            * (u * math.cos(i * math.tau / sides) + v * math.sin(i * math.tau / sides))
        )
        for p in (a, b)
        for i in range(sides)
    ]
    face(
        mat,
        pts,
        [
            [i, (i + 1) % sides, (i + 1) % sides + sides, i + sides]
            for i in range(sides)
        ],
    )


def flush(prefix):
    objects = []
    for key, (vertices, faces) in batches.items():
        me = bpy.data.meshes.new(prefix + key)
        me.from_pydata(vertices, [], faces)
        me.update()
        ob = bpy.data.objects.new(prefix + key, me)
        bpy.context.collection.objects.link(ob)
        ob.data.materials.append(mats[key])
        objects.append(ob)
    batches.clear()
    return objects


def export(name, objects):
    bpy.ops.object.select_all(action="DESELECT")
    for ob in objects:
        ob.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(ROOT / "public/park" / name),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        export_draco_mesh_compression_enable=name == "waterloo-park-detail.glb",
        export_draco_mesh_compression_level=7,
        export_draco_position_quantization=14,
    )


base = list(bpy.context.scene.objects)
pi = next(e for e in DATA["elements"] if e["id"] == 240741299)
outline = [xy(p) for p in pi["geometry"][:-1]]
if (
    sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(outline, outline[1:] + outline[:1]))
    < 0
):
    outline.reverse()
lo = [min(p[i] for p in outline) for i in (0, 1)]
hi = [max(p[i] for p in outline) for i in (0, 1)]
# Replace the undifferentiated low extrusion at the landmark's actual footprint.
for ob in base:
    if ob.type != "MESH" or ob.name not in ["building", "roof"]:
        continue
    vertices = [tuple(v.co) for v in ob.data.vertices]
    faces = []
    for poly in ob.data.polygons:
        c = ob.matrix_world @ poly.center
        if not (
            lo[0] - 0.02 <= c.x <= hi[0] + 0.02 and lo[1] - 0.02 <= c.y <= hi[1] + 0.02
        ):
            faces.append(list(poly.vertices))
    me = bpy.data.meshes.new(ob.name + "-without-pi")
    me.from_pydata(vertices, [], faces)
    me.update()
    for m in ob.data.materials:
        me.materials.append(m)
    ob.data = me
export("waterloo-park.glb", base)
# Observational architectural reconstruction: true footprint, approximate heights.
# The original east block and the western Hawking wing retain their irregular plan.
h = 0.62
n = len(outline)
face(
    "pi-charcoal",
    [(x, y, z) for z in (0.17, h) for x, y in outline],
    [[i, (i + 1) % n, (i + 1) % n + n, i + n] for i in range(n)]
    + [list(range(n, 2 * n))],
)
for edge, (a, b) in enumerate(zip(outline, outline[1:] + outline[:1])):
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy)
    if length < 0.10:
        continue
    ux, uy = dx / length, dy / length
    nx, ny = uy, -ux
    angle = math.atan2(dy, dx)
    count = max(1, int(length / 0.11))
    pitch = length / count
    for j in range(count):
        x = a[0] + ux * (j + 0.5) * pitch
        y = a[1] + uy * (j + 0.5) * pitch
        # Seamed charcoal panels and folded, irregular window recesses.
        box(
            "pi-folds",
            (x + nx * 0.006, y + ny * 0.006, 0.41),
            (0.006, 0.014, 0.40),
            angle,
        )
        for row in range(3):
            if random.random() < 0.30:
                continue
            z = 0.265 + row * 0.13 + random.uniform(-0.012, 0.012)
            w = pitch * random.uniform(0.42, 0.70)
            hh = random.uniform(0.073, 0.105)
            protrudes = (j + edge + row * 5) % 13 == 0
            depth = 0.038 if protrudes else 0.009
            if protrudes:
                box(
                    "pi-frame",
                    (x + nx * depth, y + ny * depth, z),
                    (w + 0.014, 0.025, hh + 0.015),
                    angle,
                )
            box(
                "pi-window-warm" if (j + row + edge) % 7 == 0 else "pi-glass",
                (x + nx * (depth + 0.016), y + ny * (depth + 0.016), z),
                (w, 0.012, hh),
                angle,
            )
    # Glazed ground floor and narrow concrete supports.
    for j in range(max(1, int(length / 0.26))):
        x = a[0] + ux * (j + 0.5) * length / max(1, int(length / 0.26))
        y = a[1] + uy * (j + 0.5) * length / max(1, int(length / 0.26))
        box(
            "pi-glass",
            (x + nx * 0.013, y + ny * 0.013, 0.153),
            (0.21, 0.014, 0.115),
            angle,
        )
        rod("concrete-detail", (x, y, 0.1), (x + ux * 0.04, y + uy * 0.04, 0.23), 0.017)
# Low roof parapet around the building's actual outline.
for a, b in zip(outline, outline[1:] + outline[:1]):
    rod("pi-frame", (*a, h + 0.016), (*b, h + 0.016), 0.012)
landmark = flush("perimeter-")
export("perimeter.glb", landmark)
# Northbound ION segments form one continuous measured path through the park.
ids = [1012946398, 1012946397, 1020715340, 1020715339, 1020715336]
ways = {e["id"]: e for e in DATA["elements"]}
rail = []
for way_id in ids:
    pts = [xy(p) for p in ways[way_id]["geometry"]]
    if rail and math.dist(rail[-1], pts[-1]) < math.dist(rail[-1], pts[0]):
        pts.reverse()
    if rail and math.dist(rail[-1], pts[0]) < 0.015:
        pts = pts[1:]
    rail.extend(pts)
# The short mapped connector between two way ids is included as a straight segment.
rail = [p for p in rail if -15 < p[0] < 14 and -12 < p[1] < 15]
features = {
    "perimeter": {
        "osmWay": pi["id"],
        "position": [
            sum(x for x, y in outline) / n,
            0.8,
            -sum(y for x, y in outline) / n,
        ],
    },
    "ion": {
        "sourceWays": ids,
        "points": [[round(x, 5), round(-y, 5)] for x, y in rail],
        "simulation": True,
    },
    "source": "https://www.openstreetmap.org/copyright",
}
# Rails, sleepers, catenary poles and wire. The route is shared by the animated train.
for a, b in zip(rail, rail[1:]):
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy)
    if length < 0.001:
        continue
    nx, ny = -dy / length, dx / length
    for offset in [-0.0239, 0.0239, 0.13 - 0.0239, 0.13 + 0.0239]:
        rod(
            "rail-steel",
            (a[0] + nx * offset, a[1] + ny * offset, 0.145),
            (b[0] + nx * offset, b[1] + ny * offset, 0.145),
            0.004,
        )
    rod("rail-steel", (*a, 0.4), (*b, 0.4), 0.0018, 4)
    for j in range(max(1, int(length / 0.13))):
        t = (j + 0.5) / max(1, int(length / 0.13))
        box(
            "timber-detail",
            (a[0] + dx * t, a[1] + dy * t, 0.127),
            (0.22, 0.026, 0.013),
            math.atan2(dy, dx) + math.pi / 2,
        )
for i in range(0, len(rail), 3):
    x, y = rail[i]
    rod("rail-steel", (x + 0.22, y, 0.1), (x + 0.22, y, 0.45), 0.008)
    rod("rail-steel", (x + 0.22, y, 0.43), (x, y, 0.4), 0.005)
track = flush("ion-track-")
export("ion-track.glb", track)
# All trees are community idea instances, never baked into the landscape.
# Waterfront benches and warm path lights, aligned to mapped shoreline points.
lake = next(
    e for e in DATA["elements"] if e.get("tags", {}).get("name") == "Silver Lake"
)
shore = [xy(p) for p in lake["geometry"]]
for i in range(0, len(shore) - 1, 7):
    a, b = shore[i], shore[i + 1]
    angle = math.atan2(b[1] - a[1], b[0] - a[0])
    dx, dy = math.cos(angle), math.sin(angle)
    x, y = a[0] + dy * 0.13, a[1] - dx * 0.13
    box("timber-detail", (x, y, 0.145), (0.15, 0.055, 0.014), angle)
    box(
        "timber-detail",
        (x + dy * 0.023, y - dx * 0.023, 0.19),
        (0.15, 0.014, 0.06),
        angle,
    )
    rod("rail-steel", (x + 0.10, y, 0.1), (x + 0.10, y, 0.34), 0.007)
    box("lamp-glow", (x + 0.10, y, 0.34), (0.022, 0.022, 0.008))
waterfront = flush("waterfront-")


# Neighbouring streets and footprints give the detailed park geographic context.
# Building heights are still estimates when absent from the map.
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


park = [xy(p) for p in ways[216873421]["geometry"]]
mats["context-stone"] = material("context-stone", (0.36, 0.35, 0.30))
mats["context-brick"] = material("context-brick", (0.30, 0.18, 0.13))
mats["context-roof"] = material("context-roof", (0.15, 0.18, 0.17))
mats["context-road"] = material("context-road", (0.28, 0.29, 0.27))
mats["context-walk"] = material("context-walk", (0.50, 0.49, 0.43))
mats["context-glass"] = material("context-glass", (0.11, 0.17, 0.20), 0.45, 0.3)
context_buildings = 0
for element in DATA["elements"]:
    pts = [xy(p) for p in element.get("geometry", [])]
    if not pts:
        continue
    center = (sum(x for x, y in pts) / len(pts), sum(y for x, y in pts) / len(pts))
    if math.hypot(center[0] - 11, center[1] + 4) > 28:
        continue
    tags = element.get("tags", {})
    if tags.get("building") and not any(inside(p, park) for p in pts):
        if pts[0] == pts[-1]:
            pts = pts[:-1]
        if len(pts) < 3:
            continue
        if sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:] + pts[:1])) < 0:
            pts.reverse()
        try:
            height = (
                float(tags.get("height", float(tags.get("building:levels", 2)) * 3.5))
                / 30
            )
        except ValueError:
            height = 0.24
        height = min(2.8, max(0.14, height))
        n = len(pts)
        facade = "context-brick" if context_buildings % 3 == 0 else "context-stone"
        face(
            facade,
            [(x, y, z) for z in (-0.21, height) for x, y in pts],
            [[i, (i + 1) % n, (i + 1) % n + n, i + n] for i in range(n)],
        )
        face("context-roof", [(x, y, height + 0.003) for x, y in pts], [list(range(n))])
        # Glazed bands distinguish larger residential/office volumes from houses.
        if height > 0.45:
            for a, b in zip(pts, pts[1:] + pts[:1]):
                dx, dy = b[0] - a[0], b[1] - a[1]
                length = math.hypot(dx, dy)
                if length < 0.15:
                    continue
                nx, ny = dy / length, -dx / length
                for floor in range(1, int(height / 0.12)):
                    box(
                        "context-glass",
                        (
                            (a[0] + b[0]) / 2 + nx * 0.005,
                            (a[1] + b[1]) / 2 + ny * 0.005,
                            floor * 0.12,
                        ),
                        (length * 0.94, 0.008, 0.063),
                        math.atan2(dy, dx),
                    )
        context_buildings += 1
    highway = tags.get("highway")
    if highway in [
        "residential",
        "tertiary",
        "secondary",
        "primary",
        "service",
        "pedestrian",
        "footway",
    ]:
        width = (
            0.25
            if highway in ["tertiary", "secondary", "primary"]
            else 0.15 if highway in ["residential", "service"] else 0.065
        )
        for a, b in zip(pts, pts[1:]):
            c = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            if inside(c, park):
                continue
            dx, dy = b[0] - a[0], b[1] - a[1]
            length = math.hypot(dx, dy)
            if length < 0.001:
                continue
            nx, ny = -dy / length * width / 2, dx / length * width / 2
            face(
                "context-walk" if width < 0.1 else "context-road",
                [
                    (a[0] + nx, a[1] + ny, -0.22),
                    (a[0] - nx, a[1] - ny, -0.22),
                    (b[0] - nx, b[1] - ny, -0.22),
                    (b[0] + nx, b[1] + ny, -0.22),
                ],
                [[0, 1, 2, 3]],
            )
context = flush("neighbourhood-")
features["contextBuildings"] = context_buildings

high = (
    base
    + landmark
    + track
    + waterfront
    + context
)
export("waterloo-park-detail.glb", high)
# Save the full editable detail source.
bpy.ops.wm.save_as_mainfile(
    filepath=str(ROOT / "assets/park/waterloo-park-detail.blend"), compress=True
)
features["detailBytes"] = (ROOT / "public/park/waterloo-park-detail.glb").stat().st_size
(ROOT / "assets/park/landmarks.json").write_text(json.dumps(features, indent=2) + "\n")
print(
    "DETAIL_ASSETS",
    json.dumps(
        {
            name: (ROOT / "public/park" / name).stat().st_size
            for name in [
                "waterloo-park.glb",
                "perimeter.glb",
                "ion-track.glb",
                "waterloo-park-detail.glb",
            ]
        }
    ),
)
