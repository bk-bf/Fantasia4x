import itemsData from '../game/database/items/items.json';
import recipesData from '../game/database/items/recipes.json';
import buildingsData from '../game/database/world/buildings.json';
import researchData from '../game/database/progression/research.json';
import traitsData from '../game/database/pawns/traits.json';
import creaturesData from '../game/database/pawns/creatures.json';
import lootpoolData from '../game/database/items/lootpool.json';
import { carcassItems, nodeItems, hasRecipe, chainAgeOf, usesBossPart } from './chainAge';

/* eslint-disable @typescript-eslint/no-explicit-any */
const items = itemsData as any[];
const recipes = recipesData as any[];
const buildings = buildingsData as any[];
const research = researchData as any[];
const traits = traitsData as any[];

export type BuildClass =
  | 'Sword & Shield'
  | 'Axe & Shield'
  | 'Mace & Shield'
  | 'Cleaver & Shield'
  | 'Flail & Shield'
  | 'Spear & Shield'
  | 'Sword (Duelist)'
  | 'Axe (Duelist)'
  | 'Mace (Duelist)'
  | 'Cleaver (Duelist)'
  | 'Flail (Duelist)'
  | 'Spear (Duelist)'
  | 'Greatsword (2H)'
  | '2H Cleaver'
  | '2H Axe'
  | '2H Hammer'
  | 'Polearm (2H)'
  | 'Pure Tank'
  | 'Fencer (Rapier)'
  | 'Assassin (Dagger)'
  | 'Archer (Bow)'
  | 'Crossbowman'
  | 'Skirmisher (Throwing)'
  | 'Slinger (Sling)'
  | 'Battlemage (1H Staff)'
  | 'War-Caster (2H Staff)'
  | 'Stunwaller (2H Staff)'
  | 'General';

export type BuildCategory =
  | 'melee'
  | 'duelist'
  | 'tank'
  | 'finesse'
  | 'ranged'
  | 'caster'
  | 'general';
export type GearKind = 'weapon' | 'armor' | 'tool' | 'ammo' | 'medicine' | 'trait' | 'material';
export type TraitGating = 'ungated' | 'cultural' | 'lineage' | 'flaw';

const SHIELD_BUILDS: BuildClass[] = [
  'Sword & Shield',
  'Axe & Shield',
  'Mace & Shield',
  'Cleaver & Shield',
  'Flail & Shield',
  'Spear & Shield'
];
const DUELIST: BuildClass[] = [
  'Sword (Duelist)',
  'Axe (Duelist)',
  'Mace (Duelist)',
  'Cleaver (Duelist)',
  'Flail (Duelist)',
  'Spear (Duelist)'
];
const TWOH: BuildClass[] = ['Greatsword (2H)', '2H Cleaver', '2H Axe', '2H Hammer', 'Polearm (2H)'];
const FRONTLINE: BuildClass[] = [...SHIELD_BUILDS, ...TWOH];
const MELEE_ALL: BuildClass[] = [
  ...FRONTLINE,
  ...DUELIST,
  'Pure Tank',
  'Fencer (Rapier)',
  'Assassin (Dagger)'
];
const RANGED: BuildClass[] = [
  'Archer (Bow)',
  'Crossbowman',
  'Skirmisher (Throwing)',
  'Slinger (Sling)'
];
const PER_BUILDS: BuildClass[] = ['Fencer (Rapier)', ...RANGED];
const CASTERS: BuildClass[] = ['Battlemage (1H Staff)', 'War-Caster (2H Staff)'];
const NIMBLE: BuildClass[] = [
  'Assassin (Dagger)',
  'Fencer (Rapier)',
  ...RANGED,
  ...DUELIST,
  'Stunwaller (2H Staff)'
];

export const BUILDS: BuildClass[] = [
  ...SHIELD_BUILDS,
  ...DUELIST,
  ...TWOH,
  'Pure Tank',
  'Fencer (Rapier)',
  'Assassin (Dagger)',
  ...RANGED,
  ...CASTERS,
  'Stunwaller (2H Staff)'
];
export const CLASSES: BuildClass[] = [...BUILDS, 'General'];
export const KINDS: GearKind[] = ['weapon', 'armor', 'tool', 'ammo', 'medicine', 'trait'];

export const BUILD_CAT: Record<string, BuildCategory> = (() => {
  const m: Record<string, BuildCategory> = { General: 'general' };
  FRONTLINE.forEach((b) => (m[b] = 'melee'));
  DUELIST.forEach((b) => (m[b] = 'duelist'));
  m['Pure Tank'] = 'tank';
  m['Fencer (Rapier)'] = 'finesse';
  m['Assassin (Dagger)'] = 'finesse';
  RANGED.forEach((b) => (m[b] = 'ranged'));
  m['Battlemage (1H Staff)'] = 'caster';
  m['War-Caster (2H Staff)'] = 'caster';
  m['Stunwaller (2H Staff)'] = 'caster';
  return m;
})();

const GROUP_LABELS: [BuildClass[], string][] = [
  [MELEE_ALL, 'all melee'],
  [FRONTLINE, 'frontline'],
  [DUELIST, 'duelists'],
  [PER_BUILDS, 'PER builds'],
  [RANGED, 'ranged'],
  [CASTERS, 'casters'],
  [NIMBLE, 'nimble']
];
export function describeClasses(cs: BuildClass[]): string {
  if (!cs.length || (cs.length === 1 && cs[0] === 'General')) return 'general';
  const rest = new Set(cs);
  const labels: string[] = [];
  for (const [grp, label] of GROUP_LABELS)
    if (grp.every((x) => rest.has(x))) {
      labels.push(label);
      grp.forEach((x) => rest.delete(x));
    }
  for (const x of rest) labels.push(x);
  return labels.join(' · ');
}

