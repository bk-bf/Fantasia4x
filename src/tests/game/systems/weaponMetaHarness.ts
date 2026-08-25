import { appendFileSync, writeFileSync } from 'node:fs';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { buildScenario } from '$lib/game/headless/Scenario';
import { setSimLogSink } from '$lib/game/core/util/logSink';
import type { CombatTurnEntry } from '$lib/game/core/defs/events';
import type { EntityStats, Pawn } from '$lib/game/core/types';

/**
 * Shared harness for the weapon-meta sweeps — which weapon beats which, and how armour on the TARGET changes the answer.
 *
 * NOT a `.test.ts`, so vitest never collects it: it is imported by the sweep files that are.
 *
 * The sweeps live in SEPARATE FILES on purpose. Vitest parallelises across files and runs the tests
 * inside one file sequentially, in a single worker — so the whole sweep as one file pinned exactly
 * one core no matter how many forks were allowed (measured: 8-core box, load average 1.01, seven
 * cores idle, ~45 minutes). One file per armour class turns that into one core each, running at once.
 *
 * Two separate questions:
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

export const MAX_TICKS = 14_000;
export const EQUAL: Partial<EntityStats> = { strength: 20, dexterity: 20, constitution: 20, perception: 20 };

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

export const ARMOUR: Record<string, string[]> = {
  none: [],
  light: [
    'linen_gambeson',
    'leather_coif',
    'rawhide_shoulder_pads',
    'rawhide_arm_wraps',
    'rawhide_leg_wraps'
  ],
  medium: ['iron_plated_jack', 'leather_coif', 'iron_bracers', 'iron_greaves'],
  heavy: ['plate_cuirass', 'great_helm', 'steel_vambraces', 'steel_greaves']
};

export const ONE_H: [string, string][] = [
  ['longsword', 'steel_longsword'],
  ['mace', 'steel_mace'],
  ['flail', 'steel_flail'],
  ['cleaver', 'steel_cleaver'],
  ['broadaxe', 'steel_broadaxe'],
  ['boar spear', 'steel_boar_spear'],
  ['rapier', 'steel_rapier']
];
export const TWO_H: [string, string][] = [
  ['greatsword', 'steel_greatsword'],
  ['greataxe', 'steel_greataxe'],
  ['greatcleaver', 'steel_greatcleaver'],
  ['warhammer', 'steel_warhammer'],
  ['greatflail', 'steel_greatflail'],
  ['halberd', 'steel_halberd'],
  ['pike', 'steel_pike']
];

export interface Side {
  label: string;
  equip: string[];
  traits?: string[];
}
export const STYLES: Side[] = [
  ...ONE_H.map(([n, id]) => ({ label: `${n} + shield`, equip: [id, 'iron_boss_shield'] })),
  ...ONE_H.map(([n, id]) => ({ label: `${n} duelist`, equip: [id], traits: ['duelist'] })),
  { label: 'twin daggers', equip: ['steel_stiletto', 'steel_stiletto'] },
  ...TWO_H.map(([n, id]) => ({ label: `${n} (2H)`, equip: [id] }))
];

export interface Duel {
  aWon: boolean;
  bWon: boolean;
  aDamage: number;
  aHits: number;
  aSwings: number;
}

/** One duel. `defenderArmour` is added to side B only — side A always fights naked. */
export async function duel(
  seed: number,
  A: Side,
  B: Side,
  defenderArmour: string[] = []
): Promise<Duel> {
  const s = new HeadlessSession();
  await s.start(
    buildScenario({
      seed,
      map: { w: 24, h: 24 },
      pawns: [
        {
          count: 1,
          drafted: true,
          stats: EQUAL,
          equip: A.equip,
          ...(A.traits ? { traits: A.traits } : {})
        },
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
