"""
Flappy Crix — procedural source models for the VR build.

Run headless, no GUI needed:

    blender --background --python blender/crix_models.py -- --out models

One .glb per asset, built to the spec the VR renderer expects:

    glTF 2.0 binary, metres, Y-up, no baked lighting, low poly.

Blender is Z-up; the glTF exporter rotates to Y-up on the way out, so
everything here is authored Z-up and comes out correct. Do not "fix" it by
rotating the meshes.

Origins are placed where the game needs to grab them:
    pipe_body, pipe_cap   base of the piece, so they stack by translation
    bird, hats            the point that sits on the ground / on the head
    wings                 the shoulder joint, so a rotation flaps them
    coin, ground, bushes  centre

Materials are flat Principled BSDF colours with UVs already unwrapped. They
are there so the parts are distinguishable and the export is valid — swap in
real textures once the look is decided.

    --out DIR     where the .glb files go            (default: models)
    --only NAME   build one asset, repeatable        (default: all)
    --list        print the asset names and exit
    --no-export   build in the scene but write nothing
"""

import bpy
import bmesh
import math
import os
import sys


# ───────────────────────── scale ─────────────────────────
# A pipe reads as roughly 15 m of wall with a 3–4 m gap, which is what makes
# the first-person shot feel as big as the reference. Everything else is
# sized off the bird.

BIRD_LEN   = 0.45
PIPE_R     = 1.50
PIPE_BODY_H = 2.00     # one tile; stack N of these per pipe
PIPE_CAP_R = 1.75
PIPE_CAP_H = 0.60
COIN_R     = 0.22
TILE       = 8.00      # ground / bush tile edge


# ───────────────────────── helpers ─────────────────────────

def apply_transform(obj, location=False, rotation=True, scale=True):
    """bpy.ops.object.transform_apply works on the selection, not on the
    active object alone — setting active and forgetting to select is a silent
    no-op, which is how a scaled primitive reaches the exporter unscaled."""
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=location, rotation=rotation, scale=scale)
    return obj


def origin_to_bottom(obj):
    """Put the origin on the lowest vertex, measured rather than guessed."""
    zmin = min(v.co.z for v in obj.data.vertices)
    return shift_mesh(obj, dz=-zmin)


def clear_scene():
    try:
        bpy.ops.object.mode_set(mode='OBJECT')
    except Exception:
        pass
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.objects):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def material(name, rgb, roughness=0.6, metallic=0.0):
    """Flat Principled colour. Reused by name so a re-run does not pile up."""
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
    if not mat.use_nodes:          # already implicit in Blender 5, going in 6
        try:
            mat.use_nodes = True
        except Exception:
            pass
    bsdf = mat.node_tree.nodes.get("Principled BSDF") if mat.node_tree else None
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
    return mat


def vertex_colour_material(name, layer, fallback_rgb):
    """Principled colour driven by a colour attribute.

    The glTF exporter only writes COLOR_0 when the material reads the layer —
    without this node the dome exported solid white and the exporter said so
    in a warning that is easy to scroll past.
    """
    mat = material(name, fallback_rgb, 1.0)
    nt = mat.node_tree
    if nt is None:
        return mat
    bsdf = nt.nodes.get("Principled BSDF")
    if bsdf is None:
        return mat
    node = next((x for x in nt.nodes if x.bl_idname in
                 ("ShaderNodeVertexColor", "ShaderNodeAttribute")), None)
    if node is None:
        try:
            node = nt.nodes.new("ShaderNodeVertexColor")
            node.layer_name = layer
        except Exception:
            node = nt.nodes.new("ShaderNodeAttribute")
            node.attribute_name = layer
    nt.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def paint(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


def shift_mesh(obj, dx=0.0, dy=0.0, dz=0.0):
    """Move the geometry inside the object, leaving the origin where it is.

    This is how the origins above are set. bpy.ops.object.origin_set works too
    but depends on selection state, which makes a headless script fragile.
    """
    for v in obj.data.vertices:
        v.co.x += dx
        v.co.y += dy
        v.co.z += dz
    obj.data.update()
    return obj


def smooth(obj, angle_deg=40.0):
    """Smooth shading with an auto-smooth angle, across Blender versions.

    4.1 removed mesh.use_auto_smooth in favour of a modifier, so this tries
    the old property first and falls back to the node group.
    """
    for poly in obj.data.polygons:
        poly.use_smooth = True
    mesh = obj.data
    if hasattr(mesh, "use_auto_smooth"):
        mesh.use_auto_smooth = True
        mesh.auto_smooth_angle = math.radians(angle_deg)
        return obj
    try:
        prev = bpy.context.view_layer.objects.active
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle_deg))
        bpy.context.view_layer.objects.active = prev
    except Exception:
        pass       # flat-but-smooth is still a valid export
    return obj


