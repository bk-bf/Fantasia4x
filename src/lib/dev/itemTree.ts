import { gearClassOf } from '../game/core/rules/gear/gearClass';
import itemsData from '../game/database/items/items.json';
import recipesData from '../game/database/items/recipes.json';
import buildingsData from '../game/database/world/buildings.json';
import {
  GEAR,
  AGES,
  rowForAny,
  type Age,
  type BuildClass,
  type GearRow,
  AGE_BY_TIER
} from './gearDb';
import lootpoolData from '../game/database/items/lootpool.json';
import creaturesData from '../game/database/pawns/creatures.json';
import {
  AGE_NAMES,
  blameStation,
  chainAgeOf,
  CARCASS_TIER,
  hasRecipe,
  NODE_TOOL_AGE
} from './chainAge';
import { SLOT_LAYER } from '../game/core/rules/gear/armorCoverage';
import type { EquipmentSlot } from '../game/core/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
const items = itemsData as any[];
const recipes = recipesData as any[];

const prettify = (id: string) =>
  id
    .replace(/^category:/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

const buildingName = new Map<string, string>();
for (const b of buildingsData as any[]) if (b?.id) buildingName.set(b.id, b.name ?? prettify(b.id));

const recipeByOutput = new Map<string, any>();
for (const r of recipes)
  for (const out of Object.keys(r?.outputs ?? {}))
    if (!recipeByOutput.has(out)) recipeByOutput.set(out, r);

const gearById = new Map(GEAR.map((g) => [g.id, g]));

const SPECIES_OF_POOL = new Map<string, string>();
for (const c of creaturesData as any[]) {
  const pool = c?.lootPool;
  if (!pool || SPECIES_OF_POOL.has(pool)) continue;
  const word = String(pool).split('_')[0];
  SPECIES_OF_POOL.set(pool, word.charAt(0).toUpperCase() + word.slice(1));
}
const DROPPER_OF_ITEM = new Map<string, string>();
const DROPPER_TIER = new Map<string, number>();
{
  const tierOfPool = new Map<string, number>();
  for (const c of creaturesData as any[]) {
    if (!c?.lootPool) continue;
    const t = Number(c.tier ?? 1);
    const seen = tierOfPool.get(c.lootPool);
    if (seen === undefined || t < seen) tierOfPool.set(c.lootPool, t);
  }
  const pools = ((lootpoolData as { pools?: Record<string, any> }).pools ?? {}) as Record<
    string,
    any
  >;
  for (const [poolId, pool] of Object.entries(pools)) {
    const who = SPECIES_OF_POOL.get(poolId) ?? poolId.split('_')[0];
    const tier = tierOfPool.get(poolId);
    const note = (id: string) => {
      if (!DROPPER_OF_ITEM.has(id))
        DROPPER_OF_ITEM.set(id, who.charAt(0).toUpperCase() + who.slice(1));
      if (tier === undefined) return;
      const seen = DROPPER_TIER.get(id);
      if (seen === undefined || tier < seen) DROPPER_TIER.set(id, tier);
    };
    for (const slot of Object.values<any>(pool?.slots ?? {}))
      for (const pick of slot?.pick ?? []) if (pick?.id) note(pick.id);
    for (const carry of pool?.carried ?? [])
      for (const pick of carry?.pick ?? []) if (pick?.id) note(pick.id);
  }
}

const AGE_OF_CHAIN: Age[] = ['Primitive', 'Copper', 'Bronze', 'Iron', 'Steel', 'Runed'];
const CREATURE_AGE = [0, 0, 0, 2, 3, 5];
const ageOf = (item: any): Age => {
  const gear = gearById.get(item.id)?.age;
  if (gear) return gear;
  if (hasRecipe(item.id)) return AGE_OF_CHAIN[chainAgeOf(item.id)] ?? 'Primitive';
  const beast = CARCASS_TIER.get(item.id) ?? DROPPER_TIER.get(item.id);
  if (beast !== undefined) return AGE_OF_CHAIN[CREATURE_AGE[Math.min(Math.max(beast, 1), 5)]];
  const dig = NODE_TOOL_AGE.get(item.id);
  if (dig !== undefined) return AGE_OF_CHAIN[dig];
  return AGE_OF_CHAIN[chainAgeOf(item.id)] ?? 'Primitive';
};

const BAREFOOT_MOVE_FACTOR = 0.9;

export function effectsOf(i: any): string {
  const out: string[] = [];
  const hrs = (turns: number) => `${Math.round(turns * 10) / 10}t`;
  if (i.nutrition != null) out.push(`food ${i.nutrition}`);
  if (i.hydration != null) out.push(`drink ${i.hydration}/L`);
  if (i.medicineQuality != null) out.push(`med ${i.medicineQuality}`);
  if (i.curesConditions?.length) out.push(`cures ${i.curesConditions.join('/')}`);
  if (i.mendsWounds?.length) out.push(`mends ${i.mendsWounds.join('/')}`);
  if (i.armorProperties?.boneHealMultiplier)
    out.push(`bone x${i.armorProperties.boneHealMultiplier}`);
  if (i.grantsConditions?.length)
    out.push(
      `grants ${i.grantsConditions.join('/')}${i.conditionDurationTurns ? ` ${hrs(i.conditionDurationTurns)}` : ''}`
    );
  if (i.grantsTraitOnConsume) out.push(`trait ${i.grantsTraitOnConsume}`);
  if (i.grantsLineage) out.push('awakens a bloodline');
  if (i.traitGamble)
    out.push(`gamble t${i.traitGamble.tier} → ${(i.traitGamble.traitPool ?? []).join('/')}`);
  if (i.rawConsumeRisk)
    out.push(
      `raw risk${i.rawConsumeRisk.sickness ? ` ${i.rawConsumeRisk.sickness}` : ''}${
        i.rawConsumeRisk.flawChance ? ` ${Math.round(i.rawConsumeRisk.flawChance * 100)}% flaw` : ''
      }`
    );
  const ce = i.coatingEffect;
  if (ce)
    out.push(
      ce.condition
        ? `coats ${ce.condition} ${Math.round((ce.chance ?? 0) * 100)}%${ce.durationHours ? ` ${ce.durationHours}h` : ''}`
        : `coats bleed ×${ce.bleedMult}`
    );
  if (i.preservationMethod) out.push(i.preservationMethod);
  if (i.decaySeconds) out.push(`spoils ${Math.round(i.decaySeconds / 300)}d`);
  if (i.container?.material) out.push(`${i.container.material} vessel`);
  if (i.craftValue != null && i.craftValue !== 1) out.push(`worth ${i.craftValue}/unit`);
  if (i.fuelValue) out.push(`fuel ${i.fuelValue}`);
  const tb = i.toolBoost;
  if (tb)
    out.push(
      `tool ${[tb.speed && `spd×${tb.speed}`, tb.yield && `yld×${tb.yield}`, tb.quality && `qly×${tb.quality}`].filter(Boolean).join(' ')}`
    );
  const ab = i.aimBonuses;
  if (ab)
    out.push(
      `aim ${[ab.accuracy && `+${ab.accuracy}acc`, ab.speed && `+${ab.speed}spd`, ab.range && `+${ab.range}rng`].filter(Boolean).join(' ')}`
    );
  if (i.quiver) out.push(`draw +${i.quiver.drawSpeed} (${i.quiver.ammoCategory})`);
  if (i.inventoryBonus) {
    const { weightKg = 0, volumeL = 0 } = i.inventoryBonus;
    out.push(weightKg ? `carry +${weightKg}kg/+${volumeL}L` : `holds +${volumeL}L`);
  }
  const ap = i.armorProperties;
  if (ap?.stealthMod) out.push(`stealth ${ap.stealthMod > 0 ? '+' : ''}${ap.stealthMod}`);
  if (ap?.sightPenalty) out.push(`sight −${Math.round(ap.sightPenalty * 100)}%`);
  if (ap?.equipmentSlot === 'boots' || ap?.equipmentSlot === 'socks') {
    const gain = (1 - (ap.movementPenalty ?? 0)) / BAREFOOT_MOVE_FACTOR - 1;
    out.push(`move ${gain >= 0 ? '+' : '−'}${Math.abs(Math.round(gain * 1000) / 10)}%`);
  } else if (ap?.movementPenalty) {
    out.push(`move −${Math.round(ap.movementPenalty * 100)}%`);
  }
  if (ap?.fatiguePerTurn) out.push(`fatigue +${ap.fatiguePerTurn}`);
  if (ap?.coldResistance) out.push(`cold +${ap.coldResistance}`);
  if (ap?.heatResistance) out.push(`heat +${ap.heatResistance}`);
  const oh = i.onHitCondition;
  if (oh) out.push(`on hit ${oh.condition} ${Math.round((oh.chance ?? 0) * 100)}%`);
  return out.join(' · ');
}

export interface TreeItem {
  id: string;
  name: string;
  path: string[];
  /** every branch it belongs to; the first is `path` */
  paths: string[][];
  age: Age;
  ageRank: number;
  tier: number | null;
  stat: string;
  effects: string;
  heldBy: string;
  cls: string;
  weightKg: number;
  source: string;
  gatedBy: string;
  desc: string;
  row: GearRow;
  raw: any;
}

const COVERAGE: Record<string, string> = {
  head: 'head',
  bodyOuter: 'torso — outer',
  bodyMid: 'torso — mid',
  bodyBase: 'torso — skin',
  bracers: 'arms',
  gloves: 'hands',
  greaves: 'legs',
  boots: 'feet',
  socks: 'feet — under',
  back: 'cloak',
  back2: 'pack',
  belt: 'belt',
  mainHand: 'in hand',
  offHand: 'off-hand',
  ring: 'ring',
  ring2: 'ring',
  amulet: 'amulet'
};
const CLASS_LABEL: Record<string, string> = {
  heavy: 'heavy',
  medium: 'medium',
  light: 'light',
  shield: 'shield'
};

const LAYER_LABEL = ['outer layer', 'mid layer', 'base layer', 'under layer'];
const LAYER_OF_ARMOR_LAYER: Record<string, number> = {
  gambeson: 2,
  cloth: 2,
  mail: 1,
  plate: 0,
  under: 3
};
const PADDING = new Set(['gambeson', 'cloth', 'under']);
const layerOf = (slot: string, armorLayer?: string): string => {
  const limb = slot === 'bracers' || slot === 'greaves';
  if (limb) return LAYER_LABEL[armorLayer && PADDING.has(armorLayer) ? 2 : 0];
  return (
    LAYER_LABEL[
      (armorLayer ? LAYER_OF_ARMOR_LAYER[armorLayer] : undefined) ??
        SLOT_LAYER[slot as EquipmentSlot] ??
        1
    ] ?? 'mid layer'
  );
};

const FAMILY_OF_CLASS: Partial<Record<BuildClass, string>> = {
  'Sword & Shield': 'sword',
  'Sword (Duelist)': 'sword',
  'Greatsword (2H)': 'sword',
  'Axe & Shield': 'axe',
  'Axe (Duelist)': 'axe',
  '2H Axe': 'axe',
  'Mace & Shield': 'mace & hammer',
  'Mace (Duelist)': 'mace & hammer',
  '2H Hammer': 'mace & hammer',
  'Cleaver & Shield': 'cleaver',
  'Cleaver (Duelist)': 'cleaver',
  '2H Cleaver': 'cleaver',
  'Flail & Shield': 'flail',
  'Flail (Duelist)': 'flail',
  'Spear & Shield': 'spear & polearm',
  'Spear (Duelist)': 'spear & polearm',
  'Polearm (2H)': 'spear & polearm',
  'Fencer (Rapier)': 'rapier',
  'Assassin (Dagger)': 'dagger',
  'Archer (Bow)': 'bow',
  Crossbowman: 'crossbow',
  'Skirmisher (Throwing)': 'thrown',
  'Slinger (Sling)': 'sling',
  'Battlemage (1H Staff)': 'staff & rod',
  'War-Caster (2H Staff)': 'staff & rod',
  'Stunwaller (2H Staff)': 'staff & rod'
};
const WEAPON_FAMILY: [RegExp, string][] = [
  [/bow|longbow|shortbow|selfbow/, 'bow'],
  [/crossbow|arbalest/, 'crossbow'],
  [/sling/, 'sling'],
  [/javelin|throwing|dart|bola|harpoon/, 'thrown'],
  [/staff|rod|scepter|sceptre/, 'staff & rod'],
  [/dagger|knife|shiv|dirk|stiletto/, 'dagger'],
  [/rapier|estoc/, 'rapier'],
  [/spear|pike|halberd|glaive|poleaxe|polearm|lance|bill/, 'spear & polearm'],
  [/axe|hatchet|bardiche/, 'axe'],
  [/cleaver|falx/, 'cleaver'],
  [/flail|morningstar|whip/, 'flail'],
  [/mace|hammer|maul|club|cudgel|warhammer/, 'mace & hammer'],
  [/sword|seax|spatha|blade|sabre|saber|falchion|greatsword/, 'sword']
];
const familyOf = (id: string) =>
  FAMILY_OF_CLASS[gearById.get(id)?.cls as BuildClass] ??
  WEAPON_FAMILY.find(([re]) => re.test(id))?.[1] ??
  'other';

const MATERIAL_LINE: Record<string, string> = {
  hide: 'hide & leather',
  cured_hide: 'hide & leather',
  leather: 'hide & leather',
  wool: 'fibre & cloth',
  fiber: 'fibre & cloth',
  cloth: 'fibre & cloth',
  metal: 'metal & ore',
  ore: 'metal & ore',
  steel: 'metal & ore',
  iron: 'metal & ore',
  wood: 'wood',
  magic_wood: 'wood',
  woodwork: 'wood',
  stone: 'stone & masonry',
  block: 'stone & masonry',
  construction: 'stone & masonry',
  soil: 'earth & soil',
  gem: 'gems & crystal',
  magic_gem: 'gems & crystal',
  crystal: 'gems & crystal',
  magic_crystal: 'gems & crystal',
  reagent: 'reagents & organics',
  organic: 'reagents & organics',
  medicine: 'reagents & organics',
  ingredient: 'reagents & organics',
  fuel: 'fuel',
  carcass: 'carcasses',
  storage: 'station fittings',
  primitive: 'primitive stock',
  crafting: 'primitive stock',
  metalworking: 'metal & ore',
  grain_seed: 'seeds'
};
const materialLine = (cat: string) =>
  MATERIAL_LINE[cat] ?? (/_seed$/.test(cat) ? 'seeds' : prettify(cat));

function materialStage(i: any, line: string): string[] {
  const id = String(i.id ?? '');
  if (line === 'hide & leather') {
    if (/^fleshed_/.test(id)) return ['fleshed'];
    if (/^cured_/.test(id)) return ['cured'];
    if (/^raw_|_hide$/.test(id) && !/^cured_/.test(id)) return ['raw'];
    return ['tanned'];
  }
  if (line === 'gems & crystal') {
    if (/^attuned_/.test(id)) return ['attuned'];
    if (/^infused_/.test(id)) return ['infused'];
    if (/^cut_/.test(id)) return ['cut'];
    if (/dust$/.test(id)) return ['ground'];
    return ['rough'];
  }
  if (line === 'stone & masonry') {
    if (/_block$|_tile$|brick/.test(id)) return ['cut & fired'];
    if (/concrete|mortar|plaster/.test(id)) return ['bound'];
    return ['quarried'];
  }
  return [];
}

function sourceBranch(i: any): string[] {
  if (recipeByOutput.has(i.id)) return ['crafted'];
  const who = DROPPER_OF_ITEM.get(i.id);
  return who ? ['dropped', who] : ['dropped', 'unclaimed'];
}

const preservation = (i: any): string => {
  if (i.preservationMethod) return `${i.preservationMethod}`;
  if (i.category === 'meal') return 'cooked to order';
  if (/dried|smoked|salted|cured|pickled/i.test(`${i.id} ${i.name ?? ''}`)) return 'dried';
  return 'fresh';
};

function foodBranch(i: any): string[] {
  if (i.category === 'spoiled') return ['Spoiled'];
  if (i.category === 'meal') return ['Cooked dishes'];
  if (i.preservationMethod) return ['Preserved', prettify(String(i.preservationMethod))];
  return [prettify(i.category ?? 'other')];
}

function pathOf(i: any): string[] {
  const ap = i.armorProperties;
  const wp = i.weaponProperties;
  const age = ageOf(i);

  if (ap?.armorType === 'shield') return ['Shields', age, ...sourceBranch(i)];
  if (i.type === 'armor' && ap?.armorType) {
    return [
      'Armour',
      age,
      ...sourceBranch(i),
      ap.armorSet ? prettify(ap.armorSet) : 'no set',
      layerOf(ap.equipmentSlot ?? ap.slot ?? '', ap.armorLayer),
      COVERAGE[ap.equipmentSlot ?? ap.slot] ?? prettify(ap.equipmentSlot ?? 'unplaced')
    ];
  }
  if (i.type === 'armor')
    return ['Regalia & jewellery', COVERAGE[ap?.equipmentSlot] ?? 'worn', age];

  if (i.category === 'ammunition' || i.ammoProperties)
    return ['Ammo', prettify(i.ammoProperties?.ammoCategory ?? i.ammoCategory ?? 'other'), age];
  if (i.category === 'natural_weapon') return ['Natural weapons', age];
  if (wp)
    return [
      'Weapons',
      age,
      familyOf(i.id),
      gearClassOf(i) ?? 'unclassed',
      wp.twoHanded ? 'two-handed' : 'one-handed'
    ];

  if (i.type === 'fluid') return ['Fluids', fluidPurpose(i), age];
  if (i.inventoryBonus) {
    const slot = i.armorProperties?.equipmentSlot ?? i.armorProperties?.slot;
    return [
      'Carry aids',
      COVERAGE[slot] ?? (slot ? prettify(slot) : 'in hand'),
      age,
      gearClassOf(i) ?? 'unclassed'
    ];
  }
  if (i.container) {
    const holdsFluid = (i.container.accepts ?? []).includes('fluid');
    return ['Vessels', holdsFluid ? 'fluid' : 'general goods', age];
  }

  if (i.type === 'food' || i.nutrition != null)
    return ['Consumables', 'Food', ...foodBranch(i), age];
  if (i.medicineQuality != null) return ['Consumables', 'Medicine', age];
  if (i.type === 'consumable' && i.category === 'reagent')
    return ['Consumables', 'Beast organs', age];
  if (i.type === 'consumable') {
    const cat = String(i.category ?? 'other');
    return ['Consumables', cat === 'consumable' ? 'Other' : prettify(cat), age];
  }

  if (i.type === 'tool' || i.type === 'container') {
    const work = i.toolBoost?.workType ?? i.category ?? 'other';
    return ['Tools', prettify(String(work)), age];
  }
  const line = materialLine(String(i.category ?? 'other'));
  return ['Materials', line, ...materialStage(i, line), age];
}

function altPathsOf(i: any): string[][] {
  const out: string[][] = [];
  const age = ageOf(i);
  if (i.type === 'fluid' && i.nutrition != null)
    out.push(['Consumables', 'Food', ...foodBranch(i), age]);
  if (i.type === 'fluid' && i.medicineQuality != null) out.push(['Consumables', 'Medicine', age]);
  return out;
}

function fluidPurpose(i: any): string {
  if (i.coatingEffect) return 'Coatings & oils';
  if (i.medicineQuality != null) return 'Medicine';
  if (i.nutrition != null || i.id === 'water') return 'Drink';
  if ((i.grantsConditions?.length && i.conditionDurationTurns) || i.grantsTraitOnConsume)
    return 'Potions & draughts';
  return 'Industrial';
}

function statOf(i: any): string {
  const ap = i.armorProperties;
  const wp = i.weaponProperties;
  if (ap?.armorType === 'shield') return `block ${Math.round((ap.blockBonus ?? 0) * 100)}%`;
  if (i.inventoryBonus) {
    const { weightKg = 0, volumeL = 0 } = i.inventoryBonus;
    const carry = weightKg ? `carry +${weightKg}kg / +${volumeL}L` : `holds +${volumeL} L`;
    return ap?.defense ? `${carry} · def ${ap.defense}` : carry;
  }
  if (ap?.armorType) return `def ${ap.defense ?? 0}`;
  if (wp) return `dmg ${wp.damage ?? '—'}${wp.damageType ? ` ${wp.damageType}` : ''}`;
  if (i.ammoProperties) return `dmg ${i.ammoProperties.damage ?? '—'}`;
  const feeds: string[] = [];
  if (i.nutrition != null)
    feeds.push(i.type === 'fluid' ? `food ${i.nutrition}/L` : `food ${i.nutrition}`);
  if (i.hydration != null) feeds.push(`drink ${i.hydration}/L`);
  if (i.medicineQuality != null) feeds.push(`med ${i.medicineQuality}`);
  if (feeds.length) {
    if (i.type === 'fluid') feeds.push(`${i.volumeL ?? 1} L per serving`);
    return feeds.join(' · ');
  }
  if (i.toolBoost) {
    const b = i.toolBoost;
    const parts = [
      b.speed ? `spd ×${b.speed}` : '',
      b.yield ? `yld ×${b.yield}` : '',
      b.quality ? `qly ×${b.quality}` : ''
    ].filter(Boolean);
    if (parts.length) return parts.join(' ');
  }

  if (i.container)
    return `holds ${i.container.capacityL} L${i.container.capacityKg ? ` / ${i.container.capacityKg} kg` : ''}`;
  if (i.type === 'fluid') return `${i.weightKg ?? 1} kg/L · ${i.volumeL ?? 1} L per serving`;
  if (i.fuelValue) return `fuel ${i.fuelValue}`;
  return '—';
}

export const TREE_ITEMS: TreeItem[] = items
  .filter((i) => i?.id)
  .map((i) => {
    const gated = blameStation(i.id);
    return {
      id: i.id,
      name: i.name ?? prettify(i.id),
      path: pathOf(i),
      paths: [pathOf(i), ...altPathsOf(i)],
      age: ageOf(i),
      ageRank: AGES.indexOf(ageOf(i)),
      tier: i.tier ?? null,
      stat: statOf(i),
      effects: effectsOf(i),
      heldBy: (i.heldBy ?? []).map(prettify).join(' / '),
      cls: CLASS_LABEL[(i.armorProperties ?? {}).armorType] ?? '',
      weightKg: i.weightKg ?? 0,
      source: (gearById.get(i.id) ?? rowForAny(i)).source,
      gatedBy: gated
        ? `${buildingName.get(gated) ?? prettify(gated)} · ${AGE_NAMES[chainAgeOf(i.id)]}`
        : '',
      desc: i.description ?? '',
      row: gearById.get(i.id) ?? rowForAny(i),
      raw: i
    };
  });

export interface TreeNode {
  key: string;
  label: string;
  depth: number;
  count: number;
  children: TreeNode[];
  items: TreeItem[];
  missing: string[];
}

const KIT_PARTS = ['head', 'torso', 'arms', 'hands', 'legs', 'feet'];
const COVERED_PARTS = new Map<string, Set<string>>();
for (const i of items as any[]) {
  const covers: string[] = i?.armorProperties?.covers ?? [];
  if (!covers.length) continue;
  const parts = new Set<string>();
  for (const c of covers) {
    if (/Shoulder|UpperArm|Forearm/i.test(c)) parts.add('arms');
    else if (/Hand|Finger|Thumb/i.test(c)) parts.add('hands');
    else if (/UpperLeg|LowerLeg|Hip/i.test(c)) parts.add('legs');
    else if (/Foot|Toe/i.test(c)) parts.add('feet');
    else if (/head|skull|face|neck/i.test(c)) parts.add('head');
    else if (/chest|abdomen|torso/i.test(c)) parts.add('torso');
  }
  if (parts.size) COVERED_PARTS.set(i.id, parts);
}
const NOT_A_KIT = new Set(['no set', 'drop only']);
const coverageOf = (label: string) => (label.startsWith('torso') ? 'torso' : label);
function missingOf(node: TreeNode, rootLabel: string): string[] {
  if (rootLabel !== 'Armour' || NOT_A_KIT.has(node.label)) return [];
  if (node.depth !== 3 && node.depth !== 4) return [];
  if (!node.children.some((c) => LAYER_LABEL.includes(c.label))) return [];
  const present = new Set<string>();
  (function walk(n: TreeNode) {
    if (!n.children.length) present.add(coverageOf(n.label));
    for (const it of n.items) for (const p of COVERED_PARTS.get(it.id) ?? []) present.add(p);
    n.children.forEach(walk);
  })(node);
  return KIT_PARTS.filter((p) => !present.has(p));
}

const TRAILING = ['no set', 'drop only', 'other', 'unplaced'];
function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return nodes.sort((a, b) => {
    const ai = AGES.indexOf(a.label as Age);
    const bi = AGES.indexOf(b.label as Age);
    if (ai >= 0 && bi >= 0) return ai - bi;
    const al = LAYER_LABEL.indexOf(a.label);
    const bl = LAYER_LABEL.indexOf(b.label);
    if (al >= 0 && bl >= 0) return al - bl;
    const at = TRAILING.indexOf(a.label);
    const bt = TRAILING.indexOf(b.label);
    if (at >= 0 || bt >= 0) return (at < 0 ? -1 : at) - (bt < 0 ? -1 : bt);
    return a.label.localeCompare(b.label);
  });
}

