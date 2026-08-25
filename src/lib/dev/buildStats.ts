import statsData from '../game/database/pawns/stats.jsonc';
import { GEAR, BUILDS, type BuildClass, type GearRow } from './gearDb';

const statDefs = statsData as {
  id: string;
  primaryStat?: string;
  formula?: string;
  description?: string;
}[];

export type Wiring = 'wired' | 'mirrored' | 'dead';
export type Source = 'rolled' | 'derived';
export type Rank = 'primary' | 'secondary' | 'none';

export interface StatInfo {
  id: string;
  label: string;
  primaryStat: string | null;
  formula: string;
  description: string;
  wiring: Wiring;
  where: string;
  engineFormula: string | null;
  source: Source;
}

export interface StatCell {
  rank: Rank;
  why: string;
}

export interface BuildStatRow {
  build: BuildClass;
  powerStats: string[];
  cells: Record<string, StatCell>;
}

const ROLLED = new Set([
  'hit_chance',
  'attack_speed',
  'hit_precision',
  'armor_damage',
  'dodge',
  'aim_accuracy',
  'block'
]);

const WIRING: Record<string, { wiring: Wiring; where: string; engineFormula?: string }> = {
  hit_precision: {
    wiring: 'wired',
    where: 'Combat.resolveHit — crit roll and ADR-029 gap-finding (aimedBodyPart)',
    engineFormula:
      'critChance = clamp((hit_precision × (unseen ? 3.5 : 1) + weapon.critMod) × condition, 0, 0.6)'
  },
  melee_damage: {
    wiring: 'wired',
    where: 'Combat.resolveHit — THE melee damage multiplier (COMBAT-BALANCE task 3)',
    engineFormula:
      'raw = weapon.damage × melee_damage, where the stat is (1.0 + (POWER − 10) × 0.1) × manipulation and POWER is the equipped weapon’s own core stat, damped'
  },
  armor_damage: {
    wiring: 'wired',
    where:
      'Combat.computeArmorDamage — condition stripped from the defender’s worn piece per landed hit',
    engineFormula: 'armour lost = weapon.armorDamage × armor_damage'
  },
  hit_chance: {
    wiring: 'wired',
    where: 'Combat.resolveHit — the melee to-hit roll (COMBAT-BALANCE task 5)',
    engineFormula:
      'toHit = 60 + (hit_chance − 1) × 33.3 + weapon.accuracy × 2 − (dodge − 1) × 50, clamped 5–95'
  },
  dodge: {
    wiring: 'wired',
    where: 'Combat.resolveHit — the defender’s side of the to-hit roll',
    engineFormula: 'toHit −= (dodge × condition − naturalArmor × 0.01 − 1) × 50'
  },
  block: {
    wiring: 'wired',
    where: 'Combat.blockChance — resolved BEFORE evasion, after the parry roll',
    engineFormula: 'clamp((block + shield.blockBonus) × condition × (ranged ? 0.5 : 1), 0, 0.65)'
  },
  stealth: {
    wiring: 'wired',
    where: 'entityHelpers detection + the unseen-attacker branch of resolveHit',
    engineFormula: 'undetected ⇒ hit_precision × 3.5 for the opening blow (still capped at 0.6)'
  },
  knockdown_resistance: {
    wiring: 'wired',
    where: 'Combat stun / knockdown rolls',
    engineFormula: 'knockdown chance × (1 − clamp(knockdown_resistance, 0, 0.9))'
  },
  attack_speed: {
    wiring: 'wired',
    where: 'Combat.attackIntervalTicks — the melee cadence',
    engineFormula:
      'interval = max(72, round(120 / (attack_speed × weapon.attackSpeed))) → gains stop at 1.67×'
  },
  aim_accuracy: {
    wiring: 'wired',
    where: 'rangedCombat.rangedAccuracyMod — with a linear distance penalty and cover',
    engineFormula: 'hitMod = (aim_accuracy − 1) × weight − distance penalty + gear aimBonus'
  },
  aim_speed: {
    wiring: 'wired',
    where: 'rangedCombat.aimIntervalTicks — time to line the shot up',
    engineFormula: 'aim ticks = base / aim_speed, lengthened by distance'
  },
  reload_speed: {
    wiring: 'wired',
    where: 'rangedCombat.aimIntervalTicks — the span step, only for weapons that author a `reload`',
    engineFormula: 'shot gap = aim ticks + (weapon.reload × span base) / reload_speed'
  },
  aim_range: {
    wiring: 'wired',
    where: 'rangedCombat — scales the weapon’s printed range',
    engineFormula: 'effective range = weapon.range × aim_range'
  },
  ranged_damage: {
    wiring: 'wired',
    where:
      'Combat.resolveHit, ranged branch — THE ranged damage multiplier (COMBAT-BALANCE task 3)',
    engineFormula:
      'raw = ammo.damage × launcher.drawPower × ranged_damage; a crossbow/sling (strScaled: false) bypasses the stat entirely — the mechanism supplies the force'
  },
  stamina: {
    wiring: 'mirrored',
    where:
      'Combat reads calcMaxStamina (entities/Pawns.ts), a raw-stat copy — the × moving × blood_pumping capacity terms of the design formula are dropped',
    engineFormula: 'maxStamina = 50 + (CONSTITUTION − 10) × 4 + (DEXTERITY − 10) × 2'
  },
  stamina_recovery_rate: {
    wiring: 'wired',
    where: 'Combat.tickStaminaAndWinded — per-tick regen while resting or winded',
    engineFormula: 'per tick = stamina_recovery_rate / ticksPerSecond ÷ fatigue factor'
  },
  movement_speed: {
    wiring: 'mirrored',
    where:
      'PawnService.getMoveSpeed keeps its OWN curve — a different shape from the design formula, not just a copy',
    engineFormula:
      'tiles/s = 4 × clamp(0.5 + DEXTERITY/20, 0.4, 1.8) × load × legs × needs × conditions'
  },
  carry_weight: {
    wiring: 'mirrored',
    where: 'ItemService.getCarryCapacityBreakdown recomputes the same fraction from raw STRENGTH',
    engineFormula: 'capacity kg = bodyWeight × clamp(STRENGTH × 0.012, 0.05, 0.3)'
  }
};

