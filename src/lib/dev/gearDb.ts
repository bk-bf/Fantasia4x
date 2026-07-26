// gearDb.ts — DEV TOOL (not a game system). Reads the real item/recipe/building/research/trait
// databases and derives a flat, auto-classified BUILD catalogue for the /gear-db browser route.
// Nothing here runs in the sim; it exists so the build audit is data-driven instead of hand-curated.
//
// Builds are WEAPON-DEFINED (Battle-Brothers style): a weapon maps to exactly one build by its
// damage type + handedness + finesse/arcane + family. Armour maps by weight class to the builds that
// favour it. Traits map by the combat stat/effect they touch. Crafting/healing/gather traits are
// NOT builds — they are general pawn skills (→ 'General'), since any build can also craft or heal.
//
// It imports the same .jsonc the game does (vite jsonc plugin), so it stays in sync with the data.

import itemsData from '../game/database/items/items.jsonc';
import recipesData from '../game/database/items/recipes.jsonc';
import buildingsData from '../game/database/world/buildings.jsonc';
import researchData from '../game/database/progression/research.jsonc';
import traitsData from '../game/database/pawns/traits.jsonc';

/* eslint-disable @typescript-eslint/no-explicit-any */
const items = itemsData as any[];
const recipes = recipesData as any[];
const buildings = buildingsData as any[];
const research = researchData as any[];
const traits = traitsData as any[];

export type BuildClass =
  // one-handed + shield (STR frontline)
  | 'Sword & Shield' | 'Axe & Shield' | 'Mace & Shield' | 'Cleaver & Shield' | 'Flail & Shield' | 'Spear & Shield'
  // one-handed duel-grip, no shield / free off-hand (needs the Duelist trait — Workstream B)
  | 'Sword (Duelist)' | 'Axe (Duelist)' | 'Mace (Duelist)' | 'Cleaver (Duelist)' | 'Flail (Duelist)' | 'Spear (Duelist)'
  // two-handed (STR)
  | 'Greatsword (2H)' | '2H Cleaver' | '2H Axe' | '2H Hammer' | 'Polearm (2H)'
  // pure defensive anchor (heaviest armour + shield, taunt/provoke — Workstream B)
  | 'Pure Tank'
  // finesse
  | 'Fencer (Rapier)' | 'Assassin (Dagger)'
  // ranged
  | 'Archer (Bow)' | 'Crossbowman' | 'Skirmisher (Throwing)' | 'Slinger (Sling)'
  // arcane / caster
  | 'Battlemage (1H Staff)' | 'War-Caster (2H Staff)' | 'Stunwaller (2H Staff)'
  // non-build (crafting/healing/social skills)
  | 'General';

export type BuildCategory = 'melee' | 'duelist' | 'tank' | 'finesse' | 'ranged' | 'caster' | 'general';
export type GearKind = 'weapon' | 'armor' | 'tool' | 'ammo' | 'medicine' | 'trait';
export type TraitGating = 'ungated' | 'cultural' | 'lineage' | 'flaw';

// ── build groups (used by the classifiers) ──────────────────────────────────
const SHIELD_BUILDS: BuildClass[] = ['Sword & Shield', 'Axe & Shield', 'Mace & Shield', 'Cleaver & Shield', 'Flail & Shield', 'Spear & Shield'];
const DUELIST: BuildClass[] = ['Sword (Duelist)', 'Axe (Duelist)', 'Mace (Duelist)', 'Cleaver (Duelist)', 'Flail (Duelist)', 'Spear (Duelist)'];
const TWOH: BuildClass[] = ['Greatsword (2H)', '2H Cleaver', '2H Axe', '2H Hammer', 'Polearm (2H)'];
const FRONTLINE: BuildClass[] = [...SHIELD_BUILDS, ...TWOH];
const MELEE_ALL: BuildClass[] = [...FRONTLINE, ...DUELIST, 'Pure Tank', 'Fencer (Rapier)', 'Assassin (Dagger)'];
const RANGED: BuildClass[] = ['Archer (Bow)', 'Crossbowman', 'Skirmisher (Throwing)', 'Slinger (Sling)'];
const PER_BUILDS: BuildClass[] = ['Fencer (Rapier)', ...RANGED];
const CASTERS: BuildClass[] = ['Battlemage (1H Staff)', 'War-Caster (2H Staff)'];
// Light-medium / dodge-based builds (duelists live here too — heavy armour claps their speed).
const NIMBLE: BuildClass[] = ['Assassin (Dagger)', 'Fencer (Rapier)', ...RANGED, ...DUELIST, 'Stunwaller (2H Staff)'];