const ROOT_ORDER = [
  'Armour',
  'Carry aids',
  'Shields',
  'Weapons',
  'Ammo',
  'Regalia & jewellery',
  'Tools',
  'Vessels',
  'Consumables',
  'Fluids',
  'Materials',
  'Natural weapons'
];

export function buildTree(rows: TreeItem[] = TREE_ITEMS): TreeNode {
  const root: TreeNode = {
    key: '',
    label: 'all',
    depth: -1,
    count: 0,
    children: [],
    items: [],
    missing: []
  };
  const index = new Map<string, TreeNode>([['', root]]);
  for (const it of rows) {
    root.count++;
    for (const path of it.paths ?? [it.path]) {
      let key = '';
      let node = root;
      path.forEach((label, depth) => {
        key = key ? `${key}/${label}` : label;
        let child = index.get(key);
        if (!child) {
          child = { key, label, depth, count: 0, children: [], items: [], missing: [] };
          index.set(key, child);
          node.children.push(child);
        }
        child.count++;
        node = child;
      });
      node.items.push(it);
    }
  }
  (function order(n: TreeNode, rootLabel = '') {
    if (n === root)
      n.children.sort((a, b) => {
        const ai = ROOT_ORDER.indexOf(a.label);
        const bi = ROOT_ORDER.indexOf(b.label);
        return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
      });
    else sortNodes(n.children);
    n.items.sort(
      (a, b) =>
        a.ageRank - b.ageRank || (a.tier ?? 0) - (b.tier ?? 0) || a.name.localeCompare(b.name)
    );
    n.children.forEach((c) => order(c, n.depth < 0 ? c.label : rootLabel));
    n.missing = missingOf(n, rootLabel);
  })(root);
  return root;
}

