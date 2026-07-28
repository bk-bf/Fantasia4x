import { appendFileSync, writeFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { buildScenario } from '$lib/game/headless/Scenario';
import { setSimLogSink } from '$lib/game/core/logSink';
import type { CombatTurnEntry } from '$lib/game/core/Events';
import type { EntityStats, Pawn } from '$lib/game/core/types';

/**
 * WEAPON META — which weapon beats which, and how armour on the TARGET changes the answer.
 *
 * Two separate questions, run as two separate sweeps:
 *
 *   1. ARMOUR SWEEP — every style, naked, against every other style wearing each armour class. The
 *      thing being tested is whether the meta SPLITS: light fast one-handers strongest against
 *      unarmoured targets, two-handers strongest against armoured ones. If it does, that split is the
 *      balance, and no weapon needs a flat buff.
 *
 *   2. HEAD TO HEAD — every style against every other, nobody armoured, reported as a matchup grid
 *      rather than a single win total. A style with a poor overall record can still be a COUNTER: if
 *      most of what it wins comes from one or two specific opponents, that is a build with a purpose,
 *      not a weak build. Twin daggers are the case this exists to catch.
 *
 * Both sides always have identical stats at the spawn ceiling, so the weapon and the free hand are the
 * only variables.
 */

const MAX_TICKS = 14_000;
const EQUAL: Partial<EntityStats> = { brawn: 20, agility: 20, vigour: 20, awareness: 20 };

/**
 * Live progress file. Vitest buffers a test's console output until the test ENDS, so a sweep this long
 * looks frozen from the outside; writing straight to disk sidesteps the interception entirely and lets
 * the run be watched with `tail -f`.
 */
const PROGRESS = '.debug/weapon-meta-progress.log';
let _done = 0;
let _total = 0;
const startProgress = (label: string, total: number) => {
  _done = 0;
  _total = total;
  try {
    writeFileSync(PROGRESS, `${label} — ${total} fights to run\n`, { flag: 'a' });
  } catch {
    /* progress reporting must never fail the audit */
  }
};
const step = (what: string) => {
  _done++;
  if (_done % 25 !== 0 && _done !== _total) return;
  const pct = ((_done / _total) * 100).toFixed(1);
  try {
    appendFileSync(PROGRESS, `  ${_done} of ${_total} fights (${pct}%)   ${what}\n`);
  } catch {
    /* ignore */
  }
};

const ARMOUR: Record<string, string[]> = {
  none: [],
  light: ['linen_gambeson', 'leather_coif', 'rawhide_shoulder_pads', 'rawhide_arm_wraps', 'rawhide_leg_wraps'],
  medium: ['brigandine_coat', 'leather_coif', 'iron_pauldrons', 'iron_bracers', 'iron_greaves'],
  heavy: ['plate_cuirass', 'great_helm', 'steel_pauldrons', 'steel_vambraces', 'steel_greaves']
};

const ONE_H: [string, string][] = [
  ['longsword', 'steel_longsword'],
  ['mace', 'steel_mace'],
  ['flail', 'steel_flail'],
  ['cleaver', 'steel_cleaver'],
  ['broadaxe', 'steel_broadaxe'],
  ['boar spear', 'steel_boar_spear'],
  ['rapier', 'steel_rapier']
];
const TWO_H: [string, string][] = [
  ['greatsword', 'steel_greatsword'],
  ['greataxe', 'steel_greataxe'],
  ['greatcleaver', 'steel_greatcleaver'],
  ['warhammer', 'steel_warhammer'],
  ['greatflail', 'steel_greatflail'],
  ['halberd', 'steel_halberd'],
  ['pike', 'steel_pike']
];

interface Side {
  label: string;
  equip: string[];
  traits?: string[];
}
const STYLES: Side[] = [
  ...ONE_H.map(([n, id]) => ({ label: `${n} + shield`, equip: [id, 'iron_boss_shield'] })),
  ...ONE_H.map(([n, id]) => ({ label: `${n} duelist`, equip: [id], traits: ['duelist'] })),
  { label: 'twin daggers', equip: ['steel_stiletto', 'steel_stiletto'] },
  ...TWO_H.map(([n, id]) => ({ label: `${n} (2H)`, equip: [id] }))
];

interface Duel {
  aWon: boolean;
  bWon: boolean;
  aDamage: number;
  aHits: number;
  aSwings: number;
}

/** One duel. `defenderArmour` is added to side B only — side A always fights naked. */
async function duel(seed: number, A: Side, B: Side, defenderArmour: string[] = []): Promise<Duel> {
  const s = new HeadlessSession();
  await s.start(
    buildScenario({
      seed,
      map: { w: 24, h: 24 },
      pawns: [
        { count: 1, drafted: true, stats: EQUAL, equip: A.equip, ...(A.traits ? { traits: A.traits } : {}) },
        {
          count: 1,
          drafted: true,
          stats: EQUAL,
          equip: [...B.equip, ...defenderArmour],
          ...(B.traits ? { traits: B.traits } : {})
        }
      ],
      needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
      seedEntities: false
    })
  );
  const pawns = s.getState().pawns as Pawn[];
  const [pa, pb] = pawns;
  let aDamage = 0;
  let aHits = 0;
  let aSwings = 0;
  setSimLogSink({
    logActivity: () => '',
    logEvent: () => {},
    logCombatSwing: (
      _i: string,
      attackerName: string,
      _j: string,
      _k: string,
      _t: number,
      _x: number,
      _y: number,
      sw: CombatTurnEntry
    ) => {
      if (attackerName !== pa.name) return;
      aSwings++;
      if (sw.hit) {
        aHits++;
        aDamage += sw.damage ?? 0;
      }
    },
    logCombatKill: () => {},
    pushCombatText: () => {},
    pushAttackLunge: () => {},
    pushCombatSound: () => {},
    pushProjectile: () => {},
    logEntityDeath: () => {},
    threatAlert: () => {},
    vitalAlert: () => {},
    pawnDeath: () => {}
  } as never);

  s.command({
    type: 'attackTargetWith',
    payload: { ids: [pa.id], targetId: pb.id, targetType: 'pawn' }
  } as never);
  s.command({
    type: 'attackTargetWith',
    payload: { ids: [pb.id], targetId: pa.id, targetType: 'pawn' }
  } as never);

  const alive = (id: string) => {
    const p = (s.getState().pawns as Pawn[]).find((x) => x.id === id);
    return !!p && p.isAlive !== false;
  };
  let ticks = 0;
  while (ticks < MAX_TICKS && alive(pa.id) && alive(pb.id)) {
    s.tick(20);
    ticks += 20;
  }
  setSimLogSink(null as never);
  return {
    aWon: alive(pa.id) && !alive(pb.id),
    bWon: alive(pb.id) && !alive(pa.id),
    aDamage,
    aHits,
    aSwings
  };
}

describe('WEAPON META', () => {
  it('1 · ARMOUR SWEEP: naked attacker against every style in every armour class', async () => {
    const SEEDS = [11, 23, 37];
    startProgress(
      '[1 · ARMOUR SWEEP] naked attacker vs every style in every armour class',
      Object.keys(ARMOUR).length * STYLES.length * (STYLES.length - 1) * SEEDS.length
    );
    const lines: string[] = [];
    const rankByArmour: Record<string, [string, number, number][]> = {};

    for (const [armourName, armour] of Object.entries(ARMOUR)) {
      const won: Record<string, number> = {};
      const dealt: Record<string, { dmg: number; hits: number }> = {};
      for (const s of STYLES) {
        won[s.label] = 0;
        dealt[s.label] = { dmg: 0, hits: 0 };
      }
      for (const A of STYLES)
        for (const B of STYLES) {
          if (A.label === B.label) continue;
          for (const seed of SEEDS) {
            const r = await duel(seed, A, B, armour);
            step(`${armourName} armour · ${A.label} vs ${B.label}`);
            if (r.aWon) won[A.label]++;
            dealt[A.label].dmg += r.aDamage;
            dealt[A.label].hits += r.aHits;
          }
        }
      const fights = (STYLES.length - 1) * SEEDS.length;
      const ranked = Object.entries(won)
        .map(([k, v]) => [k, v, dealt[k].hits ? dealt[k].dmg / dealt[k].hits : 0] as [string, number, number])
        .sort((x, y) => y[1] - x[1]);
      rankByArmour[armourName] = ranked;
      lines.push(
        `\n── target wearing ${armourName.toUpperCase()} armour ── (attacker always naked, ${fights} fights each)`
      );
      for (const [label, wins, perHit] of ranked)
        lines.push(
          `  ${label.padEnd(22)} won ${String(wins).padStart(3)} of ${fights}   ${perHit.toFixed(1)} damage per landed hit`
        );
    }

    // The question the split is supposed to answer: do the light fast one-handers lead against bare
    // targets while the two-handers lead against armoured ones?
    const posOf = (armour: string, label: string) =>
      rankByArmour[armour].findIndex(([l]) => l === label) + 1;
    const movers = STYLES.map((s) => ({
      label: s.label,
      naked: posOf('none', s.label),
      heavy: posOf('heavy', s.label)
    }))
      .sort((a, b) => a.naked - b.naked - (a.heavy - b.heavy))
      .map(
        (m) =>
          `  ${m.label.padEnd(22)} ranks #${String(m.naked).padStart(2)} against bare targets, ` +
          `#${String(m.heavy).padStart(2)} against plate   (${m.naked - m.heavy > 0 ? '+' : ''}${m.naked - m.heavy} places)`
      );

    console.log('[1 · ARMOUR SWEEP]' + lines.join('\n'));
    console.log(
      '\nhow each style moves when the target puts plate on ' +
        '(a positive number means it climbs the ranking):\n' +
        movers.join('\n')
    );
    expect(rankByArmour.none.length).toBe(STYLES.length);
  }, 7_200_000);

  it('2 · HEAD TO HEAD: the full matchup grid, and who counters whom', async () => {
    const SEEDS = [11, 23, 37, 41, 59, 71];
    startProgress(
      '[2 · HEAD TO HEAD] every style against every other, nobody armoured',
      ((STYLES.length * (STYLES.length - 1)) / 2) * SEEDS.length
    );
    const wins: Record<string, Record<string, number>> = {};
    for (const s of STYLES) wins[s.label] = {};

    for (let i = 0; i < STYLES.length; i++)
      for (let j = i + 1; j < STYLES.length; j++) {
        let a = 0;
        let b = 0;
        for (const seed of SEEDS) {
          const r = await duel(seed, STYLES[i], STYLES[j]);
          step(`${STYLES[i].label} vs ${STYLES[j].label}`);
          if (r.aWon) a++;
          if (r.bWon) b++;
        }
        wins[STYLES[i].label][STYLES[j].label] = a;
        wins[STYLES[j].label][STYLES[i].label] = b;
      }

    const total = (l: string) => Object.values(wins[l]).reduce((x, y) => x + y, 0);
    const order = STYLES.slice().sort((x, y) => total(y.label) - total(x.label));

    // Compact grid: 3-character column per opponent, in the same order as the rows.
    const grid = [
      '     ' + order.map((_, i) => String(i + 1).padStart(4)).join(''),
      ...order.map(
        (row, i) =>
          `${String(i + 1).padStart(2)} ${row.label.padEnd(22)}` +
          order
            .map((col) => (col.label === row.label ? '  —' : String(wins[row.label][col.label] ?? 0).padStart(4)))
            .join('')
      )
    ];

    // Counter analysis: where does each style's win total actually come from?
    const counters = order.map((s) => {
      const rows = Object.entries(wins[s.label]).sort((x, y) => y[1] - x[1]);
      const best = rows.filter(([, v]) => v >= 5).map(([k, v]) => `${k} (${v} of ${SEEDS.length})`);
      const worst = rows.filter(([, v]) => v <= 1).map(([k]) => k);
      return (
        `  ${s.label.padEnd(22)} won ${String(total(s.label)).padStart(3)} overall\n` +
        `      dominates: ${best.length ? best.join(', ') : 'nothing'}\n` +
        `      helpless against: ${worst.length ? worst.slice(0, 6).join(', ') : 'nothing'}`
      );
    });

    console.log(
      `[2 · HEAD TO HEAD] nobody armoured, ${SEEDS.length} fights per pairing\n` +
        'rows are numbered; the number in each cell is how many of the six the ROW style won\n' +
        grid.join('\n') +
        '\n\nwhere each style’s wins come from (a style that only beats one or two things is a COUNTER,\n' +
        'not a weak build):\n' +
        counters.join('\n')
    );
    for (const s of STYLES) expect(total(s.label)).toBeGreaterThanOrEqual(0);
  }, 7_200_000);
});
