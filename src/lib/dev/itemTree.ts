// itemTree.ts — DEV TOOL. EVERY item in items.jsonc, filed into a nested tree.
//
// The flat tables could not answer the question an audit actually asks: "what does this age offer for
// this slot, and what is missing next to it". A list of 888 rows sorted by one column hides that; a
// path does not. Each item declares where it belongs — Armour ▸ Bronze ▸ jackal_hide ▸ light ▸ head —
// and the tree is built by inserting paths, so a new item files itself and a hole shows up as a level
// with one child instead of six.
//
// Ages: EQUIPMENT reuses `gearDb`'s age so this tree and the build grid never disagree. Everything
// else (materials, food, drink, reagents) is priced by the WORKSHOP its chain needs — `chainAge` —
// because a material has no tier of its own and its own station lies (linen cloth is woven at a
// primitive frame from thread spun on a bronze-age wheel).

import itemsData from '../game/database/items/items.jsonc';
import recipesData from '../game/database/items/recipes.jsonc';
import buildingsData from '../game/database/world/buildings.jsonc';
import { GEAR, AGES, rowForAny, type Age, type BuildClass, type GearRow } from './gearDb';
import lootpoolData from '../game/database/items/lootpool.jsonc';
import creaturesData from '../game/database/pawns/creatures.jsonc';
import { AGE_NAMES, blameStation, chainAgeOf } from './chainAge';
import { SLOT_LAYER } from '../game/core/armorCoverage';
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

// EVERY output — one butchery recipe produces meat, hide, sinew and bones together.
const recipeByOutput = new Map<string, any>();
for (const r of recipes)
  for (const out of Object.keys(r?.outputs ?? {}))
    if (!recipeByOutput.has(out)) recipeByOutput.set(out, r);

const gearById = new Map(GEAR.map((g) => [g.id, g]));

// ── who drops what ──────────────────────────────────────────────────────────
// "drop only" as one flat bucket said nothing you could act on. A kobold dropping a goblin vest and
// an orc dropping his own warplate are different facts, and the species is the one that matters:
// it names the thing you have to go and kill.
const SPECIES_OF_POOL = new Map<string, string>();
for (const c of creaturesData as any[]) {
  const pool = c?.lootPool;
  if (!pool || SPECIES_OF_POOL.has(pool)) continue;
  // the pool's own name carries the faction far more reliably than any one creature that rolls on it
  const word = String(pool).split('_')[0];
  SPECIES_OF_POOL.set(pool, word.charAt(0).toUpperCase() + word.slice(1));
}
const DROPPER_OF_ITEM = new Map<string, string>();
{
  const pools = ((lootpoolData as { pools?: Record<string, any> }).pools ?? {}) as Record<
    string,
    any
  >;
  for (const [poolId, pool] of Object.entries(pools)) {
    const who = SPECIES_OF_POOL.get(poolId) ?? poolId.split('_')[0];
    for (const slot of Object.values<any>(pool?.slots ?? {}))
      for (const pick of slot?.pick ?? [])
        if (pick?.id && !DROPPER_OF_ITEM.has(pick.id))
          DROPPER_OF_ITEM.set(pick.id, who.charAt(0).toUpperCase() + who.slice(1));
  }
}

/** Chain age → the same age vocabulary the build tables use. */
const AGE_OF_CHAIN: Age[] = ['Primitive', 'Copper', 'Bronze', 'Iron', 'Steel', 'Runed'];
const ageOf = (item: any): Age =>
  gearById.get(item.id)?.age ?? AGE_OF_CHAIN[chainAgeOf(item.id)] ?? 'Primitive';

export interface TreeItem {
  id: string;
  name: string;
  path: string[];
  age: Age;
  ageRank: number;
  tier: number | null;
  /** The one number that matters for this kind — defence, damage, nutrition, comfort… */
  stat: string;
  /** light / medium / heavy / shield — it left the tree when layers took that level. */
  cls: string;
  weightKg: number;
  /** Where it comes from: a station name, "forage / hunt", or "drop only". */
  source: string;
  /** The station whose age set this item's chain age — why it sits in the age it does. */
  gatedBy: string;
  desc: string;
  /** The catalogue row for this item — what the build tables' tooltip renders. Built for EVERY item,
   *  including the materials and food `GEAR` does not carry, so there is one tooltip, not two. */
  row: GearRow;
  raw: any;
}

// ── slot / coverage vocabulary ──────────────────────────────────────────────
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

