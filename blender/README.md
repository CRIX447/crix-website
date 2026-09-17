# Blender source models — Flappy Crix VR

`crix_models.py` builds every model procedurally and exports one `.glb` each.
Nothing is hand-modelled, so changing the pipe radius is one constant, not an
afternoon of re-modelling.

## Run it

```
blender --background --python blender/crix_models.py -- --out models
```

No GUI, no open .blend file needed. Blender 3.3 or newer.

```
--out DIR     where the .glb files go (default: models)
--only NAME   build just one, repeatable: --only coin --only bird
--list        print the asset names and stop
--no-export   build and report triangle counts without writing files
```

`--no-export` first is the cheap way to see what you are about to get.

## What it builds

| Asset | Origin | Notes |
|---|---|---|
| `pipe_body` | base | One tile. Stack N of them for any pipe height. Open at both ends, so a stack has no hidden discs at the seams. |
| `pipe_cap` | base | The lip at the mouth. Sits on top of the last body tile. The inner ring is darker so the mouth reads as a hole. |
| `coin` | centre | Spins on its local Z with no wobble. |
| `bird` | feet | Body, beak, eyes and tail joined; `wing_L` and `wing_R` stay separate, parented, with their origins at the shoulder. |
| `wing_fp` | wrist | What you see on your own controller in first person. |
| `hat_crown`, `hat_cap`, `hat_bucket` | where it meets the head | 3D versions of the existing cosmetics. |
| `ground_tile` | centre | 8 m square, flat at every edge so copies butt together with no seam. |
| `bush_tile` | centre | A hedge row exactly 8 m long, repeats along the ground edge. |
| `sky_dome` | centre | Normals face inward — you are inside it. The gradient is vertex colours, so there is no texture to load. |

## Conventions

**Metres.** A pipe is `PIPE_R` 1.5 m in radius and tiles at 2 m, so a 15 m pipe
is seven bodies and a cap. The bird is 0.45 m. These are at the top of the
script; change them there and every asset re-derives.

**Z-up in Blender, Y-up in the file.** The glTF exporter rotates on the way
out. Do not rotate the meshes to "fix" it — you will get it wrong twice.

**Origins are load-bearing.** A pipe stacks by translating its origin, a wing
flaps by rotating around its own, a hat is placed by sitting its origin on the
head. Moving one breaks whatever places it.

**Materials are placeholders.** Flat Principled colours, UVs already
unwrapped by smart project. They exist so the parts are distinguishable and
the export is valid. Replace them with real textures — one 1024 atlas per
asset, no baked lighting — once the look is settled.

## Budget

The script prints a triangle count per asset and a total. Quest is
phone-class: about 100k triangles for the whole visible scene. The count is
taken *after* modifiers, because the exporter applies them, so what it prints
is what ships.

A pipe is the thing to watch: one cap plus N bodies, times however many are on
screen at once.

## If you edit it

Run `--no-export` after any change and read the triangle counts before
committing. A subdivision bumped by one is easy to miss in the viewport and
obvious in the numbers.
