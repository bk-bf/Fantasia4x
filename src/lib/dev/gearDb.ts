// gearDb.ts — DEV TOOL (not a game system). Reads the real item/recipe/building/research
// databases and derives a flat, auto-classified gear catalogue for the /gear-db browser route.
// Nothing here runs in the sim; it exists so the build-archetype audit is data-driven instead of
// hand-curated. Classification is by STATS ONLY (damage axis, weight, armour class) — see classify().
//
// It imports the same .jsonc databases the game does (vite jsonc plugin), so the table is always in
// sync with the data — edit items.jsonc/recipes.jsonc, save, and the route re-renders.

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
  | 'Bruiser' | 'Tank' | 'Duelist' | 'Marksman' | 'Skulker'
  | 'Mage' | 'Artisan' | 'Medic' | 'Commander' | 'Utility';

export type GearKind = 'weapon' | 'armor' | 'tool' | 'ammo' | 'medicine' | 'trait';

export type TraitGating = 'ungated' | 'cultural' | 'lineage' | 'flaw';

export const AGES = ['Primitive', 'Copper', 'Bronze', 'Iron', 'Steel', 'Runed', 'Boss'] as const;
export type Age = (typeof AGES)[number];

export interface RecipeInfo {
  station: string; // human building name, or 'anywhere'
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
  cls: BuildClass; // primary build (for display/sort)
  classes: BuildClass[]; // every build this supports (traits often serve several) — filtered on
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
  ap: number | null; // armour penetration 0–1
  crit: number | null; // crit modifier
  atkSpeed: number | null;
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
  effect: string | null; // compact effect summary ("STR +2 · aim_speed ×1.15")
  gating: TraitGating | null; // ungated (roll toward) · cultural · lineage · flaw
  scope: string | null; // personal | cultural
  rarity: string | null;
  lineageNames: string | null; // lineage(s) the trait belongs to, if any
}

// ── lookup maps ───────────────────────────────────────────────────────────
const prettify = (id: string) =>
  id.replace(/^category:/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const buildingName = new Map<string, string>();
for (const b of buildings) if (b?.id) buildingName.set(b.id, b.name ?? prettify(b.id));

const researchName = new Map<string, string>();
for (const r of research) if (r?.id) researchName.set(r.id, r.name ?? prettify(r.id));

const itemName = new Map<string, string>();
for (const it of items) if (it?.id) itemName.set(it.id, it.name ?? prettify(it.id));

// primary-output → recipe (first output key is the product)
const recipeByOutput = new Map<string, any>();
for (const rec of recipes) {
  const outs = rec?.outputs ? Object.keys(rec.outputs) : [];
  if (outs.length) if (!recipeByOutput.has(outs[0])) recipeByOutput.set(outs[0], rec);
}

// ── derivations ───────────────────────────────────────────────────────────
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

// Classification is by STATS, not a hand-maintained list.
function classify(item: any, kind: GearKind): BuildClass {
  const wp = item.weaponProperties;
  const ap = item.armorProperties;
  if (kind === 'medicine') return 'Medic';
  if (kind === 'weapon' || kind === 'ammo') {
    if (!wp) return 'Utility';
    if (wp.arcane) return 'Mage';
    const ranged = wp.ammoCategory || wp.drawPower != null || (wp.range ?? 0) >= 4 || kind === 'ammo';
    if (ranged) return 'Marksman';
    if (wp.finesse) return 'Duelist';
    const fast = (wp.attackSpeed ?? 1) >= 1.2;
    const light = (item.weightKg ?? 9) <= 1.2;
    const piercing = wp.damageType === 'piercing' || wp.damageType === 'pierce';
    if (piercing && (light || fast) && !wp.twoHanded) return 'Skulker';
    if (wp.twoHanded) return 'Bruiser';
    return 'Tank';
  }
  if (kind === 'armor') {
    if (ap?.stealthMod) return 'Skulker';
    if (item.magicResistance != null || ap?.magicResistance != null || /robe|circlet|arcane/.test(item.id))
      return 'Mage';
    if (/regal|ceremonial|crown|torc|circlet_sovereign|sovereign|warden|champion|regalia/.test(item.id))
      return 'Commander';
    if (ap?.armorType === 'shield' || ap?.armorType === 'heavy') return 'Tank';
    if (ap?.armorType === 'medium') return 'Bruiser';
    if (ap?.armorType === 'light') return 'Marksman';
    return 'Utility';
  }
  // tool
  const boost = item.toolBoost;
  if (!boost && !item.processingType) return 'Utility';
  return 'Artisan';
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
    for (const [k, v] of Object.entries(obj))
      inputs.push({ name: itemName.get(k) ?? prettify(k), qty: v as number });
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
  const cls = classify(item, kind);
  return {
    id: item.id,
    name: item.name ?? prettify(item.id),
    kind,
    cls,
    classes: [cls],
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
    crit: wp?.critMod ?? null,
    atkSpeed: wp?.attackSpeed ?? null,
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
    lineageNames: null
  };
}

// ── traits ────────────────────────────────────────────────────────────────
const STAT_ABBR: Record<string, string> = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON',
  perception: 'PER', intelligence: 'INT', charisma: 'CHA'
};
// Which build(s) a stat feeds.
const STAT_BUILDS: Record<string, BuildClass[]> = {
  strength: ['Bruiser', 'Tank'], dexterity: ['Duelist', 'Skulker'], constitution: ['Tank'],
  perception: ['Marksman'], intelligence: ['Artisan', 'Medic', 'Mage'], charisma: ['Commander']
};

