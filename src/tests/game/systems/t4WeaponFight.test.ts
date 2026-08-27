import { describe, it, expect } from 'vitest';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { buildScenario } from '$lib/game/headless/Scenario';
import { setSimLogSink } from '$lib/game/core/util/logSink';
import itemsData from '$lib/game/database/items/items.jsonc';
import type { CombatTurnEntry } from '$lib/game/core/defs/events';
import type { Pawn } from '$lib/game/core/types';

const BASE = {
  strength: 10,
  dexterity: 10,
  constitution: 10,
  perception: 10,
  intelligence: 10,
  charisma: 10
};
type Stats = typeof BASE;
const CORE_ALL: (keyof Stats)[] = [
  'strength',
  'dexterity',
  'constitution',
  'perception',
  'intelligence',
  'charisma'
];

const OPPONENTS: Record<'raider' | 'knight' | 'duelist', { stats: Partial<Stats>; equip: string[] }> = {
  raider: { stats: { ...BASE, dexterity: 8, constitution: 12 }, equip: ['raw_hide_vest'] },
  knight: {
    stats: { ...BASE, dexterity: 6, constitution: 20 },
    equip: ['plate_cuirass', 'mail_hauberk', 'great_helm']
  },
  duelist: { stats: { ...BASE, dexterity: 40, constitution: 25 }, equip: ['iron_boss_shield'] }
};
type OppKey = keyof typeof OPPONENTS;

const MELEE: [string, keyof Stats, boolean][] = [
  ['rune_etched_axe', 'dexterity', false],
  ['rune_ribbed_mace', 'dexterity', false],
  ['rune_toothed_cleaver', 'dexterity', false],
  ['rune_lashing_greatflail', 'strength', true],
  ['rune_etched_arming_sword', 'dexterity', false],
  ['rune_standard_glaive', 'charisma', true],
  ['rune_chained_flail', 'dexterity', false],
  ['rune_graven_spear', 'dexterity', false],
  ['rune_needle_rapier', 'perception', false],
  ['rune_slotted_stiletto', 'dexterity', false],
  ['rune_sung_greatsword', 'strength', true],
  ['rune_bitten_greataxe', 'strength', true],
  ['rune_fanged_greatcleaver', 'strength', true],
  ['rune_weighted_warhammer', 'strength', true],
  ['rune_etched_halberd', 'strength', true],
  ['rune_banded_longstaff', 'strength', true]
];

const RANGED = ['rune_strung_warbow', 'rune_cranked_arbalest', 'rune_whistling_sling', 'rune_marked_javelin'];

function offHandFor(id: string, twoHanded: boolean): string | undefined {
  return twoHanded || /stiletto|rapier/.test(id) ? undefined : 'iron_boss_shield';
}

const ITEMS = itemsData as Array<{
  id: string;
  tier?: number;
  category?: string;
  weaponProperties?: Record<string, unknown>;
  ammoProperties?: Record<string, unknown>;
}>;
function wp(id: string): Record<string, unknown> {
  return ITEMS.find((i) => i.id === id)!.weaponProperties!;
}

function godmode(p: Pawn): void {
  p.bloodVolume = 1e7;
  p.maxBloodVolume = 1e7;
  for (const limb of p.limbs ?? []) {
    limb.health = 1e7;
    for (const part of limb.parts ?? []) {
      part.health = 1e7;
      part.maxHp = 1e7;
    }
  }
}

interface Tally {
  swings: number;
  hits: number;
  damage: number;
}
const tally = (): Tally => ({ swings: 0, hits: 0, damage: 0 });

