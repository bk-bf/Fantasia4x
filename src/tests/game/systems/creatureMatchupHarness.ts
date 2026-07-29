import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { buildScenario } from '$lib/game/headless/Scenario';
import { setSimLogSink } from '$lib/game/core/logSink';
import { itemService } from '$lib/game/services/ItemService';
import { partCombatValue } from '$lib/game/systems/Combat';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import creaturesData from '$lib/game/database/pawns/creatures.jsonc';
import type { CombatTurnEntry } from '$lib/game/core/Events';
import type { BodyPartId, EntityStats, Mob, Pawn } from '$lib/game/core/types';

/**
 * WEAPON × CREATURE — every weapon against the enemies that are actually in the game.
 *
 * Until now every sweep fought a DUMMY: another colonist with sword and shield. That answers "which
 * weapon beats a colonist", which is not a question the game ever asks. Real opponents differ in the
 * ways that decide a weapon's worth — natural armour (hide vs plate), body scale, wildly different
 * stat blocks, and body PLANS that are not humanoid, so the hit table and the parts worth wrecking are
 * different too.
 *
 * Scored by COMBAT VALUE wrecked per 1000 ticks, not kills: a fight is decided by degrading what the
 * other body can still do, and most end in collapse long before anything dies.
 *
 * SHARDED across files. Vitest parallelises across files and runs the tests inside one file
 * sequentially in a single worker, so the whole sweep in one file pins exactly one core — measured at
 * ~115 minutes of CPU for the full matrix, which is 15 across eight cores if it is split and 115 if it
 * is not. The sim's one-live-session-per-process rule (HeadlessSession) means the parallelism has to
 * come from separate processes, which is what the fork pool gives.
 */

const MAX_TICKS = 14_000;
/** Enough fights per cell that a row is not noise. The 3 the earlier sweeps used left some cells
 *  resting on 3 landed hits, where a suited and a poor pawn scored identically by coincidence. */
export const SEEDS = [11, 23, 37, 41, 59, 71, 83, 97, 103, 127];

interface CreatureDef {
  id: string;
  name?: string;
  tier?: number;
  threatLevel?: number;
  behaviour?: string;
  naturalArmor?: number;
  naturalArmorRange?: [number, number];
}

/** The hide the creature actually fights with — variants declare a range instead of a flat value. */
export const creatureHide = (c: CreatureDef): number =>
  c.naturalArmor ?? (c.naturalArmorRange ? (c.naturalArmorRange[0] + c.naturalArmorRange[1]) / 2 : 0);
const ALL = creaturesData as unknown as CreatureDef[];

/** Every creature that will actually pick a fight — the ones a colonist meets as an enemy. */
export const HOSTILES: CreatureDef[] = ALL.filter((c) => c && c.behaviour === 'aggressive').sort(
  (a, b) => (a.tier ?? 0) - (b.tier ?? 0) || a.id.localeCompare(b.id)
);

/**
 * The pawn's OWN armour is part of the matrix, not a constant. It decides how long the pawn survives
 * and therefore how many blows it gets to land, so a weapon's effectiveness against a given creature is
 * a different number in a shirt than in plate — which is exactly the thing worth knowing.
 */
export const ARMOUR: Record<string, string[]> = {
  none: [],
  light: [
    'linen_gambeson',
    'leather_coif',
    'rawhide_shoulder_pads',
    'rawhide_arm_wraps',
    'rawhide_leg_wraps'
  ],
  medium: ['brigandine_coat', 'leather_coif', 'iron_pauldrons', 'iron_bracers', 'iron_greaves'],
  heavy: ['plate_cuirass', 'great_helm', 'steel_pauldrons', 'steel_vambraces', 'steel_greaves']
};
export const ARMOUR_KEYS = Object.keys(ARMOUR);

/** Round-robin shards, so every shard gets a mix of tiers and they finish at about the same time.
 *  Slicing by tier instead would put all 18 tier-4 creatures in one shard and leave cores idle. */
export const SHARDS = 8;
export const shardOf = (n: number) => HOSTILES.filter((_, i) => i % SHARDS === n);

/** One row of the sweep: the weapon plus everything else that makes the grip real. */
export interface Loadout {
  label: string;
  itemId: string;
  /** Extra items in the hands beside the weapon — a shield, or the second dagger. */
  alsoEquip?: string[];
  /** Trait ids granted to the pawn — the duel grip is trained, not just an empty off-hand. */
  traits?: string[];
}

const TWO_HANDERS: [string, string][] = [
  ['greatsword 2H', 'steel_greatsword'],
  ['greataxe 2H', 'steel_greataxe'],
  ['greatcleaver 2H', 'steel_greatcleaver'],
  ['warhammer 2H', 'steel_warhammer'],
  ['greatflail 2H', 'steel_greatflail'],
  ['halberd 2H', 'steel_halberd'],
  ['pike 2H', 'steel_pike']
];
const ONE_HANDERS: [string, string][] = [
  ['longsword', 'steel_longsword'],
  ['mace', 'steel_mace'],
  ['flail', 'steel_flail'],
  ['cleaver', 'steel_cleaver'],
  ['broadaxe', 'steel_broadaxe'],
  ['boar spear', 'steel_boar_spear'],
  ['rapier', 'steel_rapier']
];

/** Every 1H weapon fights TWICE — with a shield and as a trained duelist — because a bare 1H with an
 *  empty, untrained off-hand is the neutral grip no player actually fields. The daggers equip two, so
 *  the row really is the dual-wield grip and not one stiletto swung one-handed. */
