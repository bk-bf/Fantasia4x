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
  | 'Sword & Shield'
  | 'Axe & Shield'
  | 'Mace & Shield'
  | 'Cleaver & Shield'
  | 'Flail & Shield'
  | 'Spear & Shield'
  // one-handed duel-grip, no shield / free off-hand (needs the Duelist trait — Workstream B)
  | 'Sword (Duelist)'
  | 'Axe (Duelist)'
  | 'Mace (Duelist)'
  | 'Cleaver (Duelist)'
  | 'Flail (Duelist)'
  | 'Spear (Duelist)'
  // two-handed (STR)
  | 'Greatsword (2H)'
  | '2H Cleaver'
  | '2H Axe'
  | '2H Hammer'
  | 'Polearm (2H)'
  // pure defensive anchor (heaviest armour + shield, taunt/provoke — Workstream B)
  | 'Pure Tank'
  // finesse
  | 'Fencer (Rapier)'
  | 'Assassin (Dagger)'
  // ranged
  | 'Archer (Bow)'
  | 'Crossbowman'
  | 'Skirmisher (Throwing)'
  | 'Slinger (Sling)'
  // arcane / caster
  | 'Battlemage (1H Staff)'
  | 'War-Caster (2H Staff)'
  | 'Stunwaller (2H Staff)'
  // non-build (crafting/healing/social skills)
  | 'General';

export type BuildCategory =
  | 'melee'
  | 'duelist'
  | 'tank'
  | 'finesse'
  | 'ranged'
  | 'caster'
  | 'general';
export type GearKind = 'weapon' | 'armor' | 'tool' | 'ammo' | 'medicine' | 'trait';
export type TraitGating = 'ungated' | 'cultural' | 'lineage' | 'flaw';

// ── build groups (used by the classifiers) ──────────────────────────────────
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
// Light-medium / dodge-based builds (duelists live here too — heavy armour claps their speed).
const NIMBLE: BuildClass[] = [
  'Assassin (Dagger)',
  'Fencer (Rapier)',
  ...RANGED,
  ...DUELIST,
  'Stunwaller (2H Staff)'
];

// Every real build (order = display order). 'General' is deliberately excluded — it is not a build.
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
  for (const [grp, label] of GROUP_LABELS)
    if (grp.every((x) => rest.has(x))) {
      labels.push(label);
      grp.forEach((x) => rest.delete(x));
    }
  for (const x of rest) labels.push(x);
  return labels.join(' · ');
}

/** Two DIFFERENT kinds of setless armour, which were previously lumped as "one-offs":
 *  `DROPPED` has no recipe at all — enemy gear you can only take off a corpse, never plan for;
 *  `UNAFFILIATED` is craftable but belongs to no kit. Only the second is a candidate for folding into
 *  a set later, so the tables must not conflate them. */
export const DROPPED = '__dropped';
export const UNAFFILIATED = '__unaffiliated';

export const AGES = ['Primitive', 'Copper', 'Bronze', 'Iron', 'Steel', 'Runed', 'Boss'] as const;
export type Age = (typeof AGES)[number];

// Formal per-build spec — the design intent to check the implementation against. Hand-authored.
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
  /** Damage multiplier on a crit — a precision weapon authors a bigger one (default 1.5). */
  critMult: number | null;
  accuracy: number | null;
  atkSpeed: number | null;
  stamina: number | null;
  reach: number | null;
  range: number | null;
  stun: number | null;
  scaling: 'BRN' | 'AGI' | 'AWR' | 'INT' | 'CHA' | 'draw' | null;
  twoHanded: boolean | null;
  onHit: string | null;
  wieldStr: number | null;
  // armor
  defense: number | null;
  armorType: string | null;
  slot: string | null;
  bodyPart: string | null; // canonical body slot the piece equips to
  /** The SET this piece belongs to (`steel_plate`, `munition_half_plate`…), or null for a
   *  deliberate one-off — a boss drop, a ceremonial piece. Lets the tables group a kit into one
   *  row instead of scattering six torso pieces across a tier with no way to tell them apart. */
  armorSet: string | null;
  setLabel: string | null;
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
  rarity: string | null; // raw data value (may be the pseudo-"negative")
  rarityRank: number;
  polarity: 'positive' | 'negative'; // derived from the effects, NOT the rarity field
  gradeRarity: string | null; // real rarity (common…mythic); "negative"-rarity flaws derived by magnitude
  gradeRank: number;
  lineageNames: string | null;
  evolvesTo: string | null;
  evoStage: number; // 0 = base, +1 per step down an evolution chain
  desc: string | null; // player-facing description
  raw: any; // the source item/trait object — for the info panel to format its fields directly
}