export interface DropSource {
  creature: string;
  tier: number;
  threat: number;
  chance: number;
}
type LootPick = { id: string; w?: number };
type LootSlot = { chance?: number; pick?: LootPick[] };
type LootPool = { dropChance?: number; slots?: Record<string, LootSlot> };

const DROPS_BY_ITEM: Map<string, DropSource[]> = (() => {
  const pools = ((lootpoolData as { pools?: Record<string, LootPool> }).pools ?? {}) as Record<
    string,
    LootPool
  >;
  const byPool = new Map<string, { name: string; tier: number; threat: number }[]>();
  for (const c of creaturesData as {
    id: string;
    name?: string;
    tier?: number;
    threatLevel?: number;
    lootPool?: string;
  }[]) {
    if (!c?.lootPool) continue;
    const arr = byPool.get(c.lootPool) ?? [];
    arr.push({ name: c.name ?? c.id, tier: c.tier ?? 0, threat: c.threatLevel ?? 0 });
    byPool.set(c.lootPool, arr);
  }
  const out = new Map<string, DropSource[]>();
  for (const [poolId, pool] of Object.entries(pools)) {
    const dropChance = pool.dropChance ?? 1;
    for (const slot of Object.values(pool.slots ?? {})) {
      const picks = slot.pick ?? [];
      const total = picks.reduce((n, p) => n + (p.w ?? 1), 0) || 1;
      for (const p of picks) {
        const chance = dropChance * (slot.chance ?? 1) * ((p.w ?? 1) / total);
        for (const c of byPool.get(poolId) ?? []) {
          const arr = out.get(p.id) ?? [];
          const prev = arr.find((x) => x.creature === c.name);
          if (prev) prev.chance = Math.max(prev.chance, chance);
          else arr.push({ creature: c.name, tier: c.tier, threat: c.threat, chance });
          out.set(p.id, arr);
        }
      }
    }
  }
  for (const arr of out.values()) arr.sort((a, b) => b.chance - a.chance || a.tier - b.tier);
  return out;
})();

export const DROPPED = '__dropped';
export const UNAFFILIATED = '__unaffiliated';

export const AGES = ['Primitive', 'Copper', 'Bronze', 'Iron', 'Steel', 'Runed', 'Boss'] as const;
export type Age = (typeof AGES)[number];