// Every real build (order = display order). 'General' is deliberately excluded — it is not a build.
export const BUILDS: BuildClass[] = [
  ...SHIELD_BUILDS, ...DUELIST, ...TWOH, 'Pure Tank', 'Fencer (Rapier)', 'Assassin (Dagger)', ...RANGED, ...CASTERS, 'Stunwaller (2H Staff)'
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

// Collapse a multi-build support list into readable group labels for the UI (filter still uses the
// full array). e.g. all frontline + fencer + assassin → "all melee".
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
  for (const [grp, label] of GROUP_LABELS) if (grp.every((x) => rest.has(x))) { labels.push(label); grp.forEach((x) => rest.delete(x)); }
  for (const x of rest) labels.push(x);
  return labels.join(' · ');
}

export const AGES = ['Primitive', 'Copper', 'Bronze', 'Iron', 'Steel', 'Runed', 'Boss'] as const;
export type Age = (typeof AGES)[number];

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
  cls: BuildClass; // primary build (for display/sort/colour)
  classes: BuildClass[]; // every build this supports — filtered on
  age: Age;
  ageRank: number;
  tier: number;
  weightKg: number;
  durability: number;
  research: string | null;
  craftable: boolean;
  recipe: RecipeInfo | null;
  // weapon / ammo
  dmg: number | null;
  damMin: number | null;
  damMax: number | null;
  damageType: string | null;
  ap: number | null;
  armorDmg: number | null;
  crit: number | null;
  accuracy: number | null;
  atkSpeed: number | null;
  stamina: number | null;
  reach: number | null;
  range: number | null;
  stun: number | null;
  scaling: 'STR' | 'PER' | 'INT' | 'draw' | null;
  twoHanded: boolean | null;
  onHit: string | null;
  wieldStr: number | null;
  // armor
  defense: number | null;
  armorType: string | null;
  slot: string | null;
  movePen: number | null;
  stealthMod: number | null;
  block: number | null;
  // tool
  boostSpeed: number | null;
  boostYield: number | null;
  boostQuality: number | null;
  work: string | null;
  // medicine
  medicine: number | null;
  // trait
  effect: string | null;
  gating: TraitGating | null;
  scope: string | null;
  rarity: string | null;
  rarityRank: number; // 0=common … 5=mythic, 6=flaw — for sorting
  lineageNames: string | null;
  evolvesTo: string | null;
  evoStage: number; // 0 = base, +1 per step down an evolution chain
}