export const REAL_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as const;

// ── lookup maps ─────────────────────────────────────────────────────────────
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
for (const rec of recipes) {
  const outs = rec?.outputs ? Object.keys(rec.outputs) : [];
  if (outs.length && !recipeByOutput.has(outs[0])) recipeByOutput.set(outs[0], rec);
}

// ── derivations ─────────────────────────────────────────────────────────────
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
  // A high-tier LOOT piece is a boss drop, whatever it is forged from — checked before the material
  // words so `iron_tide_greataxe` reads as Boss, not as an iron-age craftable.
  if (!craftable && tier >= 4) return 'Boss';
  if (/staff$|rune|arcane/.test(id)) return 'Runed';
  // Material words match ANYWHERE in the id, not just at the front: `gnoll_flint_axe` and
  // `gnoll_bone_cleaver` are stone-age pieces that happen to carry a faction prefix.
  if (/steel|clockwork/.test(id)) return 'Steel';
  if (/iron/.test(id)) return 'Iron';
  if (/bronze/.test(id)) return 'Bronze';
  if (/copper/.test(id)) return 'Copper';
  // Bone and antler are butchered, dried and carved at a bench — a band above knapped stone. The
  // bigger pieces (a two-handed maul, a cleaver) land in bronze rather than copper. Above tier 2 the
  // material stops deciding: `fang_reaver` is a legendary craft, not a bone-age club.
  if (tier <= 2 && /bone|antler|fang/.test(id)) return tier >= 2 ? 'Bronze' : 'Copper';
  if (/flint|stone|wood|rawhide|raw_hide|hide|leaf/.test(id)) return 'Primitive';
  // Ambiguous words that only mean "primitive" at the FRONT of an id — a `staff_sling` is a later
  // build than a `sling`, and `padded`/`wicker` name a piece rather than a material.
  if (/^(throwing|sling|self|padded|linen|tallow|wattle|wicker)/.test(id)) return 'Primitive';
  return AGE_BY_TIER[Math.min(Math.max(tier, 0), 4)];
}
const AGE_BY_TIER: Age[] = ['Primitive', 'Bronze', 'Iron', 'Steel', 'Runed'];

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
  // A rod is the same channelled magic in one hand, bought at a lower yield to keep a shield.
  if (wp.arcane) return two ? 'War-Caster (2H Staff)' : 'Battlemage (1H Staff)';
  // Same test the engine uses (`rangedCombat.isRangedWeaponProps`): melee authors range 0–1.
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
  // A plain shod staff: no edge, no magic, all cadence and stun.
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
  // fallback by damage type + handedness
  if (two) return dt === 'blunt' ? '2H Hammer' : pierce ? 'Polearm (2H)' : 'Greatsword (2H)';
  return dt === 'blunt' ? 'Mace & Shield' : pierce ? 'Spear & Shield' : 'Sword & Shield';
}

// Armour → the builds whose weight/role favour it (multi-build).
function classifyArmor(item: any): BuildClass[] {
  const ap = item.armorProperties;
  if (ap?.armorType === 'shield') return [...SHIELD_BUILDS, 'Pure Tank', 'Battlemage (1H Staff)'];
  if (ap?.stealthMod) return ['Assassin (Dagger)', 'Fencer (Rapier)', ...RANGED];
  if (
    item.magicResistance != null ||
    ap?.magicResistance != null ||
    /robe|circlet|arcane/.test(item.id)
  )
    return [...CASTERS];
  switch (ap?.armorType) {
    case 'heavy':
      return [...FRONTLINE, 'Pure Tank']; // duelists excluded — heavy claps their speed
    case 'medium':
      return [...FRONTLINE, ...DUELIST, 'Fencer (Rapier)'];
    case 'light':
      return [...NIMBLE, ...CASTERS];
    default:
      return ['General'];
  }
}