function withTallySink(myName: string, t: Tally, fn: () => void): void {
  setSimLogSink({
    logActivity: () => '',
    logEvent: () => {},
    logCombatSwing: (
      _a: string,
      attackerName: string,
      _b: string,
      _c: string,
      _t: number,
      _x: number,
      _y: number,
      sw: CombatTurnEntry
    ) => {
      if (attackerName !== myName) return;
      t.swings++;
      if (sw.hit) {
        t.hits++;
        t.damage += sw.damage ?? 0;
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
  try {
    fn();
  } finally {
    setSimLogSink(null as never);
  }
}

async function meleeDuel(
  weaponId: string,
  offHand: string | undefined,
  atkStats: Partial<Stats>,
  oppKey: OppKey,
  seed: number,
  ticks = 1800
): Promise<Tally & { conditions: string[] }> {
  const gs = buildScenario({
    seed,
    map: { w: 24, h: 24 },
    pawns: [
      { count: 1, drafted: true, stats: atkStats, equip: [weaponId, ...(offHand ? [offHand] : [])] },
      { count: 1, drafted: true, stats: OPPONENTS[oppKey].stats, equip: OPPONENTS[oppKey].equip }
    ],
    needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
    seedEntities: false
  });
  gs.pawns[0].position = { x: 10, y: 10 };
  gs.pawns[1].position = { x: 10, y: 11 };
  godmode(gs.pawns[1] as Pawn);
  const s = new HeadlessSession();
  await s.start(gs);
  const pawns = s.getState().pawns as Pawn[];
  const [me, foe] = pawns;
  const t = tally();
  withTallySink(me.name, t, () => {
    s.command({
      type: 'attackTargetWith',
      payload: { ids: [me.id], targetId: foe.id, targetType: 'pawn' }
    } as never);
    s.tick(ticks);
  });
  const after = (s.getState().pawns as Pawn[]).find((p) => p.id === me.id)!;
  return { ...t, conditions: (after.conditions ?? []).map((c) => c.id) };
}

async function rangedDuel(
  weaponId: string,
  mainHandExtra: string | undefined,
  ammoId: string | undefined,
  ammoStart: number,
  seed: number,
  ticks: number,
  distance = 4
): Promise<{ tally: Tally; ammoSpent: number; drops: number; offHandGone: boolean }> {
  const equip = ammoId ? [weaponId] : mainHandExtra ? [mainHandExtra, weaponId] : [weaponId];
  const gs = buildScenario({
    seed,
    map: { w: 24, h: 24 },
    pawns: [
      {
        count: 1,
        drafted: true,
        stats: { ...BASE, strength: 20, dexterity: 20, perception: 30 },
        equip
      },
      { count: 1, drafted: true, stats: BASE, equip: [] }
    ],
    needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
    seedEntities: false
  });
  gs.pawns[0].position = { x: 10, y: 10 };
  gs.pawns[1].position = { x: 10, y: 10 + distance };
  if (ammoId) {
    const inv = gs.pawns[0].inventory ?? {
      items: {},
      instances: [],
      weightKg: 0,
      maxWeightKg: 50,
      volumeL: 0,
      maxVolumeL: 50
    };
    gs.pawns[0].inventory = { ...inv, items: { ...inv.items, [ammoId]: ammoStart } };
  }
  godmode(gs.pawns[1] as Pawn);
  const s = new HeadlessSession();
  await s.start(gs);
  const pawns = s.getState().pawns as Pawn[];
  const [me, foe] = pawns;
  const t = tally();
  withTallySink(me.name, t, () => {
    s.command({
      type: 'attackTargetWith',
      payload: { ids: [me.id], targetId: foe.id, targetType: 'pawn' }
    } as never);
    s.tick(ticks);
  });
  const after = (s.getState().pawns as Pawn[]).find((p) => p.id === me.id)!;
  const ammoEnd = ammoId ? ((after.inventory?.items as Record<string, number> | undefined)?.[ammoId] ?? 0) : 0;
  const dropTarget = ammoId ?? weaponId;
  const drops = (s.getState().droppedItems ?? []).filter(
    (d) => (d as { resourceId?: string }).resourceId === dropTarget
  ).length;
  return {
    tally: t,
    ammoSpent: ammoId ? ammoStart - ammoEnd : 0,
    drops,
    offHandGone: after.equipment?.offHand === undefined
  };
}

describe('T4 melee weapons — power stat confirmed in a REAL fight (HeadlessSession)', () => {
  it(
    "the stat that wins a live duel is the weapon's declared powerStat (vs a knight opponent)",
    { timeout: 600_000 },
    async () => {
      const lines = ['[FIGHT STAT SWEEP vs knight] best-performing stat per T4 melee weapon, in a real duel'];
      for (const [id, powerStat, twoHanded] of MELEE) {
        const off = offHandFor(id, twoHanded);
        const cells: [string, number][] = [];
        for (const stat of CORE_ALL) {
          const r = await meleeDuel(id, off, { ...BASE, [stat]: 40 }, 'knight', 4242, 2400);
          cells.push([stat, r.damage]);
        }
        const best = cells.reduce((a, b) => (b[1] > a[1] ? b : a));
        lines.push(
          id.padEnd(28) +
            cells.map(([s, d]) => `${s.slice(0, 3)}:${d.toFixed(0)}`).join(' ') +
            `  best=${best[0]} (declared=${powerStat})`
        );
        expect(
          best[0],
          `${id}: a real fight says ${best[0]} wins, but the declared powerStat is ${powerStat}`
        ).toBe(powerStat);
      }
      console.log(lines.join('\n'));
    }
  );

  it(
    'the power-stat build measurably outdamages a flat baseline, against all three opponent profiles',
    { timeout: 600_000 },
    async () => {
      const lines = ['[FIGHT vs BASELINE] power-stat build (40) vs flat baseline (10), damage over the window'];
      for (const [id, powerStat, twoHanded] of MELEE) {
        const off = offHandFor(id, twoHanded);
        for (const opp of Object.keys(OPPONENTS) as OppKey[]) {
          const powered = await meleeDuel(id, off, { ...BASE, [powerStat]: 40 }, opp, 4242, 6000);
          const flat = await meleeDuel(id, off, BASE, opp, 4242, 6000);
          lines.push(
            `${id.padEnd(28)} vs ${opp.padEnd(8)} baseline ${flat.damage.toFixed(0).padStart(6)} -> powered ${powered.damage
              .toFixed(0)
              .padStart(6)}`
          );
          expect(
            powered.damage,
            `${id} vs ${opp}: the ${powerStat} build should out-damage the flat baseline in a real fight`
          ).toBeGreaterThan(flat.damage);
        }
      }
      console.log(lines.join('\n'));
    }
  );
});

describe('T4 ranged/arcane weapons — ammo lifecycle in a REAL fight (HeadlessSession)', () => {
  it(
    'warbow: draws matching arrows from inventory, and its shot damage beats its own melee stave (ammo x drawPower)',
    { timeout: 120_000 },
    async () => {
      const r = await rangedDuel('rune_strung_warbow', undefined, 'steel_bodkin_arrow', 200, 4242, 6000);
      const meleeDamage = wp('rune_strung_warbow').damage as number;
      console.log(
        `[WARBOW] ${r.tally.hits} hits, ${r.ammoSpent} arrows spent, avg dmg/hit ${(
          r.tally.damage / Math.max(1, r.tally.hits)
        ).toFixed(1)} (melee stave ${meleeDamage})`
      );
      expect(r.ammoSpent, 'the warbow drew and spent arrows from inventory').toBeGreaterThan(5);
      expect(r.tally.hits, 'shots landed on the target at range').toBeGreaterThan(0);
      expect(
        r.tally.damage / r.tally.hits,
        'shot damage comes from ammo x drawPower, not the weak melee stave'
      ).toBeGreaterThan(meleeDamage);
    }
  );

  it(
    "arbalest: the reload:4 span fires markedly fewer shots than the warbow's reload:1, over the same window",
    { timeout: 180_000 },
    async () => {
      const bow = await rangedDuel('rune_strung_warbow', undefined, 'steel_bodkin_arrow', 200, 4242, 6000);
      const arb = await rangedDuel('rune_cranked_arbalest', undefined, 'steel_quarrel', 200, 4242, 6000);
      console.log(
        `[RELOAD] warbow spent ${bow.ammoSpent} arrows, arbalest spent ${arb.ammoSpent} bolts, over the same 6000-tick window`
      );
      expect(arb.tally.hits, 'the arbalest still lands shots').toBeGreaterThan(0);
      expect(
        arb.ammoSpent,
        "the arbalest's longer reload fires fewer shots in the same window"
      ).toBeLessThan(bow.ammoSpent);
    }
  );

  it('sling: consumes sling_stone-category ammo and wounds the target at range', { timeout: 120_000 }, async () => {
    const r = await rangedDuel('rune_whistling_sling', undefined, 'lead_glans', 200, 4242, 6000);
    console.log(`[SLING] ${r.tally.hits} hits, ${r.ammoSpent} stones spent`);
    expect(r.ammoSpent, 'the sling drew and spent stones from inventory').toBeGreaterThan(5);
    expect(r.tally.hits, 'stones landed on the target at range').toBeGreaterThan(0);
  });

  it(
    "javelin: throws itself once (self-consuming), drops on the target's tile, then the pawn falls back to melee",
    { timeout: 60_000 },
    async () => {
      const r = await rangedDuel('rune_marked_javelin', 'rune_slotted_stiletto', undefined, 0, 4242, 3000);
      console.log(
        `[JAVELIN] offHand empty after throw: ${r.offHandGone}, drops of rune_marked_javelin: ${r.drops}, total hits (throw + follow-up melee): ${r.tally.hits}`
      );
      expect(r.offHandGone, 'the javelin unequips itself once thrown').toBe(true);
      expect(r.drops, 'the thrown javelin lands as a haulable drop').toBeGreaterThan(0);
      expect(
        r.tally.hits,
        'the pawn keeps fighting in melee (mainHand) after throwing its one javelin'
      ).toBeGreaterThan(1);
    }
  );
});

describe('T4 weapons — recoverable ammo, numerically', () => {
  it(
    'about the declared `recoverable` fraction of spent arrows land back on the ground',
    { timeout: 180_000 },
    async () => {
      const recoverable = (ITEMS.find((i) => i.id === 'steel_bodkin_arrow')!.ammoProperties as { recoverable: number })
        .recoverable;
      const r = await rangedDuel('rune_strung_warbow', undefined, 'steel_bodkin_arrow', 300, 4242, 10_000);
      const rate = r.drops / Math.max(1, r.ammoSpent);
      console.log(
        `[RECOVER] ${r.ammoSpent} arrows spent, ${r.drops} recovered (${(rate * 100).toFixed(0)}% vs a declared ${(
          recoverable * 100
        ).toFixed(0)}%)`
      );
      expect(r.ammoSpent, 'enough shots fired for the recovery rate to be measurable').toBeGreaterThan(30);
      expect(r.drops, 'some arrows are recovered').toBeGreaterThan(0);
      expect(
        Math.abs(rate - recoverable),
        "the recovered fraction tracks the ammo's declared recoverable probability"
      ).toBeLessThan(0.3);
    }
  );
});

describe('T4 weapons — wieldRequirement.strength drives a real fight loss (overmatched)', () => {
  it(
    'an underpowered pawn takes `overmatched` and measurably loses, vs an adequately-strong pawn with the same weapon',
    { timeout: 120_000 },
    async () => {
      const weak = await meleeDuel('rune_weighted_warhammer', undefined, { ...BASE, strength: 6 }, 'knight', 4242);
      const strong = await meleeDuel('rune_weighted_warhammer', undefined, { ...BASE, strength: 30 }, 'knight', 4242);
      console.log(
        `[OVERMATCHED] warhammer (wieldRequirement.strength 20) — STRENGTH 6: ${weak.damage.toFixed(
          0
        )} dmg, conditions [${weak.conditions.join(',')}]; STRENGTH 30: ${strong.damage.toFixed(
          0
        )} dmg, conditions [${strong.conditions.join(',')}]`
      );
      expect(weak.conditions, 'the underpowered pawn is overmatched by the weapon').toContain('overmatched');
      expect(strong.conditions, 'the adequately-strong pawn is not overmatched').not.toContain('overmatched');
      expect(
        weak.damage,
        'being overmatched measurably costs damage output in a real fight'
      ).toBeLessThan(strong.damage);
      expect(
        weak.hits / Math.max(1, weak.swings),
        'the overmatched hitChance penalty shows up as a worse hit rate'
      ).toBeLessThan(strong.hits / Math.max(1, strong.swings));
    }
  );
});

describe('T4 weapon fight coverage — the class cannot silently reopen', () => {
  it('every real tier-4 rune_ weapon has a headless duel or ranged pass in this file', () => {
    const live = ITEMS.filter(
      (i) => i.tier === 4 && i.weaponProperties && i.category !== 'natural_weapon' && i.id.startsWith('rune_')
    )
      .map((i) => i.id)
      .sort();
    const covered = [...MELEE.map(([id]) => id), ...RANGED].sort();
    expect(live, 'a new or removed T4 rune_ weapon must be added to MELEE or RANGED above').toEqual(covered);
    expect(live.length).toBe(20);
  });
});