export const ITEM_TREE = buildTree();

export type SortKey =
  | 'name'
  | 'tier'
  | 'cls'
  | 'age'
  | 'stat'
  | 'effects'
  | 'heldBy'
  | 'weightKg'
  | 'source'
  | 'gatedBy';

export const SORT_COLUMNS: { key: SortKey; label: string; num?: boolean }[] = [
  { key: 'name', label: 'Item' },
  { key: 'tier', label: 'Tier', num: true },
  { key: 'cls', label: 'Class' },
  { key: 'age', label: 'Age' },
  { key: 'stat', label: 'Stat' },
  { key: 'effects', label: 'Effects' },
  { key: 'heldBy', label: 'Held by' },
  { key: 'weightKg', label: 'kg', num: true },
  { key: 'source', label: 'Made at' },
  { key: 'gatedBy', label: 'Gated by' }
];

function statNumber(stat: string): number {
  const m = /-?\d+(?:\.\d+)?/.exec(stat);
  return m ? parseFloat(m[0]) : Number.NEGATIVE_INFINITY;
}

function valueOf(it: TreeItem, key: SortKey): number | string {
  switch (key) {
    case 'tier':
      return it.tier ?? -1;
    case 'weightKg':
      return it.weightKg ?? 0;
    case 'age':
      return it.ageRank;
    case 'stat':
      return statNumber(it.stat);
    case 'effects':
      return it.effects;
    default:
      return it[key] ?? '';
  }
}

