import eventData from '../database/events.jsonc';
import { ticksFromSeconds } from './time';
import { rng } from './rng';
import { addToStockpileZone, consumeFromStockpiles } from './GameState';
export interface EventConsequence {
  id: string;
  description: string;
  probability: number; // 0.0 to 1.0
  effects: {
    resources?: Record<string, { min: number; max: number }>;
    pawnEffects?: {
      targetType: 'all' | 'random' | 'specific' | 'percentage';
      count?: number;
      percentage?: number; // For percentage-based targeting
      effects: {
        healthChange?: { min: number; max: number };
        moodChange?: { min: number; max: number };
        statChanges?: Record<string, { min: number; max: number }>;
        skillChanges?: Record<string, { min: number; max: number }>;
        addTrait?: string[];
        removeTrait?: string[];
        injuryChance?: number; // 0.0 to 1.0
        deathChance?: number; // 0.0 to 1.0 (very low for most events)
      };
    };
    buildingEffects?: {
      damageChance?: number;
      damageAmount?: { min: number; max: number };
      destroyChance?: number;
      targetBuilding?: string | 'random';
      targetCount?: number;
    };
    discoveryEffects?: {
      newLocation?: string;
      advanceResearch?: string;
      unlockBuilding?: string;
      unlockRecipe?: string;
    };
    tradingPlaceholder?: {
      traderType: 'merchant' | 'nomads' | 'nobles' | 'smugglers';
      goodsOffered: string[];
      goodsWanted: string[];
      priceModifier: number; // Multiplier for standard prices
    };
    combatPlaceholder?: {
      enemyType: 'bandits' | 'wildlife' | 'monsters' | 'rival_faction';
      threatLevel: 'minor' | 'moderate' | 'major' | 'extreme';
      enemyCount: { min: number; max: number };
      lootPotential: string[];
    };
  };
  modifiers?: {
    populationScaling?: boolean; // Scale effects with population
    seasonalModifier?: Record<string, number>; // Different effects per season
    buildingModifiers?: Record<string, number>; // Building presence affects outcome
    requiresRoll?: boolean; // If true, requires additional skill/stat rolls
  };
}

export interface GameEvent {
  id: string;
  title: string;
  description: string;
  category:
    | 'environmental'
    | 'discovery'
    | 'social'
    | 'disaster'
    | 'opportunity'
    | 'wildlife'
    | 'weather'
    | 'supernatural'
    | 'political';
  severity: 'trivial' | 'minor' | 'moderate' | 'major' | 'critical' | 'catastrophic';
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  weight: number;
  consequences: EventConsequence[];
  triggers: {
    minTurn?: number;
    maxTurn?: number;
    requiredBuildings?: string[];
    requiredResources?: Record<string, number>;
    populationRange?: { min: number; max: number };
    seasonSpecific?: 'spring' | 'summer' | 'autumn' | 'winter';
    cooldown?: number;
    prerequisites?: string[]; // Other events that must have occurred
    mutuallyExclusive?: string[]; // Events that prevent this one
  };
}

export interface EventLog {
  id: string;
  eventId: string;
  turn: number;
  title: string;
  description: string;
  choiceMade?: string;
  outcome: string;
  timestamp: Date;
}

export interface CombatTurnEntry {
  turn: number;
  attackerName: string;
  defenderName: string;
  hit: boolean;
  damage?: number;
  injury?: string;
  knockdown?: boolean;
  crit?: boolean;
  /** Attack used this swing (weapon name / natural-weapon id, e.g. 'bite', 'kick'). */
  weapon?: string;
  bodyPart?: string;
  damageType?: string;
  partMaxHp?: number;
  partRemainingHp?: number;
  bleeding?: boolean;
  /** Wound this swing inflicted: kind (cut | fracture | puncture | crush | burn) + severity. */
  woundType?: string;
  woundSeverity?: 'minor' | 'serious' | 'critical' | 'destroyed';
}

export interface ActivityLogEntry {
  id: string;
  turn: number;
  timestamp: Date;
  type:
    | 'work'
    | 'building'
    | 'crafting'
    | 'event'
    | 'pawn_action'
    | 'research'
    | 'exploration'
    | 'system'
    | 'combat'
    | 'entity'
    // Diagnostic categories (unified logging): low-volume always-on (job, perf) +
    // high-volume verbose traces (ai, needs) gated behind --debug/--profiler.
    | 'ai'
    | 'needs'
    | 'job'
    | 'perf';
  actor?: string; // Pawn ID or 'system'
  action: string;
  target?: string;
  location?: string;
  result: string;
  details?: Record<string, any>;
  severity: 'info' | 'success' | 'warning' | 'error' | 'critical';
  /** Entity IDs involved — used for click-to-jump on the map. */
  entityIds?: string[];
  /** Map coordinates for camera focus. */
  focusX?: number;
  focusY?: number;
  /** Per-turn combat breakdown — shown when expanding a combat log entry. */
  combatBreakdown?: CombatTurnEntry[];
}

/** Log categories = the `ActivityLogEntry.type` union — the single dimension the unified log
 *  pipeline routes/filters on (in-game tab + per-category `.debug/<category>.log` agent files). */