export interface BuildSpec {
  goal: string;
  requires: string;
  downside: string;
}
export const BUILD_SPEC: Record<string, BuildSpec> = {
  'Sword & Shield': {
    goal: 'Balanced frontline anchor: reliable damage with a solid guard.',
    requires: 'STR, a shield, medium–heavy armour.',
    downside: 'Master of none — out-damaged by 2H, out-tanked by Pure Tank.'
  },
  'Axe & Shield': {
    goal: 'Shield-breaker: strip an enemy shield, then cut.',
    requires: 'STR, an axe (bonus shield damage), a shield.',
    downside: 'Lower raw damage than swords once the shield is gone.'
  },
  'Mace & Shield': {
    goal: 'Anti-armour control: stun / knockdown and dent armour.',
    requires: 'STR, a mace (2nd-best armour damage + stun), a shield.',
    downside: 'Wasted on unarmoured foes; modest cutting damage.'
  },
  'Cleaver & Shield': {
    goal: 'Bleed-and-crit bruiser behind a shield.',
    requires: 'STR, a cleaver (high bleed/crit), a shield.',
    downside: 'High stamina drain; bleed is slow against armour.'
  },
  'Flail & Shield': {
    goal: 'Ignore the enemy guard and hit weak spots (top precision).',
    requires: 'STR, a flail (highest weakspot precision + stun), a shield.',
    downside: 'Erratic, lower base damage than swords/axes.'
  },
  'Spear & Shield': {
    goal: 'Defensive anti-flanker: reach + knockback holds a line.',
    requires: 'STR, a spear (reach, knockback at tier), a shield.',
    downside: 'Low damage — a holder/support, not a killer.'
  },
  'Sword (Duelist)': {
    goal: 'High-tempo 1H swordsman: faster and more precise than 2H, no shield.',
    requires: 'High DEX + dodge, the Duelist trait, light–medium armour, a free off-hand.',
    downside: 'Fragile (no shield, light armour); heavy armour caps its speed.'
  },
  'Axe (Duelist)': {
    goal: 'Duel-grip axe: fast shield-splitting with a free off-hand bonus.',
    requires: 'High DEX + dodge, the Duelist trait, light–medium armour.',
    downside: 'Fragile; loses the shield-break value against unshielded foes.'
  },
  'Mace (Duelist)': {
    goal: 'Fast duel-grip stun: precise blunt control, no shield.',
    requires: 'High DEX + dodge, the Duelist trait, light–medium armour.',
    downside: 'Low damage on unarmoured foes; fragile.'
  },
  'Cleaver (Duelist)': {
    goal: 'Fast bleed duelist: high crit + bleed with a free off-hand.',
    requires: 'High DEX + dodge, the Duelist trait, light–medium armour.',
    downside: 'Stamina hungry; fragile.'
  },
  'Flail (Duelist)': {
    goal: 'Duel-grip flail: weak-spot hunter that ignores the guard.',
    requires: 'High DEX + dodge, the Duelist trait, light–medium armour.',
    downside: 'Erratic damage; fragile.'
  },
  'Spear (Duelist)': {
    goal: 'Reach duelist: keep distance, poke and knock back, no shield.',
    requires: 'High DEX + dodge, the Duelist trait, light–medium armour.',
    downside: 'Low damage; very exposed once closed on.'
  },
  'Greatsword (2H)': {
    goal: 'Cleaving frontline that punishes crowds (AoE swings).',
    requires: 'STR, a 2H sword, room to swing.',
    downside: 'No shield, slow, stamina-heavy.'
  },
  '2H Cleaver': {
    goal: 'Maximum bleed, crit and raw cutting damage.',
    requires: 'STR and a deep stamina pool.',
    downside: 'Highest stamina drain of any weapon; slow.'
  },
  '2H Axe': {
    goal: 'Shield-destroyer with armour-damage AoE.',
    requires: 'STR, a 2H axe (devastating shield damage).',
    downside: 'Slow; no shield; less raw damage than the greatsword.'
  },
  '2H Hammer': {
    goal: 'Armour-crusher and boss-breaker: top armour-durability damage + stun/knockdown.',
    requires: 'STR, a 2H hammer/maul.',
    downside: 'Slow; poor against unarmoured foes; no shield.'
  },
  'Polearm (2H)': {
    goal: 'Backline reach + the highest knockback; anti-flank spacing.',
    requires: 'STR, a rank behind the front line.',
    downside: '2H slow, less precise; weak once an enemy closes.'
  },
  'Pure Tank': {
    goal: 'Unkillable anchor that soaks hits and provokes enemies onto itself.',
    requires:
      'Heaviest armour + heaviest shield, high CON, taunt/provoke traits, a stamina-cheap weapon.',
    downside: 'Negligible damage — a wall, not a threat.'
  },
  'Fencer (Rapier)': {
    goal: 'Precision duelist: the highest precision, armour-piercing thrusts.',
    requires: 'PER (finesse), light–medium armour, a rapier/estoc.',
    downside: 'Low raw damage; fragile.'
  },
  'Assassin (Dagger)': {
    goal: 'Fastest attacker; bypass armour and backstab from stealth.',
    requires: 'DEX, low encumbrance, stealth, a dagger.',
    downside: 'Tiny per-hit damage without position; very fragile.'
  },
  'Archer (Bow)': {
    goal: 'Longest-range precision fire with the best ranged crit.',
    requires: 'PER, high skill, a clear line, arrows.',
    downside: 'Needs the most skill; helpless in melee.'
  },
  Crossbowman: {
    goal: 'Armour-piercing ranged with a low skill floor.',
    requires: 'PER, bolts.',
    downside: 'Shorter range than a bow; slow reload.'
  },
  'Skirmisher (Throwing)': {
    goal: 'Close-range harasser with the highest AP and armour damage of the ranged builds.',
    requires: 'STR/PER, a stock of thrown weapons.',
    downside: 'Shortest range; limited ammo.'
  },
  'Slinger (Sling)': {
    goal: 'Cheapest, fastest-firing chip damage; easiest to land.',
    requires: 'Minimal skill, stones.',
    downside: 'Lowest damage / AP / armour damage; blunt only.'
  },
  'Battlemage (1H Staff)': {
    goal: 'Elemental caster that keeps a shield or off-hand: massive per-shot damage, unlimited ammo.',
    requires: 'INT, a 1H staff, stamina management.',
    downside: 'Slow, huge stamina per shot (Magic Drained); frail.'
  },
  'War-Caster (2H Staff)': {
    goal: '2H elemental staff that doubles as a high-stun blunt weapon.',
    requires: 'INT, a 2H staff, stamina.',
    downside: 'Slow; Magic Drained on overuse; no off-hand.'
  },
  'Stunwaller (2H Staff)': {
    goal: 'Non-magical allrounder: best blunt precision + fastest attack to stun-wall with weak pawns.',
    requires: 'A 2H staff; very low stat bar to use.',
    downside: 'Lowest damage / AP / armour damage — pure control, no kills.'
  }
};

export interface RecipeInfo {
  station: string;
  stationId: string;
  toolTier: number;
  discipline: string | null;
  inputs: { name: string; qty: number }[];
  workAmount: number;
  passive: boolean;
}

export interface GearRow {
  id: string;
  name: string;
  kind: GearKind;
  cls: BuildClass;
  classes: BuildClass[];
  fallbackClasses: BuildClass[];
  age: Age;
  ageRank: number;
  tier: number;
  weightKg: number;
  durability: number;
  research: string | null;
  craftable: boolean;
  recipe: RecipeInfo | null;
  dmg: number | null;
  damMin: number | null;
  damMax: number | null;
  damageType: string | null;
  ap: number | null;
  armorDmg: number | null;
  crit: number | null;
  critMult: number | null;
  accuracy: number | null;
  atkSpeed: number | null;
  stamina: number | null;
  reach: number | null;
  range: number | null;
  stun: number | null;
  scaling: 'STR' | 'DEX' | 'PER' | 'INT' | 'CHA' | 'draw' | null;
  twoHanded: boolean | null;
  onHit: string | null;
  wieldStr: number | null;
  defense: number | null;
  armorType: string | null;
  slot: string | null;
  bodyPart: string | null;
  droppedBy: DropSource[];
  source: string;
  armorSet: string | null;
  setLabel: string | null;
  movePen: number | null;
  stealthMod: number | null;
  block: number | null;
  boostSpeed: number | null;
  boostYield: number | null;
  boostQuality: number | null;
  work: string | null;
  medicine: number | null;
  effect: string | null;
  gating: TraitGating | null;
  scope: string | null;
  rarity: string | null;
  rarityRank: number;
  polarity: 'positive' | 'negative';
  gradeRarity: string | null;
  gradeRank: number;
  lineageNames: string | null;
  evolvesTo: string | null;
  evoStage: number;
  desc: string | null;
  raw: any;
}

