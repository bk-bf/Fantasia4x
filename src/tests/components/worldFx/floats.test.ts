import { describe, expect, it } from 'vitest';
import { drawFloats, type FloaterMode } from '$lib/components/UI/canvas/worldFx/floats';
import { icon, worded } from '$lib/pixelArt/fx/icons';
import { tint, word } from '$lib/pixelArt/fx/glyphs';
import type { FxPainter } from '$lib/pixelArt/fx/painter';
import type { Spr } from '$lib/pixelArt/fx/spr';
import type { CombatTextEvent } from '$lib/stores/fx/combatFeedback';

const onset = (conditionId: string, text: string, id = 1, worldX = 4): CombatTextEvent => ({
  id,
  spawnTime: 0,
  until: 1700,
  worldX,
  worldY: 4,
  text,
  kind: 'condition',
  color: '#9575cd',
  entityId: 'p1',
  conditionId
});

interface Put {
  s: Spr;
  x: number;
  y: number;
}

function draw(list: CombatTextEvent[], mode: FloaterMode): Put[] {
  const put: Put[] = [];
  const p = {
    put: (s: Spr, x: number, y: number) => put.push({ s, x, y })
  } as unknown as FxPainter;
  drawFloats(p, null, list, 300, mode);
  return put;
}

const drawn = (e: CombatTextEvent, mode: FloaterMode): Spr[] => draw([e], mode).map((d) => d.s);

const rect = (d: Put) => {
  const x = Math.round(d.x) - d.s.ax;
  const y = Math.round(d.y) - d.s.ay;
  return [x, y, x + d.s.w, y + d.s.h];
};

describe('condition floaters', () => {
  const e = onset('winded', 'Winded');

  it('shows the icon and the word together when both are on', () => {
    expect(drawn(e, { icons: true, text: true })).toEqual([
      worded('winded', 'Winded', '#9575cd')[0]
    ]);
  });

  it('shows the icon alone when the text is off', () => {
    expect(drawn(e, { icons: true, text: false })).toEqual([icon('winded')[0]]);
  });

  it('shows the word alone when the icons are off', () => {
    const text = word('Winded', tint('#9575cd'), { small: true, icon: 'pip' });
    expect(drawn(e, { icons: false, text: true })).toEqual([text[0]]);
  });

  it('shows nothing when both are off', () => {
    expect(drawn(e, { icons: false, text: false })).toEqual([]);
  });

  it('shows the word for a condition without an icon', () => {
    expect(drawn(onset('staggered', 'Staggered'), { icons: true, text: false })).toEqual([]);
    expect(drawn(onset('staggered', 'Staggered'), { icons: true, text: true })).toHaveLength(1);
  });

  it('lifts a floater that would overlap the floater of a neighbour', () => {
    const both = { icons: true, text: true };
    const [a, b] = draw(
      [onset('knockdown', 'Knocked Down', 7, 4), onset('winded', 'Winded', 8, 5)],
      both
    ).map(rect);
    const apart = a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1];
    expect(apart).toBe(true);
  });
});