def unwrap(obj, margin=0.02):
    prev = bpy.context.view_layer.objects.active
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=margin)
    except Exception:
        pass
    finally:
        if bpy.context.object and bpy.context.object.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
    bpy.context.view_layer.objects.active = prev
    return obj


def centre_x(obj):
    """Put the origin on the X midpoint of the geometry."""
    xs = [v.co.x for v in obj.data.vertices]
    return shift_mesh(obj, dx=-(min(xs) + max(xs)) / 2.0)


def join(objects, name):
    """Join into the first object, rename, and bake the transform.

    A join keeps the FIRST object's origin, which is only harmless while that
    object happens to sit at the world origin. Baking location makes the
    result's origin predictable, so each builder can then place it on purpose.
    """
    objects = [o for o in objects if o is not None]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    out = bpy.context.view_layer.objects.active
    out.name = name
    out.data.name = name
    apply_transform(out, location=True)
    return out


def bevel(obj, width, segments=2):
    mod = obj.modifiers.new("bevel", 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(40)
    return obj


def cylinder(verts, radius, depth, cap='NGON', location=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=verts, radius=radius, depth=depth,
        end_fill_type=cap, location=location)
    return bpy.context.active_object


def cone(verts, r1, r2, depth, location=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(
        vertices=verts, radius1=r1, radius2=r2, depth=depth, location=location)
    return bpy.context.active_object


def ico(subdiv, radius, location=(0, 0, 0)):
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=subdiv, radius=radius, location=location)
    return bpy.context.active_object


def cube(size, location=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=size, location=location)
    return bpy.context.active_object


def blade(points2d, thickness, name):
    """A flat outline extruded to thickness — used for the wings.

    A scaled cube reads as a plank from any angle. An outline lets the wing
    taper, sweep back and carry feather notches at the tip for the same
    handful of triangles.
    """
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    verts = [bm.verts.new((x, y, 0.0)) for x, y in points2d]
    bm.faces.new(verts)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    mod = obj.modifiers.new("solidify", 'SOLIDIFY')
    mod.thickness = thickness
    mod.offset = 0.0
    return obj


def wing_outline(chord, span, mirror=False):
    """Swept wing with three primaries notched into the trailing tip."""
    pts = [
        ( 0.55 * chord, 0.00 * span),   # root, leading edge
        ( 0.15 * chord, 1.00 * span),   # tip, swept back
        ( 0.02 * chord, 0.93 * span),
        (-0.02 * chord, 0.98 * span),   # primary 1
        (-0.18 * chord, 0.88 * span),
        (-0.22 * chord, 0.92 * span),   # primary 2
        (-0.40 * chord, 0.80 * span),
        (-0.55 * chord, 0.00 * span),   # root, trailing edge
    ]
    return [(x, -y) for x, y in pts] if mirror else pts


def open_ends(obj):
    """Delete the flat cap faces so a tiling piece has no hidden geometry."""
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    faces = [f for f in bm.faces if abs(f.normal.z) > 0.9]
    bmesh.ops.delete(bm, geom=faces, context='FACES')
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    return obj


def tri_count(obj):
    """Counted after modifiers, because export_apply=True bakes them in —
    reading obj.data directly reports the pre-bevel mesh and undercounts."""
    deps = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(deps)
    mesh = ev.to_mesh()
    mesh.calc_loop_triangles()
    n = len(mesh.loop_triangles)
    ev.to_mesh_clear()
    return n


# ───────────────────────── palette ─────────────────────────

def palette():
    return {
        'pipe':      material("crix_pipe",      (0.11, 0.78, 0.38), 0.45),
        'pipe_dark': material("crix_pipe_dark", (0.06, 0.52, 0.25), 0.50),
        'gold':      material("crix_gold",      (1.00, 0.78, 0.10), 0.30, 0.85),
        'body':      material("crix_body",      (0.95, 0.93, 0.90), 0.75),
        'beak':      material("crix_beak",      (1.00, 0.62, 0.15), 0.55),
        'eye':       material("crix_eye",       (0.05, 0.05, 0.07), 0.25),
        'wing':      material("crix_wing",      (0.85, 0.82, 0.80), 0.80),
        'cloth':     material("crix_cloth",     (0.14, 0.14, 0.17), 0.85),
        'grass':     material("crix_grass",     (0.18, 0.55, 0.24), 0.90),
        'bush':      material("crix_bush",      (0.12, 0.42, 0.20), 0.90),
        'sky':       vertex_colour_material("crix_sky", "Col", (0.13, 0.20, 0.42)),
    }


# ───────────────────────── assets ─────────────────────────

def build_pipe_body(P):
    """One tiling metre-and-a-bit of pipe wall. Stack by z += PIPE_BODY_H.

    No caps: a stack of these would hide a flat disc at every seam, which on
    Quest is drawn and depth-tested for nothing.
    """
    obj = cylinder(16, PIPE_R, PIPE_BODY_H, cap='NOTHING')
    open_ends(obj)
    shift_mesh(obj, dz=PIPE_BODY_H / 2)      # origin at the base
    obj.name = "pipe_body"
    obj.data.name = "pipe_body"
    paint(obj, P['pipe'])
    unwrap(obj)
    return [obj]


def build_pipe_cap(P):
    """The lip at the mouth of a pipe. Sits on top of the last body tile."""
    skirt = cylinder(16, PIPE_CAP_R, PIPE_CAP_H, cap='NOTHING')
    open_ends(skirt)
    rim = cylinder(16, PIPE_CAP_R, 0.06, cap='NGON',
                   location=(0, 0, PIPE_CAP_H / 2 - 0.03))   # flush with the top
    inner = cylinder(16, PIPE_R * 0.92, 0.10, cap='NGON',
                     location=(0, 0, PIPE_CAP_H / 2 - 0.05))   # top flush at PIPE_CAP_H
    paint(skirt, P['pipe'])
    paint(rim, P['pipe'])
    # The mouth of the pipe reads as a hole only if it is darker than the
    # wall. Painted before the join so the slot survives it.
    paint(inner, P['pipe_dark'])
    obj = join([skirt, rim, inner], "pipe_cap")
    shift_mesh(obj, dz=PIPE_CAP_H / 2)
    unwrap(obj)
    return [obj]


def build_coin(P):
    """Spins on its local Z. Origin at the centre so the spin has no wobble."""
    obj = cylinder(20, COIN_R, COIN_R * 0.16, cap='NGON')
    bevel(obj, COIN_R * 0.05, 2)
    obj.name = "coin"
    obj.data.name = "coin"
    paint(obj, P['gold'])
    smooth(obj, 50)
    unwrap(obj)
    return [obj]


def build_bird(P):
    """The player avatar, as other players see it.

    Wings stay separate objects parented to the body, with their origins at
    the shoulder, so the flap is one rotation per wing and needs no armature.
    """
    L = BIRD_LEN

    body = ico(3, L * 0.5)
    body.scale = (1.15, 0.9, 0.95)
    apply_transform(body, rotation=False)
    paint(body, P['body'])

    beak = cone(8, L * 0.17, 0.0, L * 0.34)
    beak.rotation_euler = (0, math.radians(90), 0)
    beak.location = (L * 0.60, 0, -L * 0.02)
    apply_transform(beak, location=True)
    paint(beak, P['beak'])

    # The body is an ellipsoid with semi-axes (0.575, 0.45, 0.475) * L, so an
    # eye at a comfortable-looking (0.30, 0.20, 0.16) * L is entirely INSIDE
    # it — sum of squared ratios 0.58, well under 1. These sit on the surface.
    eyes = []
    for side in (1, -1):
        e = ico(1, L * 0.085,
                location=(L * 0.414, side * L * 0.262, L * 0.200))
        paint(e, P['eye'])
        eyes.append(e)

    tail = cone(6, L * 0.18, 0.0, L * 0.26)
    tail.rotation_euler = (0, math.radians(-90), 0)
    tail.location = (-L * 0.52, 0, L * 0.06)
    apply_transform(tail, location=True)
    paint(tail, P['body'])

    # The eyes and beak are separate materials, so they are joined into the
    # body only after each has its own — a joined mesh keeps per-face slots.
    body = join([body, beak, tail] + eyes, "bird")
    smooth(body, 35)
    unwrap(body)
    origin_to_bottom(body)               # origin at the feet

    wings = []
    for side, tag in ((1, "L"), (-1, "R")):
        w = blade(wing_outline(L * 0.42, L * 0.80, mirror=(side < 0)),
                  L * 0.035, "wing_" + tag)
        paint(w, P['wing'])
        unwrap(w)
        w.location = (0, side * L * 0.22, L * 0.50)
        w.parent = body
        w.matrix_parent_inverse = body.matrix_world.inverted()
        wings.append(w)

    return [body] + wings


def build_wing_fp(P):
    """What you see on your own controller. Origin at the wrist."""
    L = BIRD_LEN * 2.6
    obj = blade(wing_outline(L * 0.34, L * 0.90), L * 0.030, "wing_fp")
    paint(obj, P['wing'])
    unwrap(obj)
    return [obj]


def build_hat_crown(P):
    band = cylinder(16, BIRD_LEN * 0.34, BIRD_LEN * 0.20, cap='NOTHING')
    open_ends(band)
    spikes = []
    for i in range(5):
        a = (i / 5.0) * math.tau
        s = cone(6, BIRD_LEN * 0.07, 0.0, BIRD_LEN * 0.22,
                 location=(math.cos(a) * BIRD_LEN * 0.30,
                           math.sin(a) * BIRD_LEN * 0.30,
                           BIRD_LEN * 0.20))
        spikes.append(s)
    obj = join([band] + spikes, "hat_crown")
    shift_mesh(obj, dz=BIRD_LEN * 0.10)
    paint(obj, P['gold'])
    unwrap(obj)
    return [obj]


def build_hat_cap(P):
    dome = ico(2, BIRD_LEN * 0.33)
    dome.scale = (1.0, 1.0, 0.62)
    apply_transform(dome, rotation=False)
    # lose the lower half so it sits on a head rather than swallowing it
    bm = bmesh.new()
    bm.from_mesh(dome.data)
    bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
                           plane_co=(0, 0, 0), plane_no=(0, 0, 1), clear_inner=True)
    bm.to_mesh(dome.data)
    bm.free()
    dome.data.update()

    brim = cylinder(16, BIRD_LEN * 0.30, BIRD_LEN * 0.03, cap='NGON')
    brim.scale = (1.0, 1.35, 1.0)
    apply_transform(brim, rotation=False)
    shift_mesh(brim, dx=BIRD_LEN * 0.22)

    obj = join([dome, brim], "hat_cap")
    paint(obj, P['cloth'])
    smooth(obj, 40)
    unwrap(obj)
    return [obj]