export const REAL_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as const;

const prettify = (id: string) =>
  id
    .replace(/^category:/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

const buildingName = new Map<string, string>();
for (const b of buildings) if (b?.id) buildingName.set(b.id, b.name ?? prettify(b.id));
const researchName = new Map<string, string>();
for (const r of research) if (r?.id) researchName.set(r.id, r.name ?? prettify(r.id));
const itemName = new Map<string, string>();
for (const it of items) if (it?.id) itemName.set(it.id, it.name ?? prettify(it.id));
const recipeByOutput = new Map<string, any>();
for (const rec of recipes)
  for (const out of Object.keys(rec?.outputs ?? {}))
    if (!recipeByOutput.has(out)) recipeByOutput.set(out, rec);

function ageOf(
  id: string,
  researchId: string | null,
  tier: number,
  craftable: boolean,
  tierDeclared: boolean
): Age {
  const r = researchId ?? '';
  if (/rune|runic|arcane|attunement|manaforge|lapidary/.test(r)) return 'Runed';
  if (r === 'steel_making') return 'Steel';
  if (r === 'iron_working') return 'Iron';
  if (r === 'bronze_working') return 'Bronze';
  if (r === 'copper_smelting') return 'Copper';
  if (tier >= 4 && (!craftable || usesBossPart(id))) return 'Boss';
  if (hasRecipe(id)) return AGE_OF_CHAIN[chainAgeOf(id)] ?? 'Primitive';
  if (tierDeclared) return AGE_BY_TIER[Math.min(Math.max(tier, 0), 4)];
  if (/staff$|rune|arcane/.test(id)) return 'Runed';
  if (/steel|clockwork/.test(id)) return 'Steel';
  if (/iron/.test(id)) return 'Iron';
  if (/bronze/.test(id)) return 'Bronze';
  if (/copper/.test(id)) return 'Copper';
  if (tier <= 2 && /bone|antler|fang/.test(id)) return tier >= 2 ? 'Bronze' : 'Copper';
  if (/flint|stone|wood|rawhide|raw_hide|hide|leaf/.test(id)) return 'Primitive';
  if (/^(throwing|sling|self|padded|linen|tallow|wattle|wicker)/.test(id)) return 'Primitive';
  return AGE_BY_TIER[Math.min(Math.max(tier, 0), 4)];
}
export const AGE_OF_CHAIN: Age[] = ['Primitive', 'Copper', 'Bronze', 'Iron', 'Steel', 'Runed'];
export const AGE_BY_TIER: Age[] = ['Primitive', 'Bronze', 'Iron', 'Steel', 'Runed'];

function kindOf(item: any): GearKind | null {
  if (item.category === 'natural_weapon') return null;
  if (item.category === 'ammunition') return 'ammo';
  if (item.weaponProperties) return 'weapon';
  if (item.armorProperties) return 'armor';
  if (item.medicineQuality != null) return 'medicine';
  if (item.type === 'tool') return 'tool';
  return null;
}

const FAMILY_CLASS: Record<string, { one: BuildClass; two: BuildClass }> = {
  sword: { one: 'Sword & Shield', two: 'Greatsword (2H)' },
  axe: { one: 'Axe & Shield', two: '2H Axe' },
  cleaver: { one: 'Cleaver & Shield', two: '2H Cleaver' },
  mace: { one: 'Mace & Shield', two: '2H Hammer' },
  flail: { one: 'Flail & Shield', two: 'Flail & Shield' },
  spear: { one: 'Spear & Shield', two: 'Polearm (2H)' },
  rapier: { one: 'Fencer (Rapier)', two: 'Fencer (Rapier)' },
  dagger: { one: 'Assassin (Dagger)', two: 'Assassin (Dagger)' },
  bow: { one: 'Archer (Bow)', two: 'Archer (Bow)' },
  crossbow: { one: 'Crossbowman', two: 'Crossbowman' },
  sling: { one: 'Slinger (Sling)', two: 'Slinger (Sling)' },
  thrown: { one: 'Skirmisher (Throwing)', two: 'Skirmisher (Throwing)' },
  staff: { one: 'Battlemage (1H Staff)', two: 'War-Caster (2H Staff)' }
};

function classifyWeapon(item: any, wp: any): BuildClass {
  const declared = FAMILY_CLASS[wp.weaponFamily as string];
  if (declared) return wp.twoHanded ? declared.two : declared.one;
  const id = item.id;
  const dt = wp.damageType;
  const two = !!wp.twoHanded;
  const pierce = dt === 'piercing' || dt === 'pierce';
  const has = (re: RegExp) => re.test(id);
  if (wp.arcane) return two ? 'War-Caster (2H Staff)' : 'Battlemage (1H Staff)';
  const ranged =
    wp.ammoCategory ||
    wp.drawPower != null ||
    (wp.range ?? 0) > 1 ||
    /throw|javelin|dart|sling|blowgun|firepot|bow|crossbow/.test(id);
  if (ranged) {
    if (has(/sling/)) return 'Slinger (Sling)';
    if (has(/crossbow|xbow|arbalest/)) return 'Crossbowman';
    if (has(/throw|javelin|firepot|dart|blowgun/) || (!wp.ammoCategory && !wp.drawPower))
      return 'Skirmisher (Throwing)';
    return 'Archer (Bow)';
  }
  if (wp.finesse) return 'Fencer (Rapier)';
  const light = (item.weightKg ?? 9) <= 1.3;
  const fast = (wp.attackSpeed ?? 1) >= 1.2;
  if (!two && has(/dagger|knife|rondel|stiletto|shank|punch|dirk/)) return 'Assassin (Dagger)';
  if (!two && pierce && light && fast && !has(/spear|pike/)) return 'Assassin (Dagger)';
  if (two && has(/staff/)) return 'Stunwaller (2H Staff)';
  if (has(/flail/)) return 'Flail & Shield';
  if (has(/maul|warhammer|hammer/)) return two ? '2H Hammer' : 'Mace & Shield';
  if (has(/mace|club/)) return 'Mace & Shield';
  if (has(/cleaver/)) return two ? '2H Cleaver' : 'Cleaver & Shield';
  if (has(/axe|hatchet/)) return two ? '2H Axe' : 'Axe & Shield';
  if (has(/pike|spear|framea|glaive|halberd|lance/)) return two ? 'Polearm (2H)' : 'Spear & Shield';
  if (has(/greatsword/)) return 'Greatsword (2H)';
  if (has(/sword|seax|spatha|estoc|rapier|blade|sabre|saber|falchion/))
    return two ? 'Greatsword (2H)' : 'Sword & Shield';
  if (two) return dt === 'blunt' ? '2H Hammer' : pierce ? 'Polearm (2H)' : 'Greatsword (2H)';
  return dt === 'blunt' ? 'Mace & Shield' : pierce ? 'Spear & Shield' : 'Sword & Shield';
}

export interface ArmorFit {
  ideal: BuildClass[];
  fallback: BuildClass[];
}
const othersThan = (ideal: BuildClass[]): BuildClass[] => BUILDS.filter((b) => !ideal.includes(b));

function classifyArmor(item: any): ArmorFit {
  const ap = item.armorProperties;
  if (ap?.armorType === 'shield')
    return { ideal: [...SHIELD_BUILDS, 'Pure Tank', 'Battlemage (1H Staff)'], fallback: [] };
  const fit = (ideal: BuildClass[]): ArmorFit => ({ ideal, fallback: othersThan(ideal) });
  if (ap?.stealthMod) return fit(['Assassin (Dagger)', 'Fencer (Rapier)', ...RANGED]);
  if (
    item.magicResistance != null ||
    ap?.magicResistance != null ||
    /robe|circlet|arcane/.test(item.id)
  )
    return fit([...CASTERS]);
  switch (ap?.armorType) {
    case 'heavy':
      return { ideal: [...FRONTLINE, 'Pure Tank'], fallback: [] };
    case 'medium':
      return fit([...FRONTLINE, ...DUELIST, 'Fencer (Rapier)']);
    case 'light':
      return fit([...NIMBLE, ...CASTERS]);
    default:
      return { ideal: ['General'], fallback: [] };
  }
}

const DUELIST_OF: Partial<Record<BuildClass, BuildClass>> = {
  'Sword & Shield': 'Sword (Duelist)',
  'Axe & Shield': 'Axe (Duelist)',
  'Mace & Shield': 'Mace (Duelist)',
  'Cleaver & Shield': 'Cleaver (Duelist)',
  'Flail & Shield': 'Flail (Duelist)',
  'Spear & Shield': 'Spear (Duelist)'
};

function classifyItem(item: any, kind: GearKind): ArmorFit {
  if (kind === 'weapon' || kind === 'ammo') {
    const wp = item.weaponProperties;
    if (!wp) return { ideal: ['General'], fallback: [] };
    const base = classifyWeapon(item, wp);
    const duel = DUELIST_OF[base];
    return { ideal: duel ? [base, duel, 'Pure Tank'] : [base], fallback: [] };
  }
  if (kind === 'armor') return classifyArmor(item);
  return { ideal: ['General'], fallback: [] };
}

export const BODY_PARTS = [
  'head',
  'torso-outer',
  'torso-mid',
  'torso-skin',
  'arms',
  'hands',
  'legs',
  'feet',
  'feet — under',
  'cloak',
  'pack'
] as const;
function bodyPartOf(slot: string | null): string | null {
  switch (slot) {
    case 'offHand':
      return 'shield';
    case 'head':
      return 'head';
    case 'bodyOuter':
      return 'torso-outer';
    case 'bodyMid':
      return 'torso-mid';
    case 'bodyBase':
      return 'torso-skin';
    case 'bracers':
      return 'arms';
    case 'gloves':
      return 'hands';
    case 'greaves':
      return 'legs';
    case 'boots':
      return 'feet';
    case 'socks':
      return 'feet — under';
    case 'back':
      return 'cloak';
    case 'back2':
      return 'pack';
    default:
      return null;
  }
}

const SCALE_ABBR: Record<string, GearRow['scaling']> = {
  strength: 'STR',
  dexterity: 'DEX',
  perception: 'PER',
  intelligence: 'INT',
  charisma: 'CHA'
};
function scalingOf(wp: any): GearRow['scaling'] {
  if (!wp) return null;
  if (wp.powerStat) return SCALE_ABBR[String(wp.powerStat)] ?? null;
  if (wp.arcane) return 'INT';
  if (wp.finesse) return 'PER';
  if (wp.strScaled === false) return 'draw';
  return 'STR';
}

function recipeInfo(rec: any): RecipeInfo | null {
  if (!rec) return null;
  const inputs: { name: string; qty: number }[] = [];
  const push = (obj: any) => {
    if (!obj) return;
    for (const [k, v] of Object.entries(obj))
      inputs.push({ name: itemName.get(k) ?? prettify(k), qty: v as number });
  };
  push(rec.inputs);
  if (rec.dynamicRecipe)
    for (const slot of Object.values<any>(rec.dynamicRecipe)) {
      const cats: string[] =
        slot.acceptsCategories ?? (slot.acceptsCategory ? [slot.acceptsCategory] : []);
      inputs.push({
        name: cats.length ? cats.map(prettify).join(' / ') : 'any material',
        qty: slot.quantity ?? 1
      });
    }
  const stationId = rec.station ?? '';
  return {
    stationId,
    station:
      !stationId || stationId === 'craft_spot'
        ? 'anywhere / craft spot'
        : (buildingName.get(stationId) ?? prettify(stationId)),
    toolTier: rec.toolTierRequired ?? 0,
    discipline: rec.discipline ?? null,
    inputs,
    workAmount: rec.workAmount ?? 0,
    passive: !!rec.passive
  };
}

const DRIED_FROM = new Map<string, string>();
const ROTTED_FROM = new Map<string, string>();
for (const i of items) {
  const dry = i?.driesTo;
  const to = typeof dry === 'string' ? dry : dry?.itemId;
  if (to && !DRIED_FROM.has(to)) DRIED_FROM.set(to, i.id);
  if (typeof i?.decaysTo === 'string' && !ROTTED_FROM.has(i.decaysTo))
    ROTTED_FROM.set(i.decaysTo, i.id);
}
for (const [cat, out] of [
  ['meat', 'dried_meat'],
  ['fruit', 'dried_fruit']
] as const)
  if (!DRIED_FROM.has(out)) DRIED_FROM.set(out, `any ${cat}`);

const GATHERED = new Map<string, string>([
  ['water', 'river / lake / well'],
  ['terra_preta', 'dug from rich soil']
]);

function sourceOf(item: any, rec: any, drops: DropSource[]): string {
  if (item.category === 'natural_weapon') return 'innate';
  if (nodeItems.has(item.id)) return 'forage / mine';
  if (carcassItems.has(item.id)) return 'hunt';
  if (DRIED_FROM.has(item.id)) return `dries from ${DRIED_FROM.get(item.id)}`;
  if (ROTTED_FROM.has(item.id)) return 'spoilage';
  if (GATHERED.has(item.id)) return GATHERED.get(item.id)!;
  if (/^(carried_pawn|pawn_carcass)$/.test(item.id)) return 'the sim';
  if (rec)
    return !rec.station || rec.station === 'craft_spot'
      ? 'anywhere / craft spot'
      : (buildingName.get(rec.station) ?? prettify(rec.station));
  return drops.length ? 'drop only' : 'no source';
}

function toRow(item: any, forcedKind?: GearKind): GearRow | null {
  const kind = forcedKind ?? kindOf(item);
  if (!kind) return null;
  const rec = recipeByOutput.get(item.id) ?? null;
  const researchId = rec?.researchRequired ?? null;
  const tier = item.tier ?? 0;
  const craftable = !!rec;
  const age = ageOf(item.id, researchId, tier, craftable, item.tier != null);
  const wp = item.weaponProperties;
  const ap = item.armorProperties;
  const tb = item.toolBoost;
  const oh = item.onHitCondition;
  const { ideal: classes, fallback } = classifyItem(item, kind);
  return {
    id: item.id,
    name: item.name ?? prettify(item.id),
    kind,
    cls: classes[0] ?? 'General',
    classes,
    fallbackClasses: fallback,
    age,
    ageRank: AGES.indexOf(age),
    tier,
    weightKg: item.weightKg ?? 0,
    durability: item.maxDurability ?? item.durability ?? 0,
    research: researchId ? (researchName.get(researchId) ?? prettify(researchId)) : null,
    craftable,
    recipe: recipeInfo(rec),
    dmg: wp?.damage ?? null,
    damMin: wp?.damMin ?? null,
    damMax: wp?.damMax ?? null,
    damageType: wp?.damageType ?? item.ammoProperties?.damageType ?? null,
    ap: wp?.armorPenetration ?? item.ammoProperties?.armorPenetration ?? null,
    armorDmg: wp?.armorDamage ?? item.ammoProperties?.armorDamage ?? null,
    crit: wp?.critMod ?? null,
    critMult: wp?.critMultiplier ?? null,
    accuracy: wp?.accuracy ?? null,
    atkSpeed: wp?.attackSpeed ?? null,
    stamina: wp?.staminaCost ?? null,
    reach: wp?.reach ?? null,
    range: wp?.range ?? null,
    stun: wp?.stunChance ?? null,
    scaling: scalingOf(wp),
    twoHanded: wp ? !!wp.twoHanded : null,
    onHit: oh?.condition ?? null,
    wieldStr: item.wieldRequirement?.strength ?? null,
    defense: ap?.defense ?? null,
    armorType: ap?.armorType ?? null,
    slot: ap?.slot ?? ap?.equipmentSlot ?? null,
    bodyPart: kind === 'armor' ? bodyPartOf(ap?.equipmentSlot ?? ap?.slot ?? null) : null,
    droppedBy: DROPS_BY_ITEM.get(item.id) ?? [],
    source: sourceOf(item, rec, DROPS_BY_ITEM.get(item.id) ?? []),
    armorSet: ap?.armorSet ?? (kind === 'armor' ? (craftable ? UNAFFILIATED : DROPPED) : null),
    setLabel: ap?.armorSet
      ? prettify(ap.armorSet)
      : kind === 'armor'
        ? craftable
          ? 'unaffiliated'
          : 'drop-only'
        : null,
    movePen: ap?.movementPenalty ?? null,
    stealthMod: ap?.stealthMod ?? null,
    block: ap?.block ?? null,
    boostSpeed: tb?.speed ?? null,
    boostYield: tb?.yield ?? null,
    boostQuality: tb?.quality ?? null,
    work: item.processingType?.join(', ') ?? item.category ?? null,
    medicine: item.medicineQuality ?? null,
    effect: null,
    gating: null,
    scope: null,
    rarity: null,
    rarityRank: 0,
    polarity: 'positive',
    gradeRarity: null,
    gradeRank: 0,
    lineageNames: null,
    evolvesTo: null,
    evoStage: 0,
    desc: item.description ?? null,
    raw: item
  };
}

const STAT_ABBR: Record<string, string> = {
  strength: 'STR',
  dexterity: 'DEX',
  constitution: 'CON',
  perception: 'PER',
  intelligence: 'INT',
  charisma: 'CHA'
};

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'negative'];
const rarityRank = (r: string) => {
  const i = RARITY_ORDER.indexOf(r);
  return i < 0 ? 0 : i;
};

