import { describe, it, expect } from 'vitest';
import { combatService } from '$lib/game/systems/Combat';
import { itemService } from '$lib/game/services/ItemService';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import { createDefaultBodyParts } from '$lib/game/core/defs/bodyParts';
import { applyGainedTrait } from '$lib/game/entities/Pawns';
import { rng } from '$lib/game/core/util/rng';
import itemsData from '$lib/game/database/items/items.jsonc';
import traitsData from '$lib/game/database/pawns/traits.jsonc';
import type { GameState, Pawn, Trait } from '$lib/game/core/types';

/**
 * TIER-4 WEAPON AUDIT — which stat and which trait break which weapon.
 *
 * Every top-tier weapon is swept against three real opponents, first across the core stats and then
 * across every combat-relevant trait, so the outliers are ranked from measurement instead of taste.
 * Drives the real `resolveHit` (armour soak, crit, grip, body parts) and the real cadence path
 * (`attack_speed` through Combat's interval clamp); the only arithmetic here is
 * dps = mean damage per swing × swings per second.
 *
 * The headless confirmation of the worst offenders lives in `weaponFightSim.test.ts`.
 */

const BASE_ATTACK_INTERVAL_TICKS = 120;
const MIN_ATTACK_INTERVAL_TICKS = 72;
const TPS = 60;

/* eslint-disable @typescript-eslint/no-explicit-any */
const ITEMS = itemsData as any[];
const TRAITS = traitsData as any[];

const baseStats = {
  strength: 10,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  perception: 10,
  charisma: 10
};
type Stats = typeof baseStats;
const CORE: (keyof Stats)[] = ['strength', 'dexterity', 'constitution', 'perception', 'intelligence'];

const fullLimbs = () =>
  (['head', 'torso', 'left_arm', 'right_arm', 'left_leg', 'right_leg'] as const).map((id) => ({
    id,
    health: 100,
    isMissing: false,
    bleedRate: 0,
    parts: createDefaultBodyParts(id)
  }));

function makePawn(over: Record<string, unknown> = {}): Pawn {
  return {
    id: 'atk',
    name: 'Subject',
    isAlive: true,
    position: { x: 5, y: 5 },
    currentState: 'Fighting',
    stats: { ...baseStats },
    traits: [],
    equipment: {},
    limbs: fullLimbs(),
    injuries: [],
    conditions: [],
    pain: 0,
    bloodVolume: 100,
    maxBloodVolume: 100,
    stamina: 500,
    maxStamina: 500,
    ...over
  } as unknown as Pawn;
}

/** Every craftable/lootable tier-4 weapon that resolves through the MELEE path. */
const T4 = ITEMS.filter(
  (i) => i.tier === 4 && i.weaponProperties && i.category !== 'natural_weapon'
).map((i) => ({
  id: i.id as string,
  name: i.name as string,
  twoHanded: !!i.weaponProperties.twoHanded,
  ranged: (i.weaponProperties.range ?? 0) > 1,
  powerStat: (i.weaponProperties.powerStat ??
    (i.weaponProperties.arcane ? 'intelligence' : i.weaponProperties.finesse ? 'perception' : 'strength')) as keyof Stats
}));
const T4_MELEE = T4.filter((w) => !w.ranged);

/** Off-hand for the grip a weapon is actually built around: a shield for 1H, nothing for 2H. */
const offHandFor = (w: { twoHanded: boolean; id: string }) =>
  w.twoHanded || /stiletto|rapier/.test(w.id) ? undefined : 'iron_boss_shield';

function armed(weaponId: string, stats: Partial<Stats>, offHand?: string, traits: Trait[] = []): Pawn {
  const pawn = makePawn({
    stats: { ...baseStats, ...stats },
    traits,
    equipment: {
      mainHand: { itemId: weaponId, instanceId: 'w', durability: 999 },
      ...(offHand ? { offHand: { itemId: offHand, instanceId: 'o', durability: 999 } } : {})
    }
  });
  // A trait's `combatMods` are read live off `pawn.traits`, but its core-stat deltas, grafts and
  // bodyMod HP scaling are ONE-SHOT, baked when the trait is acquired. Route through the same
  // `applyGainedTrait` the growth path uses so the audit prices what the engine actually does —
  // including its sign convention for `*Penalty` (see the AUDIT finding on that).
  for (const t of traits) applyGainedTrait(pawn, t);
  return pawn;
}

/**
 * Three real opponents drawn from gear the game actually fields, not abstractions:
 *  • `raider`  — light foe, leather, low dodge: the common fight.
 *  • `knight`  — heavy plate + great helm: the armour check.
 *  • `duelist` — high DEXTERITY, shield, no plate: the dodge + block check.
 */