const LABEL: Record<string, string> = {
  hit_precision: 'precision',
  melee_damage: 'melee dmg',
  armor_damage: 'armour dmg',
  hit_chance: 'hit chance',
  attack_speed: 'atk speed',
  aim_accuracy: 'aim acc',
  aim_speed: 'aim speed',
  aim_range: 'aim range',
  reload_speed: 'reload',
  ranged_damage: 'ranged dmg',
  dodge: 'dodge',
  block: 'block',
  knockdown_resistance: 'knockdown res',
  stealth: 'stealth',
  stamina: 'stamina',
  stamina_recovery_rate: 'stam regen',
  movement_speed: 'move',
  carry_weight: 'carry'
};

export const STAT_GROUPS: { label: string; stats: string[] }[] = [
  {
    label: 'Offence',
    stats: ['melee_damage', 'hit_chance', 'attack_speed', 'hit_precision', 'armor_damage']
  },
  {
    label: 'Ranged',
    stats: ['aim_accuracy', 'aim_speed', 'aim_range', 'reload_speed', 'ranged_damage']
  },
  { label: 'Defence', stats: ['dodge', 'block', 'knockdown_resistance', 'stealth'] },
  { label: 'Upkeep', stats: ['stamina', 'stamina_recovery_rate', 'movement_speed', 'carry_weight'] }
];
export const STAT_IDS: string[] = STAT_GROUPS.flatMap((g) => g.stats);

export const STAT_INFO: Record<string, StatInfo> = (() => {
  const out: Record<string, StatInfo> = {};
  for (const id of STAT_IDS) {
    const def = statDefs.find((s) => s?.id === id);
    const w = WIRING[id];
    out[id] = {
      id,
      label: LABEL[id] ?? id.replace(/_/g, ' '),
      primaryStat: def?.primaryStat ?? null,
      formula: def?.formula ?? '—',
      description: def?.description ?? '',
      wiring: w.wiring,
      where: w.where,
      engineFormula: w.engineFormula ?? null,
      source: ROLLED.has(id) ? 'rolled' : 'derived'
    };
  }
  return out;
})();