export type LogCategory = ActivityLogEntry['type'];

// Enhanced Event System
export class EventSystem {
  private eventCooldowns: Map<string, number> = new Map();
  private eventHistory: string[] = [];
  private lastEventTurn = 0;

  generateEvent(gameState: any): { event: GameEvent; consequences: EventConsequence[] } | null {
    // Minimum gap between events (in-game seconds; TURNS_PER_DAY = 300/day). 90–180s ≈ one event
    // every ~½ in-game day → a couple per day. The early-return keeps the per-tick cost ~nil between
    // events (the candidate scan only runs once the gap elapses). Tunable.
    if (gameState.turn - this.lastEventTurn < ticksFromSeconds(90 + Math.floor(rng.random() * 90)))
      return null;

    const availableEvents = this.getAvailableEvents(gameState);
    if (availableEvents.length === 0) return null;

    // Weighted selection with rarity modifiers
    const weightedEvents = availableEvents.map((event) => ({
      event,
      adjustedWeight: this.calculateAdjustedWeight(event, gameState)
    }));

    const totalWeight = weightedEvents.reduce((sum, item) => sum + item.adjustedWeight, 0);
    let random = rng.random() * totalWeight;

    for (const { event, adjustedWeight } of weightedEvents) {
      random -= adjustedWeight;
      if (random <= 0) {
        this.lastEventTurn = gameState.turn;
        if (event.triggers.cooldown) {
          this.eventCooldowns.set(
            event.id,
            gameState.turn + ticksFromSeconds(event.triggers.cooldown)
          );
        }
        this.eventHistory.push(event.id);

        // Roll consequences
        const rolledConsequences = this.rollConsequences(event, gameState);
        return { event, consequences: rolledConsequences };
      }
    }

    return null;
  }

  private rollConsequences(event: GameEvent, gameState: any): EventConsequence[] {
    const rolledConsequences: EventConsequence[] = [];

    for (const consequence of event.consequences) {
      const roll = rng.random();
      if (roll <= consequence.probability) {
        rolledConsequences.push(consequence);
      }
    }

    // Ensure at least one consequence for major+ events
    if (
      rolledConsequences.length === 0 &&
      ['major', 'critical', 'catastrophic'].includes(event.severity)
    ) {
      const forcedConsequence = event.consequences[0]; // Take first as fallback
      if (forcedConsequence) {
        rolledConsequences.push(forcedConsequence);
      }
    }

    return rolledConsequences;
  }

  private calculateAdjustedWeight(event: GameEvent, gameState: any): number {
    let weight = event.weight;

    // Rarity modifiers
    const rarityMultipliers = {
      common: 1.0,
      uncommon: 0.7,
      rare: 0.4,
      epic: 0.2,
      legendary: 0.05
    };
    weight *= rarityMultipliers[event.rarity];

    // Population scaling
    const population = gameState.pawns.length;
    if (event.category === 'social' && population > 5) {
      weight *= 1.5; // More social events with larger populations
    }
    if (event.category === 'disaster' && population > 10) {
      weight *= 1.3; // More disasters with larger settlements
    }

    // Building modifiers — buildings are physical PlacedBuilding[] now (the `buildingCounts` map is gone).
    if (event.triggers.requiredBuildings) {
      const hasAllBuildings = event.triggers.requiredBuildings.every((building) =>
        (gameState.buildings ?? []).some(
          (b: any) => b.type === building && b.status === 'complete'
        )
      );
      if (hasAllBuildings) {
        weight *= 2.0; // Double chance if all required buildings present
      }
    }

    return weight;
  }

  processEventConsequences(consequences: EventConsequence[], gameState: any): any {
    let newState = { ...gameState };

    for (const consequence of consequences) {
      newState = this.applyConsequence(consequence, newState);
    }

    return newState;
  }

