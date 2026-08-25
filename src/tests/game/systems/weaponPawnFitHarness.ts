import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { buildScenario } from '$lib/game/headless/Scenario';
import { setSimLogSink } from '$lib/game/core/util/logSink';
import { itemService } from '$lib/game/services/ItemService';
import { partArmorPoints, partCombatValue } from '$lib/game/systems/Combat';
import type { CombatTurnEntry } from '$lib/game/core/defs/events';
import type { BodyPartId, EntityStats, Pawn } from '$lib/game/core/types';

const MAX_TICKS = 14_000;
export const SEEDS = [11, 23, 37];

export const ARMOUR: Record<string, string[]> = {
  none: [],
  medium: ['iron_plated_jack', 'leather_coif', 'iron_bracers', 'iron_greaves'],
  heavy: ['plate_cuirass', 'great_helm', 'steel_vambraces', 'steel_greaves']
};

export const WEAPONS: [string, string][] = [
  ['greatsword 2H', 'steel_greatsword'],
  ['greataxe 2H', 'steel_greataxe'],
  ['greatcleaver 2H', 'steel_greatcleaver'],
  ['warhammer 2H', 'steel_warhammer'],
  ['greatflail 2H', 'steel_greatflail'],
  ['halberd 2H', 'steel_halberd'],
  ['pike 2H', 'steel_pike'],
  ['longsword 1H', 'steel_longsword'],
  ['mace 1H', 'steel_mace'],
  ['flail 1H', 'steel_flail'],
  ['cleaver 1H', 'steel_cleaver'],
  ['broadaxe 1H', 'steel_broadaxe'],
  ['boar spear 1H', 'steel_boar_spear'],
  ['rapier 1H', 'steel_rapier'],
  ['stiletto 1H', 'steel_stiletto']
];

export type Fit = 'suited' | 'average' | 'poor';
export const FITS: Fit[] = ['suited', 'average', 'poor'];

function powerStatOfWeapon(itemId: string): keyof EntityStats {
  const wp = itemService.getItemById(itemId)?.weaponProperties;
  if (wp?.powerStat) return wp.powerStat as keyof EntityStats;
  if (wp?.arcane) return 'intelligence';
  if (wp?.finesse) return 'perception';
  return 'strength';
}

export function statsFor(fit: Fit, itemId: string): Partial<EntityStats> {
  const power = powerStatOfWeapon(itemId);
  const base: Record<Fit, number> = { suited: 11, average: 12, poor: 7 };
  const s: Partial<EntityStats> = {
    strength: base[fit],
    dexterity: base[fit],
    constitution: fit === 'suited' ? 17 : base[fit],
    perception: base[fit],
    intelligence: base[fit],
    charisma: base[fit]
  };
  if (fit === 'suited') s[power] = 20;
  return s;
}

export function aptitudesFor(fit: Fit): Record<string, number> {
  const v = fit === 'suited' ? 1.15 : fit === 'poor' ? 0.85 : 1;
  return {
    hit_chance: v,
    attack_speed: v,
    hit_precision: v,
    armor_damage: v,
    dodge: v,
    block: v,
    aim_accuracy: v
  };
}

export interface FitResult {
  wins: number;
  fights: number;
  landed: number;
  swings: number;
  damage: number;
  armourAtHits: number;
  effect: number;
  ticks: number;
}

export async function runFit(itemId: string, fit: Fit, armour: string[]): Promise<FitResult> {
  const out: FitResult = {
    wins: 0,
    fights: 0,
    landed: 0,
    swings: 0,
    damage: 0,
    armourAtHits: 0,
    effect: 0,
    ticks: 0
  };
  for (const seed of SEEDS) {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed,
        map: { w: 24, h: 24 },
        pawns: [
          { count: 1, drafted: true, stats: statsFor(fit, itemId), equip: [itemId] },
          {
            count: 1,
            drafted: true,
            stats: statsFor('average', 'steel_longsword'),
            equip: ['steel_longsword', 'iron_boss_shield', ...armour]
          }
        ],
        needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
        seedEntities: false
      })
    );
    const pawns = s.getState().pawns as Pawn[];
    const [me, foe] = pawns;
    me.aptitudes = aptitudesFor(fit) as never;
    foe.aptitudes = aptitudesFor('average') as never;
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
        out.swings++;
        if (!sw.hit) return;
        out.landed++;
        out.damage += sw.damage ?? 0;
        if (sw.bodyPart) {
          const part = sw.bodyPart as BodyPartId;
          const live = (s.getState().pawns as Pawn[]).find((p) => p.id === foe.id);
          if (live) out.armourAtHits += partArmorPoints(live, part);
          const maxHp = sw.partMaxHp ?? 0;
          const frac = maxHp > 0 ? Math.min(1, (sw.damage ?? 0) / maxHp) : 0;
          out.effect += frac * partCombatValue(part);
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
      payload: { ids: [me.id], targetId: foe.id, targetType: 'pawn' }
    } as never);
    s.command({
      type: 'attackTargetWith',
      payload: { ids: [foe.id], targetId: me.id, targetType: 'pawn' }
    } as never);

    const alive = (id: string) => {
      const p = (s.getState().pawns as Pawn[]).find((x) => x.id === id);
      return !!p && p.isAlive !== false;
    };
    let ticks = 0;
    while (ticks < MAX_TICKS && alive(me.id) && alive(foe.id)) {
      s.tick(20);
      ticks += 20;
    }
    setSimLogSink(null as never);
    out.ticks += ticks;
    out.fights++;
    if (alive(me.id) && !alive(foe.id)) out.wins++;
  }
  return out;
}