// 1H melee weapons serve both their "& Shield" build and their duel-grip (no-shield) variant.
const DUELIST_OF: Partial<Record<BuildClass, BuildClass>> = {
  'Sword & Shield': 'Sword (Duelist)',
  'Axe & Shield': 'Axe (Duelist)',
  'Mace & Shield': 'Mace (Duelist)',
  'Cleaver & Shield': 'Cleaver (Duelist)',
  'Flail & Shield': 'Flail (Duelist)',
  'Spear & Shield': 'Spear (Duelist)'
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

// Canonical body slots, in head→feet order. Used to show where a piece equips and which parts a
// build has NO armour for at a given age.
// The slot model, in the order a kit is read. Torso is the only THREE-layer region — plate over mail
// over a gambeson is a real decision with a real weight cost. Shoulder and neck slots were removed
// (they only ever held one obvious piece per tier); the shoulders ride on the torso layers' coverage
// and the neck on the head piece's, so both stay protected without padding the count.
export const BODY_PARTS = [
  'head',
  'torso-outer',
  'torso-mid',
  'torso-skin',
  'arms',
  'hands',
  'legs',
  'feet',
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
    case 'back':
      return 'cloak';
    case 'back2':
      return 'pack';
    default:
      return null;
  }
}

/** Core-stat display abbreviations, matching the pawn panels. */
const SCALE_ABBR: Record<string, GearRow['scaling']> = {
  brawn: 'BRN',
  agility: 'AGI',
  awareness: 'AWR',
  intellect: 'INT',
  charisma: 'CHA'
};
function scalingOf(wp: any): GearRow['scaling'] {
  if (!wp) return null;
  if (wp.powerStat) return SCALE_ABBR[String(wp.powerStat)] ?? null;
  if (wp.arcane) return 'INT';
  if (wp.finesse) return 'AWR';
  if (wp.strScaled === false) return 'draw';
  return 'BRN';
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

function toRow(item: any): GearRow | null {
  const kind = kindOf(item);
  if (!kind) return null;
  const rec = recipeByOutput.get(item.id) ?? null;
  // The RECIPE is the only research gate — items no longer carry one (it was a second, drifting copy).
  const researchId = rec?.researchRequired ?? null;
  const tier = item.tier ?? 0;
  const craftable = !!rec;
  const age = ageOf(item.id, researchId, tier, craftable, item.tier != null);
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
    wieldStr: item.wieldRequirement?.brawn ?? null,
    defense: ap?.defense ?? null,
    armorType: ap?.armorType ?? null,
    slot: ap?.slot ?? ap?.equipmentSlot ?? null,
    bodyPart: kind === 'armor' ? bodyPartOf(ap?.equipmentSlot ?? ap?.slot ?? null) : null,
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

// ── traits ──────────────────────────────────────────────────────────────────
const STAT_ABBR: Record<string, string> = {
  brawn: 'BRN',
  agility: 'AGI',
  vigour: 'VIG',
  awareness: 'AWR',
  intellect: 'INT',
  charisma: 'CHA'
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

// Polarity from the EFFECTS, not the rarity field: a trait is negative only when every non-zero
// effect is a downside (all penalties / debuff multipliers) — this catches all-penalty curse traits
// like Accursed Blood (rarity "epic") that the raw rarity would otherwise hide among positives.
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

// The rarity a trait occupies in the REAL rarity table. Graded traits keep their rarity (so an
// all-penalty epic like Accursed Blood stays epic, just on the negative side). The flat "negative"
// pool (ungraded mundane flaws) is graded by the magnitude of its penalty so it spreads across the
// same table instead of collapsing into a fake "flaw" rarity.
function flawMagnitude(t: any): number {
  const e = t.effects ?? {};
  let m = 0;
  for (const [k, v] of Object.entries(e)) {
    if (k.endsWith('Bonus') && (v as number) < 0) m += Math.abs(v as number);
    else if (v && typeof v === 'object')
      for (const mv of Object.values(v)) if (typeof mv === 'number' && mv < 1) m += (1 - mv) * 6;
  }
  if (t.kind === 'wound') m += 5; // a permanent injury is a heavy flaw even with no stat block
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

// Trait → the build(s) its stat/effect keys support. Work/heal/CHA-only traits touch no build → General.
function classifyTrait(t: any): BuildClass[] {
  const e = t.effects ?? {};
  const set = new Set<BuildClass>();
  const stat = (k: string) => e[k + 'Bonus'] != null;
  if (stat('brawn')) MELEE_ALL.forEach((b) => set.add(b));
  if (stat('vigour')) {
    FRONTLINE.forEach((b) => set.add(b));
    set.add('Pure Tank');
  }
  if (stat('agility')) {
    set.add('Assassin (Dagger)');
    set.add('Fencer (Rapier)');
    DUELIST.forEach((b) => set.add(b));
  }
  if (stat('awareness')) PER_BUILDS.forEach((b) => set.add(b));
  if (stat('intellect')) CASTERS.forEach((b) => set.add(b));
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