  private applyConsequence(consequence: EventConsequence, gameState: any): any {
    let newState = gameState;

    // Resource effects — ADR-016: against the physical stockpile (these helpers return new state).
    if (consequence.effects.resources) {
      for (const [itemId, resourceEffect] of Object.entries(consequence.effects.resources)) {
        const change = this.rollBetween((resourceEffect as any).min, (resourceEffect as any).max);
        const scaledChange = consequence.modifiers?.populationScaling
          ? Math.floor(change * Math.sqrt(newState.pawns.length))
          : change;
        if (scaledChange > 0) {
          newState = addToStockpileZone(newState, null, { [itemId]: scaledChange });
        } else if (scaledChange < 0) {
          newState = consumeFromStockpiles(newState, { [itemId]: -scaledChange });
        }
      }
    }

    // Pawn effects — immutable (events are NOT a hot per-tick phase, so ADR-002 immutability holds:
    // build new pawn objects rather than mutating live ones). mood/stat are real; `state.health` is
    // the legacy scalar (combat uses limbs). Lethal/injury effects need killPawn (systems layer),
    // which core/Events cannot reach — injury is applied as bounded legacy-health damage; deathChance
    // is intentionally NOT applied here (a lethal-events pass is a follow-up).
    if (consequence.effects.pawnEffects) {
      const pawnEffect = consequence.effects.pawnEffects;
      const targetIds = new Set(
        this.selectTargetPawns(pawnEffect, newState.pawns).map((p: any) => p.id)
      );
      if (targetIds.size > 0) {
        const e = pawnEffect.effects;
        newState = {
          ...newState,
          pawns: newState.pawns.map((pawn: any) => {
            if (!targetIds.has(pawn.id)) return pawn;
            let state = pawn.state;
            if (e.moodChange) {
              const v = this.clamp(state.mood + this.rollBetween(e.moodChange.min, e.moodChange.max), 0, 100);
              state = { ...state, mood: v };
            }
            if (e.healthChange) {
              const v = this.clamp((state.health ?? 100) + this.rollBetween(e.healthChange.min, e.healthChange.max), 0, 100);
              state = { ...state, health: v };
            }
            if (e.injuryChance && rng.random() < e.injuryChance) {
              state = { ...state, health: Math.max(10, (state.health ?? 100) - 15) };
            }
            let stats = pawn.stats;
            if (e.statChanges) {
              stats = { ...stats };
              for (const [stat, range] of Object.entries(e.statChanges)) {
                if (stats[stat] !== undefined)
                  stats[stat] = this.clamp(stats[stat] + this.rollBetween((range as any).min, (range as any).max), 1, 20);
              }
            }
            return state === pawn.state && stats === pawn.stats ? pawn : { ...pawn, state, stats };
          })
        };
      }
    }

    // Building effects — immutable, against physical PlacedBuilding[]. Damage/destroy reduce a target
    // building's structural `condition` (destroy → 0). NOTE: this wrecks the building in place; full
    // removal + footprint clear (BuildingService) belongs to a higher layer — a follow-up.
    const be = consequence.effects.buildingEffects;
    if (be) {
      const targetType = be.targetBuilding;
      const candidates = (newState.buildings ?? []).filter(
        (b: any) =>
          b.status === 'complete' &&
          (!targetType || targetType === 'random' || b.type === targetType)
      );
      if (candidates.length > 0) {
        const n = Math.min(be.targetCount ?? 1, candidates.length);
        const chosen = new Set(this.getRandomPawns(candidates, n).map((b: any) => b.id));
        newState = {
          ...newState,
          buildings: newState.buildings.map((b: any) => {
            if (!chosen.has(b.id)) return b;
            const cur = b.condition ?? 100;
            if (be.destroyChance && rng.random() < be.destroyChance) return { ...b, condition: 0 };
            if (be.damageChance && rng.random() < be.damageChance) {
              const dmg = be.damageAmount
                ? this.rollBetween(be.damageAmount.min, be.damageAmount.max)
                : 10;
              return { ...b, condition: Math.max(0, cur - dmg) };
            }
            return b;
          })
        };
      }
    }

    return newState;
  }

  private clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
  }

  private selectTargetPawns(pawnEffect: any, pawns: any[]): any[] {
    switch (pawnEffect.targetType) {
      case 'all':
        return [...pawns];
      case 'random':
        const count = pawnEffect.count || 1;
        return this.getRandomPawns(pawns, count);
      case 'percentage':
        const percentage = pawnEffect.percentage || 0.1;
        const targetCount = Math.max(1, Math.floor(pawns.length * percentage));
        return this.getRandomPawns(pawns, targetCount);
      default:
        return [];
    }
  }

  private rollBetween(min: number, max: number): number {
    return Math.floor(rng.random() * (max - min + 1)) + min;
  }

  private getRandomPawns(pawns: any[], count: number): any[] {
    const shuffled = [...pawns].sort(() => rng.random() - 0.5);
    return shuffled.slice(0, Math.min(count, pawns.length));
  }

  private getAvailableEvents(gameState: any): GameEvent[] {
    return EVENT_DATABASE.filter((event) => {
      // Check cooldown
      const cooldownEnd = this.eventCooldowns.get(event.id);
      if (cooldownEnd && gameState.turn < cooldownEnd) return false;

      // Check turn requirements
      if (event.triggers.minTurn && gameState.turn < event.triggers.minTurn) return false;
      if (event.triggers.maxTurn && gameState.turn > event.triggers.maxTurn) return false;

      // Check population requirements
      const population = gameState.pawns.length;
      if (event.triggers.populationRange) {
        if (
          population < event.triggers.populationRange.min ||
          population > event.triggers.populationRange.max
        )
          return false;
      }

      // Check prerequisites
      if (event.triggers.prerequisites) {
        const hasPrerequisites = event.triggers.prerequisites.every((prereq) =>
          this.eventHistory.includes(prereq)
        );
        if (!hasPrerequisites) return false;
      }

      // Check mutual exclusivity
      if (event.triggers.mutuallyExclusive) {
        const hasConflict = event.triggers.mutuallyExclusive.some((exclusive) =>
          this.eventHistory.includes(exclusive)
        );
        if (hasConflict) return false;
      }

      return true;
    });
  }
}

export const eventSystem = new EventSystem();

// Event data loaded from database
export const EVENT_DATABASE = eventData as unknown as GameEvent[];