export function naturalOrder(a: TreeItem, b: TreeItem): number {
  return a.ageRank - b.ageRank || (a.tier ?? 0) - (b.tier ?? 0) || a.name.localeCompare(b.name);
}

function aggregateOf(node: TreeNode, key: SortKey, dir: 1 | -1): number | string | null {
  let best: number | string | null = null;
  const consider = (v: number | string) => {
    if (best === null) best = v;
    else if (typeof v === 'number' && typeof best === 'number')
      best = dir === 1 ? Math.min(best, v) : Math.max(best, v);
    else {
      const d = String(v).localeCompare(String(best));
      if (dir === 1 ? d < 0 : d > 0) best = v;
    }
  };
  (function walk(n: TreeNode) {
    for (const it of n.items) consider(valueOf(it, key));
    n.children.forEach(walk);
  })(node);
  return best;
}

export function sortTree(node: TreeNode, key: SortKey | null, dir: 1 | -1): TreeNode {
  const cmp = rowComparator(key, dir);
  const clone = (n: TreeNode, natural: number): TreeNode & { _n: number } => ({
    ...n,
    _n: natural,
    children: n.children.map(clone),
    items: [...n.items].sort(cmp)
  });
  const out = clone(node, 0);
  if (!key) return out;

  (function orderGroups(n: TreeNode, isRoot: boolean) {
    const holdsAges = key !== 'age' && n.children.some((c) => AGES.includes(c.label as Age));
    if (isRoot || holdsAges) {
      n.children.forEach((c) => orderGroups(c, false));
      return;
    }
    n.children.sort((a, b) => {
      const av = aggregateOf(a, key, dir);
      const bv = aggregateOf(b, key, dir);
      if (av === null || bv === null) return av === null ? (bv === null ? 0 : 1) : -1;
      const d =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv));
      return d
        ? d * dir
        : (a as TreeNode & { _n: number })._n - (b as TreeNode & { _n: number })._n;
    });
    n.children.forEach((c) => orderGroups(c, false));
  })(out, true);
  return out;
}

