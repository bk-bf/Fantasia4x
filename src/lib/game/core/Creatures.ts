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
 * Governs how deeply an entity uses game systems.
 * - `primitive`: food-only needs, eats directly from tile/corpse (no item spawns), no mood.
 * - `sapient`:   full pawn-equivalent systems — abilities, mood, cooked food, beverages.
 *   Sapient creatures spawn as `Pawn` instances (isPlayerControlled: false), not as `Mob`.
 */
export type EntityIntelligence = 'primitive' | 'sapient';

export interface CreatureStats {
    health: number;
    strength: number;
    speed: number; // tiles per in-game second
    visionRange: number; // tiles — detection radius
    fleeRange: number;   // tiles — stop fleeing once all threats are beyond this distance
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
    /** What this creature eats — drives feeding FSM (Phase B hunger system). */
    diet: EntityDiet;
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
    /** biome id → relative spawn weight (terrains.jsonc biome ids). */
    biomeWeights: Record<string, number>;
    lootTable: CreatureLootEntry[];
}

type RawCreature = Record<string, unknown>;

function toDefinition(raw: RawCreature): CreatureDefinition {
    return {
        id: raw.id as string,
        name: raw.name as string,
        entityClass: raw.entityClass as EntityClass,
        chars: resolveCharSpans((raw.charSpans ?? []) as CharSpan[]),
        fg: raw.fg as [number, number, number],
        bg: (raw.bg as [number, number, number]) ?? [0, 0, 0],
        stats: raw.stats as CreatureStats,
        behaviour: raw.behaviour as EntityBehaviour,
        diet: (raw.diet as EntityDiet) ?? 'omnivore',
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
        biomeWeights: (raw.biomeWeights as Record<string, number>) ?? {},
        lootTable: (raw.lootTable as CreatureLootEntry[]) ?? []
    };
}

/** All creature definitions, in DB order. */
export const CREATURES: CreatureDefinition[] = (
    creaturesData as unknown as RawCreature[]
).map(toDefinition);

const CREATURES_BY_ID: Map<string, CreatureDefinition> = new Map(
    CREATURES.map((c) => [c.id, c])
);

export function getCreatureById(id: string): CreatureDefinition | undefined {
    return CREATURES_BY_ID.get(id);
}

export function getCreaturesByClass(entityClass: EntityClass): CreatureDefinition[] {
    return CREATURES.filter((c) => c.entityClass === entityClass);
}