def build_hat_bucket(P):
    crown = cone(16, BIRD_LEN * 0.30, BIRD_LEN * 0.34, BIRD_LEN * 0.30)
    open_ends(crown)
    top = cylinder(16, BIRD_LEN * 0.30, 0.004, cap='NGON',
                   location=(0, 0, BIRD_LEN * 0.15))
    brim = cone(16, BIRD_LEN * 0.52, BIRD_LEN * 0.34, BIRD_LEN * 0.06,
                location=(0, 0, -BIRD_LEN * 0.15))
    obj = join([crown, top, brim], "hat_bucket")
    shift_mesh(obj, dz=BIRD_LEN * 0.18)
    paint(obj, P['cloth'])
    unwrap(obj)
    return [obj]


def build_ground_tile(P):
    """Flat on every edge so copies butt together with no seam."""
    bpy.ops.mesh.primitive_plane_add(size=TILE)
    obj = bpy.context.active_object
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=3, use_grid_fill=True)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    obj.name = "ground_tile"
    obj.data.name = "ground_tile"
    paint(obj, P['grass'])
    unwrap(obj)
    return [obj]


def build_bush_tile(P):
    """A hedge row exactly TILE long, so it repeats along the ground edge."""
    # Each blob has to be wider than the gap to the next one or the row reads
    # as separate lumps instead of a hedge. Spacing is TILE/n = 1.6 m, so the
    # half-width after the X scale needs to comfortably exceed 0.8 m.
    blobs = []
    n = 5
    for i in range(n):
        x = -TILE / 2 + TILE * (i + 0.5) / n
        h = 0.78 + (0.22 if i % 2 else 0.0)
        b = ico(2, h, location=(x, 0, h * 0.25))
        b.scale = (1.55, 1.05, 0.78)
        apply_transform(b, rotation=False)
        blobs.append(b)
    obj = join(blobs, "bush_tile")
    centre_x(obj)                 # copies are placed every TILE metres
    origin_to_bottom(obj)         # sits on the ground plane, not through it
    paint(obj, P['bush'])
    smooth(obj, 45)
    unwrap(obj)
    return [obj]