const OPPONENTS = {
  raider: () =>
    makePawn({
      id: 'raider',
      stats: { ...baseStats, dexterity: 8, constitution: 12 },
      equipment: { bodyOuter: { itemId: 'raw_hide_vest', instanceId: 'o1', durability: 999 } }
    }),
  knight: () =>
    makePawn({
      id: 'knight',
      stats: { ...baseStats, dexterity: 6, constitution: 20 },
      equipment: {
        bodyOuter: { itemId: 'plate_cuirass', instanceId: 'o1', durability: 999 },
        bodyMid: { itemId: 'mail_hauberk', instanceId: 'o2', durability: 999 },
        head: { itemId: 'great_helm', instanceId: 'o3', durability: 999 }
      }
    }),
  duelist: () =>
    makePawn({
      id: 'duelist',
      stats: { ...baseStats, dexterity: 40, constitution: 25 },
      equipment: { offHand: { itemId: 'iron_boss_shield', instanceId: 'o1', durability: 999 } }
    })
};
type OppKey = keyof typeof OPPONENTS;

const emptyState = { turn: 0, pawns: [], mobs: [], worldMap: [] } as unknown as GameState;

function swingsPerSec(pawn: Pawn): number {
  const speed = Math.max(0.5, pawnStatService.evaluateStat('attack_speed', pawn));
  return TPS / Math.max(MIN_ATTACK_INTERVAL_TICKS, Math.round(BASE_ATTACK_INTERVAL_TICKS / speed));
}

function dpsOf(attacker: Pawn, defender: Pawn, n = 1200, seed = 77): number {
  rng.reseed(seed);
  let dmg = 0;
  for (let i = 0; i < n; i++) {
    const d = makePawn({ ...(defender as unknown as Record<string, unknown>), limbs: fullLimbs() });
    dmg += combatService.resolveHit(attacker, d, emptyState).damage;
  }
  return (dmg / n) * swingsPerSec(attacker);
}

const f = (x: number, w = 7, d = 1) => x.toFixed(d).padStart(w);

describe('trait baking — a gained trait is a born trait', () => {
  it('a runtime-gained trait is NOT dead: applyGainedTrait bakes what generation would', () => {
    // The growth path (`PawnGrowthService` → `lineageGrowthEvent`) pushes the trait then calls
    // `applyGainedTrait`, which is also what the trait-gamble/consume path and `devSetPawnTraits` use.
    // So a trait acquired at turn 40,000 lands the same stat deltas as one rolled at generation.
    const gain = TRAITS.find((t) => t.id === 'str-dex-plus-5');
    const plain = armed('rune_sung_greatsword', { strength: 20, dexterity: 20 });
    const grown = armed('rune_sung_greatsword', { strength: 20, dexterity: 20 }, undefined, [
      gain as unknown as Trait
    ]);
    console.log(
      `[BAKE] str-dex-plus-5 gained at runtime: STRENGTH ${plain.stats.strength}→${grown.stats.strength}, DEXTERITY ${plain.stats.dexterity}→${grown.stats.dexterity}`
    );
    expect(grown.stats.strength).toBe(plain.stats.strength + 5);
    expect(grown.stats.dexterity).toBe(plain.stats.dexterity + 5);
  });

  it('a flaw LOWERS its stat — core-stat grants are signed, with no `*Penalty` key left', () => {
    // Both bake paths (`applyCulturalTraitBonuses` at generation, `applyGainedTrait` at runtime) now do
    // ONE signed add. A flaw authors a negative `*Bonus`; the `*Penalty` key is gone, which is what
    // makes the sign impossible to get wrong again.
    const leftovers = TRAITS.flatMap((t) =>
      Object.keys((t.effects ?? {}) as Record<string, unknown>).filter((k) => k.endsWith('Penalty'))
    );
    expect(leftovers, 'no `*Penalty` key survives in traits.jsonc').toEqual([]);

    const negatives = TRAITS.flatMap((t) =>
      Object.entries((t.effects ?? {}) as Record<string, unknown>)
        .filter(([k, v]) => k.endsWith('Bonus') && typeof v === 'number' && (v as number) < 0)
        .map(([k, v]) => ({ id: t.id as string, key: k, value: v as number }))
    );
    expect(negatives.length, 'flaws are authored as negative bonuses').toBeGreaterThan(50);

    const clumsy = TRAITS.find((t) => t.id === 'clumsy'); // dexterityBonus: -2
    const plain = armed('rune_slotted_stiletto', { dexterity: 20 });
    const cursed = armed('rune_slotted_stiletto', { dexterity: 20 }, undefined, [
      clumsy as unknown as Trait
    ]);
    console.log(
      `[SIGNED] ${negatives.length} negative grants. "clumsy" (dexterityBonus −2): DEXTERITY ${plain.stats.dexterity} → ${cursed.stats.dexterity}`
    );
    expect(cursed.stats.dexterity, 'clumsy LOWERS dexterity').toBe(plain.stats.dexterity - 2);
  });
});

