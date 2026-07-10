import creaturesData from '../database/creatures.jsonc';
import { resolveCharSpans, type CharSpan } from './Terrains';
import type { DamageType } from './types/health';

// Entity (mob + animal) definitions loaded from database/creatures.jsonc — never
// hardcode a creature in a service. EntityService consumes these to spawn Mobs.

export type EntityClass = 'mob' | 'animal';
export type EntityBehaviour = 'passive' | 'neutral' | 'aggressive';
export type EntityDiet = 'herbivore' | 'carnivore' | 'omnivore' | 'none';
/** Item categories (items.jsonc `category`) an entity eats: `food` = wild forage/meals,
 *  `meat` = butchered cuts, `organic` = raw carcasses/remains. */
export type FoodCategory = 'food' | 'meat' | 'organic';
/** `primitive` = food-only needs, eats from tile/corpse, no mood; `sapient` = full
 *  pawn-equivalent systems — spawns as `Pawn` (isPlayerControlled: false), not `Mob`. */
export type EntityIntelligence = 'primitive' | 'sapient';

export interface CreatureStats {
  // ── Primary attributes (set in creatures.jsonc) ───────────────────────
  /** Physical power → melee damage, carry weight. */
  str: number;
  /** Agility → move speed, dodge, hit chance. */
  dex: number;
  /** Durability → maxHealth. */
  con: number;
  /** Awareness → vision range. */
  per: number;
  // ── Derived (computed in toDefinition(); do not set in JSON) ─────────
  health: number;
  /** Tiles per second. */
  speed: number;
  /** Tile detection radius. */
  visionRange: number;
  fleeRange: number;
  /** Alias for str; used by legacy spawn code. */
  strength: number;
}

// Natural attacks are first-class items (category 'natural_weapon' in items.jsonc),
// resolved through ItemService in Combat like crafted weapons; STR scaling
// differentiates a shared attack across species.

export interface CreatureLootEntry {
  itemId: string;
  chance: number; // 0–1
  qty: [number, number]; // inclusive [min, max]
}

export interface CreatureProduces {
  itemId: string;
  qty: number;
  intervalSeconds: number;
}