const evolvesParent = new Map<string, string>();
for (const t of traits) if (t?.id && t?.evolvesTo) evolvesParent.set(t.evolvesTo, t.id);
const evoStageCache = new Map<string, number>();
function evoStage(id: string, seen = new Set<string>()): number {
  if (evoStageCache.has(id)) return evoStageCache.get(id)!;
  if (seen.has(id)) return 0;
  seen.add(id);
  const p = evolvesParent.get(id);
  const s = p ? evoStage(p, seen) + 1 : 0;
  evoStageCache.set(id, s);
  return s;
}

function traitPolarity(t: any): 'positive' | 'negative' {
  if (t.kind === 'wound') return 'negative';
  const e = t.effects ?? {};
  let pos = false;
  let neg = false;
  for (const [k, v] of Object.entries(e)) {
    if (k.endsWith('Bonus')) (v as number) < 0 ? (neg = true) : (pos = true);
    else if (v && typeof v === 'object') {
      for (const mv of Object.values(v)) {
        if (typeof mv === 'number') {
          if (mv > 1) pos = true;
          else if (mv < 1) neg = true;
        }
      }
    } else if (typeof v === 'number') {
      if (v > 0) pos = true;
      else if (v < 0) neg = true;
    }
  }
  if (t.rarity === 'negative' && !pos) return 'negative';
  return neg && !pos ? 'negative' : 'positive';
}