describe('tier-4 weapon audit — stats', { timeout: 600_000 }, () => {
  it('the power-stat soft cap holds the damage term inside a sane band', () => {
    // The fix for the runaway `baseDamage × stat / 10` term. Early-game values barely move; the
    // growth ceiling is bounded instead of multiplying weapon damage tenfold.
    const rows = [10, 16, 20, 30, 45, 60, 100].map((s) => {
      const w = armed('rune_sung_greatsword', { strength: s }, undefined);
      const d = dpsOf(w, OPPONENTS.knight());
      return `stat ${String(s).padStart(3)}  old ×${(s / 10).toFixed(2).padStart(5)}  now ×${(1 + ((s - 10) / 10) / (1 + (s - 10) / 30)).toFixed(2).padStart(5)}  dps vs knight ${f(d)}`;
    });
    console.log('[POWER CURVE]\n' + rows.join('\n'));
    const low = dpsOf(armed('rune_sung_greatsword', { strength: 16 }), OPPONENTS.knight());
    const high = dpsOf(armed('rune_sung_greatsword', { strength: 100 }), OPPONENTS.knight());
    expect(high / Math.max(0.01, low), 'a maxed pawn no longer multiplies damage tenfold').toBeLessThan(6);
  });

  it('STAT SWEEP — dps per T4 weapon per stat, against three real opponents', () => {
    // Which stat is worth the most on which weapon. A weapon whose best stat is not its power stat is
    // being carried by cadence or to-hit rather than by what it is supposed to be about.
    for (const opp of Object.keys(OPPONENTS) as OppKey[]) {
      const lines = [`[STAT SWEEP vs ${opp}]   dps at stat 40 (all others 10) — ★ = the weapon's power stat`];
      lines.push('weapon                      STRENGTH     DEXTERITY     CONSTITUTION     PERCEPTION     INT   best');
      for (const w of T4_MELEE) {
        const t = OPPONENTS[opp]();
        const cells = CORE.map((s) => dpsOf(armed(w.id, { [s]: 40 }, offHandFor(w)), t));
        const bestIdx = cells.indexOf(Math.max(...cells));
        lines.push(
          w.name.padEnd(26) +
            cells.map((c, i) => f(c) + (CORE[i] === w.powerStat ? '★' : ' ')).join('') +
            '  ' +
            CORE[bestIdx].slice(0, 3).toUpperCase()
        );
      }
      console.log(lines.join('\n'));
    }
    expect(T4_MELEE.length).toBeGreaterThan(8);
  });

  it('STAT OUTLIERS — the single most damaging stat point in the game', () => {
    // Marginal dps per +10 on each stat, ranked across every T4 weapon and opponent. The top of this
    // list is where a stat is doing more than its share.
    const rows: { weapon: string; stat: string; opp: string; gain: number }[] = [];
    for (const opp of Object.keys(OPPONENTS) as OppKey[]) {
      for (const w of T4_MELEE) {
        const t = OPPONENTS[opp]();
        const base = dpsOf(armed(w.id, { [w.powerStat]: 30 }, offHandFor(w)), t);
        for (const s of CORE) {
          const bumped = dpsOf(armed(w.id, { [w.powerStat]: 30, [s]: 40 }, offHandFor(w)), t);
          rows.push({ weapon: w.name, stat: s, opp, gain: bumped - base });
        }
      }
    }
    rows.sort((a, b) => b.gain - a.gain);
    console.log(
      '[STAT OUTLIERS] top 12 marginal gains (+10 on the stat, from a 30 power-stat baseline)\n' +
        rows
          .slice(0, 12)
          .map((r) => `${r.weapon.padEnd(26)} ${r.stat.padEnd(13)} vs ${r.opp.padEnd(8)} +${r.gain.toFixed(1)} dps`)
          .join('\n')
    );
    expect(rows.length).toBeGreaterThan(0);
  });
});

/** Combat-relevant traits: anything that moves a core stat or a combat stat multiplier. */
const COMBAT_TRAITS = TRAITS.filter((t) => {
  const e = t.effects ?? {};
  return (
    e.combatMods ||
    e.strengthBonus ||
    e.dexterityBonus ||
    e.perceptionBonus ||
    e.constitutionBonus ||
    e.intelligenceBonus
  );
});