// Armour is SUBTRACTIVE and layers ADD (ADR-029), so what stacks on top of what is the thing an audit
// most needs to see — it is why three stone-age garments come to one bronze jerkin. The tree nests by
// layer, outermost first, using the same depths the mitigation walk itself reads.
const LAYER_LABEL = ['outer layer', 'mid layer', 'base layer', 'under layer'];
const layerOf = (slot: string): string =>
  LAYER_LABEL[SLOT_LAYER[slot as EquipmentSlot] ?? 1] ?? 'mid layer';

// A weapon's family comes from the build gearDb ALREADY classified it into — one classifier, not a
// second name-regex quietly disagreeing with it. `pilum`, `francisca` and `framea` all landed in an
// "other" bucket while gearDb knew perfectly well what they were.
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
  storage: 'containers',
  primitive: 'primitive stock',
  crafting: 'primitive stock',
  metalworking: 'metal & ore',
  grain_seed: 'seeds'
};
const materialLine = (cat: string) =>
  MATERIAL_LINE[cat] ?? (/_seed$/.test(cat) ? 'seeds' : prettify(cat));

/** Crafted and dropped are different things to a player: one is a plan, the other is a hunt. They
 *  split BEFORE sets, so a craftable one-off never sits next to enemy loot. */
function sourceBranch(i: any): string[] {
  if (recipeByOutput.has(i.id)) return ['crafted'];
  const who = DROPPER_OF_ITEM.get(i.id);
  return who ? ['dropped', who] : ['dropped', 'unclaimed'];
}

const perishable = (i: any) => (i.decaySeconds || i.decaysTo ? 'perishable' : 'keeps');

// ── the path each item files itself under ───────────────────────────────────
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
      layerOf(ap.equipmentSlot ?? ap.slot ?? ''),
      COVERAGE[ap.equipmentSlot ?? ap.slot] ?? prettify(ap.equipmentSlot ?? 'unplaced')
    ];
  }
  // Worn but soaks nothing: rings, amulets, crowns, torcs.
  if (i.type === 'armor')
    return ['Regalia & jewellery', COVERAGE[ap?.equipmentSlot] ?? 'worn', age];

  if (i.category === 'ammunition' || i.ammoProperties)
    return ['Ammo', prettify(i.ammoProperties?.ammoCategory ?? i.ammoCategory ?? 'other'), age];
  if (i.category === 'natural_weapon') return ['Natural weapons', prettify(i.category), age];
  if (wp) return ['Weapons', age, familyOf(i.id), wp.twoHanded ? 'two-handed' : 'one-handed'];

  // CONTAINERS-AND-FLUIDS: three separate branches for three separate things, and they sit beside
  // Armour/Shields/Weapons because a player choosing a loadout is choosing between them.
  //
  //   Carry aids — WORN. They raise what a pawn can shoulder and hold nothing. Filed by the slot they
  //                occupy, because the loadout trade-off (a back quiver blocks a pack) is the point.
  //   Vessels    — NOT worn. Nesting and capacity only; what they hold is what they are for.
  //   Fluids     — cannot exist outside one of the above.
  if (i.type === 'fluid') return ['Fluids', prettify(i.category ?? 'other'), age];
  if (i.inventoryBonus) {
    const slot = i.armorProperties?.equipmentSlot ?? i.armorProperties?.slot;
    return ['Carry aids', COVERAGE[slot] ?? (slot ? prettify(slot) : 'in hand'), age];
  }
  if (i.container) {
    const holdsFluid = (i.container.accepts ?? []).includes('fluid');
    return ['Vessels', holdsFluid ? 'fluid' : 'general goods', age];
  }

  if (i.type === 'food' || i.nutrition != null)
    return ['Consumables', 'Food', perishable(i), prettify(i.category ?? 'food'), age];
  if (i.category === 'drink') return ['Consumables', 'Drink', perishable(i), age];
  if (i.medicineQuality != null) return ['Consumables', 'Medicine', age];
  if (i.type === 'consumable' && i.category === 'reagent')
    return ['Consumables', 'Coatings & tinctures', age];
  if (i.type === 'consumable') return ['Consumables', prettify(i.category ?? 'other'), age];

  if (i.type === 'tool' || i.type === 'container') {
    const work = i.toolBoost?.workType ?? i.category ?? 'other';
    return ['Tools', prettify(String(work)), age];
  }
  return ['Materials', materialLine(String(i.category ?? 'other')), age];
}

