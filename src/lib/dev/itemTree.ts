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
//
// Age is a LEVEL of the tree: Armour ▸ Bronze ▸ crafted ▸ set ▸ layer ▸ what it covers. It is also a
// column on the row, but the nesting is what answers the question an audit asks — "what does this age
// offer for this slot, and what sits empty beside it" — because a level with one child instead of six
// IS the hole, visible without reading a row.

import { gearClassOf } from '../game/core/gearClass';
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

/**
 * WHAT THE ITEM DOES — everything the sim actually reads off it, in one line.
 *
 * The `stat` column carries a single headline number, which meant a herbal tea and a cup of water were
 * indistinguishable in the tables: nothing surfaced the conditions an item grants or clears, what a
 * coating inflicts, what a draught gambles, or what a fluid needs to be held in. Auditing content you
 * cannot see is guesswork, so this is deliberately exhaustive rather than pretty.
 */
export function effectsOf(i: any): string {
  const out: string[] = [];
  const hrs = (turns: number) => `${Math.round(turns * 10) / 10}t`;
  if (i.nutrition != null) out.push(`food ${i.nutrition}`);
  if (i.hydration != null) out.push(`drink ${i.hydration}`);
  if (i.medicineQuality != null) out.push(`med ${i.medicineQuality}`);
  if (i.curesConditions?.length) out.push(`cures ${i.curesConditions.join('/')}`);
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
  if (i.heldBy?.length) out.push(`held by ${i.heldBy.join('/')}`);
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
  if (ap?.movementPenalty) out.push(`move −${Math.round(ap.movementPenalty * 100)}%`);
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
  age: Age;
  ageRank: number;
  tier: number | null;
  /** The one number that matters for this kind — defence, damage, nutrition, comfort… */
  stat: string;
  /** Everything the sim reads off this item — conditions, cures, coatings, boosts. See `effectsOf`. */
  effects: string;
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
  storage: 'station fittings',
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

/**
 * How a food is KEPT, not merely whether it rots. The old `keeps / perishable` split was a lie by
 * omission — almost everything under "keeps" also rots, just slower — and it told the reader nothing
 * about the technique that bought the time. Fresh food and finished meals are their own shelves
 * because neither was preserved at all.
 */
const preservation = (i: any): string => {
  if (i.preservationMethod) return `${i.preservationMethod}`;
  if (i.category === 'meal') return 'cooked to order';
  // Legacy preserved goods that predate the field, read off the name rather than guessed from decay.
  if (/dried|smoked|salted|cured|pickled/i.test(`${i.id} ${i.name ?? ''}`)) return 'dried';
  return 'fresh';
};

// ── the path each item files itself under ───────────────────────────────────
//
// Branches say what a thing IS; the AGE level under them says when the colony can have it. Equipment
// puts age directly under the branch (an audit reads "what does Bronze offer for this slot"); every
// other branch puts its conceptual line first and age beneath it, because "all the fuels, by age" is
// the question there rather than "everything the bronze age has".
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
  // One child named the same thing as its parent is a level that tells the reader nothing.
  if (i.category === 'natural_weapon') return ['Natural weapons', age];
  if (wp)
    return [
      'Weapons',
      age,
      familyOf(i.id),
      gearClassOf(i) ?? 'unclassed',
      wp.twoHanded ? 'two-handed' : 'one-handed'
    ];

  // CONTAINERS-AND-FLUIDS: three separate branches for three separate things, and they sit beside
  // Armour/Shields/Weapons because a player choosing a loadout is choosing between them.
  //
  //   Carry aids — WORN. They raise what a pawn can shoulder and hold nothing. Filed by the slot they
  //                occupy, because the loadout trade-off (a back quiver blocks a pack) is the point.
  //   Vessels    — NOT worn. Nesting and capacity only; what they hold is what they are for.
  //   Fluids     — cannot exist outside one of the above.
  //
  // Fluids split by what the fluid is FOR, never by its raw `category`. Those category words —
  // "reagent", "organic" — are the same words Materials files its own lines under, so reusing them
  // put a shelf called "Reagent" in two branches meaning two different things.
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
    return ['Consumables', 'Food', preservation(i), prettify(i.category ?? 'food'), age];
  if (i.medicineQuality != null) return ['Consumables', 'Medicine', age];
  // The coatings and tinctures all became FLUIDS; what still carries `category: reagent` here is beast
  // ORGANS, eaten whole for the trait gamble. Calling that shelf "Coatings & tinctures" was a leftover
  // pointing at a shelf that had moved.
  if (i.type === 'consumable' && i.category === 'reagent')
    return ['Consumables', 'Beast organs', age];
  if (i.type === 'consumable') {
    const cat = String(i.category ?? 'other');
    // A shelf called "Consumable" inside a branch called Consumables says nothing twice.
    return ['Consumables', cat === 'consumable' ? 'Other' : prettify(cat), age];
  }

  if (i.type === 'tool' || i.type === 'container') {
    const work = i.toolBoost?.workType ?? i.category ?? 'other';
    return ['Tools', prettify(String(work)), age];
  }
  return ['Materials', materialLine(String(i.category ?? 'other')), age];
}

/**
 * What a fluid is FOR — the question a player is actually asking when they open the branch. Read off
 * the fields the sim itself reads, so a new fluid files itself: nutrition (or being water) means you
 * drink it, a timed condition or a trait grant means you quaff it for the effect, a `coatingEffect`
 * means it goes on a blade, and everything left over is something a workshop eats.
 */
function fluidPurpose(i: any): string {
  if (i.coatingEffect) return 'Coatings & oils';
  if (i.nutrition != null || i.id === 'water') return 'Drink';
  if ((i.grantsConditions?.length && i.conditionDurationTurns) || i.grantsTraitOnConsume)
    return 'Potions & draughts';
  return 'Industrial';
}

