"""Render every model on its own, so the shapes can be looked at.

    python3 blender/preview.py [outdir]

Needs the bpy module (pip install bpy) or Blender's own Python. Cycles on the
CPU, 24 samples, one 360x360 PNG per asset — a couple of seconds each at these
triangle counts.

This exists because the numeric checks in check_glb.py cannot see shape. They
passed happily while the bird's eyes were buried inside its head, the wings
were flat planks and the hedge was five separate lumps with gaps between them.
Look at the renders after changing a builder.
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy                 # mathutils only exists once bpy has loaded
import mathutils
import crix_models as cm

OUT = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('-') else 'preview'
os.makedirs(OUT, exist_ok=True)

ORDER = ['pipe_body', 'pipe_cap', 'coin', 'bird', 'wing_fp',
         'hat_crown', 'hat_cap', 'hat_bucket',
         'ground_tile', 'bush_tile', 'sky_dome']

def world_bbox(objs):
    lo = mathutils.Vector((1e9,)*3); hi = mathutils.Vector((-1e9,)*3)
    for o in objs:
        for c in o.bound_box:
            p = o.matrix_world @ mathutils.Vector(c)
            for i in range(3):
                lo[i] = min(lo[i], p[i]); hi[i] = max(hi[i], p[i])
    return lo, hi

for name in ORDER:
    cm.clear_scene()
    P = cm.palette()
    objs = cm.ASSETS[name](P)
    bpy.context.view_layer.update()

    lo, hi = world_bbox(objs)
    centre = (lo + hi) / 2.0
    radius = max((hi - lo).length / 2.0, 1e-3)

    # three-quarter view, framed off the bounding sphere
    d = radius * 3.0
    eye = centre + mathutils.Vector((d*0.72, -d*0.72, d*0.42))
    bpy.ops.object.camera_add(location=eye)
    cam = bpy.context.active_object
    cam.rotation_euler = (eye - centre).to_track_quat('Z', 'Y').to_euler()
    cam.data.lens = 50
    bpy.context.scene.camera = cam

    bpy.ops.object.light_add(type='SUN', location=centre + mathutils.Vector((d, -d*0.5, d*1.4)))
    key = bpy.context.active_object; key.data.energy = 4.0
    bpy.ops.object.light_add(type='SUN', location=centre + mathutils.Vector((-d, -d, d*0.4)))
    fill = bpy.context.active_object; fill.data.energy = 1.3
    fill.rotation_euler = (math.radians(50), 0, math.radians(200))

    w = bpy.context.scene.world or bpy.data.worlds.new("w")
    bpy.context.scene.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.11, 0.12, 0.16, 1)

    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 24
    sc.cycles.device = 'CPU'
    sc.render.resolution_x = sc.render.resolution_y = 360
    sc.render.film_transparent = False
    sc.render.filepath = os.path.join(OUT, name + '.png')
    bpy.ops.render.render(write_still=True)
    print('rendered', name)