function flawMagnitude(t: any): number {
  const e = t.effects ?? {};
  let m = 0;
  for (const [k, v] of Object.entries(e)) {
    if (k.endsWith('Bonus') && (v as number) < 0) m += Math.abs(v as number);
    else if (v && typeof v === 'object')
      for (const mv of Object.values(v)) if (typeof mv === 'number' && mv < 1) m += (1 - mv) * 6;
  }
  if (t.kind === 'wound') m += 5;
  return m;
}
function gradeRarityOf(t: any): string {
  if ((REAL_RARITIES as readonly string[]).includes(t.rarity)) return t.rarity;
  const m = flawMagnitude(t);
  return m < 1.5
    ? 'common'
    : m < 2.5
      ? 'uncommon'
      : m < 3.5
        ? 'rare'
        : m < 5
          ? 'epic'
          : m < 7
            ? 'legendary'
            : 'mythic';
}

function traitGating(t: any): TraitGating {
  if (t.rarity === 'negative') return 'flaw';
  if (t.scope === 'personal') return 'ungated';
  if ((t.lineage && t.lineage.length) || ['rare', 'epic', 'legendary'].includes(t.rarity))
    return 'lineage';
  return 'cultural';
}

function classifyTrait(t: any): BuildClass[] {
  const e = t.effects ?? {};
  const set = new Set<BuildClass>();
  const stat = (k: string) => e[k + 'Bonus'] != null;
  if (stat('strength')) MELEE_ALL.forEach((b) => set.add(b));
  if (stat('constitution')) {
    FRONTLINE.forEach((b) => set.add(b));
    set.add('Pure Tank');
  }
  if (stat('dexterity')) {
    set.add('Assassin (Dagger)');
    set.add('Fencer (Rapier)');
    DUELIST.forEach((b) => set.add(b));
  }
  if (stat('perception')) PER_BUILDS.forEach((b) => set.add(b));
  if (stat('intelligence')) CASTERS.forEach((b) => set.add(b));
  const cm = e.combatMods ?? {};
  for (const k of Object.keys(cm)) {
    if (/aim|reload|ranged|vision_range/.test(k)) RANGED.forEach((b) => set.add(b));
    else if (/melee_damage|attack_speed/.test(k)) MELEE_ALL.forEach((b) => set.add(b));
    else if (/hit_precision|hit_chance/.test(k)) {
      (['Fencer (Rapier)', 'Assassin (Dagger)', 'Archer (Bow)'] as BuildClass[]).forEach((b) =>
        set.add(b)
      );
      MELEE_ALL.forEach((b) => set.add(b));
    } else if (/dodge|knockdown|block|parry/.test(k)) NIMBLE.forEach((b) => set.add(b));
  }
  if (e.stealth != null || e.nightVision != null) set.add('Assassin (Dagger)');
  if (t.kind === 'bodyMod' || e.resistances) {
    FRONTLINE.forEach((b) => set.add(b));
    set.add('Pure Tank');
  }
  return set.size ? [...set] : ['General'];
}