const num = (v: number | null | undefined) => v ?? 0;
const weaponsOf = (b: BuildClass) =>
  GEAR.filter((g) => g.kind === 'weapon' && g.classes.includes(b));
const armorOf = (b: BuildClass) => GEAR.filter((g) => g.kind === 'armor' && g.classes.includes(b));

interface Profile {
  weapons: GearRow[];
  armorTypes: Set<string>;
  hasShield: boolean;
  wearsHeavy: boolean;
  wearsLight: boolean;
  rangedShare: number;
  ranged: boolean;
  maxArmorDmg: number;
  maxCrit: number;
  avgStamina: number;
  reloads: boolean;
  allMechanical: boolean;
  powerStats: string[];
}

function profileOf(b: BuildClass): Profile {
  const weapons = weaponsOf(b);
  const armor = armorOf(b);
  const armorTypes = new Set(armor.map((a) => a.armorType ?? '').filter(Boolean));
  const rangedWeapons = weapons.filter(
    (w) => num(w.range) > 1 || w.raw?.weaponProperties?.ammoCategory
  );
  const rangedShare = weapons.length ? rangedWeapons.length / weapons.length : 0;
  const stam = weapons.map((w) => num(w.stamina)).filter((s) => s > 0);
  return {
    weapons,
    armorTypes,
    hasShield: armorTypes.has('shield'),
    wearsHeavy: armorTypes.has('heavy'),
    wearsLight: armorTypes.has('light') && !armorTypes.has('heavy'),
    rangedShare,
    ranged: rangedShare >= 0.5,
    maxArmorDmg: Math.max(0, ...weapons.map((w) => num(w.armorDmg))),
    maxCrit: Math.max(0, ...weapons.map((w) => num(w.crit))),
    avgStamina: stam.length ? stam.reduce((a, c) => a + c, 0) / stam.length : 0,
    reloads: weapons.some((w) => num(w.raw?.weaponProperties?.reload) > 1),
    allMechanical:
      rangedWeapons.length > 0 &&
      rangedWeapons.every((w) => w.raw?.weaponProperties?.strScaled === false),
    powerStats: [
      ...new Set(
        weapons.map((w) => w.scaling).filter((s): s is NonNullable<GearRow['scaling']> => !!s)
      )
    ]
  };
}

const P: Record<string, Profile> = {};
for (const b of BUILDS) P[b] = profileOf(b);

const topArmorDmg = Math.max(...BUILDS.map((b) => P[b].maxArmorDmg));
const topCrit = Math.max(...BUILDS.map((b) => P[b].maxCrit));
const topStamina = Math.max(...BUILDS.map((b) => P[b].avgStamina));

const cell = (rank: Rank, why: string): StatCell => ({ rank, why });
const share = (v: number, top: number) => (top > 0 ? v / top : 0);
const pctOf = (v: number, top: number) =>
  `${Math.round(share(v, top) * 100)}% of the best (${round1(v)} vs ${round1(top)})`;
const round1 = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

