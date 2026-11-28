import {
  FLECK_SHAPES,
  TREE_GROUND_TINTS,
  TREE_GROUND_WINTERS,
  type PaintedTreeGround,
  type TreeGroundLook,
  type TreeSoil
} from './treeGroundManifest.js';

export const TABLE_W = 64;
export const KIND_ROWS = 5;
const SHARED_ROWS = 3;
const HALF = 8;
const FULL = 255;
const FLECK_AT = 8;
const CRACK_AT = 12;
const HOT_AT = 13;
const GLOW_AT = 14;
export const FLAG = {
  core: 1,
  herb: 2,
  fall: 4,
  moss: 8,
  crack: 16,
  hot: 32,
  glow: 64,
  stain: 128
} as const;
export const SOIL_FLAG = { grassy: 1, dry: 2, wet: 4 } as const;

const byte = (v: number) => Math.max(0, Math.min(FULL, Math.round(v * FULL)));
const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16)
];

export const tableRows = (kinds: number) => kinds * KIND_ROWS + SHARED_ROWS;

function soilBits(s: TreeSoil): number {
  return (
    (s.grassy ? SOIL_FLAG.grassy : 0) | (s.dry ? SOIL_FLAG.dry : 0) | (s.wet ? SOIL_FLAG.wet : 0)
  );
}

function flags(l: TreeGroundLook): number {
  return (
    (l.core ? FLAG.core : 0) |
    (l.herb ? FLAG.herb : 0) |
    (l.fall ? FLAG.fall : 0) |
    (l.moss ? FLAG.moss : 0) |
    (l.crack ? FLAG.crack : 0) |
    (l.crack?.hot ? FLAG.hot : 0) |
    (l.glow ? FLAG.glow : 0) |
    (l.stain ? FLAG.stain : 0)
  );
}

const DRY: TreeSoil = { gain: 0 };

export function treeSoils(
  look: PaintedTreeGround,
  groundIds: readonly string[],
  wet: (id: string) => boolean
): TreeSoil[] {
  return [DRY, ...groundIds.map((id) => (wet(id) ? DRY : (look.soils.get(id) ?? look.fallback)))];
}

export function treeGroundTable(look: PaintedTreeGround, soils: readonly TreeSoil[]): Uint8Array {
  const rows = tableRows(look.kinds.length);
  const out = new Uint8Array(TABLE_W * rows * 4);
  const put = (x: number, y: number, c: readonly number[]) => {
    const i = (y * TABLE_W + x) * 4;
    out[i] = c[0];
    out[i + 1] = c[1];
    out[i + 2] = c[2];
    out[i + 3] = FULL;
  };
  const ramp = (x: number, y: number, r: readonly string[] | null | undefined) =>
    r?.slice(0, HALF).forEach((h, i) => put(x + i, y, rgb(h)));
  look.kinds.forEach((k, n) => {
    const l = k.look;
    const y = n * KIND_ROWS;
    ramp(0, y, l.bed);
    ramp(HALF, y, l.core);
    ramp(0, y + 1, l.herb?.ramp);
    ramp(HALF, y + 1, l.tint?.ramp);
    ramp(0, y + 2, l.fall?.ramp);
    ramp(HALF, y + 2, l.moss?.ramp);
    ramp(0, y + 3, l.stain);
    l.fleck.cols.slice(0, CRACK_AT - FLECK_AT).forEach((h, i) => put(FLECK_AT + i, y + 3, rgb(h)));
    if (l.crack) put(CRACK_AT, y + 3, rgb(l.crack.col));
    if (l.crack?.hot) put(HOT_AT, y + 3, rgb(l.crack.hot));
    if (l.glow) put(GLOW_AT, y + 3, rgb(l.glow));
    const p = y + 4;
    put(0, p, [byte(k.gain / 2), k.hard ? FULL : 0, l.remap ? FULL : 0]);
    put(1, p, [
      TREE_GROUND_WINTERS.indexOf(k.winter),
      l.tint ? TREE_GROUND_TINTS.indexOf(l.tint.mode) + 1 : 0,
      byte(l.tint?.reach ?? 0)
    ]);
    put(2, p, [byte(l.herb?.amount ?? 0), l.herb?.low ?? 0, FLECK_SHAPES.indexOf(l.fleck.shape)]);
    put(3, p, [byte(l.fleck.bed), byte(l.fleck.out), byte(l.fall?.carpet ?? 0)]);
    put(4, p, [byte(l.moss?.amount ?? 0), l.moss?.base ?? 0, flags(l)]);
    put(5, p, [l.bed.length, l.core?.length ?? 0, l.herb?.ramp.length ?? 0]);
    put(6, p, [l.tint?.ramp?.length ?? 0, l.fall?.ramp.length ?? 0, l.moss?.ramp.length ?? 0]);
    put(7, p, [l.stain?.length ?? 0, Math.min(l.fleck.cols.length, CRACK_AT - FLECK_AT), 0]);
  });
  const s = look.kinds.length * KIND_ROWS;
  ramp(0, s, look.shared.snow);
  ramp(HALF, s, look.shared.frost);
  ramp(0, s + 1, look.shared.mud);
  ramp(HALF, s + 1, look.shared.ice);
  soils.forEach((soil, k) => {
    if (k < TABLE_W) put(k, s + 2, [byte(soil.gain), soilBits(soil), 0]);
  });
  return out;
}
