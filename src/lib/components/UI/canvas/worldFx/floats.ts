import type { CombatTextEvent } from '$lib/stores/fx/combatFeedback';
import { COLD, CRIT, DULL, GORE, HURT, tint, word, type Pair } from '$lib/pixelArt/fx/glyphs';
import { badge, float } from '$lib/pixelArt/fx/effects';
import { icon, worded, type IconId } from '$lib/pixelArt/fx/icons';
import type { FxPainter } from '$lib/pixelArt/fx/painter';
import type { WebGLRenderer } from '$lib/webgl/renderer.js';
import { figureAt, type Figure } from './figure';

export interface FloaterMode {
  icons: boolean;
  text: boolean;
}

interface Placed {
  pair: Pair;
  x: number;
  y: number;
  ttl: number;
  shake: boolean;
  badge: boolean;
}

const TIERS = [0, 20, 38, 56];
const BADGE_STEP = 18;
const TTL_BY_CONDITION: Record<string, number> = { knockdown: 1.3, staggered: 0.9 };
const ICON_BY_CONDITION: Record<string, IconId> = {
  collapse: 'collapsed',
  winded: 'winded',
  knockdown: 'knocked',
  bleeding: 'bleeding',
  burning: 'burning',
  envenomed: 'poisoned',
  hypothermia: 'frozen',
  malnutrition: 'starving',
  tired: 'exhausted',
  mental_breakdown: 'moodbreak',
  nausea: 'sick',
  dysentery: 'sick',
  infection: 'sick'
};

export const conditionIcon = (id: string | undefined): IconId | undefined =>
  id ? ICON_BY_CONDITION[id.split(':')[0]] : undefined;

function textLook(e: CombatTextEvent): [Pair, number, number, boolean] {
  switch (e.kind) {
    case 'damage':
      return [word(e.text, HURT), 4, 0.9, false];
    case 'crit':
      return [word(e.text, CRIT, { big: true }), 0, 0.9, true];
    case 'miss':
      return [word(e.text, DULL), 0, 0.9, false];
    case 'dodge':
      return [word(e.text, COLD), -6, 0.9, false];
    case 'bleed':
      return [word(e.text, GORE, { icon: 'drop' }), 4, 0.9, false];
    case 'fracture':
      return [word(e.text, tint('#ff9944')), 0, 0.9, false];
    case 'knockdown':
      return [
        word(e.text, tint(e.color ?? '#ff6a3a'), { small: true, icon: 'pip' }),
        6,
        1.3,
        false
      ];
    default:
      return [
        word(e.text, tint(e.color ?? '#dddddd'), { small: true, icon: 'pip' }),
        4,
        TTL_BY_CONDITION[e.conditionId ?? ''] ?? 1.4,
        false
      ];
  }
}

function place(e: CombatTextEvent, f: Figure, mode: FloaterMode): Placed | null {
  const tier = Math.min(TIERS.length - 1, Math.round((e.dy ?? 0) / 13));
  const id = e.kind === 'condition' ? conditionIcon(e.conditionId) : undefined;
  if (id && mode.icons) {
    const col = e.color ?? '#dddddd';
    return {
      pair: mode.text ? worded(id, e.text, col) : icon(id),
      x: f.x,
      y: (f.lying ? f.y - 20 : f.y - 34) - tier * BADGE_STEP,
      ttl: 0,
      shake: false,
      badge: true
    };
  }
  if (e.kind === 'condition' && !mode.text) return null;
  const [pair, dx, ttl, shake] = textLook(e);
  return { pair, x: f.x + dx, y: f.head - 8 + TIERS[tier], ttl, shake, badge: false };
}

const placed = new Map<number, Placed | null>();

export function drawFloats(
  p: FxPainter,
  r: WebGLRenderer | null,
  list: readonly CombatTextEvent[],
  now: number,
  mode: FloaterMode
): void {
  const seen = new Set<number>();
  for (const e of list) {
    if (e.kind === 'social') continue;
    seen.add(e.id);
    let q = placed.get(e.id);
    if (q === undefined) {
      q = place(e, figureAt(r, e.worldX, e.worldY, e.worldX, e.worldY), mode);
      placed.set(e.id, q);
    }
    if (!q) continue;
    const u = (now - e.spawnTime) / 1000;
    if (q.badge) badge(p, q.x, q.y, q.pair, u);
    else float(p, q.x, q.y, q.pair, u, q.ttl, q.shake);
  }
  for (const id of placed.keys()) if (!seen.has(id)) placed.delete(id);
}