export interface CreatureDefinition {
  id: string;
  name: string;
  entityClass: EntityClass;
  /** Resolved glyph char array (from charSpans in the DB). */
  chars: string[];
  fg: [number, number, number];
  bg: [number, number, number];
  stats: CreatureStats;
  behaviour: EntityBehaviour;
  /** Governs hunger-accrual rate ONLY (carnivore 1.0 / omnivore 0.7 / herbivore 0.5 / none 0).
   *  Does NOT determine what this creature eats — see `eats`/`grazes`. */
  diet: EntityDiet;
  /** Item categories this creature forages/scavenges when hungry. If omitted, defaults from
   *  `diet`: herbivore → [food]; carnivore → [meat, organic]; omnivore → all three. */
  eats: FoodCategory[];
  /** Also grazes plain grass tiles (no item involved). Defaults to `diet === 'herbivore'`. */
  grazes: boolean;
  /** Hunts and frightens prey. This — not `diet` — is the sole flag marking a threat:
   *  a passive omnivore (chicken) is not a predator, a neutral omnivore (bear) is. */
  predator: boolean;
  /** `primitive` = animals; `sapient` = humanoid NPCs (spawn as Pawn, not Mob). */
  intelligence: EntityIntelligence;
  nocturnalAggro: boolean;
  /** Only spawns at night. */
  nightOnly: boolean;
  /** Inclusive pack-size range to spawn together. */
  pack: [number, number];
  tameable: boolean;
  /** 1.0 = easy to tame, 0.3 = hard. */
  tameResistance: number;
  mountable: boolean;
  /** Predatory mobs hunt this creature and it flees from them. Set on passive/neutral animals. */
  huntable: boolean;
  canSteal: boolean;
  chargesWhenWounded: boolean;
  /** A `neutral` creature defends its personal space (charges within half vision range).
   *  Defaults TRUE; set FALSE on placid herbivores. No effect on passive/aggressive creatures. */
  territorial: boolean;
  /** 0–1 darkness immunity: 0 = sight/work scale fully with light; 1 = full range/speed
   *  regardless of darkness (nocturnal predators). Defaults to 0. */
  nightVision: number;
  /** Husbandry product, when present. */
  produces?: CreatureProduces;
  /** Item id of the carcass dropped on death (items.jsonc). Absent = no physical remains. */
  carcassItemId?: string;
  /** biome id → relative spawn weight (terrains.jsonc biome ids). */
  biomeWeights: Record<string, number>;
  lootTable: CreatureLootEntry[];
  /** Natural melee attacks — ids of `natural_weapon` items in items.jsonc. */
  naturalWeapons: string[];
  /** Trait ids (traits.jsonc) this creature carries. Mobs get only the
   *  stat/resistance/weaponBonus/combatMods effects, never the pawn-only machinery. */
  traits?: string[];
  /** Per-DamageType resist added on top of the stat-derived baseline (positive = resists,
   *  NEGATIVE = vulnerable). Final resist still clamps 0–0.9, so a vulnerability can pull
   *  resistance to 0 but not below. */
  resistances?: Partial<Record<DamageType, number>>;
  /** Natural armour (hide/scale/chitin): flat 0–100 defence used exactly like a worn armour
   *  layer (torso/head full value, limbs 0.3×), reduced by attacker `armorPen`; best-of with
   *  worn equipment. Omitted = bare flesh (0). Final reduction clamps 0–0.9. */
  naturalArmor?: number;
  /** Per-part natural armour — `target` = limbmap part id / limb group / `'all'`; `defense`
   *  adds absolute soak. `naturalArmor` above is the uniform-`'all'` sugar. */
  armorMods?: Array<{ target: string; defense: number }>;
  // ── CREATURE-COMBAT-OVERHAUL §2 variant ladder ────────────────────────────
  /** §2a per-spawn stat spread: when present, the named core stats roll uniformly in [min,max] at
   *  spawn (seeded), giving intra-tier individual variation; absent stats use the fixed `stats` value.
   *  Base creatures omit it (fixed stats); variants author a band centred on the tier baseline (±~5). */
  statRanges?: Partial<Record<'str' | 'dex' | 'con' | 'per', [number, number]>>;
  /** §2a per-spawn natural-armour spread, rolled like `statRanges`; absent = fixed `naturalArmor`. */
  naturalArmorRange?: [number, number];
  /** §2c lootpool id (database/lootpool.jsonc) — a geared humanoid draws a weapon/armour loadout at
   *  spawn (quality + condition rolled) and drops a subset on death. Omitted = unarmed/natural only. */
  lootPool?: string;
  /** §2b ladder metadata. `species` groups a creature's whole 5-tier ladder (every wolf variant shares
   *  species `"wolf"`); `tier` 1–5 is the power rung (5 = boss); `variantOf` links to the base creature
   *  id for Phase-3 lair escalation. A base creature is its own species, tier 1, no `variantOf`. */
  species?: string;
  tier?: number;
  variantOf?: string;
  /** Body-size multiplier (default 1.0). Scales blood/health pool at spawn and softly scales
   *  natural-weapon damage. Does NOT rescale the shared body-part HP table. */
  bodyScale?: number;
  /** Body plan from limbmap.jsonc (omitted = "humanoid"). Drives structure + hit locations;
   *  per-limb HP = bodyScale × the plan's default sizes. */
  limbMap?: string;
  /** Spawn-gate overrides. `spawnsInMountain`: may spawn on ANY mountain tile, even
   *  non-walkable rock (incorporeal dwellers that don't eat). `maxMountainDistance`: only
   *  spawn on normal land within this many tiles of a mountain (mountain-edge grazers). */
  spawnsInMountain?: boolean;
  maxMountainDistance?: number;
  /** When set, a LAIRED hostile: spawns only at tiles bearing the matching `lair` resource
   *  (resources.jsonc, lair:true) and only wanders/aggros within `lairRange` tiles of it.
   *  `hungerRate` = hunger multiplier (default 1); `foodOverflow` = 0–1 buffer that lowers
   *  the hunt threshold so a leashed predator hunts opportunistically. */
  lair?: string;
  lairRange?: number;
  hungerRate?: number;
  foodOverflow?: number;
  /** Ambient vocalisation archetype id (audio/manifest.ts CREATURE_SFX); shared across
   *  creatures. Backend reference only. Omitted = silent. */
  audio?: string;
}

type RawCreature = Record<string, unknown>;

/** Default `eats` for a creature that doesn't author its own list, by `diet`. */
function defaultEatsForDiet(diet: EntityDiet): FoodCategory[] {
  switch (diet) {
    case 'herbivore':
      return ['food'];
    case 'carnivore':
      return ['meat', 'organic'];
    case 'none':
      return [];
    case 'omnivore':
    default:
      return ['food', 'meat', 'organic'];
  }
}

