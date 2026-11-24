import io
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).parent
REF = 'origin/test/look-overhaul'
PAINTED = 'static/tilesets/painted/'
TILE = 32
FIELD = 2048
SPRITE = re.compile(r"'((?:creature|item|building|rock|site|tree|plant|folk)/[a-z0-9_/]+)'")
LEVEL = {'dirt': 4, 'mud': 2, 'moss': 3, 'bog': 1.5, 'clay': 3, 'riverbank': 3, 'cave': 4}
GRASSY = 0.62
LEG_ROW = 0.5

SCENES = {
    'wolves': {
        'size': (22, 13), 'origin': (310, 620), 'base': 'deep_grass',
        'blobs': [
            ('tall_grass', 3, 10, 3.6, 2.4), ('tall_grass', 18, 2, 3.4, 2), ('tall_grass', 19.5, 10.5, 2.8, 2.1), ('wildflowers', 2, 2.5, 1.8, 1.4),
            ('grass', 8.8, 5.8, 4.8, 3), ('grass', 14.6, 8.8, 3, 2),
            ('dirt', 8.6, 5.5, 2.9, 1.6), ('dirt', 13.3, 7.7, 1.5, 1), ('dirt', 15.5, 9.7, 1.5, 0.9)
        ]
    },
    'bear': {
        'size': (22, 13), 'origin': (1210, 240), 'base': 'deep_grass',
        'blobs': [
            ('tall_grass', 16.5, 9.4, 4.4, 2.8), ('mossy_ground', 3.5, 9.5, 3, 2.4), ('tree', 18.5, 2.5, 3, 2.2), ('tree', 2.5, 2.5, 2.6, 2),
            ('grass', 10.2, 5.2, 4.4, 2.6), ('dirt', 10.3, 5.6, 2.6, 1.5), ('dirt', 6.6, 8.7, 1.4, 0.9), ('mushroom_patch', 5, 11.5, 1.7, 1.1)
        ]
    },
    'goblins': {
        'size': (22, 13), 'origin': (1500, 1300), 'base': 'tall_grass',
        'blobs': [
            ('scrubland', 19, 3, 3.2, 2.6), ('dead_trees', 17.8, 10.6, 3.4, 2), ('deep_grass', 2, 11, 2.8, 1.9), ('mud', 1.5, 3.5, 2, 2.4),
            ('grass', 9.8, 6.6, 7.2, 4.6), ('dirt', 9.7, 6.4, 5.2, 3.1), ('dirt', 10.6, 11.2, 1.3, 2.2), ('mud', 5.6, 5.8, 1.4, 1.1)
        ]
    },
    'fen': {
        'size': (22, 13), 'origin': (700, 1500), 'base': 'moss',
        'blobs': [
            ('mossy_ground', 3, 2.5, 3.2, 2.2), ('riverbank', 19, 2.5, 3.2, 2), ('tall_grass', 20, 11, 2.6, 2),
            ('bog', 8.5, 6.2, 5.2, 3.1), ('bog', 15.5, 8.2, 3.2, 1.9), ('mud', 12.6, 9.5, 2.8, 1.3), ('mud', 5.4, 9.8, 2, 1.2),
            ('mud', 16.6, 6.2, 1.5, 0.9), ('mud', 9.8, 7.9, 1.4, 0.9)
        ]
    },
    'harpies': {
        'size': (22, 13), 'origin': (90, 1420), 'base': 'savanna',
        'blobs': [
            ('scrubland', 3, 10, 3.6, 2.4), ('tall_grass', 19, 11, 3, 1.8), ('grass', 19, 2, 3, 2),
            ('scrubland', 10.5, 6, 5.6, 3.4), ('dirt', 9.4, 5.6, 4.2, 1.4), ('dirt', 10.2, 8.9, 2.6, 1.1), ('dirt', 14.8, 7.6, 1.6, 1)
        ]
    }
}


def blob(ref_path):
    return subprocess.run(['git', 'show', f'{REF}:{PAINTED}{ref_path}'], check=True, capture_output=True, cwd=HERE).stdout


def u32(a):
    return np.asarray(a, dtype=np.int64).astype(np.uint32)


def hashf(x, y, z):
    with np.errstate(over='ignore'):
        n = (u32(x) * np.uint32(374761393)) ^ (u32(y) * np.uint32(668265263)) ^ (u32(z) * np.uint32(1274126177))
        n = (n ^ (n >> np.uint32(13))) * np.uint32(1274126177)
        return (n ^ (n >> np.uint32(16))).astype(np.float64) / 4294967296.0