// ── lookup maps ─────────────────────────────────────────────────────────────
const prettify = (id: string) =>
  id.replace(/^category:/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const buildingName = new Map<string, string>();
for (const b of buildings) if (b?.id) buildingName.set(b.id, b.name ?? prettify(b.id));
const researchName = new Map<string, string>();
for (const r of research) if (r?.id) researchName.set(r.id, r.name ?? prettify(r.id));
const itemName = new Map<string, string>();
for (const it of items) if (it?.id) itemName.set(it.id, it.name ?? prettify(it.id));
const recipeByOutput = new Map<string, any>();
for (const rec of recipes) {
  const outs = rec?.outputs ? Object.keys(rec.outputs) : [];
  if (outs.length && !recipeByOutput.has(outs[0])) recipeByOutput.set(outs[0], rec);
}

// ── derivations ─────────────────────────────────────────────────────────────
function ageOf(id: string, researchId: string | null, tier: number, craftable: boolean): Age {
  const r = researchId ?? '';
  if (/rune|arcane|attunement|manaforge|lapidary/.test(r)) return 'Runed';
  if (r === 'steel_making') return 'Steel';
  if (r === 'iron_working') return 'Iron';
  if (r === 'bronze_working') return 'Bronze';
  if (r === 'copper_smelting') return 'Copper';
  if (/staff$|rune|arcane/.test(id)) return 'Runed';
  if (/^steel|^clockwork/.test(id)) return 'Steel';
  if (/^iron/.test(id)) return 'Iron';
  if (/^bronze|^cast_bronze/.test(id)) return 'Bronze';
  if (/^copper/.test(id)) return 'Copper';
  if (/^(flint|stone|bone|wood|antler|rawhide|raw_hide|wicker|hide|great_bone|leaf|padded|linen|tallow|wattle|throwing|sling|self)/.test(id))
    return 'Primitive';
  if (!craftable && tier >= 4) return 'Boss';
  return (['Primitive', 'Bronze', 'Iron', 'Steel', 'Runed'] as Age[])[Math.min(Math.max(tier, 0), 4)];
}

function kindOf(item: any): GearKind | null {
  if (item.category === 'natural_weapon') return null;
  if (item.category === 'ammunition') return 'ammo';
  if (item.weaponProperties) return 'weapon';
  if (item.armorProperties) return 'armor';
  if (item.medicineQuality != null) return 'medicine';
  if (item.type === 'tool') return 'tool';
  return null;
}

// Weapon → exactly one weapon-build, by stats + family keywords.
function classifyWeapon(item: any, wp: any): BuildClass {
  const id = item.id;
  const dt = wp.damageType;
  const two = !!wp.twoHanded;
  const pierce = dt === 'piercing' || dt === 'pierce';
  const has = (re: RegExp) => re.test(id);
  if (wp.arcane) return 'War-Caster (2H Staff)'; // all current staves are 2H magic
  const ranged =
    wp.ammoCategory || wp.drawPower != null || (wp.range ?? 0) >= 4 ||
    /throw|javelin|dart|sling|blowgun|firepot|bow|crossbow/.test(id);
  if (ranged) {
    if (has(/sling/)) return 'Slinger (Sling)';
    if (has(/crossbow|xbow/)) return 'Crossbowman';
    if (has(/throw|javelin|firepot|dart|blowgun/) || (!wp.ammoCategory && !wp.drawPower)) return 'Skirmisher (Throwing)';
    return 'Archer (Bow)';
  }
  if (wp.finesse) return 'Fencer (Rapier)';
  const light = (item.weightKg ?? 9) <= 1.3;
  const fast = (wp.attackSpeed ?? 1) >= 1.2;
  if (!two && has(/dagger|knife|rondel|stiletto|shank|punch|dirk/)) return 'Assassin (Dagger)';
  if (!two && pierce && light && fast && !has(/spear|pike/)) return 'Assassin (Dagger)';
  if (has(/flail/)) return 'Flail & Shield';
  if (has(/maul|warhammer|hammer/)) return two ? '2H Hammer' : 'Mace & Shield';
  if (has(/mace|club/)) return 'Mace & Shield';
  if (has(/cleaver/)) return two ? '2H Cleaver' : 'Cleaver & Shield';
  if (has(/axe|hatchet/)) return two ? '2H Axe' : 'Axe & Shield';
  if (has(/pike|spear|framea|leaf|glaive|halberd|lance/)) return two ? 'Polearm (2H)' : 'Spear & Shield';
  if (has(/greatsword/)) return 'Greatsword (2H)';
  if (has(/sword|seax|spatha|estoc|rapier|blade|sabre|saber|falchion/)) return two ? 'Greatsword (2H)' : 'Sword & Shield';
  // fallback by damage type + handedness
  if (two) return dt === 'blunt' ? '2H Hammer' : pierce ? 'Polearm (2H)' : 'Greatsword (2H)';
  return dt === 'blunt' ? 'Mace & Shield' : pierce ? 'Spear & Shield' : 'Sword & Shield';
}

// Armour → the builds whose weight/role favour it (multi-build).
function classifyArmor(item: any): BuildClass[] {
  const ap = item.armorProperties;
  if (ap?.armorType === 'shield') return [...SHIELD_BUILDS, 'Pure Tank', 'Battlemage (1H Staff)'];
  if (ap?.stealthMod) return ['Assassin (Dagger)', 'Fencer (Rapier)', ...RANGED];
  if (item.magicResistance != null || ap?.magicResistance != null || /robe|circlet|arcane/.test(item.id)) return [...CASTERS];
  switch (ap?.armorType) {
    case 'heavy': return [...FRONTLINE, 'Pure Tank']; // duelists excluded — heavy claps their speed
    case 'medium': return [...FRONTLINE, ...DUELIST, 'Fencer (Rapier)'];
    case 'light': return [...NIMBLE, ...CASTERS];
    default: return ['General'];
  }
}

// 1H melee weapons serve both their "& Shield" build and their duel-grip (no-shield) variant.
const DUELIST_OF: Partial<Record<BuildClass, BuildClass>> = {
  'Sword & Shield': 'Sword (Duelist)', 'Axe & Shield': 'Axe (Duelist)', 'Mace & Shield': 'Mace (Duelist)',
  'Cleaver & Shield': 'Cleaver (Duelist)', 'Flail & Shield': 'Flail (Duelist)', 'Spear & Shield': 'Spear (Duelist)'
};

function classifyItem(item: any, kind: GearKind): BuildClass[] {
  if (kind === 'weapon' || kind === 'ammo') {
    const wp = item.weaponProperties;
    if (!wp) return ['General'];
    const base = classifyWeapon(item, wp);
    const duel = DUELIST_OF[base];
    // A 1H melee weapon also serves its duel-grip variant AND Pure Tank (which has no bespoke weapon —
    // it wields a shield and whichever 1H turns out least stamina-hungry once balanced).
    return duel ? [base, duel, 'Pure Tank'] : [base];
  }
  if (kind === 'armor') return classifyArmor(item);
  return ['General']; // tool / medicine — pawn skills, not builds
}

function scalingOf(wp: any): GearRow['scaling'] {
  if (!wp) return null;
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
    for (const [k, v] of Object.entries(obj)) inputs.push({ name: itemName.get(k) ?? prettify(k), qty: v as number });
  };
  push(rec.inputs);
  if (rec.dynamicRecipe)
    for (const slot of Object.values<any>(rec.dynamicRecipe))
      inputs.push({ name: prettify(slot.acceptsCategory ?? 'material'), qty: slot.quantity ?? 1 });
  const stationId = rec.station ?? '';
  return {
    stationId,
    station: !stationId || stationId === 'craft_spot' ? 'anywhere / craft spot' : buildingName.get(stationId) ?? prettify(stationId),
    toolTier: rec.toolTierRequired ?? 0,
    discipline: rec.discipline ?? null,
    inputs,
    workAmount: rec.workAmount ?? 0,
    passive: !!rec.passive
  };
}

