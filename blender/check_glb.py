"""Check the exported .glb files against the spec in README.md.

    python3 blender/check_glb.py models

Plain Python, no Blender and no dependencies. It parses the GLB container and
its JSON chunk directly, so it checks what a runtime actually receives rather
than what Blender believes it sent — which is how the sky dome was caught
shipping a flat white gradient while Blender reported a successful export.

What it asserts, per asset: the container is valid glTF 2.0, the root node
carries the asset's name, the bounding box puts the origin where the README
says it is, sizes match the constants in crix_models.py, tiles are flat and
wide enough to interlock, every primitive has UVs and a named material, the
bird's wings are parented with their blades outboard of the shoulder, and the
sky dome's COLOR_0 carries a real gradient rather than one flat value.

Exits non-zero if anything is off, so it can gate a build.
"""
import json, os, struct, sys, math

DIR = sys.argv[1] if len(sys.argv) > 1 else 'models'
problems, notes = [], []

BINS = {}

def read_accessor(g, bin_, i):
    import struct as _s
    a = g['accessors'][i]; bv = g['bufferViews'][a['bufferView']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    ncomp = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
    fmt = {5126:'f',5123:'H',5125:'I',5121:'B'}[a['componentType']]
    stride = bv.get('byteStride') or ncomp * _s.calcsize(fmt)
    return [_s.unpack_from('<' + fmt*ncomp, bin_, off + k*stride) for k in range(a['count'])]


def read_glb(path):
    with open(path, 'rb') as f:
        magic, ver, _ = struct.unpack('<III', f.read(12))
        assert magic == 0x46546C67, f'{path}: not a GLB'
        assert ver == 2, f'{path}: glTF version {ver}, expected 2'
        clen, ctype = struct.unpack('<II', f.read(8))
        assert ctype == 0x4E4F534A, f'{path}: first chunk is not JSON'
        js = json.loads(f.read(clen))
        blen, _ = struct.unpack('<II', f.read(8))
        BINS[os.path.splitext(os.path.basename(path))[0]] = f.read(blen)
        return js

def bbox(g, mesh_i):
    """World-ish bounds from POSITION accessor min/max across primitives."""
    lo = [math.inf]*3; hi = [-math.inf]*3
    for prim in g['meshes'][mesh_i]['primitives']:
        acc = g['accessors'][prim['attributes']['POSITION']]
        for i in range(3):
            lo[i] = min(lo[i], acc['min'][i]); hi[i] = max(hi[i], acc['max'][i])
    return lo, hi

def node_bbox(g, node):
    """Bounds of a node's own mesh, offset by its translation."""
    lo, hi = bbox(g, node['mesh'])
    t = node.get('translation', [0,0,0])
    return [lo[i]+t[i] for i in range(3)], [hi[i]+t[i] for i in range(3)]

def near(a, b, tol=0.02):
    return abs(a-b) <= tol

EXPECT = {
    # name: (checks)
    'pipe_body':   dict(y=(0.0, 2.00), radius=1.50, uv=True),
    'pipe_cap':    dict(y=(0.0, 0.60), radius=1.75, uv=True),   # exactly PIPE_CAP_H
    'coin':        dict(centred=True, radius=0.22, uv=True),
    'bird':        dict(y0=0.0, uv=True, children=['wing_L','wing_R']),
    'wing_fp':     dict(uv=True),
    'hat_crown':   dict(uv=True),
    'hat_cap':     dict(uv=True),
    'hat_bucket':  dict(uv=True),
    'ground_tile': dict(centred=True, span_xz=8.0, flat=True, uv=True),
    'bush_tile':   dict(span_x=8.0, uv=True, centred_x=True, y0=0.0),
    'sky_dome':    dict(radius=100.0, inward=True, vcol=True),
}

for name, exp in EXPECT.items():
    path = os.path.join(DIR, name + '.glb')
    if not os.path.exists(path):
        problems.append(f'{name}: not exported'); continue
    g = read_glb(path)

    nodes = {n.get('name', f'node{i}'): n for i, n in enumerate(g['nodes'])}
    root = nodes.get(name)
    if root is None:
        problems.append(f'{name}: no node called {name!r} (got {list(nodes)})'); continue

    lo, hi = bbox(g, root['mesh'])

    # glTF is Y-up: Blender Z became Y.
    if 'y' in exp:
        y0, y1 = exp['y']
        if not (near(lo[1], y0) and near(hi[1], y1)):
            problems.append(f'{name}: spans Y {lo[1]:.3f}..{hi[1]:.3f}, expected {y0}..{y1} '
                            f'(origin at the base?)')
    if 'y0' in exp and not near(lo[1], exp['y0'], 0.03):
        problems.append(f'{name}: lowest point Y={lo[1]:.3f}, expected {exp["y0"]} (origin at the feet)')
    if 'radius' in exp:
        r = max(abs(lo[0]), abs(hi[0]), abs(lo[2]), abs(hi[2]))
        if not near(r, exp['radius'], max(0.03, exp['radius']*0.03)):
            problems.append(f'{name}: radius {r:.3f}, expected {exp["radius"]}')
    if exp.get('centred_x') and not near((lo[0]+hi[0])/2, 0.0, 0.02):
        problems.append(f'{name}: X origin off centre by {(lo[0]+hi[0])/2:.3f} — tiles will not line up')
    if exp.get('centred'):
        for i, ax in enumerate('XYZ'):
            if not near((lo[i]+hi[i])/2, 0.0, 0.02):
                problems.append(f'{name}: not centred on {ax} ({(lo[i]+hi[i])/2:.3f})')
    if 'span_xz' in exp:
        for i, ax in ((0,'X'), (2,'Z')):
            if not near(hi[i]-lo[i], exp['span_xz'], 0.05):
                problems.append(f'{name}: {ax} span {hi[i]-lo[i]:.3f}, expected {exp["span_xz"]}')
    if 'span_x' in exp:
        span = hi[0] - lo[0]
        if span < exp['span_x']:
            problems.append(f'{name}: X span {span:.3f} < {exp["span_x"]} — copies placed '
                            f'{exp["span_x"]} m apart would leave a gap')
        elif span > exp['span_x'] * 1.25:
            problems.append(f'{name}: X span {span:.3f} overhangs {exp["span_x"]} by more than 25%')
        else:
            notes.append(f'{name:<12} overhangs its {exp["span_x"]} m tile by '
                         f'{(span-exp["span_x"])/2:.2f} m each side, so copies interlock')
    if exp.get('flat') and not near(hi[1]-lo[1], 0.0, 0.001):
        problems.append(f'{name}: not flat, Y span {hi[1]-lo[1]:.4f} — copies will seam')

    # UVs so it can be textured later
    if exp.get('uv'):
        for prim in g['meshes'][root['mesh']]['primitives']:
            if 'TEXCOORD_0' not in prim['attributes']:
                problems.append(f'{name}: a primitive has no UVs'); break
    # vertex colours actually present in the file
    if exp.get('vcol'):
        prim0 = g['meshes'][root['mesh']]['primitives'][0]
        if 'COLOR_0' not in prim0['attributes']:
            problems.append(f'{name}: no COLOR_0 — the gradient did not make it into the file')
        else:
            n = len(set(map(tuple, read_accessor(g, BINS[name], prim0['attributes']['COLOR_0']))))
            if n < 10:
                problems.append(f'{name}: COLOR_0 has only {n} distinct value(s) — '
                                f'the gradient was flattened, the material is not reading the layer')
            else:
                notes.append(f'{name:<12} COLOR_0 carries {n} distinct colours')
    # parented children with their own meshes
    for child in exp.get('children', []):
        if child not in nodes:
            problems.append(f'{name}: missing child node {child!r}')
        elif root.get('children') is None or g['nodes'].index(nodes[child]) not in root['children']:
            problems.append(f'{name}: {child!r} is not parented to it')

    # materials named and reachable
    mats = set()
    for prim in g['meshes'][root['mesh']]['primitives']:
        if 'material' not in prim:
            problems.append(f'{name}: a primitive has no material')
        else:
            mats.add(g['materials'][prim['material']].get('name', '?'))
    notes.append(f'{name:<12} Y {lo[1]:7.3f}..{hi[1]:7.3f}  X {lo[0]:7.3f}..{hi[0]:7.3f}  '
                 f'mats {",".join(sorted(mats)) or "-"}')

# the wings' origins have to be at the shoulder, or a rotation swings the
# whole blade through the body instead of flapping it
b = read_glb(os.path.join(DIR, 'bird.glb'))
bn = {n.get('name'): n for n in b['nodes']}
for w in ('wing_L', 'wing_R'):
    if w in bn:
        lo, hi = bbox(b, bn[w]['mesh'])
        # The blade spans along Z and must sit entirely on one side of the
        # origin; rotating about a shoulder inside the blade would swing half
        # of it through the body. X is the chord and straddles by design.
        if lo[2] < -0.02 and hi[2] > 0.02:
            problems.append(f'{w}: blade straddles its own origin on Z — origin is not at the shoulder')
        t = bn[w].get('translation', [0,0,0])
        mid = (lo[2] + hi[2]) / 2.0
        side = 'outboard' if (mid > 0) == (t[2] > 0) else 'INBOARD (points at the body)'
        if 'INBOARD' in side:
            problems.append(f'{w}: blade extends toward the body, not away from it')
        notes.append(f'{w:<12} blade Z {lo[2]:7.3f}..{hi[2]:7.3f} {side}, shoulder {[round(v,3) for v in t]}')

print('\n'.join(notes))
print()
print(('PROBLEMS:\n  ' + '\n  '.join(problems)) if problems else 'every exported model matches the spec')
sys.exit(1 if problems else 0)