function traitEffect(t: any): string {
  const e = t.effects ?? {};
  const parts: string[] = [];
  for (const stat of Object.keys(STAT_ABBR)) {
    const v = e[stat + 'Bonus'];
    if (v != null) parts.push(`${STAT_ABBR[stat]} ${v < 0 ? '−' : '+'}${Math.abs(v as number)}`);
  }
  const mults = (obj: any, suffix: string) => {
    if (!obj) return;
    for (const [k, v] of Object.entries(obj)) parts.push(`${k}${suffix} ×${v}`);
  };
  mults(e.combatMods, '');
  mults(e.workSpeed, ' spd');
  mults(e.workQuality, ' qual');
  mults(e.workYield, ' yld');
  if (e.stealth != null) parts.push(`stealth +${e.stealth}`);
  if (e.healRate != null) parts.push(`heal +${e.healRate}`);
  if (e.nightVision != null) parts.push(`nightVision +${e.nightVision}`);
  if (t.bodyMods) parts.push('body ' + t.bodyMods.map((b: any) => b.target).join('/'));
  if (t.selfCondition)
    parts.push(t.kind === 'naturalGear' ? 'natural gear' : String(t.selfCondition));
  return parts.join(' · ') || (t.kind ?? '—');
}

function traitRow(t: any): GearRow {
  const classes = classifyTrait(t);
  return {
    id: t.id,
    name: t.name ?? prettify(t.id),
    kind: 'trait',
    cls: classes[0],
    classes,
    fallbackClasses: [],
    source: 'innate',
    age: 'Primitive',
    ageRank: 0,
    tier: 0,
    weightKg: 0,
    durability: 0,
    research: null,
    craftable: false,
    recipe: null,
    dmg: null,
    damMin: null,
    damMax: null,
    damageType: null,
    ap: null,
    armorDmg: null,
    crit: null,
    critMult: null,
    accuracy: null,
    atkSpeed: null,
    stamina: null,
    reach: null,
    range: null,
    stun: null,
    scaling: null,
    twoHanded: null,
    onHit: null,
    wieldStr: null,
    defense: null,
    armorType: null,
    slot: null,
    bodyPart: null,
    droppedBy: [],
    armorSet: null,
    setLabel: null,
    movePen: null,
    stealthMod: null,
    block: null,
    boostSpeed: null,
    boostYield: null,
    boostQuality: null,
    work: null,
    medicine: null,
    effect: traitEffect(t),
    gating: traitGating(t),
    scope: t.scope ?? null,
    rarity: t.rarity ?? null,
    rarityRank: rarityRank(t.rarity),
    polarity: traitPolarity(t),
    gradeRarity: gradeRarityOf(t),
    gradeRank: (REAL_RARITIES as readonly string[]).indexOf(gradeRarityOf(t)),
    lineageNames: t.lineage && t.lineage.length ? t.lineage.join(', ') : null,
    evolvesTo: t.evolvesTo ?? null,
    evoStage: evoStage(t.id),
    desc: t.description ?? null,
    raw: t
  };
}

