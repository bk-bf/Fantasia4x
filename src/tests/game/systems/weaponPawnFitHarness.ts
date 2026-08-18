import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { buildScenario } from '$lib/game/headless/Scenario';
import { setSimLogSink } from '$lib/game/core/logSink';
import { itemService } from '$lib/game/services/ItemService';
import { partArmorPoints, partCombatValue } from '$lib/game/systems/Combat';
import type { CombatTurnEntry } from '$lib/game/core/Events';
import type { BodyPartId, EntityStats, Pawn } from '$lib/game/core/types';

/**
 * WEAPON × PAWN FIT — does the right pawn for a weapon actually make it work?
 *
 * Every sweep so far handed BOTH sides identical, generic stats, which answers "which weapon is best in
 * the abstract" and not "which weapon is best in the hands it was designed for". A warhammer in the
 * hands of someone with no brawn is not a warhammer. So each weapon is run by three pawns:
 *
 *   WELL SUITED — the weapon's own power stat at the spawn ceiling, the supporting stats high, and the
 *                 aptitudes its style leans on rolled at the top of the band.
 *   AVERAGE     — every stat at the population median, every aptitude neutral.
 *   POOR        — low across the board, aptitudes at the bottom of the band.
 *
 * It also records WHERE each blow landed and how much armour was actually there, because that is the
 * open question about hammers: on paper a warhammer puts 18 points through a 30-point cuirass where a
 * greataxe manages 11.5, yet the greataxe out-damages it in a real fight. Armour is not spread evenly
 * over a body — a plate harness is 30 at the chest, 22 at the head and 11 on the limbs — so if most
 * blows land on lightly-armoured parts, raw damage beats penetration and the anti-armour weapon never
 * gets to be one. This measures that rather than assuming it.
 *
 * NOT a `.test.ts` — imported by the per-armour-class files that are, so they run in parallel.
 */

const MAX_TICKS = 14_000;
export const SEEDS = [11, 23, 37];

export const ARMOUR: Record<string, string[]> = {
  none: [],
  medium: ['iron_plated_jack', 'leather_coif', 'iron_bracers', 'iron_greaves'],
  heavy: ['plate_cuirass', 'great_helm', 'steel_vambraces', 'steel_greaves']
};

/** The steel tier of every melee family, so the comparison is like-for-like. */
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

/** Which core stat this weapon's damage actually runs on (the grip names it). */
function powerStatOfWeapon(itemId: string): keyof EntityStats {
  const wp = itemService.getItemById(itemId)?.weaponProperties;
  if (wp?.powerStat) return wp.powerStat as keyof EntityStats;
  if (wp?.arcane) return 'intellect';
  if (wp?.finesse) return 'awareness';
  return 'brawn';
}

/**
 * Stats for a pawn of the given fit, holding the given weapon. Capped at the SPAWN CEILING of 20 — a
 * colonist cannot exceed it at growth level 1, and balance read above it describes a fighter who does
 * not exist.
 */
export function statsFor(fit: Fit, itemId: string): Partial<EntityStats> {
  const power = powerStatOfWeapon(itemId);
  const base: Record<Fit, number> = { suited: 11, average: 12, poor: 7 };
  const s: Partial<EntityStats> = {
    brawn: base[fit],
    agility: base[fit],
    vigour: fit === 'suited' ? 17 : base[fit],
    awareness: base[fit],
    intellect: base[fit],
    charisma: base[fit]
  };
  // The suited pawn's edge is CONCENTRATED in the stat its weapon actually uses, not spread over
  // everything — that is what "built for this weapon" means, and it keeps the total stat budget honest
  // against the average pawn rather than simply handing it more of everything.
  if (fit === 'suited') s[power] = 20;
  return s;
}

/** Aptitudes for the given fit. The suited pawn rolls the top of the band, the poor one the bottom. */
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
  /** Total armour points at the locations this weapon actually struck — the hammer question. */
  armourAtHits: number;
  /**
   * COMBAT EFFECTIVENESS — the metric that actually matters, and the reason `wins` is kept only as a
   * secondary column. A fight is decided by degrading what the other body can still DO, not by killing:
   * most end in collapse, and the outcome is settled well before that. Each landed blow scores the
   * FRACTION of the struck location it accounted for, times how much that location is worth to a
   * fighter (`partCombatValue` — organs and bleeding, plus the combat capacities it gates).
   *
   * Scoring by kills measured the tail of a fight and missed the part that decided it.
   */
  effect: number;
  /** Ticks the fights actually ran, so `effect` can be expressed as a RATE rather than a total. */
  ticks: number;
}

/**
 * One weapon, one pawn fit, against a standard opponent wearing `armour`. The opponent is always the
 * same average pawn with sword and shield, so the only things changing are the weapon and who holds it.
 */
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
    // Drive the aptitudes directly: rolling them would make the comparison a coin flip rather than a
    // controlled one, and the roll is exactly the axis being held fixed per fit.
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
          // Against the part's OWN size, so a maul does not get credit for overkilling a finger.
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