def value_noise(px, py, seed):
    ix, iy = np.floor(px), np.floor(py)
    fx, fy = px - ix, py - iy
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    top = hashf(ix, iy, seed) * (1 - fx) + hashf(ix + 1, iy, seed) * fx
    bottom = hashf(ix, iy + 1, seed) * (1 - fx) + hashf(ix + 1, iy + 1, seed) * fx
    return top * (1 - fy) + bottom * fy


def warp(px, py):
    wx = px + (value_noise(px * 0.042, py * 0.042, 11) - 0.5) * 22 + (value_noise(px * 0.155, py * 0.155, 12) - 0.5) * 7
    wy = py + (value_noise(px * 0.042, py * 0.042, 14) - 0.5) * 22 + (value_noise(px * 0.155, py * 0.155, 15) - 0.5) * 7
    return wx, wy


def darken(c, k):
    out = c.astype(np.float64)
    out[..., 0] *= k
    out[..., 1] *= k
    out[..., 2] = np.minimum(255, out[..., 2] * (k + 0.1))
    return out


def kind_map(scene, names):
    w, h = scene['size']
    ty, tx = np.mgrid[0:h, 0:w]
    kinds = np.full((h, w), names.index(scene['base']))
    for i, (kind, cx, cy, rx, ry) in enumerate(scene['blobs']):
        wob = 0.75 + 0.5 * hashf(tx, ty, 200 + i)
        inside = ((tx + 0.5 - cx) / rx) ** 2 + ((ty + 0.5 - cy) / ry) ** 2 < wob
        kinds[inside] = names.index(kind)
    return kinds


def bake_ground(name, scene, manifest, atlas, field):
    sprites = manifest['sprites']
    art = manifest['ground']['kinds']
    names = sorted({scene['base'], *(b[0] for b in scene['blobs'])})
    kinds = kind_map(scene, names)
    w, h = scene['size']
    ox, oy = scene['origin']
    yy, xx = np.mgrid[0:h * TILE, 0:w * TILE]
    qx, qy = xx + ox, yy + oy

    def kind_at(ax, ay):
        cx = np.clip(np.floor((ax - ox) / TILE).astype(int), 0, w - 1)
        cy = np.clip(np.floor((ay - oy) / TILE).astype(int), 0, h - 1)
        return kinds[cy, cx]

    wx, wy = warp(qx.astype(np.float64), qy.astype(np.float64))
    k = kind_at(wx, wy)
    level = np.array([LEVEL.get(n, 5) for n in names])
    here = field[qy % FIELD, qx % FIELD].astype(int)
    lip = field[(qy - 3) % FIELD, qx % FIELD, 1].astype(int)
    pieces = sprites[manifest['ground']['pieces']]
    out = np.zeros((h * TILE, w * TILE, 3))
    for i, kind in enumerate(names):
        m = k == i
        if not m.any():
            continue
        ramps = sprites[art[kind]['ramps']]
        block = atlas[ramps['y']:ramps['y'] + 6, ramps['x']:ramps['x'] + 16].astype(int)
        meta = block[5]
        if 'bare' in art[kind]:
            bare = sprites[art[kind]['bare']]
            c = atlas[bare['y'] + qy % bare['h'], bare['x'] + qx % bare['w'], :3].astype(np.float64)
        else:
            amount = meta[15, 0]
            grass = here[..., 1] < amount
            shades = []
            for col, shift_bits in ((13, 0), (14, 3)):
                sx, sy = meta[col, 0] * 8, meta[col, 1] * 8
                packed = field[(qy + sy) % FIELD, (qx + sx) % FIELD, 0].astype(int)
                shades.append((packed >> shift_bits) & 7)
            c = np.where(grass[..., None], block[1][shades[1]][..., :3], block[0][shades[0]][..., :3]).astype(np.float64)
            c = np.where((grass & (here[..., 1] > amount - 3))[..., None], darken(c, 0.7), c)
            c = np.where((~grass & (lip < amount))[..., None], darken(c, 0.68), c)
        b = here[..., 2]
        ptype = (b >> 4) - 1
        colour = b & 15
        shown = (b != 0) & (255 - here[..., 3] < meta[np.clip(ptype, 0, 12), 0])
        ramp_piece = block[np.clip(2 + ptype, 0, 4), colour][..., :3]
        free_piece = atlas[np.clip(pieces['y'] + ptype + 1, 0, atlas.shape[0] - 1), pieces['x'] + colour, :3]
        piece = np.where((ptype < 3)[..., None], ramp_piece, free_piece)
        c = np.where(shown[..., None], piece, c)
        out[m] = c[m]
    up = level[kind_at(wx, wy - 4)]
    down = level[kind_at(wx, wy + 4)]
    own = level[k]
    under = up > own + 0.4
    above = ~under & (down < own - 0.4) & (down < 2)
    out = np.where(under[..., None], darken(out, 0.68), out)
    out = np.where(above[..., None], darken(out, 0.8), out)
    img = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).convert('RGBA')
    for ty in range(h):
        for tx in range(w):
            tufts = art[names[kinds[ty, tx]]].get('tufts')
            if not tufts or hashf(tx + ox, ty + oy, 7) > GRASSY:
                continue
            for n in range(int(tufts['density'] + hashf(tx + ox, ty + oy, 31))):
                s = sprites[tufts['sprites'][int(hashf(tx + ox, ty + oy, 40 + n) * len(tufts['sprites']))]]
                px = tx * TILE + int(hashf(tx + ox, ty + oy, 60 + n) * (TILE - s['w']))
                py = ty * TILE + int(hashf(tx + ox, ty + oy, 80 + n) * (TILE - s['h']))
                tuft = Image.fromarray(atlas[s['y']:s['y'] + s['h'], s['x']:s['x'] + s['w']])
                img.alpha_composite(tuft, (px, py))
    img.convert('RGB').quantize(colors=96, dither=Image.Dither.NONE).save(HERE / f'ground-{name}.png', optimize=True)