const itemRows = items.map((i) => toRow(i)).filter((r): r is GearRow => r !== null);
const traitRows = traits.filter((t) => t?.id && t?.name).map(traitRow);
export const GEAR: GearRow[] = [...itemRows, ...traitRows];

export interface BuildSummary {
  build: BuildClass;
  weapons: number;
  armor: number;
  ungatedTraits: number;
  culturalTraits: number;
  lineageTraits: number;
  flaws: number;
  lineages: string[];
  gaps: string[];
}

export function buildSummaries(): BuildSummary[] {
  return BUILDS.map((build) => {
    const rows = GEAR.filter((g) => g.classes.includes(build));
    const of = (kind: GearKind) => rows.filter((g) => g.kind === kind);
    const traitsFor = of('trait');
    const lineages = [
      ...new Set(
        traitsFor
          .filter((t) => t.gating === 'lineage' && t.lineageNames)
          .flatMap((t) => t.lineageNames!.split(', '))
      )
    ].sort();
    const ungated = traitsFor.filter((t) => t.gating === 'ungated').length;
    const weapons = of('weapon').length;
    const armor = of('armor').length;
    const gaps: string[] = [];
    if (weapons === 0) gaps.push('no weapon');
    if (ungated <= 1) gaps.push('≤1 ungated trait');
    if (lineages.length === 0) gaps.push('no lineage');
    return {
      build,
      weapons,
      armor,
      ungatedTraits: ungated,
      culturalTraits: traitsFor.filter((t) => t.gating === 'cultural').length,
      lineageTraits: traitsFor.filter((t) => t.gating === 'lineage').length,
      flaws: traitsFor.filter((t) => t.gating === 'flaw').length,
      lineages,
      gaps
    };
  });
}

export const rowForAny = (item: any): GearRow => toRow(item, kindOf(item) ?? 'material')!;
