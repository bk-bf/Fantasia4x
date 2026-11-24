import { describe, expect, it } from 'vitest';
import {
  drawFloats,
  type Box,
  type Locate,
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
  entityId: `p${worldX}`,
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

const both = { icons: true, text: true, words: true };

function draw(
  list: CombatTextEvent[],
  mode: FloaterMode,
  now: number,
  blocked: Box[] = [],
  locate?: Locate
): Put[] {
  const put: Put[] = [];
  const p = {
    textRatio: 1,
    label: (s: Spr, x: number, y: number, ox: number, oy: number) =>
      put.push({ s, x: x + ox, y: y + oy }),
    fill: () => {},
    band: (x: number, y: number, ox: number, oy: number, w: number, h: number) =>
      ticks.push([x + ox, y + oy, w, h])
  } as unknown as FxPainter;
  ticks.length = 0;
  drawFloats(p, null, list, now, mode, blocked, locate);
  return put;
}

const ticks: number[][] = [];

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
    expect(draw([e], { icons: true, text: false, words: true }, at + 501).map((d) => d.s)).toEqual([
      icon('winded')[0]
    ]);
    expect(draw([e], { icons: false, text: true, words: true }, at + 502).map((d) => d.s)).toEqual([
      word('Winded', tint('#9575cd'), { small: true })[0]
    ]);
    expect(draw([e], { icons: false, text: false, words: true }, at + 503)).toEqual([]);
  });

  it('shows condition icons alone, with no numbers, when only the icons are on', () => {
    const at = 15_000;
    const e = onset('winded', 'Winded', 8000);
    const h = hit(7, 8001, 4, at);
    const iconsOnly = { icons: true, text: false, words: false };
    draw([e, h], iconsOnly, at);
    expect(draw([e, h], iconsOnly, at + 500).map((d) => d.s)).toEqual([icon('winded')[0]]);
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

  it('drifts a lost condition in from above, strikes it through, then crumbles it', () => {
    const at = 200_000;
    const gain = onset('wet', 'Wet', 900, 4);
    const loss = onset('wet', 'Wet', 1900, 4, { lost: true });
    const frame = (e: CombatTextEvent, now: number) => {
      const drawn = draw([e], both, now);
      const lines = ticks.filter((t) => t[3] === 1).map((t) => t[2]);
      return { s: drawn[0]?.s, y: drawn[0] && rect(drawn[0])[1], line: lines[0] ?? 0 };
    };
    frame(gain, at);
    expect(frame(gain, at + 1000).line).toBe(0);
    const t0 = at + 10_000;
    frame(loss, t0);
    const early = frame(loss, t0 + 100);
    const settled = frame(loss, t0 + 550);
    expect(settled.y).toBeGreaterThan(early.y);
    expect(early.line).toBe(0);
    const striking = frame(loss, t0 + 750);
    const struck = frame(loss, t0 + 1500);
    expect(striking.line).toBeGreaterThan(0);
    expect(struck.line).toBeGreaterThan(striking.line);
    const lit = (x: Spr) => x.c.filter(Boolean).length;
    const crumbling = frame(loss, t0 + 2100).s;
    const gone = frame(loss, t0 + 2900).s;
    expect(crumbling.h).toBeGreaterThan(struck.s.h);
    expect(lit(gone)).toBeLessThan(lit(crumbling));
    expect(lit(crumbling)).toBeLessThan(lit(struck.s) + struck.s.w);
  });

  it('fades a lost condition so it never looks like the gain', () => {
    const gain = floater('drops', 'Wet', '#4fa3d1')[0];
    const loss = floater('drops', 'Wet', '#4fa3d1', undefined, 0, true)[0];
    expect([loss.w, loss.h]).toEqual([gain.w, gain.h]);
    const colour = (s: typeof gain) =>
      s.c.reduce((n, c) => n + (c ? Math.max(...c) - Math.min(...c) : 0), 0) /
      s.c.filter(Boolean).length;
    expect(colour(loss)).toBeLessThan(colour(gain) * 0.5);
  });

  it('keeps every floater on screen clear of every other, across neighbouring creatures', () => {
    const t0 = 250_000;
    const list = [
      onset('knockdown', 'Knocked Down', 3000, 4),
      onset('winded', 'Winded', 3001, 4),
      onset('bleeding', 'Bleeding', 3001, 4, { level: 2, levels: 3 }),
      hit(7, 3000, 4, t0),
      hit(9, 3001, 4, t0),
      onset('staggered', 'Staggered', 3002, 4)
    ];
    draw(list, both, t0);
    for (let dt = 100; dt <= 3000; dt += 100) {
      const drawn = draw(list, both, t0 + dt).map(rect);
      for (let i = 0; i < drawn.length; i++)
        for (let j = i + 1; j < drawn.length; j++) expect(apart(drawn[i], drawn[j])).toBe(true);
    }
  });

  it('rises clear of a speech bubble instead of landing on it', () => {
    const t0 = 260_000;
    const e = onset('winded', 'Winded', 4000, 4);
    const first = draw([e], both, t0)[0];
    const [x0, y0, x1, y1] = rect(first);
    const bubble: Box = [x0 - 10, y0 - 20, x1 + 10, y1 + 20];
    for (let dt = 100; dt <= 3000; dt += 300) {
      const drawn = draw([e], both, t0 + dt, [bubble]).map(rect);
      expect(drawn.every((d) => apart(d, bubble))).toBe(true);
    }
  });

  it('follows the creature it belongs to while it lives', () => {
    const t0 = 270_000;
    const e = onset('winded', 'Winded', 5000, 4, { entityId: 'walker' });
    let pos = { x: 5000, y: 4 };
    const locate: Locate = (id) => (id === 'walker' ? pos : undefined);
    draw([e], both, t0, [], locate);
    const before = rect(draw([e], both, t0 + 1000, [], locate)[0]);
    pos = { x: 5003, y: 6 };
    const after = rect(draw([e], both, t0 + 1000, [], locate)[0]);
    expect(after[0] - before[0]).toBe(3 * 32);
    expect(after[1] - before[1]).toBe(2 * 32);
  });

  it('settles back toward the head once the floater it made room for is gone', () => {
    const t0 = 280_000;
    const first = onset('knockdown', 'Knocked Down', 7000, 4, { entityId: 'a' });
    const second = onset('winded', 'Winded', 7000, 4, { entityId: 'b' });
    const alone = onset('winded', 'Winded', 7100, 4, { entityId: 'c' });
    const w = worded('winded', 'Winded', '#9575cd')[0].w;
    const lift = (now: number, list: CombatTextEvent[]) => {
      const drawn = draw(list, both, now)
        .filter((d) => d.s.w === w)
        .map(rect);
      const mine = drawn.find((d) => d[0] < 7050 * 32)!;
      const ref = drawn.find((d) => d[0] > 7050 * 32)!;
      return ref[1] - mine[1];
    };
    draw([first], both, t0);
    draw([first, second, alone], both, t0 + 1500);
    const blocked = lift(t0 + 2500, [first, second, alone]);
    const freed = lift(t0 + 3600, [second, alone]);
    expect(blocked).toBeGreaterThan(0);
    expect(freed).toBeLessThan(blocked);
  });

  it('ties a lifted floater to its own creature with a tick down to its head', () => {
    const t0 = 290_000;
    const low = onset('knockdown', 'Knocked Down', 9000, 4, { entityId: 'left' });
    const high = onset('winded', 'Winded', 9001, 4, { entityId: 'right' });
    draw([low], both, t0);
    draw([low, high], both, t0 + 300);
    const drawn = draw([low, high], both, t0 + 800);
    const mine = ticks.filter((t) => t[2] === 1);
    expect(mine).toHaveLength(1);
    expect(mine[0][0]).toBe((9001 + 0.5) * 32);
    const winded = rect(drawn.find((d) => d.x > (9001 - 0.5) * 32)!);
    expect(mine[0][1]).toBe(winded[3]);
    expect(mine[0][3]).toBeGreaterThan(5);
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
