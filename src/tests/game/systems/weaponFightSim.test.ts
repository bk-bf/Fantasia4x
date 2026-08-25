import { describe, it, expect } from 'vitest';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { buildScenario } from '$lib/game/headless/Scenario';
import type { Mob, Pawn } from '$lib/game/core/types';

/**
 * FIGHT SIM — total damage over a real fight, not damage per second.
 *
 * DPS ignores three things that decide actual fights: a swing that is blocked or dodged is wasted
 * entirely, armour condition falls as it is struck and SHATTERS at zero (Combat.decrEquipDurability
 * removes the piece from the doll), and precision biases where the blow lands. This drives the real
 * loop — HeadlessSession, drafted colonists, `attackTargetWith`, real ticks — and reports time to
 * kill plus what the target was still wearing when it died.
 *
 * Preflight per the headless skill: flat map (default), needs frozen, `seedEntities: false` so the
 * only mob is the one under test, and the fight is driven by an explicit draft order because the sim
 * starts at night and mobs are vision-gated.
 */

const CREATURE = 'orc_reaver'; // geared humanoid: draws worn armour from `orc_warband`, so it can be stripped

interface Outcome {
  ticks: number;
  killed: boolean;
  /** Fraction of the target's blood pool still left when the fight ended. */
  bloodPct: number;
  /** Armour condition remaining, as a fraction of what it spawned with. */
  armourPct: number;
  /** Tick at which the last worn piece shattered (Combat removes it at condition 0). */
  strippedAt: number | null;
  /** Blood lost in the first 600 ticks, i.e. before armour attrition can matter. */
  early: number;
}

/** ONE drafted colonist against ONE mob, so the weapon is the only variable. */
async function duel(weaponId: string, offHand: string | undefined, maxTicks = 12_000): Promise<Outcome> {
  const s = new HeadlessSession();
  await s.start(
    buildScenario({
      seed: 4242,
      map: { w: 24, h: 24 },
      pawns: [
        {
          count: 1,
          drafted: true,
          stats: { strength: 30, dexterity: 30, constitution: 40, perception: 20 },
          equip: [weaponId, ...(offHand ? [offHand] : [])]
        }
      ],
      needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
      spawnMobs: [{ count: 1, creatureId: CREATURE }],
      seedEntities: false
    })
  );

  const mobOf = (): Mob | undefined => s.getState().mobs?.[0];
  const start = mobOf();
  if (!start) throw new Error('no mob spawned');
  const startBlood = start.bloodVolume ?? start.maxBloodVolume ?? 1;
  const startArmour = armourCondition(start);

  const ids = (s.getState().pawns as Pawn[]).map((p) => p.id);
  s.command({
    type: 'attackTargetWith',
    payload: { ids, targetId: start.id, targetType: 'mob' }
  } as never);

  let ticks = 0;
  let strippedAt: number | null = null;
  let early = 0;
  let last = mobOf();
  while (ticks < maxTicks) {
    s.tick(20);
    ticks += 20;
    const m = mobOf();
    if (startArmour > 0 && strippedAt === null && (!m || armourCondition(m) <= 0)) strippedAt = ticks;
    if (ticks === 600) early = startBlood - ((m?.bloodVolume ?? 0) || 0);
    if (!m || m.isAlive === false) {
      last = m ?? last;
      break;
    }
    last = m;
  }

  const alive = last && last.isAlive !== false;
  return {
    ticks,
    killed: !alive,
    bloodPct: Math.round((((last?.bloodVolume ?? 0) || 0) / startBlood) * 100),
    armourPct: startArmour > 0 ? Math.round((armourCondition(last!) / startArmour) * 100) : 0,
    strippedAt,
    early: Math.round(early)
  };
}

/** Total condition across worn armour pieces (a piece at 0 is removed from the doll by Combat). */
function armourCondition(m: Mob | undefined): number {
  const eq = (m?.equipment ?? {}) as Record<string, { itemId: string; durability?: number } | undefined>;
  let sum = 0;
  for (const [slot, inst] of Object.entries(eq)) {
    if (!inst || slot === 'mainHand') continue;
    sum += inst.durability ?? 0;
  }
  return sum;
}

const CONTENDERS: [string, string, string | undefined][] = [
  ['stiletto (dagger)', 'steel_stiletto', undefined],
  ['longsword+shield', 'steel_longsword', 'iron_boss_shield'],
  ['mace+shield', 'steel_mace', 'iron_boss_shield'],
  ['warhammer 2H', 'steel_warhammer', undefined],
  ['greatsword 2H', 'steel_greatsword', undefined],
  ['greatcleaver 2H', 'steel_greatcleaver', undefined]
];

/**
 * The trait piles the analytical sweep (`t4WeaponAudit.test.ts`) ranked as the most dangerous, taken
 * back into the real loop to see whether the paper multiplier survives contact with a live fight.
 * `whirlwind` and `giants-grip` are the two epics that top every stack; the `*-plus-5` line is the
 * flat stat pile; `lumbering-fighter` is the worst flaw found.
 */
const TRAIT_PILES: [string, string[]][] = [
  ['baseline (no traits)', []],
  ['whirlwind', ['whirlwind']],
  ['giants-grip', ['giants-grip']],
  ['whirlwind+giants-grip', ['whirlwind', 'giants-grip']],
  ['audit worst-5 stack', ['whirlwind', 'giants-grip', 'str-dex-plus-5', 'all-plus-5', 'dex-plus-5']],
  ['lumbering-fighter (flaw)', ['lumbering-fighter']]
];