/** The single number worth showing for a row, chosen by what the item IS. */
function statOf(i: any): string {
  const ap = i.armorProperties;
  const wp = i.weaponProperties;
  if (ap?.armorType === 'shield') return `block ${Math.round((ap.blockBonus ?? 0) * 100)}%`;
  if (ap?.armorType) return `def ${ap.defense ?? 0}`;
  if (wp) return `dmg ${wp.damage ?? '—'}${wp.damageType ? ` ${wp.damageType}` : ''}`;
  if (i.ammoProperties) return `dmg ${i.ammoProperties.damage ?? '—'}`;
  // A drinkable food is BOTH: what it feeds and how much of the vessel it takes. Both numbers matter
  // when you are deciding whether a skin of ale is worth the litre it costs to carry.
  if (i.nutrition != null)
    return i.type === 'fluid' ? `food ${i.nutrition} · ${i.volumeL ?? 1} L` : `food ${i.nutrition}`;
  if (i.hydration != null) return `drink ${i.hydration}`;
  if (i.medicineQuality != null) return `med ${i.medicineQuality}`;
  if (i.toolBoost) {
    const b = i.toolBoost;
    const parts = [
      b.speed ? `spd ×${b.speed}` : '',
      b.yield ? `yld ×${b.yield}` : '',
      b.quality ? `qly ×${b.quality}` : ''
    ].filter(Boolean);
    if (parts.length) return parts.join(' ');
  }
  // A carry aid is read by what it GRANTS; a vessel by what it HOLDS. Checked in that order, because a
  // quiver has both blocks and while worn it is the carry aid.
  if (i.inventoryBonus)
    return `carry +${i.inventoryBonus.weightKg ?? 0}kg / +${i.inventoryBonus.volumeL ?? 0}L`;
  if (i.container)
    return `holds ${i.container.capacityL} L${i.container.capacityKg ? ` / ${i.container.capacityKg} kg` : ''}`;
  if (i.type === 'fluid') return `${i.volumeL ?? 1} L per measure`;
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
      age: ageOf(i),
      ageRank: AGES.indexOf(ageOf(i)),
      tier: i.tier ?? null,
      stat: statOf(i),
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

// ── the tree itself ─────────────────────────────────────────────────────────
export interface TreeNode {
  key: string;
  label: string;
  depth: number;
  count: number;
  children: TreeNode[];
  items: TreeItem[];
  /** Coverage cells this kit does NOT fill — the same "– legs" marker the build grid carries, at the
   *  level where a complete kit is actually defined. */
  missing: string[];
}

// What a KIT must cover, using the build grid's rule: six cells, and the three torso layers collapse
// to one — a kit needs *a* torso piece, not one per layer (plate over mail over a gambeson is the
// layering, not two holes). Cloak, pack and belt are carry slots and never count as coverage.
//
// The marker sits on the SET, not on the class beneath it: `Iron Mail` is one kit with a heavy
// hauberk and medium limbs, and asking each class-node separately invented "heavy kit missing
// everything". `no set` and `drop only` are not kits at all — loose pieces and enemy loot can never
// be complete, so they carry no marker.
const KIT_PARTS = ['head', 'torso', 'arms', 'hands', 'legs', 'feet'];
const NOT_A_KIT = new Set(['no set', 'drop only']);
const coverageOf = (label: string) => (label.startsWith('torso') ? 'torso' : label);
function missingOf(node: TreeNode, rootLabel: string): string[] {
  if (rootLabel !== 'Armour' || NOT_A_KIT.has(node.label)) return [];
  // Armour ▸ age ▸ crafted ▸ SET  (or ▸ dropped ▸ species ▸ SET)
  if (node.depth !== 3 && node.depth !== 4) return [];
  // a set node is the one whose children are layers
  if (!node.children.some((c) => LAYER_LABEL.includes(c.label))) return [];
  const present = new Set<string>();
  (function walk(n: TreeNode) {
    if (!n.children.length) present.add(coverageOf(n.label));
    n.children.forEach(walk);
  })(node);
  return KIT_PARTS.filter((p) => !present.has(p));
}

/** Ages sort by the real ladder; everything else alphabetically, with the catch-alls last. */
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

/** Top level in the order an audit reads it, not alphabetically. A label missing from this list falls
 *  to the end, which is where the three CONTAINERS-AND-FLUIDS branches landed until they were placed:
 *  carry aids belong with the WORN kit, next to the armour they compete with for a slot. */
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
    let key = '';
    let node = root;
    node.count++;
    it.path.forEach((label, depth) => {
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
  (function order(n: TreeNode, rootLabel = '') {
    if (n === root)
      n.children.sort((a, b) => {
        const ai = ROOT_ORDER.indexOf(a.label);
        const bi = ROOT_ORDER.indexOf(b.label);
        return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
      });
    else sortNodes(n.children);
    n.items.sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0) || a.name.localeCompare(b.name));
    n.children.forEach((c) => order(c, n.depth < 0 ? c.label : rootLabel));
    n.missing = missingOf(n, rootLabel);
  })(root);
  return root;
}

export const ITEM_TREE = buildTree();