function toRow(item: any): GearRow | null {
  const kind = kindOf(item);
  if (!kind) return null;
  const rec = recipeByOutput.get(item.id) ?? null;
  const researchId = rec?.researchRequired ?? item.researchRequired ?? null;
  const tier = item.tier ?? 0;
  const craftable = !!rec;
  const age = ageOf(item.id, researchId, tier, craftable);
  const wp = item.weaponProperties;
  const ap = item.armorProperties;
  const tb = item.toolBoost;
  const oh = item.onHitCondition;
  const classes = classifyItem(item, kind);
  return {
    id: item.id,
    name: item.name ?? prettify(item.id),
    kind,
    cls: classes[0] ?? 'General',
    classes,
    age,
    ageRank: AGES.indexOf(age),
    tier,
    weightKg: item.weightKg ?? 0,
    durability: item.maxDurability ?? item.durability ?? 0,
    research: researchId ? researchName.get(researchId) ?? prettify(researchId) : null,
    craftable,
    recipe: recipeInfo(rec),
    dmg: wp?.damage ?? null,
    damMin: wp?.damMin ?? null,
    damMax: wp?.damMax ?? null,
    damageType: wp?.damageType ?? item.ammoProperties?.damageType ?? null,
    ap: wp?.armorPenetration ?? item.ammoProperties?.armorPenetration ?? null,
    armorDmg: wp?.armorDamage ?? item.ammoProperties?.armorDamage ?? null,
    crit: wp?.critMod ?? null,
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
    lineageNames: null,
    evolvesTo: null,
    evoStage: 0
  };
}

// ── traits ──────────────────────────────────────────────────────────────────
const STAT_ABBR: Record<string, string> = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON', perception: 'PER', intelligence: 'INT', charisma: 'CHA'
};

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'negative'];
const rarityRank = (r: string) => {
  const i = RARITY_ORDER.indexOf(r);
  return i < 0 ? 0 : i;
};

// Evolution chains: a base trait names the higher trait it grows into (evolvesTo). Stage = depth.
const evolvesParent = new Map<string, string>(); // child id → parent id
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

function traitGating(t: any): TraitGating {
  if (t.rarity === 'negative') return 'flaw';
  if (t.scope === 'personal') return 'ungated';
  if ((t.lineage && t.lineage.length) || ['rare', 'epic', 'legendary'].includes(t.rarity)) return 'lineage';
  return 'cultural';
}