async function traitDuel(weaponId: string, traitIds: string[], seed = 4242, maxTicks = 12_000): Promise<Outcome> {
  const s = new HeadlessSession();
  await s.start(
    buildScenario({
      seed,
      map: { w: 24, h: 24 },
      pawns: [
        {
          count: 1,
          drafted: true,
          stats: { strength: 30, dexterity: 30, constitution: 40, perception: 30 },
          traits: traitIds,
          equip: [weaponId]
        }
      ],
      needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
      spawnMobs: [{ count: 1, creatureId: CREATURE }],
      seedEntities: false
    })
  );
  const mobOf = (): Mob | undefined => s.getState().mobs?.[0];
  const start = mobOf();
  if (!start) throw new Error('no mob spawned');
  const startBlood = start.bloodVolume ?? 1;
  const startArmour = armourCondition(start);
  const ids = (s.getState().pawns as Pawn[]).map((p) => p.id);
  s.command({
    type: 'attackTargetWith',
    payload: { ids, targetId: start.id, targetType: 'mob' }
  } as never);

  let ticks = 0;
  let last = mobOf();
  while (ticks < maxTicks) {
    s.tick(20);
    ticks += 20;
    const m = mobOf();
    if (!m || m.isAlive === false) {
      last = m ?? last;
      break;
    }
    last = m;
  }
  const alive = last && last.isAlive !== false;
  return {
    ticks,
    killed: !alive,
    bloodPct: Math.round((((last?.bloodVolume ?? 0) || 0) / startBlood) * 100),
    armourPct: startArmour > 0 ? Math.round((armourCondition(last!) / startArmour) * 100) : 0,
    strippedAt: null,
    early: 0
  };
}

describe('fight sim — total damage over a real fight (HeadlessSession)', () => {
  it(
    'time to kill an armoured orc, and whether its armour survived the fight',
    { timeout: 300_000 },
    async () => {
      const lines = ['[FIGHT] one drafted colonist STRENGTH/DEXTERITY 30 vs one Orc Reaver, 1v1'];
      lines.push('loadout              ticks  killed  blood%  armour%  stripped@  blood lost @600t');
      const results: [string, Outcome][] = [];
      for (const [label, id, off] of CONTENDERS) {
        const r = await duel(id, off);
        results.push([label, r]);
        lines.push(
          label.padEnd(20) +
            String(r.ticks).padStart(6) +
            String(r.killed).padStart(8) +
            String(r.bloodPct).padStart(7) +
            '%' +
            String(r.armourPct).padStart(8) +
            '%' +
            String(r.strippedAt ?? '—').padStart(11) +
            String(r.early).padStart(18)
        );
      }
      console.log(lines.join('\n'));

      // The sim ran a real fight: a real pawn damaged a real mob over real ticks.
      const anyProgress = results.some(([, r]) => r.killed || r.bloodPct < 100);
      expect(anyProgress, 'the drafted colonist engaged and damaged the orc').toBe(true);
    }
  );

  it(
    'TRAIT CONFIRMATION — the audit’s worst trait piles, in a real fight',
    { timeout: 300_000 },
    async () => {
      // Time to kill is the honest measure here: the analytical sweep prices dps, but a fight also
      // spends swings on misses, blocks and a target that fights back. A pile that halves the clock
      // is doing in the loop what the sweep said it would.
      // A top-tier weapon kills this orc in a handful of swings, so ONE seed is noise: whether those
      // two or three swings crit decides the whole run. Every cell is the mean over SEEDS runs.
      const SEEDS = [4242, 7, 1013, 55, 909, 31337, 64, 2718];
      const meanTicks = async (weapon: string, ids: string[]) => {
        let sum = 0;
        for (const seed of SEEDS) sum += (await traitDuel(weapon, ids, seed)).ticks;
        return sum / SEEDS.length;
      };
      for (const weapon of ['rune_sung_greatsword', 'rune_weighted_warhammer', 'rune_slotted_stiletto']) {
        const lines = [`[TRAITS vs orc] ${weapon} — mean ticks to kill over ${SEEDS.length} seeds`];
        let baseline = 0;
        for (const [label, ids] of TRAIT_PILES) {
          const t = await meanTicks(weapon, ids);
          if (label.startsWith('baseline')) baseline = t;
          lines.push(
            label.padEnd(26) + t.toFixed(0).padStart(6) + ' ticks   ×' +
              (baseline > 0 ? (baseline / t).toFixed(2) : '—') + ' vs baseline'
          );
        }
        console.log(lines.join('\n'));
      }
      // The pile must be a real, visible advantage in the loop, not just on paper.
      const plain = await meanTicks('rune_slotted_stiletto', []);
      const stacked = await meanTicks('rune_slotted_stiletto', TRAIT_PILES[4][1]);
      console.log(`[TRAITS] stiletto worst-5 pile: ${plain.toFixed(0)} → ${stacked.toFixed(0)} mean ticks`);
      expect(stacked, 'the worst-5 pile measurably shortens a real fight').toBeLessThan(plain);
    }
  );
});