def build_sky_dome(P):
    """Normals face inward — you are inside it. Vertex colours carry the
    gradient so there is no texture to load and nothing to light."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=24, radius=100.0)
    obj = bpy.context.active_object

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    lower = [f for f in bm.faces if f.calc_center_median().z < -1.0]
    bmesh.ops.delete(bm, geom=lower, context='FACES')
    bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()

    obj.name = "sky_dome"
    obj.data.name = "sky_dome"

    mesh = obj.data
    if hasattr(mesh, "color_attributes"):
        layer = mesh.color_attributes.new(name="Col", type='FLOAT_COLOR', domain='CORNER')
    else:
        layer = mesh.vertex_colors.new(name="Col")   # Blender < 3.2
    top, horizon = (0.06, 0.09, 0.26), (0.30, 0.42, 0.70)
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            z = mesh.vertices[mesh.loops[li].vertex_index].co.z / 100.0
            t = max(0.0, min(1.0, z))
            layer.data[li].color = (
                horizon[0] + (top[0] - horizon[0]) * t,
                horizon[1] + (top[1] - horizon[1]) * t,
                horizon[2] + (top[2] - horizon[2]) * t,
                1.0)
    paint(obj, P['sky'])
    return [obj]


ASSETS = {
    'pipe_body':   build_pipe_body,
    'pipe_cap':    build_pipe_cap,
    'coin':        build_coin,
    'bird':        build_bird,
    'wing_fp':     build_wing_fp,
    'hat_crown':   build_hat_crown,
    'hat_cap':     build_hat_cap,
    'hat_bucket':  build_hat_bucket,
    'ground_tile': build_ground_tile,
    'bush_tile':   build_bush_tile,
    'sky_dome':    build_sky_dome,
}


# ───────────────────────── export ─────────────────────────

def export(objects, path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    kwargs = dict(filepath=path, export_format='GLB', use_selection=True,
                  export_apply=True)
    try:
        bpy.ops.export_scene.gltf(**kwargs)
    except TypeError:
        kwargs.pop('export_apply', None)     # older exporter
        bpy.ops.export_scene.gltf(**kwargs)


def parse_args(argv):
    args = {'out': 'models', 'only': [], 'list': False, 'export': True}
    if '--' in argv:
        argv = argv[argv.index('--') + 1:]
    else:
        argv = []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--out' and i + 1 < len(argv):
            args['out'] = argv[i + 1]; i += 2
        elif a == '--only' and i + 1 < len(argv):
            args['only'].append(argv[i + 1]); i += 2
        elif a == '--list':
            args['list'] = True; i += 1
        elif a == '--no-export':
            args['export'] = False; i += 1
        else:
            i += 1
    return args


def main():
    args = parse_args(sys.argv)

    if args['list']:
        for name in ASSETS:
            print(name)
        return

    names = args['only'] or list(ASSETS)
    unknown = [n for n in names if n not in ASSETS]
    if unknown:
        print("unknown asset(s): " + ", ".join(unknown))
        print("known: " + ", ".join(ASSETS))
        return

    out = os.path.abspath(args['out'])
    if args['export']:
        os.makedirs(out, exist_ok=True)

    total = 0
    print("")
    print("%-14s %8s  %s" % ("asset", "tris", "file"))
    print("-" * 56)

    for name in names:
        clear_scene()
        P = palette()
        objects = ASSETS[name](P)

        tris = sum(tri_count(o) for o in objects)
        total += tris

        path = os.path.join(out, name + ".glb")
        if args['export']:
            export(objects, path)
            where = os.path.relpath(path)
        else:
            where = "(not written)"
        print("%-14s %8d  %s" % (name, tris, where))

    print("-" * 56)
    print("%-14s %8d" % ("total", total))
    print("")
    print("Quest budget is roughly 100k triangles for the whole scene; a pipe")
    print("is one cap plus N bodies, so count them at the density you spawn.")


if __name__ == "__main__":
    main()