function toDefinition(raw: RawCreature): CreatureDefinition {
  const rs = raw.stats as { str: number; dex: number; con: number; per: number };
  // MUST mirror baseVisionRange() in core/vision.ts (doubled sight range); fleeRange scales with it.
  const visionRange = Math.round(4 + rs.per * 1.3);
  const stats: CreatureStats = {
    str: rs.str,
    dex: rs.dex,
    con: rs.con,
    per: rs.per,
    strength: rs.str,
    health: rs.con * 5,
    speed: Math.floor(1.5 + rs.dex * 0.35),
    visionRange,
    fleeRange: Math.round(visionRange * 1.45)
  };
  const diet = (raw.diet as EntityDiet) ?? 'omnivore';
  const predator = (raw.predator as boolean) ?? false;
  return {
    id: raw.id as string,
    name: raw.name as string,
    entityClass: raw.entityClass as EntityClass,
    chars: resolveCharSpans((raw.charSpans ?? []) as CharSpan[]),
    fg: raw.fg as [number, number, number],
    bg: (raw.bg as [number, number, number]) ?? [0, 0, 0],
    stats,
    behaviour: raw.behaviour as EntityBehaviour,
    diet,
    predator,
    eats: (raw.eats as FoodCategory[] | undefined) ?? defaultEatsForDiet(diet),
    grazes: (raw.grazes as boolean | undefined) ?? diet === 'herbivore',
    intelligence: (raw.intelligence as EntityIntelligence) ?? 'primitive',
    nocturnalAggro: (raw.nocturnalAggro as boolean) ?? false,
    nightOnly: (raw.nightOnly as boolean) ?? false,
    pack: (raw.pack as [number, number]) ?? [1, 1],
    tameable: (raw.tameable as boolean) ?? false,
    tameResistance: (raw.tameResistance as number) ?? 0.5,
    mountable: (raw.mountable as boolean) ?? false,
    huntable: (raw.huntable as boolean) ?? false,
    canSteal: (raw.canSteal as boolean) ?? false,
    chargesWhenWounded: (raw.chargesWhenWounded as boolean) ?? false,
    territorial: (raw.territorial as boolean) ?? true,
    nightVision: (raw.nightVision as number) ?? 0,
    produces: raw.produces as CreatureProduces | undefined,
    carcassItemId: (raw.carcassItemId as string) ?? undefined,
    biomeWeights: (raw.biomeWeights as Record<string, number>) ?? {},
    lootTable: (raw.lootTable as CreatureLootEntry[]) ?? [],
    naturalWeapons: (raw.naturalWeapons as string[]) ?? [],
    armorMods:
      (raw.armorMods as Array<{ target: string; defense: number }> | undefined) ?? undefined,
    statRanges: (raw.statRanges as CreatureDefinition['statRanges'] | undefined) ?? undefined,
    naturalArmorRange: (raw.naturalArmorRange as [number, number] | undefined) ?? undefined,
    lootPool: (raw.lootPool as string | undefined) ?? undefined,
    species: (raw.species as string | undefined) ?? undefined,
    tier: (raw.tier as number | undefined) ?? undefined,
    variantOf: (raw.variantOf as string | undefined) ?? undefined,
    traits: (raw.traits as string[] | undefined) ?? undefined,
    resistances: (raw.resistances as Partial<Record<DamageType, number>> | undefined) ?? undefined,
    naturalArmor: (raw.naturalArmor as number | undefined) ?? undefined,
    bodyScale: (raw.bodyScale as number | undefined) ?? undefined,
    limbMap: (raw.limbMap as string | undefined) ?? undefined,
    spawnsInMountain: (raw.spawnsInMountain as boolean | undefined) ?? undefined,
    maxMountainDistance: (raw.maxMountainDistance as number | undefined) ?? undefined,
    lair: (raw.lair as string | undefined) ?? undefined,
    lairRange: (raw.lairRange as number | undefined) ?? undefined,
    hungerRate: (raw.hungerRate as number | undefined) ?? undefined,
    foodOverflow: (raw.foodOverflow as number | undefined) ?? undefined,
    audio: (raw.audio as string | undefined) ?? undefined
  };
}

/** All creature definitions, in DB order. */
export const CREATURES: CreatureDefinition[] = (creaturesData as unknown as RawCreature[]).map(
  toDefinition
);

const CREATURES_BY_ID: Map<string, CreatureDefinition> = new Map(CREATURES.map((c) => [c.id, c]));

export function getCreatureById(id: string): CreatureDefinition | undefined {
  return CREATURES_BY_ID.get(id);
}

export function getCreaturesByClass(entityClass: EntityClass): CreatureDefinition[] {
  return CREATURES.filter((c) => c.entityClass === entityClass);
}