/** The single number worth showing for a row, chosen by what the item IS. */
function statOf(i: any): string {
  const ap = i.armorProperties;
  const wp = i.weaponProperties;
  if (ap?.armorType === 'shield') return `block ${Math.round((ap.blockBonus ?? 0) * 100)}%`;
  // A carry aid answers to the same light/medium/heavy class as armour now, so it HAS an `armorType`.
  // What the row has to say is still what the piece grants — the carry, plus hip defence where the
  // war-belt line has any. Checked before the armour branch or every pack reads `def 0`.
  if (i.inventoryBonus) {
    // Worn aids are volume-only (R14), so the weight half is shown ONLY by the hand-hauled line that
    // actually has one. Printing "+0kg" on every pack in the game is noise, not information.
    const { weightKg = 0, volumeL = 0 } = i.inventoryBonus;
    const carry = weightKg ? `carry +${weightKg}kg / +${volumeL}L` : `holds +${volumeL} L`;
    return ap?.defense ? `${carry} · def ${ap.defense}` : carry;
  }
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
      effects: effectsOf(i),
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

/** Ages sort by the real ladder — Primitive before Bronze because it IS before it, not because P
 *  precedes B; layers by the body's own order; everything else alphabetically, catch-alls last. */
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
    // Age first, then tier, then name. With age as a LEVEL every row on a shelf shares one, so this
    // usually reduces to tier-then-name — but it keeps the unsorted order identical either way, which
    // is what `naturalOrder` (the sort's "off" position) promises.
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

// ── column sorting ──────────────────────────────────────────────────────────
//
// Sorting is per SHELF, not across the whole table: the tree's whole value is that position tells you
// what a thing is, and a global flat sort would throw that away to answer a question the flat tables
// already answer better. Clicking a column re-orders the rows INSIDE every shelf, so "heaviest first"
// means "heaviest in each line", which is the comparison an audit is actually making.

export type SortKey =
  | 'name'
  | 'tier'
  | 'cls'
  | 'age'
  | 'stat'
  | 'effects'
  | 'weightKg'
  | 'source'
  | 'gatedBy';

/** The header row, in table order. `num` right-aligns, matching the cells. */
export const SORT_COLUMNS: { key: SortKey; label: string; num?: boolean }[] = [
  { key: 'name', label: 'Item' },
  { key: 'tier', label: 'Tier', num: true },
  { key: 'cls', label: 'Class' },
  { key: 'age', label: 'Age' },
  { key: 'stat', label: 'Stat' },
  { key: 'effects', label: 'Effects' },
  { key: 'weightKg', label: 'kg', num: true },
  { key: 'source', label: 'Made at' },
  { key: 'gatedBy', label: 'Gated by' }
];

/** The leading number in a stat readout ("def 12", "holds 3 L") — what the column is really about. */
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
    // Sorting by age means sorting the ladder, not the alphabet — Bronze comes after Primitive
    // because it does, not because B follows P.
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

/** The default order a shelf falls back to — the sort's "off" position: age, then tier, then name. */
export function naturalOrder(a: TreeItem, b: TreeItem): number {
  return a.ageRank - b.ageRank || (a.tier ?? 0) - (b.tier ?? 0) || a.name.localeCompare(b.name);
}

/**
 * The value a GROUP sorts by: the best value among everything under it, where "best" means the one
 * that would come first under the current direction — the earliest age when sorting up, the latest
 * when sorting down. That is what makes a sort visible at all here. Most shelves hold a single age, so
 * ordering only the rows inside them left the headings alphabetical and the whole table looking
 * unsorted; a set of Primitive pieces has to be able to move above a set of Iron ones.
 */
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

/**
 * A copy of the tree ordered by one column — GROUPS and rows alike. A copy rather than a re-sort in
 * place because the built tree is shared with the search view and the fold state is keyed off it.
 * With no column chosen this is the tree exactly as `buildTree` left it.
 */
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

  // The TOP level is a table of contents, not data: it is the deliberate order an audit reads in
  // (ROOT_ORDER), and letting a column throw Regalia to the bottom because its earliest piece is
  // late-age would undo that for no gain. Sorting starts one level in — at the AGE shelves and below.
  (function orderGroups(n: TreeNode, isRoot: boolean) {
    // The AGE level is the tree's spine. Sorting by weight or defence must not shuffle it into
    // "Boss, Iron, Steel, Runed, Copper, Bronze, Primitive" — that answers no question and costs the
    // reader the one ordering they can navigate by. Ages hold the ladder for every column EXCEPT the
    // age column itself, which is exactly the case where flipping them is the point.
    const holdsAges = key !== 'age' && n.children.some((c) => AGES.includes(c.label as Age));
    if (isRoot || holdsAges) {
      n.children.forEach((c) => orderGroups(c, false));
      return;
    }
    n.children.sort((a, b) => {
      const av = aggregateOf(a, key, dir);
      const bv = aggregateOf(b, key, dir);
      // A branch holding nothing sortable sinks, whichever way the column points.
      if (av === null || bv === null) return av === null ? (bv === null ? 0 : 1) : -1;
      const d =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv));
      // Ties keep the shelf order the tree was built with, so equal groups never shuffle about.
      return d
        ? d * dir
        : (a as TreeNode & { _n: number })._n - (b as TreeNode & { _n: number })._n;
    });
    n.children.forEach((c) => orderGroups(c, false));
  })(out, true);
  return out;
}

/**
 * Comparator for a chosen column, or the natural ladder when nothing is chosen. Ties always fall back
 * to the ladder, so the order is stable and a column with a lot of equal values (every Class is
 * "light") still reads early-to-late underneath instead of shuffling.
 */
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