function traitGating(t: any): TraitGating {
  if (t.rarity === 'negative') return 'flaw';
  if (t.scope === 'personal') return 'ungated';
  if ((t.lineage && t.lineage.length) || ['rare', 'epic', 'legendary'].includes(t.rarity)) return 'lineage';
  return 'cultural';
}

// Classify a trait to the build(s) it supports — by the STAT/effect keys it touches, not by hand.
function classifyTrait(t: any): BuildClass[] {
  const e = t.effects ?? {};
  const set = new Set<BuildClass>();
  for (const [stat, builds] of Object.entries(STAT_BUILDS))
    if (e[stat + 'Bonus'] != null || e[stat + 'Penalty'] != null) builds.forEach((b) => set.add(b));
  const cm = e.combatMods ?? {};
  for (const k of Object.keys(cm)) {
    if (/aim|reload|ranged|vision_range/.test(k)) set.add('Marksman');
    else if (/melee_damage|hit_chance|hit_precision|attack_speed|crit/.test(k)) { set.add('Bruiser'); set.add('Duelist'); }
    else if (/dodge|knockdown|block|parry/.test(k)) { set.add('Tank'); set.add('Duelist'); }
  }
  const works = { ...(e.workSpeed ?? {}), ...(e.workQuality ?? {}), ...(e.workYield ?? {}) };
  for (const k of Object.keys(works)) set.add(k === 'caretaking' ? 'Medic' : 'Artisan');
  if (e.stealth != null || e.nightVision != null) set.add('Skulker');
  if (e.healRate != null) set.add('Medic');
  if (t.kind === 'bodyMod' || e.resistances) set.add('Tank');
  return set.size ? [...set] : ['Utility'];
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
  const gating = traitGating(t);
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
    dmg: null, damMin: null, damMax: null, damageType: null, ap: null, crit: null, atkSpeed: null,
    reach: null, range: null, stun: null, scaling: null, twoHanded: null, onHit: null, wieldStr: null,
    defense: null, armorType: null, slot: null, movePen: null, stealthMod: null, block: null,
    boostSpeed: null, boostYield: null, boostQuality: null, work: null, medicine: null,
    effect: traitEffect(t),
    gating,
    scope: t.scope ?? null,
    rarity: t.rarity ?? null,
    lineageNames: t.lineage && t.lineage.length ? t.lineage.join(', ') : null
  };
}

const itemRows = items.map(toRow).filter((r): r is GearRow => r !== null);
const traitRows = traits.filter((t) => t?.id && t?.name).map(traitRow);
export const GEAR: GearRow[] = [...itemRows, ...traitRows];

export const CLASSES: BuildClass[] = [
  'Bruiser', 'Tank', 'Duelist', 'Marksman', 'Skulker', 'Mage', 'Artisan', 'Medic', 'Commander', 'Utility'
];
export const KINDS: GearKind[] = ['weapon', 'armor', 'tool', 'ammo', 'medicine', 'trait'];

// The nine real archetypes (Utility is a catch-all, not a build).
export const BUILDS: BuildClass[] = [
  'Bruiser', 'Tank', 'Duelist', 'Marksman', 'Skulker', 'Artisan', 'Medic', 'Commander', 'Mage'
];

export interface BuildSummary {
  build: BuildClass;
  weapons: number;
  armor: number;
  tools: number;
  medicine: number;
  ungatedTraits: number;
  culturalTraits: number;
  lineageTraits: number;
  flaws: number;
  lineages: string[]; // distinct lineage markers that support this build
  gaps: string[]; // data-derived shortfalls
}

// "Extract builds": aggregate the whole catalogue by archetype so each build's real support (gear +
// trait spread + lineages) is tracked from the data, not hand-listed. Powers the tool's By-build view.
export function buildSummaries(): BuildSummary[] {
  return BUILDS.map((build) => {
    const rows = GEAR.filter((g) => g.classes.includes(build));
    const of = (kind: GearKind) => rows.filter((g) => g.kind === kind);
    const traitsFor = of('trait');
    const lineages = [
      ...new Set(traitsFor.filter((t) => t.gating === 'lineage' && t.lineageNames).flatMap((t) => t.lineageNames!.split(', ')))
    ].sort();
    const ungated = traitsFor.filter((t) => t.gating === 'ungated').length;
    const cultural = traitsFor.filter((t) => t.gating === 'cultural').length;
    const lineageTraits = traitsFor.filter((t) => t.gating === 'lineage').length;
    const weapons = of('weapon').length;
    const armor = of('armor').length;
    const tools = of('tool').length + of('medicine').length;
    const gaps: string[] = [];
    if (ungated <= 1) gaps.push('≤1 ungated trait');
    if (lineages.length === 0) gaps.push('no lineage');
    if (weapons + tools + of('medicine').length === 0 && armor === 0) gaps.push('no gear');
    return {
      build, weapons, armor, tools,
      medicine: of('medicine').length,
      ungatedTraits: ungated, culturalTraits: cultural, lineageTraits,
      flaws: traitsFor.filter((t) => t.gating === 'flaw').length,
      lineages, gaps
    };
  });
}
