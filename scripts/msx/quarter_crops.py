#!/usr/bin/env python3
"""generic_crop_<stage>.png packs FOUR distinct crops into a 32x32 (TL wheat · TR flower · BL greens ·
BR rye), but each crop is taller than its 16x16 cell so neighbours bleed across the quarter lines.
For each crop+stage: crop the 16x16 cell, KEEP ONLY the crop's own connected blob (drops the bled-in
fragments from the crop above/below), then center that tiny sprite — at native size, NOT upscaled
(upscaling 16→32 just blurs it) — inside a transparent 32x32 tile.
Output: scripts/msx/crops/crop_<type>_<stage>.png (+ crops_quartered.png preview)."""
import os
from collections import deque
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = "/home/kirill/Documents/Projects/CDDA-Tilesets/gfx/UltimateCataclysm/pngs_normal_32x32/furniture/crops"
OUT = os.path.join(ROOT, "scripts/msx/crops")
os.makedirs(OUT, exist_ok=True)

QUARTERS = {"wheat": (0, 0), "flower": (16, 0), "greens": (0, 16), "rye": (16, 16)}
STAGES = ["seed", "seedling", "mature", "harvest"]
A_MIN = 32  # alpha ≥ this counts as solid

def keep_largest_blob(cell):
    """Zero every pixel not in the largest 8-connected opaque component (drops neighbour bleed)."""
    w, h = cell.size
    px = cell.load()
    seen = [[False] * w for _ in range(h)]
    best = []
    for sy in range(h):
        for sx in range(w):
            if seen[sy][sx] or px[sx, sy][3] < A_MIN:
                continue
            comp, q = [], deque([(sx, sy)])
            seen[sy][sx] = True
            while q:
                x, y = q.popleft(); comp.append((x, y))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and px[nx, ny][3] >= A_MIN:
                            seen[ny][nx] = True; q.append((nx, ny))
            if len(comp) > len(best):
                best = comp
    keepset = set(best)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    op = out.load()
    for x, y in keepset:
        op[x, y] = px[x, y]
    return out

stage_im = {st: Image.open(f"{SRC}/generic_crop_{st}.png").convert("RGBA") for st in STAGES}
preview = Image.new("RGBA", (len(STAGES) * 32, len(QUARTERS) * 32), (0, 0, 0, 0))
for qi, (crop, (qx, qy)) in enumerate(QUARTERS.items()):
    for si, st in enumerate(STAGES):
        blob = keep_largest_blob(stage_im[st].crop((qx, qy, qx + 16, qy + 16)))
        bb = blob.getbbox()
        tile = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
        if bb:
            sprite = blob.crop(bb)  # tight, native size — NOT scaled up
            tile.alpha_composite(sprite, ((32 - sprite.width) // 2, (32 - sprite.height) // 2))
        tile.save(f"{OUT}/crop_{crop}_{st}.png")
        preview.alpha_composite(tile, (si * 32, qi * 32))
preview.save(os.path.join(ROOT, "static/dev/ultica/crops_quartered.png"))
print(f"wrote {len(QUARTERS) * len(STAGES)} crop tiles → {OUT}")
print("  rows: " + ", ".join(QUARTERS) + "   cols: " + ", ".join(STAGES))
