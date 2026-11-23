import { describe, expect, it } from 'vitest';
import {
  drawFloats,
  FLOATERS_PER_TARGET,
  MERGE_HITS_MS,
  type FloaterMode
} from '$lib/components/UI/canvas/worldFx/floats';
import { arrows, floater, icon, worded } from '$lib/pixelArt/fx/icons';
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
  worldY = 4,
  more: Partial<CombatTextEvent> = {}
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
  conditionId,
  ...more
});

const hit = (n: number, worldX: number, worldY = 4, spawnTime = 0): CombatTextEvent => ({
  id: nextId++,
  spawnTime,
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
      onset('pain_shock', 'Pain-Shock', 500, 4, { level: 1, levels: 4 }),
      onset('hypovolemia', 'Hypovolemia', 500, 4, { level: 4, levels: 4 }),
      onset('winded', 'Winded', 500),
      onset('staggered', 'Staggered', 500),
      onset('bleeding', 'Bleeding', 500, 4, { level: 2, levels: 3 })
    ];
    draw(list, both, t0);
    const first = draw(list, both, t0 + 300);
    expect(first).toHaveLength(FLOATERS_PER_TARGET);
    expect(first.map((d) => d.s)).not.toContain(
      floater('pain', 'Pain-Shock', '#9575cd', undefined, 1)[0]
    );
    draw(list, both, t0 + 1800);
    const later = draw(list, both, t0 + 2000);
    expect(later.length).toBeGreaterThan(0);
  });

  it('shows the stage as arrows, never as a word', () => {
    let at = 100_000;
    const look = (level: number, easing = false) => {
      at += 10_000;
      const e = onset('bleeding', 'Bleeding', nextX++, 4, { level, levels: 3, easing });
      draw([e], both, at);
      return draw([e], both, at + 500)[0].s;
    };
    const [one, two, three, eased] = [look(1), look(2), look(3), look(1, true)];
    expect(new Set([one, two, three, eased]).size).toBe(4);
    expect(two.w - one.w).toBe(arrows(2)!.w - arrows(1)!.w);
    expect(three.w - two.w).toBe(arrows(3)!.w - arrows(2)!.w);
    expect(one).toBe(floater('bleeding', 'Bleeding', '#9575cd', undefined, 1)[0]);
    expect(eased).toBe(floater('bleeding', 'Bleeding', '#9575cd', undefined, -1)[0]);
  });

  it('strikes a lost condition out, left to right, and never a gained one', () => {
    const at = 200_000;
    const gain = onset('wet', 'Wet', 900, 4);
    const loss = onset('wet', 'Wet', 1900, 4, { lost: true });
    const bands = (e: CombatTextEvent, now: number) => {
      const out: number[] = [];
      const p = {
        textRatio: 1,
        label: () => {},
        fill: () => {},
        band: (_x: number, _y: number, _ox: number, _oy: number, w: number) => out.push(w)
      } as unknown as FxPainter;
      drawFloats(p, null, [e], now, both);
      return out;
    };
    bands(gain, at);
    expect(bands(gain, at + 300)).toEqual([]);
    bands(loss, at + 10_000);
    const early = bands(loss, at + 10_200);
    const late = bands(loss, at + 10_900);
    expect(early.length).toBe(2);
    expect(late[1]).toBeGreaterThan(early[1]);
  });

  it('merges hits that land close together, however late the frame that sees them', () => {
    const t0 = 300_000;
    const a = hit(7, 600, 4, t0);
    draw([a], both, t0 + 50);
    const b = hit(10, 600, 4, t0 + MERGE_HITS_MS - 100);
    const drawn = draw([a, b], both, t0 + 500);
    expect(drawn.map((d) => d.s)).toEqual([word('-17', HURT)[0]]);
  });

  it('keeps hits apart that land further apart than the window', () => {
    const t0 = 310_000;
    const a = hit(7, 700, 4, t0);
    draw([a], both, t0 + 50);
    const b = hit(10, 700, 4, t0 + MERGE_HITS_MS + 200);
    const drawn = draw([a, b], both, t0 + MERGE_HITS_MS + 250);
    expect(drawn).toHaveLength(2);
  });
});