function cellsFor(b: BuildClass): Record<string, StatCell> {
  const p = P[b];
  const melee = !p.ranged;
  const c: Record<string, StatCell> = {};
  const arsenal = `${Math.round(p.rangedShare * 100)}% of its weapons are ranged`;

  c.melee_damage = melee
    ? cell(
        'primary',
        `every swing multiplies by it — scales on ${p.powerStats.join(' / ') || 'STR'}`
      )
    : cell('none', `shots take their damage from the ammo, not a melee multiplier — ${arsenal}`);
  c.hit_chance = melee
    ? cell('primary', 'decides whether the swing lands at all')
    : cell('none', `ranged accuracy is aim_accuracy plus the distance penalty — ${arsenal}`);
  c.attack_speed = melee
    ? cell('primary', 'sets the melee cadence, and stops paying at 1.67×')
    : cell('none', `ranged cadence is aim_speed (+ reload where the weapon spans) — ${arsenal}`);
  c.hit_precision =
    share(p.maxCrit, topCrit) >= 0.5
      ? cell('primary', `its weapons carry the crit: ${pctOf(p.maxCrit, topCrit)}`)
      : cell(
          'secondary',
          `modest weapon crit: ${pctOf(p.maxCrit, topCrit)} — precision still finds armour gaps`
        );
  c.armor_damage =
    p.maxArmorDmg <= 0
      ? cell('none', 'its weapons strip no armour condition')
      : share(p.maxArmorDmg, topArmorDmg) >= 0.5
        ? cell('primary', `built to wreck armour: ${pctOf(p.maxArmorDmg, topArmorDmg)}`)
        : cell('secondary', `some armour wear: ${pctOf(p.maxArmorDmg, topArmorDmg)}`);

  const rangedOnly = (why: string, rank: Rank = 'primary') =>
    p.ranged ? cell(rank, why) : cell('none', 'melee build — never fires a shot');
  c.aim_accuracy = rangedOnly('the whole to-hit roll for a shot');
  c.aim_speed = rangedOnly('time to line each shot up — the ranged cadence');
  c.aim_range = rangedOnly('multiplies the weapon’s printed range');
  c.reload_speed = p.reloads
    ? cell('primary', 'its weapon spans a mechanism between shots')
    : cell('none', p.ranged ? 'no span step — nothing to speed up' : 'melee build');
  c.ranged_damage = !p.ranged
    ? cell('none', 'melee build')
    : p.allMechanical
      ? cell(
          'none',
          'mechanical draw (strScaled: false) — the mechanism supplies the force, not the shooter'
        )
      : p.powerStats.includes('INT')
        ? cell('none', 'a channelled bolt carries no draw — its damage scales on INT')
        : cell('primary', 'draw/throw power behind the shot');

  c.dodge = p.wearsLight
    ? cell(
        'primary',
        `light armour is the heaviest it wears (${[...p.armorTypes].join(', ')}) — evasion IS its defence`
      )
    : p.wearsHeavy
      ? cell('secondary', 'heavy armour drags evasion; it soaks instead')
      : cell('secondary', `wears ${[...p.armorTypes].join(', ') || 'no classified armour'}`);
  c.block = p.hasShield
    ? cell('primary', 'carries a shield — block resolves before evasion and stops the blow cold')
    : p.wearsHeavy
      ? cell('secondary', 'no shield, but mass and constitution still stop some blows')
      : cell('none', 'no shield — bare block is a rounding error');
  c.knockdown_resistance = p.wearsHeavy
    ? cell('primary', 'holds ground under blows meant to stagger it')
    : cell('secondary', 'a stagger costs it a turn like anyone else');
  c.stealth =
    b === 'Assassin (Dagger)'
      ? cell('primary', 'spec: opens from stealth — the unseen strike multiplies precision ×3.5')
      : p.wearsLight
        ? cell('secondary', 'light enough to approach unseen for the opening hit')
        : cell('none', 'too loud and too heavy to go unnoticed');

  const stamRank: Rank = share(p.avgStamina, topStamina) >= 0.6 ? 'primary' : 'secondary';
  const stamWhy = `average ${round1(p.avgStamina)} stamina per swing (${pctOf(p.avgStamina, topStamina)})`;
  c.stamina = cell(stamRank, stamWhy);
  c.stamina_recovery_rate = cell(stamRank, stamWhy);
  c.movement_speed = p.wearsLight
    ? cell('primary', 'lives on spacing — closing or keeping the gap')
    : cell('secondary', 'gets to the fight, then stands in it');
  c.carry_weight = p.wearsHeavy
    ? cell('primary', 'the heaviest kit in the game has to be carried before it protects anything')
    : cell('secondary', 'light kit, little to budget');

  return c;
}

export function buildStatRows(): BuildStatRow[] {
  return BUILDS.map((build) => ({
    build,
    powerStats: P[build].powerStats,
    cells: cellsFor(build)
  }));
}
