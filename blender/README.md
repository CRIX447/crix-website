# Blender source models — Flappy Crix VR

`crix_models.py` builds every model procedurally and exports one `.glb` each.
Nothing is hand-modelled, so changing the pipe radius is one constant, not an
afternoon of re-modelling.

The built `.glb` files are committed in [`../models/`](../models), so you only
need Blender if you want to change something.

## Run it

```
blender --background --python blender/crix_models.py -- --out models
```

Blender 3.3 or newer. It also runs against the standalone module
(`pip install bpy`, Python 3.11), which is how it is tested:

```
python3 blender/crix_models.py -- --out models
```

```
--out DIR     where the .glb files go (default: models)
--only NAME   build just one, repeatable: --only coin --only bird
--list        print the asset names and stop
--no-export   build and report triangle counts without writing files
```

`--no-export` first is the cheap way to see what you are about to get.

## Check it

```
python3 blender/check_glb.py models
```

Plain Python, no Blender, no dependencies. It parses the GLB container
directly, so it checks what a runtime actually receives rather than what
Blender believes it sent — which is how the sky dome was caught shipping a
flat white gradient while the export reported success. Exits non-zero on any
mismatch, so it can gate a build.

```
python3 blender/preview.py preview
```

Renders each model on its own with Cycles. Worth doing after changing a
builder, because the numeric checks cannot see shape: they passed happily
while the bird's eyes were buried inside its head, the wings were flat planks,
and the hedge was five separate lumps with gaps between them.

## What it builds

| Asset | Tris | Origin | Notes |
|---|--:|---|---|
| `pipe_body` | 32 | base | One 2 m tile. Stack N of them for any pipe height. Open at both ends, so a stack has no hidden discs at the seams. |
| `pipe_cap` | 152 | base | Exactly `PIPE_CAP_H` tall, so seven bodies plus a cap is exactly 14.6 m. The inner ring is darker, so the mouth reads as a hole. |
| `coin` | 236 | centre | Spins on its local Y with no wobble. |
| `bird` | 440 | feet | Body, beak, eyes and tail joined; `wing_L` and `wing_R` stay separate and parented, origins at the shoulder. |
| `wing_fp` | 28 | wrist | What you see on your own controller. Same swept planform as the avatar's wings, larger. |
| `hat_crown` | 82 | head contact | |
| `hat_cap` | 140 | head contact | |
| `hat_bucket` | 152 | head contact | |
| `ground_tile` | 32 | centre | 8 m square, perfectly flat at every edge so copies butt together with no seam. |
| `bush_tile` | 400 | base centre | A hedge 8 m from origin to origin. It deliberately overhangs by 0.35 m each side so neighbouring copies interlock and the joint is invisible. |
| `sky_dome` | 736 | centre | Normals face inward — you are inside it. The gradient is a colour attribute wired into the material, which is what makes it survive the export. |

**2,430 triangles for one of everything.**

## Conventions

**Metres.** A pipe is `PIPE_R` 1.5 m in radius and tiles at 2 m, so a 15 m pipe
is seven bodies and a cap. The bird is 0.45 m. These are at the top of the
script; change them there and every asset re-derives.

**Z-up in Blender, Y-up in the file.** The glTF exporter rotates on the way
out. Do not rotate the meshes to "fix" it — you will get it wrong twice.
`check_glb.py` asserts the exported bounds in Y-up, so it catches this.

**Origins are load-bearing.** A pipe stacks by translating its origin, a wing
flaps by rotating around its own, a hat is placed by sitting its origin on the
head, a tile repeats by its origin spacing. Moving one breaks whatever places
it. Note that `bpy.ops.object.join()` keeps the *first* object's origin, which
is only harmless while that object sits at the world origin — `join()` here
bakes the transform afterwards so the result is predictable.

**Materials are placeholders.** Flat Principled colours, UVs already unwrapped
by smart project. They exist so the parts are distinguishable and the export
is valid. Replace them with real textures — one 1024 atlas per asset, no baked
lighting — once the look is settled.

## Budget

Quest is phone-class: about 100k triangles for the whole visible scene. The
count the script prints is taken *after* modifiers, because the exporter
applies them, so what it prints is what ships.

A pipe is the thing to watch: one cap plus N bodies, times however many are on
screen at once. At 15 m that is 7 x 32 + 152 = 376 triangles per pipe.

## If you edit it

Run all three: `--no-export` for the counts, `check_glb.py` for the spec, and
`preview.py` to look at it. Each catches a class of mistake the other two
cannot see.