export const WEAPONS: Loadout[] = [
  ...TWO_HANDERS.map(([label, itemId]) => ({ label, itemId })),
  ...ONE_HANDERS.flatMap(([name, itemId]) => [
    { label: `${name} 1H+shield`, itemId, alsoEquip: ['iron_boss_shield'] },
    { label: `${name} 1H duelist`, itemId, traits: ['duelist'] }
  ]),
  { label: 'twin daggers', itemId: 'steel_stiletto', alsoEquip: ['steel_stiletto'] }
];

/** The weapon's own power stat — the grip names it, and a suited pawn maxes exactly that one. */
function powerStatOf(itemId: string): keyof EntityStats {
  const wp = itemService.getItemById(itemId)?.weaponProperties;
  if (wp?.powerStat) return wp.powerStat as keyof EntityStats;
  if (wp?.arcane) return 'intellect';
  if (wp?.finesse) return 'awareness';
  return 'brawn';
}

/** A pawn built for this weapon, at the SPAWN CEILING of 20 — above it describes a colonist who cannot
 *  exist at growth level 1. Concentrated in the stat the weapon uses rather than raised across the
 *  board, so the comparison is about fit and not about a bigger stat budget. */
function suitedStats(itemId: string): Partial<EntityStats> {
  const s: Partial<EntityStats> = {
    brawn: 11,
    agility: 11,
    vigour: 17,
    awareness: 11,
    intellect: 11,
    charisma: 11
  };
  s[powerStatOf(itemId)] = 20;
  return s;
}

export interface Matchup {
  weapon: string;
  /** What the PAWN was wearing — see `ARMOUR`. */
  armour: string;
  creature: string;
  tier: number;
  naturalArmor: number;
  effectPer1k: number;
  landed: number;
  swings: number;
  perHit: number;
  kills: number;
  fights: number;
}

const PROGRESS = '.debug/weapon-meta-progress.log';

/** One loadout against one creature, over every seed. */
export async function runMatchup(
  loadout: Loadout,
  creature: CreatureDef,
  armourKey: string
): Promise<Matchup> {
  const { label, itemId } = loadout;
  let effect = 0;
  let ticksTotal = 0;
  let landed = 0;
  let swings = 0;
  let damage = 0;
  let kills = 0;

  for (const seed of SEEDS) {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed,
        map: { w: 24, h: 24 },
        pawns: [
          {
            count: 1,
            drafted: true,
            stats: suitedStats(itemId),
            equip: [itemId, ...(loadout.alsoEquip ?? []), ...ARMOUR[armourKey]],
            ...(loadout.traits ? { traits: loadout.traits } : {})
          }
        ],
        needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
        spawnMobs: [{ count: 1, creatureId: creature.id }],
        seedEntities: false
      })
    );
    const me = (s.getState().pawns as Pawn[])[0];
    const mob = s.getState().mobs?.[0] as Mob | undefined;
    if (!mob) continue; // a creature the scenario cannot place is skipped, not counted as a loss
    const myName = me.name;

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
        swings++;
        if (!sw.hit) return;
        landed++;
        damage += sw.damage ?? 0;
        if (!sw.bodyPart) return;
        // Against the part's OWN size, so a maul gets no credit for overkilling a paw.
        const maxHp = sw.partMaxHp ?? 0;
        const frac = maxHp > 0 ? Math.min(1, (sw.damage ?? 0) / maxHp) : 0;
        effect += frac * partCombatValue(sw.bodyPart as BodyPartId);
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
      payload: { ids: [me.id], targetId: mob.id, targetType: 'mob' }
    } as never);

    let ticks = 0;
    while (ticks < MAX_TICKS) {
      s.tick(20);
      ticks += 20;
      const m = s.getState().mobs?.[0];
      if (!m || m.isAlive === false) {
        kills++;
        break;
      }
      const alive = (s.getState().pawns as Pawn[]).find((p) => p.id === me.id);
      if (!alive || alive.isAlive === false) break;
    }
    setSimLogSink(null as never);
    ticksTotal += ticks;
  }

  return {
    weapon: label,
    armour: armourKey,
    creature: creature.name ?? creature.id,
    tier: creature.tier ?? 0,
    naturalArmor: creatureHide(creature),
    effectPer1k: ticksTotal ? (effect / ticksTotal) * 1000 : 0,
    landed,
    swings,
    perHit: landed ? damage / landed : 0,
    kills,
    fights: SEEDS.length
  };
}

/** Run one shard and write its rows. Progress goes straight to disk — vitest buffers a test's console
 *  output until the test ENDS, so a long sweep looks frozen from outside otherwise. */
export async function runShard(shard: number): Promise<Matchup[]> {
  const creatures = shardOf(shard);
  const rows: Matchup[] = [];
  const total = creatures.length * WEAPONS.length * ARMOUR_KEYS.length;
  let done = 0;
  try {
    mkdirSync('.debug/audit', { recursive: true });
  } catch {
    /* ignore */
  }
  for (const c of creatures)
    for (const loadout of WEAPONS)
      for (const a of ARMOUR_KEYS) {
        rows.push(await runMatchup(loadout, c, a));
        if (++done % 20 === 0 || done === total)
          try {
            appendFileSync(
              PROGRESS,
              `  [creatures ${shard}] ${done} of ${total} matchups (${((done / total) * 100).toFixed(0)}%)\n`
            );
          } catch {
            /* progress reporting must never fail the audit */
          }
      }
  try {
    writeFileSync(
      `.debug/audit/creatures-${shard}.json`,
      JSON.stringify({ kind: 'creatures', shard, fights: SEEDS.length, rows }, null, 1)
    );
  } catch {
    /* ignore */
  }
  return rows;
}