// Trait → the build(s) its stat/effect keys support. Work/heal/CHA-only traits touch no build → General.
function classifyTrait(t: any): BuildClass[] {
  const e = t.effects ?? {};
  const set = new Set<BuildClass>();
  const stat = (k: string) => e[k + 'Bonus'] != null || e[k + 'Penalty'] != null;
  if (stat('strength')) MELEE_ALL.forEach((b) => set.add(b));
  if (stat('constitution')) { FRONTLINE.forEach((b) => set.add(b)); set.add('Pure Tank'); }
  if (stat('dexterity')) { set.add('Assassin (Dagger)'); set.add('Fencer (Rapier)'); DUELIST.forEach((b) => set.add(b)); }
  if (stat('perception')) PER_BUILDS.forEach((b) => set.add(b));
  if (stat('intelligence')) CASTERS.forEach((b) => set.add(b));
  const cm = e.combatMods ?? {};
  for (const k of Object.keys(cm)) {
    if (/aim|reload|ranged|vision_range/.test(k)) RANGED.forEach((b) => set.add(b));
    else if (/melee_damage|attack_speed/.test(k)) MELEE_ALL.forEach((b) => set.add(b));
    else if (/hit_precision|hit_chance/.test(k)) { (['Fencer (Rapier)', 'Assassin (Dagger)', 'Archer (Bow)'] as BuildClass[]).forEach((b) => set.add(b)); MELEE_ALL.forEach((b) => set.add(b)); }
    else if (/dodge|knockdown|block|parry/.test(k)) NIMBLE.forEach((b) => set.add(b));
  }
  if (e.stealth != null || e.nightVision != null) set.add('Assassin (Dagger)');
  if (t.kind === 'bodyMod' || e.resistances) { FRONTLINE.forEach((b) => set.add(b)); set.add('Pure Tank'); }
  return set.size ? [...set] : ['General'];
}

function traitEffect(t: any): string {
  const e = t.effects ?? {};
  const parts: string[] = [];
  for (const stat of Object.keys(STAT_ABBR)) {
    if (e[stat + 'Bonus'] != null) parts.push(`${STAT_ABBR[stat]} +${e[stat + 'Bonus']}`);
    if (e[stat + 'Penalty'] != null) parts.push(`${STAT_ABBR[stat]} −${e[stat + 'Penalty']}`);
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
  if (t.selfCondition) parts.push(t.kind === 'naturalGear' ? 'natural gear' : String(t.selfCondition));
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
    age: 'Primitive',
    ageRank: 0,
    tier: 0,
    weightKg: 0,
    durability: 0,
    research: null,
    craftable: false,
    recipe: null,
    dmg: null, damMin: null, damMax: null, damageType: null, ap: null, armorDmg: null, crit: null,
    accuracy: null, atkSpeed: null, stamina: null, reach: null, range: null, stun: null,
    scaling: null, twoHanded: null, onHit: null, wieldStr: null,
    defense: null, armorType: null, slot: null, movePen: null, stealthMod: null, block: null,
    boostSpeed: null, boostYield: null, boostQuality: null, work: null, medicine: null,
    effect: traitEffect(t),
    gating: traitGating(t),
    scope: t.scope ?? null,
    rarity: t.rarity ?? null,
    rarityRank: rarityRank(t.rarity),
    lineageNames: t.lineage && t.lineage.length ? t.lineage.join(', ') : null,
    evolvesTo: t.evolvesTo ?? null,
    evoStage: evoStage(t.id)
  };
}

const itemRows = items.map(toRow).filter((r): r is GearRow => r !== null);
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

// "Extract builds": aggregate the whole catalogue by archetype so each build's real support is tracked
// from the data, not hand-listed. Powers the tool's By-build overview.
export function buildSummaries(): BuildSummary[] {
  return BUILDS.map((build) => {
    const rows = GEAR.filter((g) => g.classes.includes(build));
    const of = (kind: GearKind) => rows.filter((g) => g.kind === kind);
    const traitsFor = of('trait');
    const lineages = [
      ...new Set(traitsFor.filter((t) => t.gating === 'lineage' && t.lineageNames).flatMap((t) => t.lineageNames!.split(', ')))
    ].sort();
    const ungated = traitsFor.filter((t) => t.gating === 'ungated').length;
    const weapons = of('weapon').length;
    const armor = of('armor').length;
    const gaps: string[] = [];
    if (weapons === 0) gaps.push('no weapon');
    if (ungated <= 1) gaps.push('≤1 ungated trait');
    if (lineages.length === 0) gaps.push('no lineage');
    return {
      build, weapons, armor,
      ungatedTraits: ungated,
      culturalTraits: traitsFor.filter((t) => t.gating === 'cultural').length,
      lineageTraits: traitsFor.filter((t) => t.gating === 'lineage').length,
      flaws: traitsFor.filter((t) => t.gating === 'flaw').length,
      lineages, gaps
    };
  });
}
