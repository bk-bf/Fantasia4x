import data from '../../../database/pawns/looks.json';
import type { ColourPreference, Culture, Pawn, PawnLook } from '../../types';
import { mulberry32, stringSeed } from '../../util/rng';

type Weights = Record<string, number>;
type Roll = () => number;
type Sex = 'male' | 'female';

interface Palette {
  keys: string[];
  lean: [number, number];
}

export const LOOKS = data as unknown as {
  skin: Palette;
  hair: Palette;
  eyes: Palette;
  oddEye: number;
  greying: { from: number; chance: number; white: number }[];
  styles: Record<string, Partial<Record<Sex, number>>>;
  beards: Weights;
};

const WHITE = 'white';
const GREY = 'grey';
const NO_BEARD = 'none';

function weighted(r: Roll, weights: Weights): string {
  const keys = Object.keys(weights);
  let u = r() * keys.reduce((a, k) => a + weights[k], 0);
  for (const k of keys) {
    u -= weights[k];
    if (u <= 0) return k;
  }
  return keys[keys.length - 1];
}

function lean(r: Roll, palette: Palette): Weights {
  const strong = palette.lean[0] + r() * palette.lean[1];
  const w: Weights = Object.fromEntries(palette.keys.map((k) => [k, 1]));
  const pick = () => palette.keys[Math.floor(r() * palette.keys.length)];
  w[pick()] += strong;
  if (r() < 0.5) w[pick()] += strong / 2;
  return w;
}

export function rollColouring(cultureId: string): ColourPreference {
  const r = mulberry32(stringSeed(`${cultureId}:colour`));
  const eyes = lean(r, LOOKS.eyes);
  const skin = lean(r, LOOKS.skin);
  return { skin, hair: lean(r, LOOKS.hair), eyes };
}

function greying(r: Roll, age: number, hair: string): string {
  if (hair === WHITE) return hair;
  const step = LOOKS.greying.find((g) => age >= g.from);
  if (!step || r() >= step.chance) return hair;
  return r() < step.white ? WHITE : GREY;
}

export function rollPawnLook(
  pawn: Pick<Pawn, 'id' | 'name' | 'sex' | 'age'>,
  pref: ColourPreference
): PawnLook {
  const r = mulberry32(stringSeed(`${pawn.id}:${pawn.name}:look`));
  const sex: Sex = pawn.sex ?? 'male';
  const skin = weighted(r, pref.skin);
  const eyes = weighted(r, pref.eyes);
  const odd =
    r() < LOOKS.oddEye ? LOOKS.eyes.keys[Math.floor(r() * LOOKS.eyes.keys.length)] : null;
  const hair = greying(r, pawn.age ?? 30, weighted(r, pref.hair));
  const styles = Object.entries(LOOKS.styles).flatMap(([id, w]) => (w[sex] ? [[id, w[sex]]] : []));
  const style = weighted(r, Object.fromEntries(styles));
  const beard = sex === 'male' ? weighted(r, LOOKS.beards) : NO_BEARD;
  return { skin, hair, eyes, oddEye: odd !== eyes ? odd : null, style, beard };
}

export function ensureLooks(
  cultures: Culture[],
  pawns: Pawn[],
  describe: (pref: ColourPreference) => string
): void {
  for (const c of cultures) {
    if (c.colouring) continue;
    c.colouring = rollColouring(c.id);
    c.lore.description = `${c.lore.description} ${describe(c.colouring)}`.trim();
  }
  const byId = new Map(cultures.map((c) => [c.id, c]));
  for (const p of pawns) {
    if (p.look) continue;
    const pref = byId.get(p.cultureId ?? '')?.colouring ?? rollColouring(p.cultureId ?? p.id);
    p.look = rollPawnLook(p, pref);
  }
}