export function rowComparator(
  key: SortKey | null,
  dir: 1 | -1
): (a: TreeItem, b: TreeItem) => number {
  if (!key) return naturalOrder;
  return (a, b) => {
    const av = valueOf(a, key);
    const bv = valueOf(b, key);
    const d =
      typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv));
    return d ? d * dir : naturalOrder(a, b);
  };
}

// ── the table's view of this data ───────────────────────────────────────────────────────────────
// The nested audit table is one component (`TreeView`); a dataset reaches it by describing itself
// here. Buildings do the same in `buildingTree`, so the two views cannot drift apart.

import type { TreeSource, ViewNode, ViewRow } from './treeView';

const CELLS = (i: TreeItem): ViewRow['cells'] => [
  { v: i.name, cls: 'nm' },
  { v: i.tier ?? '—', cls: 'num' },
  { v: i.cls, cls: 'cls' },
  { v: i.age, cls: 'age' },
  { v: i.stat, cls: 'stat' },
  { v: i.effects, cls: 'fx', title: i.effects },
  { v: i.heldBy, cls: 'held', title: i.heldBy },
  { v: i.weightKg || '', cls: 'num' },
  { v: i.source, cls: 'src' },
  { v: i.gatedBy, cls: 'gate' }
];

const asView = (n: TreeNode): ViewNode => ({
  key: n.key,
  label: n.label,
  depth: n.depth,
  count: n.count,
  missing: n.missing,
  children: n.children.map(asView),
  rows: n.items.map((i) => ({ id: i.id, cells: CELLS(i), desc: i.desc, hover: i.row }))
});

export const ITEM_SOURCE: TreeSource = {
  noun: 'items',
  total: TREE_ITEMS.length,
  columns: SORT_COLUMNS,
  view(needle, sortKey, dir) {
    const base = needle
      ? buildTree(
          TREE_ITEMS.filter(
            (i) =>
              i.name.toLowerCase().includes(needle) ||
              i.id.includes(needle.replace(/ /g, '_')) ||
              i.path.some((p) => p.toLowerCase().includes(needle))
          )
        )
      : ITEM_TREE;
    return asView(sortTree(base, sortKey as SortKey | null, dir));
  }
};
