import { describe, expect, it } from 'vitest';
import {
  drawFloats,
  FLOATERS_PER_TARGET,
  MERGE_HITS_MS,
  type FloaterMode
} from '$lib/components/UI/canvas/worldFx/floats';
import { icon, worded } from '$lib/pixelArt/fx/icons';
import { HURT, tint, word } from '$lib/pixelArt/fx/glyphs';
import type { FxPainter } from '$lib/pixelArt/fx/painter';
import type { Spr } from '$lib/pixelArt/fx/spr';
import type { CombatTextEvent } from '$lib/stores/fx/combatFeedback';

let nextId = 1;
let nextX = 1000;

const onset = (
  conditionId: string,
  text: string,
  worldX = nextX++,
  worldY = 4
): CombatTextEvent => ({
  id: nextId++,
  spawnTime: 0,
  until: 1700,
  worldX,
  worldY,
  text,
  kind: 'condition',
  color: '#9575cd',
  entityId: 'p1',
  conditionId
});

const hit = (n: number, worldX: number, worldY = 4): CombatTextEvent => ({
  id: nextId++,
  spawnTime: 0,
  until: 900,
  worldX,
  worldY,
  text: `-${n}`,
  kind: 'damage'
});

interface Put {
  s: Spr;
  x: number;
  y: number;
}

const both = { icons: true, text: true };

function draw(list: CombatTextEvent[], mode: FloaterMode, now: number): Put[] {
  const put: Put[] = [];
  const p = {
    textRatio: 1,
    label: (s: Spr, x: number, y: number, ox: number, oy: number) =>
      put.push({ s, x: x + ox, y: y + oy })
  } as unknown as FxPainter;
  drawFloats(p, null, list, now, mode);
  return put;
}

const rect = (d: Put) => {
  const x = Math.round(d.x) - d.s.ax;
  const y = Math.round(d.y) - d.s.ay;
  return [x, y, x + d.s.w, y + d.s.h];
};

const apart = (a: number[], b: number[]) =>
  a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1];

describe('condition floaters', () => {
  it('follows the icon and text switches, live floaters included', () => {
    const e = onset('winded', 'Winded');
    const at = 10_000;
    draw([e], both, at);
    expect(draw([e], both, at + 500).map((d) => d.s)).toEqual([
      worded('winded', 'Winded', '#9575cd')[0]
    ]);
    expect(draw([e], { icons: true, text: false }, at + 501).map((d) => d.s)).toEqual([
      icon('winded')[0]
    ]);
    expect(draw([e], { icons: false, text: true }, at + 502).map((d) => d.s)).toEqual([
      word('Winded', tint('#9575cd'), { small: true, icon: 'pip' })[0]
    ]);
    expect(draw([e], { icons: false, text: false }, at + 503)).toEqual([]);
  });

  it('keeps neighbours apart for their whole lives', () => {
    const t0 = 20_000;
    const list = [onset('knockdown', 'Knocked Down', 400, 4), hit(7, 400, 5)];
    for (const dt of [0, 150, 300, 450, 600, 750, 900]) {
      const drawn = draw(list, both, t0 + dt).map(rect);
      if (drawn.length === 2) expect(apart(drawn[0], drawn[1])).toBe(true);
    }
  });

  it('shows at most a few floaters per target and queues the rest, most severe first', () => {
    const t0 = 30_000;
    const list = [
      onset('pain_shock', 'Pain-Shock (mild)', 500),
      onset('hypovolemia', 'Hypovolemia (critical)', 500),
      onset('winded', 'Winded', 500),
      onset('staggered', 'Staggered', 500),
      onset('bleeding', 'Bleeding (moderate)', 500)
    ];
    draw(list, both, t0);
    const first = draw(list, both, t0 + 300);
    expect(first).toHaveLength(FLOATERS_PER_TARGET);
    expect(first.map((d) => d.s)).not.toContain(
      word('Pain-Shock (mild)', tint('#9575cd'), { small: true, icon: 'pip' })[0]
    );
    draw(list, both, t0 + 1800);
    const later = draw(list, both, t0 + 2000);
    expect(later.length).toBeGreaterThan(0);
  });

  it('merges hits on one target within a short window into one number', () => {
    const t0 = 40_000;
    const a = hit(7, 600);
    draw([a], both, t0);
    const b = hit(10, 600);
    const drawn = draw([a, b], both, t0 + MERGE_HITS_MS / 2);
    expect(drawn.map((d) => d.s)).toEqual([word('-17', HURT)[0]]);
  });
});