def lying(cut):
    a = cut.copy()
    filled = (a[..., 3] > 0).sum(axis=1)
    legs = 0
    while legs < a.shape[0] // 2 and filled[a.shape[0] - 1 - legs] < filled.max() * LEG_ROW:
        legs += 1
    if legs < 3:
        return None, 0
    a = a[:a.shape[0] - legs + 1]
    solid = a[a[..., 3] > 0]
    outline = solid[solid[:, :3].sum(axis=1).argmin()]
    belly = a[-2, :, 3] > 0
    a[-1] = 0
    a[-1, belly] = outline
    return a, legs - 1


def pack(names, manifest, atlas):
    sprites = manifest['sprites']
    cuts = []
    for name in sorted(names):
        if name not in sprites:
            sys.exit(f'{name} is not in the painted atlas')
        s = sprites[name]
        cut = atlas[s['y']:s['y'] + s['h'], s['x']:s['x'] + s['w']]
        cuts.append((name, cut, s['ox'], s['oy']))
        if name.startswith('creature/'):
            low, drop = lying(cut)
            if low is not None:
                cuts.append((name + '#lie', low, s['ox'], s['oy'] + drop))
    cuts.sort(key=lambda c: -c[1].shape[0])
    width, x, y, row = 512, 0, 0, 0
    placed = {}
    for name, cut, ox, oy in cuts:
        h, w = cut.shape[:2]
        if x + w > width:
            x, y, row = 0, y + row + 1, 0
        placed[name] = (x, y, cut, ox, oy)
        x, row = x + w + 1, max(row, h)
    sheet = np.zeros((y + row, width, 4), dtype=np.uint8)
    table = {}
    for name, (x, y, cut, ox, oy) in placed.items():
        h, w = cut.shape[:2]
        sheet[y:y + h, x:x + w] = cut
        table[name] = [x, y, w, h, ox, oy]
    Image.fromarray(sheet).save(HERE / 'sprites.png', optimize=True)
    (HERE / 'sprites.js').write_text("'use strict';\nconst ART = " + json.dumps(table, separators=(',', ':')) + ';\n')


def main():
    manifest = json.loads(blob('manifest.json'))
    atlas = np.array(Image.open(io.BytesIO(blob('atlas.png'))).convert('RGBA'))
    Image.MAX_IMAGE_PIXELS = None
    field = np.array(Image.open(io.BytesIO(blob(manifest['ground']['field']['image']))).convert('RGBA'))
    for name, scene in SCENES.items():
        bake_ground(name, scene, manifest, atlas, field)
    names = set(SPRITE.findall((HERE / 'scenes.js').read_text()))
    pack(names, manifest, atlas)
    print(len(names), 'sprites,', len(SCENES), 'grounds')


main()
