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
    | 'system';
  actor?: string; // Pawn ID or 'system'
  action: string;
  target?: string;
  location?: string;
  result: string;
  details?: Record<string, any>;
  severity: 'info' | 'success' | 'warning' | 'error' | 'critical';
}

// Enhanced Event System
export class EventSystem {
  private eventCooldowns: Map<string, number> = new Map();
  private eventHistory: string[] = [];
  private lastEventTurn = 0;

  generateEvent(gameState: any): { event: GameEvent; consequences: EventConsequence[] } | null {
    // Reduce frequency for more meaningful events
    if (gameState.turn - this.lastEventTurn < Math.floor(Math.random() * 3) + 2) return null;

    const availableEvents = this.getAvailableEvents(gameState);
    if (availableEvents.length === 0) return null;

    // Weighted selection with rarity modifiers
    const weightedEvents = availableEvents.map((event) => ({
      event,
      adjustedWeight: this.calculateAdjustedWeight(event, gameState)
    }));

    const totalWeight = weightedEvents.reduce((sum, item) => sum + item.adjustedWeight, 0);
    let random = Math.random() * totalWeight;

    for (const { event, adjustedWeight } of weightedEvents) {
      random -= adjustedWeight;
      if (random <= 0) {
        this.lastEventTurn = gameState.turn;
        if (event.triggers.cooldown) {
          this.eventCooldowns.set(event.id, gameState.turn + event.triggers.cooldown);
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
      const roll = Math.random();
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

    // Building modifiers
    if (event.triggers.requiredBuildings) {
      const hasAllBuildings = event.triggers.requiredBuildings.every(
        (building) => gameState.buildingCounts[building] > 0
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
    let newState = { ...gameState };

    // Apply resource effects
    if (consequence.effects.resources) {
      newState.item = newState.item.map((item: any) => {
        const resourceEffect = consequence.effects.resources![item.id];
        if (resourceEffect) {
          const change = this.rollBetween(resourceEffect.min, resourceEffect.max);
          const scaledChange = consequence.modifiers?.populationScaling
            ? Math.floor(change * Math.sqrt(newState.pawns.length))
            : change;
          return { ...item, amount: Math.max(0, item.amount + scaledChange) };
        }
        return item;
      });
    }

    // Apply pawn effects
    if (consequence.effects.pawnEffects) {
      const pawnEffect = consequence.effects.pawnEffects;
      const targetPawns = this.selectTargetPawns(pawnEffect, newState.pawns);

      targetPawns.forEach((pawn: any) => {
        // Health changes
        if (pawnEffect.effects.healthChange) {
          const change = this.rollBetween(
            pawnEffect.effects.healthChange.min,
            pawnEffect.effects.healthChange.max
          );
          pawn.state.health = Math.max(0, Math.min(100, pawn.state.health + change));
        }

        // Mood changes
        if (pawnEffect.effects.moodChange) {
          const change = this.rollBetween(
            pawnEffect.effects.moodChange.min,
            pawnEffect.effects.moodChange.max
          );
          pawn.state.mood = Math.max(0, Math.min(100, pawn.state.mood + change));
        }

        // Stat changes
        if (pawnEffect.effects.statChanges) {
          Object.entries(pawnEffect.effects.statChanges).forEach(([stat, range]) => {
            if (pawn.stats[stat] !== undefined) {
              const change = this.rollBetween(range.min, range.max);
              pawn.stats[stat] = Math.max(1, Math.min(20, pawn.stats[stat] + change));
            }
          });
        }

        // Injury and death chances
        if (pawnEffect.effects.injuryChance && Math.random() < pawnEffect.effects.injuryChance) {
          // TODO: Add injury system
          pawn.state.health = Math.max(10, pawn.state.health - 15);
        }

        if (pawnEffect.effects.deathChance && Math.random() < pawnEffect.effects.deathChance) {
          // TODO: Handle pawn death
          pawn.state.health = 0;
        }
      });
    }

    // Apply building effects
    if (consequence.effects.buildingEffects) {
      const buildingEffect = consequence.effects.buildingEffects;

      if (buildingEffect.destroyChance && Math.random() < buildingEffect.destroyChance) {
        const targetBuilding = buildingEffect.targetBuilding || 'house';
        if (newState.buildingCounts[targetBuilding] > 0) {
          newState.buildingCounts[targetBuilding]--;
        }
      }
    }

    return newState;
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
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private getRandomPawns(pawns: any[], count: number): any[] {
    const shuffled = [...pawns].sort(() => Math.random() - 0.5);
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

// Comprehensive Event Database
export const EVENT_DATABASE: GameEvent[] = [
  // Environmental Events
  {
    id: 'harsh_winter_storm',
    title: 'Harsh Winter Storm',
    description:
      'A severe blizzard batters your settlement for days. The cold seeps through every crack, and food stores dwindle as hunting becomes impossible.',
    category: 'weather',
    severity: 'major',
    rarity: 'uncommon',
    weight: 12,
    triggers: {
      minTurn: 8,
      populationRange: { min: 2, max: 100 },
      seasonSpecific: 'winter',
      cooldown: 15
    },
    consequences: [
      {
        id: 'food_shortage',
        description: 'Food consumption increases significantly due to the cold',
        probability: 0.9,
        effects: {
          resources: { food: { min: -25, max: -40 } }
        },
        modifiers: { populationScaling: true }
      },
      {
        id: 'health_decline',
        description: 'Some people fall ill from the extreme cold',
        probability: 0.6,
        effects: {
          pawnEffects: {
            targetType: 'percentage',
            percentage: 0.3,
            effects: {
              healthChange: { min: -15, max: -25 },
              moodChange: { min: -5, max: -10 }
            }
          }
        }
      },
      {
        id: 'building_damage',
        description: 'The storm damages some structures',
        probability: 0.4,
        effects: {
          buildingEffects: {
            damageChance: 0.3,
            targetBuilding: 'random',
            targetCount: 2
          }
        }
      }
    ]
  },

  // Discovery Events
  {
    id: 'ancient_library_ruins',
    title: 'Ancient Library Discovered',
    description:
      'Your explorers stumble upon the ruins of an ancient library. Weathered stone tablets and mysterious artifacts lie scattered among the rubble, whispering secrets of forgotten civilizations.',
    category: 'discovery',
    severity: 'moderate',
    rarity: 'rare',
    weight: 6,
    triggers: {
      minTurn: 20,
      populationRange: { min: 4, max: 100 },
      cooldown: 50
    },
    consequences: [
      {
        id: 'knowledge_cache',
        description: 'Scholars decipher valuable knowledge from the ruins',
        probability: 0.8,
        effects: {
          resources: { knowledge: { min: 40, max: 80 } },
          discoveryEffects: {
            advanceResearch: 'random_tech'
          }
        }
      },
      {
        id: 'ancient_wisdom',
        description: 'A scholar gains insight into ancient ways',
        probability: 0.3,
        effects: {
          pawnEffects: {
            targetType: 'random',
            count: 1,
            effects: {
              statChanges: {
                intelligence: { min: 1, max: 2 },
                wisdom: { min: 1, max: 2 }
              }
            }
          }
        }
      },
      {
        id: 'cursed_knowledge',
        description: 'Some knowledge comes with a terrible price',
        probability: 0.1,
        effects: {
          pawnEffects: {
            targetType: 'random',
            count: 1,
            effects: {
              moodChange: { min: -20, max: -30 },
              addTrait: ['cursed_knowledge']
            }
          }
        }
      }
    ]
  },

  // Wildlife Events
  {
    id: 'megafauna_migration',
    title: 'Great Beast Migration',
    description:
      'A herd of massive creatures thunders past your settlement. These ancient beasts could provide enormous amounts of food and materials, but hunting them is extremely dangerous.',
    category: 'wildlife',
    severity: 'major',
    rarity: 'epic',
    weight: 3,
    triggers: {
      minTurn: 30,
      populationRange: { min: 6, max: 50 },
      cooldown: 40
    },
    consequences: [
      {
        id: 'successful_hunt',
        description: 'Skilled hunters manage to bring down one of the great beasts',
        probability: 0.4,
        effects: {
          resources: {
            food: { min: 100, max: 200 },
            leather: { min: 50, max: 80 },
            bone: { min: 30, max: 50 }
          },
          pawnEffects: {
            targetType: 'random',
            count: 2,
            effects: {
              skillChanges: {
                hunting: { min: 2, max: 4 }
              },
              moodChange: { min: 10, max: 20 }
            }
          }
        }
      },
      {
        id: 'hunting_disaster',
        description: 'The hunt goes terribly wrong',
        probability: 0.3,
        effects: {
          pawnEffects: {
            targetType: 'random',
            count: 3,
            effects: {
              healthChange: { min: -30, max: -50 },
              injuryChance: 0.6,
              deathChance: 0.1
            }
          }
        }
      },
      {
        id: 'peaceful_observation',
        description: 'Your people simply observe the majestic creatures',
        probability: 0.3,
        effects: {
          pawnEffects: {
            targetType: 'all',
            effects: {
              moodChange: { min: 5, max: 10 }
            }
          },
          resources: { knowledge: { min: 10, max: 20 } }
        }
      }
    ]
  },

  // Social Events
  {
    id: 'refugee_caravan',
    title: 'Refugee Caravan Arrives',
    description:
      'A group of desperate refugees arrives at your gates, fleeing from some distant catastrophe. They carry little but stories of horror and loss, seeking sanctuary in your growing settlement.',
    category: 'social',
    severity: 'moderate',
    rarity: 'common',
    weight: 15,
    triggers: {
      minTurn: 12,
      populationRange: { min: 4, max: 30 },
      cooldown: 8
    },
    consequences: [
      {
        id: 'population_boost',
        description: 'Some refugees decide to join your settlement',
        probability: 0.7,
        effects: {
          resources: {
            food: { min: -20, max: -35 } // Initial strain on resources
          }
          // TODO: Add actual population increase when pawn generation is improved
        }
      },
      {
        id: 'disease_outbreak',
        description: 'The refugees bring disease with them',
        probability: 0.2,
        effects: {
          pawnEffects: {
            targetType: 'percentage',
            percentage: 0.4,
            effects: {
              healthChange: { min: -20, max: -35 },
              moodChange: { min: -10, max: -15 }
            }
          }
        }
      },
      {
        id: 'valuable_information',
        description: 'Refugees share knowledge of distant lands',
        probability: 0.5,
        effects: {
          resources: { knowledge: { min: 15, max: 30 } },
          discoveryEffects: {
            newLocation: 'refugee_homeland'
          }
        }
      }
    ]
  },

  // Disaster Events
  {
    id: 'earthquake',
    title: 'Devastating Earthquake',
    description:
      'The ground shakes violently as a powerful earthquake rocks your settlement. Buildings creak and groan, people scream in terror, and the very earth seems to rebel against your presence.',
    category: 'disaster',
    severity: 'critical',
    rarity: 'rare',
    weight: 4,
    triggers: {
      minTurn: 25,
      populationRange: { min: 8, max: 100 },
      cooldown: 60
    },
    consequences: [
      {
        id: 'structural_collapse',
        description: 'Multiple buildings suffer severe damage or collapse entirely',
        probability: 0.9,
        effects: {
          buildingEffects: {
            destroyChance: 0.4,
            targetBuilding: 'random',
            targetCount: 4
          }
        }
      },
      {
        id: 'casualties',
        description: 'People are injured or killed in the collapse',
        probability: 0.7,
        effects: {
          pawnEffects: {
            targetType: 'percentage',
            percentage: 0.6,
            effects: {
              healthChange: { min: -40, max: -70 },
              injuryChance: 0.8,
              deathChance: 0.15
            }
          }
        }
      },
      {
        id: 'resource_loss',
        description: 'Stored resources are buried or destroyed',
        probability: 0.8,
        effects: {
          resources: {
            food: { min: -50, max: -80 },
            wood: { min: -30, max: -60 },
            stone: { min: -20, max: -40 }
          }
        }
      },
      {
        id: 'underground_discovery',
        description: 'The earthquake reveals hidden underground chambers',
        probability: 0.15,
        effects: {
          resources: {
            metal: { min: 20, max: 50 },
            knowledge: { min: 30, max: 60 }
          },
          discoveryEffects: {
            newLocation: 'underground_caves'
          }
        }
      }
    ]
  },

  // Trading Placeholder Events
  {
    id: 'merchant_guild_arrival',
    title: 'Merchant Guild Caravan',
    description:
      "A well-organized merchant caravan from the Guild arrives with exotic goods and hungry purses. Their leader, a shrewd trader, eyes your settlement's potential.",
    category: 'opportunity',
    severity: 'minor',
    rarity: 'common',
    weight: 10,
    triggers: {
      minTurn: 15,
      populationRange: { min: 5, max: 100 },
      cooldown: 12
    },
    consequences: [
      {
        id: 'trading_opportunity',
        description: 'A valuable trading opportunity presents itself',
        probability: 1.0,
        effects: {
          tradingPlaceholder: {
            traderType: 'merchant',
            goodsOffered: ['exotic_spices', 'fine_cloth', 'quality_tools', 'rare_metals'],
            goodsWanted: ['food', 'leather', 'wood', 'crafted_goods'],
            priceModifier: 1.2
          }
        }
      }
    ]
  },

  // Combat Placeholder Events
  {
    id: 'bandit_raid',
    title: 'Bandit Raid',
    description:
      'A group of desperate bandits has spotted your settlement and decided it looks like easy pickings. They approach under cover of darkness, weapons ready.',
    category: 'disaster',
    severity: 'major',
    rarity: 'uncommon',
    weight: 8,
    triggers: {
      minTurn: 18,
      populationRange: { min: 6, max: 100 },
      cooldown: 20
    },
    consequences: [
      {
        id: 'bandit_combat',
        description: 'Your settlement is attacked by bandits',
        probability: 1.0,
        effects: {
          combatPlaceholder: {
            enemyType: 'bandits',
            threatLevel: 'moderate',
            enemyCount: { min: 4, max: 8 },
            lootPotential: ['weapons', 'food', 'metal', 'stolen_goods']
          }
        }
      }
    ]
  }
];

export const eventSystem = new EventSystem();
