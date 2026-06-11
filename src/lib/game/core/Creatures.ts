import creaturesData from '../database/creatures.jsonc';
import { resolveCharSpans, type CharSpan } from './Terrains';

/**
 * Creatures.ts — Entity (mob + animal) definitions loaded from the DB.
 *
 * ENTITIES_SPAWNING spec, Phase A. All rosters live in
 * `database/creatures.jsonc` — never hardcode a creature in a service. This
 * module loads that file, resolves glyph charSpans once at startup, and exposes
 * typed lookups. EntityService consumes these definitions to spawn `Mob`s.
 */

export type EntityClass = 'mob' | 'animal';
export type EntityBehaviour = 'passive' | 'neutral' | 'aggressive';
export type EntityDiet = 'herbivore' | 'carnivore' | 'omnivore';
/**
 * What an entity can eat, in PRIORITY order (it tries the first kind it can find before
 * falling back to the next):
 * - `forage` — wild edible forage nodes (berry bushes, mushrooms — any forage resource that
 *   yields a food item). The "actual food" omnivores prefer.
 * - `grass`  — graze-able grass tiles. Herbivore staple.
 * - `carcass`— corpses on the ground.
 * - `prey`   — live huntable animals.
 */
export type FoodKind = 'forage' | 'grass' | 'carcass' | 'prey';
/**
 * Governs how deeply an entity uses game systems.
 * - `primitive`: food-only needs, eats directly from tile/corpse (no item spawns), no mood.
 * - `sapient`:   full pawn-equivalent systems — abilities, mood, cooked food, beverages.
 *   Sapient creatures spawn as `Pawn` instances (isPlayerControlled: false), not as `Mob`.
 */
export type EntityIntelligence = 'primitive' | 'sapient';

export interface CreatureStats {
  // ── Primary attributes (set in creatures.jsonc) ───────────────────────
  /** Physical power → melee damage, carry weight. */
  str: number;
  /** Agility → move speed, dodge, hit chance. */
  dex: number;
  /** Durability → maxHealth (= con × 5). */
  con: number;
  /** Awareness → vision range (= round(2 + per × 0.65)). */
  per: number;
  // ── Derived (computed in toDefinition(); do not set in JSON) ─────────
  /** = con × 5 */
  health: number;
  /** = floor(1.5 + dex × 0.35) — tiles per second */
  speed: number;
  /** = round(2 + per × 0.65) — tile detection radius */
  visionRange: number;
  /** = round(visionRange × 1.45) */
  fleeRange: number;
  /** Alias for str; used by legacy spawn code. */
  strength: number;
}

/** A natural attack this creature can make in melee (claws, bite, hoof, fists…). */
export interface NaturalWeapon {
  /** Descriptive id shown in logs, e.g. 'bite', 'claw', 'hoof', 'fists'. */
  id: string;
  damageType: 'cutting' | 'piercing' | 'blunt';
  /** Base damage before strength scaling. Scaled by str / STAT_SCALE in Combat. */
  baseDamage: number;
  /** Knockdown multiplier; only relevant for blunt weapons (default 1.0 for blunt, 0 otherwise). */
  bluntMod?: number;
}

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
  /** What this creature eats — gates only which foods it may consume, not aggression. */
  diet: EntityDiet;
  /**
   * Concrete, priority-ordered food sources this creature will seek when hungry. Authored
   * in creatures.jsonc as `eats`; when absent it is derived from `diet` (+`predator`):
   *   herbivore → [grass, forage]; carnivore → [prey, carcass];
   *   omnivore  → [forage, carcass, (prey if predator), grass]  (real food first, grass last).
   */
  eats: FoodKind[];
  /**
   * True if this creature hunts and frightens prey. This — not `diet` — is the
   * sole flag that marks something as a threat: a passive omnivore (chicken)
   * is not a predator, while a neutral omnivore (bear) is.
   */
  predator: boolean;
  /**
   * Depth of systems this creature uses.
   * `primitive` = animals; `sapient` = humanoid NPCs (spawn as Pawn, not Mob).
   */
  intelligence: EntityIntelligence;
  nocturnalAggro: boolean;
  /** Only spawns at night (e.g. shadow_wraith). */
  nightOnly: boolean;
  /** Inclusive pack-size range to spawn together. */
  pack: [number, number];
  tameable: boolean;
  /** 1.0 = easy to tame, 0.3 = hard. Used in Phase C. */
  tameResistance: number;
  mountable: boolean;
  /**
   * When true, predatory mobs will hunt this creature and it will flee from them.
   * Typically set on passive/neutral animals; absent on hostile mobs.
   */
  huntable: boolean;
  canSteal: boolean;
  chargesWhenWounded: boolean;
  /** Husbandry product (Phase D), when present. */
  produces?: CreatureProduces;
  /**
   * Item ID of the carcass dropped when this creature dies.
   * Maps to an item in items.jsonc (e.g. "wolf_carcass").
   * Absent on creatures that leave no physical remains (shadow_wraith, etc.).
   */
  carcassItemId?: string;
  /** biome id → relative spawn weight (terrains.jsonc biome ids). */
  biomeWeights: Record<string, number>;
  lootTable: CreatureLootEntry[];
  /** Natural melee attacks available to this creature. */
  naturalWeapons: NaturalWeapon[];
}

type RawCreature = Record<string, unknown>;

/** Default food priority when a creature doesn't author an explicit `eats` list. */
function defaultEats(diet: EntityDiet, predator: boolean): FoodKind[] {
  switch (diet) {
    case 'herbivore':
      return ['grass', 'forage'];
    case 'carnivore':
      return ['prey', 'carcass'];
    case 'omnivore':
    default:
      // Real food (berries/mushrooms) and carcasses first; predatory omnivores also hunt;
      // grass is the last-resort fallback so they don't starve when nothing else is near.
      return predator ? ['forage', 'carcass', 'prey', 'grass'] : ['forage', 'carcass', 'grass'];
  }
}

function toDefinition(raw: RawCreature): CreatureDefinition {
  const rs = raw.stats as { str: number; dex: number; con: number; per: number };
  const visionRange = Math.round(2 + rs.per * 0.65);
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
    eats: (raw.eats as FoodKind[] | undefined) ?? defaultEats(diet, predator),
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
    produces: raw.produces as CreatureProduces | undefined,
    carcassItemId: (raw.carcassItemId as string) ?? undefined,
    biomeWeights: (raw.biomeWeights as Record<string, number>) ?? {},
    lootTable: (raw.lootTable as CreatureLootEntry[]) ?? [],
    naturalWeapons: (raw.naturalWeapons as NaturalWeapon[]) ?? []
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
