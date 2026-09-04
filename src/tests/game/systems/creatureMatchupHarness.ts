import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { buildScenario } from '$lib/game/headless/Scenario';
import { setSimLogSink } from '$lib/game/core/util/logSink';
import { itemService } from '$lib/game/services/ItemService';
import { partCombatValue } from '$lib/game/systems/Combat';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import creaturesData from '$lib/game/database/pawns/creatures.json';
import type { CombatTurnEntry } from '$lib/game/core/defs/events';
import type { BodyPartId, EntityStats, Mob, Pawn } from '$lib/game/core/types';

const MAX_TICKS = 14_000;
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

export const creatureHide = (c: CreatureDef): number =>
  c.naturalArmor ?? (c.naturalArmorRange ? (c.naturalArmorRange[0] + c.naturalArmorRange[1]) / 2 : 0);
const ALL = creaturesData as unknown as CreatureDef[];

export const HOSTILES: CreatureDef[] = ALL.filter((c) => c && c.behaviour === 'aggressive').sort(
  (a, b) => (a.tier ?? 0) - (b.tier ?? 0) || a.id.localeCompare(b.id)
);

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
export const ARMOUR_KEYS = Object.keys(ARMOUR);

export const SHARDS = 8;
export const shardOf = (n: number) => HOSTILES.filter((_, i) => i % SHARDS === n);

export interface Loadout {
  label: string;
  itemId: string;
  alsoEquip?: string[];
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

export const WEAPONS: Loadout[] = [
  ...TWO_HANDERS.map(([label, itemId]) => ({ label, itemId })),
  ...ONE_HANDERS.flatMap(([name, itemId]) => [
    { label: `${name} 1H+shield`, itemId, alsoEquip: ['iron_boss_shield'] },
    { label: `${name} 1H duelist`, itemId, traits: ['duelist'] }
  ]),
  { label: 'twin daggers', itemId: 'steel_stiletto', alsoEquip: ['steel_stiletto'] }
];

function powerStatOf(itemId: string): keyof EntityStats {
  const wp = itemService.getItemById(itemId)?.weaponProperties;
  if (wp?.powerStat) return wp.powerStat as keyof EntityStats;
  if (wp?.arcane) return 'intelligence';
  if (wp?.finesse) return 'perception';
  return 'strength';
}

function suitedStats(itemId: string): Partial<EntityStats> {
  const s: Partial<EntityStats> = {
    strength: 11,
    dexterity: 11,
    constitution: 17,
    perception: 11,
    intelligence: 11,
    charisma: 11
  };
  s[powerStatOf(itemId)] = 20;
  return s;
}

export interface Matchup {
  weapon: string;
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
    if (!mob) continue;
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

export async function runShard(shard: number): Promise<Matchup[]> {
  const creatures = shardOf(shard);
  const rows: Matchup[] = [];
  const total = creatures.length * WEAPONS.length * ARMOUR_KEYS.length;
  let done = 0;
  try {
    mkdirSync('.debug/audit', { recursive: true });
  } catch {
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
          }
      }
  try {
    writeFileSync(
      `.debug/audit/creatures-${shard}.json`,
      JSON.stringify({ kind: 'creatures', shard, fights: SEEDS.length, rows }, null, 1)
    );
  } catch {
  }
  return rows;
}