const AUDIT_STATS = { strength: 30, dexterity: 30, constitution: 30, perception: 30, intelligence: 30 };
/** Smaller sample for the trait matrix: it is 100× bigger than the stat sweep and only needs a ranking. */
const TRAIT_N = 400;

interface TraitCell {
  trait: string;
  rarity: string;
  weapon: string;
  weaponId: string;
  opp: OppKey;
  gain: number;
  pct: number;
}
/**
 * trait × weapon × opponent, computed ONCE (both trait tests read it). Baselines are memoised per
 * (weapon, opponent) — recomputing them per trait was most of the cost and none of the information.
 */
let traitMatrix: TraitCell[] | null = null;
function buildTraitMatrix(): TraitCell[] {
  if (traitMatrix) return traitMatrix;
  const out: TraitCell[] = [];
  for (const opp of Object.keys(OPPONENTS) as OppKey[]) {
    const target = OPPONENTS[opp]();
    for (const w of T4_MELEE) {
      const base = dpsOf(armed(w.id, AUDIT_STATS, offHandFor(w)), target, TRAIT_N);
      if (base <= 0.01) continue;
      for (const tr of COMBAT_TRAITS) {
        const withTrait = dpsOf(
          armed(w.id, AUDIT_STATS, offHandFor(w), [tr as unknown as Trait]),
          target,
          TRAIT_N
        );
        out.push({
          trait: tr.id,
          rarity: tr.rarity ?? '?',
          weapon: w.name,
          weaponId: w.id,
          opp,
          gain: withTrait - base,
          pct: ((withTrait - base) / base) * 100
        });
      }
    }
  }
  traitMatrix = out;
  return out;
}

describe('tier-4 weapon audit — traits', { timeout: 900_000 }, () => {
  it('TRAIT SWEEP — every combat trait priced on every T4 weapon', () => {
    // One trait at a time on an otherwise identical stat-30 pawn, so the delta IS the trait. Ranked
    // by the worst case it produces anywhere, which is what "most broken" means in practice.
    const worst = [...buildTraitMatrix()].sort((a, b) => b.pct - a.pct);
    const seen = new Set<string>();
    const top = worst.filter((r) => (seen.has(r.trait) ? false : (seen.add(r.trait), true))).slice(0, 15);
    console.log(
      `[TRAIT SWEEP] ${COMBAT_TRAITS.length} combat traits × ${T4_MELEE.length} weapons × 3 opponents\n` +
        'top 15 traits by their single best-case dps swing:\n' +
        top
          .map(
            (r) =>
              `${r.trait.padEnd(22)} ${r.rarity.padEnd(10)} ${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(1)}%`.padEnd(48) +
              `(${r.weapon} vs ${r.opp})`
          )
          .join('\n')
    );
    const bottom = worst.slice(-5).reverse();
    console.log(
      'worst 5 (the flaws that actually cost you a fight):\n' +
        bottom.map((r) => `${r.trait.padEnd(22)} ${r.pct.toFixed(1)}%  (${r.weapon} vs ${r.opp})`).join('\n')
    );
    expect(COMBAT_TRAITS.length).toBeGreaterThan(50);
  });

  it('TRAIT STACKS — the worst combination a single pawn can legally carry', () => {
    // Traits stack multiplicatively on the combat stats and additively on the core stats, so the
    // question is not "which trait is strongest" but "what does the best legal pile do".
    const matrix = buildTraitMatrix();
    const byId = new Map(COMBAT_TRAITS.map((t) => [t.id as string, t]));
    const lines = ['[TRAIT STACKS] best five-trait pile per archetype weapon, vs each opponent'];
    const picks = T4_MELEE.filter((w) =>
      /greatsword|stiletto|ribbed_mace|weighted_warhammer|needle_rapier/.test(w.id)
    );
    for (const w of picks) {
      for (const opp of Object.keys(OPPONENTS) as OppKey[]) {
        const target = OPPONENTS[opp]();
        const ranked = matrix
          .filter((c) => c.weaponId === w.id && c.opp === opp)
          .sort((a, b) => b.gain - a.gain)
          .slice(0, 5);
        const base = dpsOf(armed(w.id, AUDIT_STATS, offHandFor(w)), target);
        const stacked = dpsOf(
          armed(w.id, AUDIT_STATS, offHandFor(w), ranked.map((r) => byId.get(r.trait)) as unknown as Trait[]),
          target
        );
        lines.push(
          `${w.name.padEnd(26)} vs ${opp.padEnd(8)} ${f(base)} → ${f(stacked)} dps  (×${(stacked / Math.max(0.01, base)).toFixed(2)})  [${ranked.map((r) => r.trait).join(', ')}]`
        );
      }
    }
    console.log(lines.join('\n'));
    expect(picks.length).toBeGreaterThan(0);
  });
});
