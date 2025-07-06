// Locations.ts - Complete Location Database
import type { Location } from '$lib/game/core/types';

// LOCATIONS DATABASE - Complete Resource Integration
export const LOCATIONS_DATABASE: Location[] = [
  // TIER 0 - STARTING LOCATIONS (Always Available)
  {
    id: 'starting_plains',
    name: 'Starting Plains',
    description: 'Gentle grasslands where your civilization first took root',
    type: 'plains',
    tier: 0,
    rarity: 'common',
    discovered: true,
    
    availableResources: {
      tier0: [
        // Basic wood types
        'pine_wood', 'fir_wood',
        // Basic food
        'wild_berries', 'wild_oats', 'wild_barley',
        // Basic animals
        'rabbit_carcass',
        // Basic materials
        'plant_fiber', 'common_clay',
        // Basic stone
        'sandstone', 'flint'
      ],
      tier1: [],
      tier2: []
    },
    
    workModifiers: {
      hunting: 1.2,
      foraging: 1.3,
      farming: 1.1
    },
    
    explorationRequirements: {},
    hazards: [],
    specialFeatures: ['fertile_soil'],
    emoji: '🌾',
    color: '#8BC34A'
  },

  {
    id: 'nearby_hills',
    name: 'Nearby Hills',
    description: 'Rolling hills visible from your settlement with scattered stones',
    type: 'hills',
    tier: 0,
    rarity: 'common',
    discovered: false,
    
    availableResources: {
      tier0: [
        // Stone types
        'sandstone', 'limestone', 'flint',
        // Wood
        'pine_wood', 'fir_wood',
        // Plants
        'herbs', 'plant_fiber'
      ],
      tier1: [],
      tier2: []
    },
    
    workModifiers: {
      mining: 1.3,
      stoneworking: 1.2
    },
    
    explorationRequirements: {
      population: 3,
      tools: ['stone_tools']
    },
    
    hazards: ['loose_rocks'],
    specialFeatures: ['stone_quarry'],
    emoji: '⛰️',
    color: '#8D6E63'
  },

  // TIER 1 - INTERMEDIATE LOCATIONS
  {
    id: 'old_forest',
    name: 'Old Forest',
    description: 'Ancient woodland with towering oaks and hidden groves',
    type: 'forest',
    tier: 1,
    rarity: 'uncommon',
    discovered: false,
    
    availableResources: {
      tier0: [
        // Basic woods
        'pine_wood', 'fir_wood',
        // Basic food
        'wild_berries'
      ],
      tier1: [
        // Advanced woods
        'oak_wood', 'ash_wood', 'birch_wood',
        // Advanced animals
        'deer_carcass',
        // Advanced plants
        'rare_herbs', 'medicinal_plants',
        // Tree products
        'tree_sap', 'oak_bark'
      ],
      tier2: []
    },
    
    workModifiers: {
      woodcutting: 1.8,
      hunting: 1.1,
      herbalism: 1.6
    },
    
    explorationRequirements: {
      population: 5,
      tools: ['bronze_axe'],
      research: ['advanced_forestry']
    },
    
    hazards: ['wild_animals', 'getting_lost'],
    specialFeatures: ['ancient_tree', 'hidden_grove'],
    emoji: '🌲',
    color: '#2E7D32'
  },

  {
    id: 'mountain_foothills',
    name: 'Mountain Foothills',
    description: 'Rocky slopes leading to the great mountains, rich in minerals',
    type: 'mountains',
    tier: 1,
    rarity: 'uncommon',
    discovered: false,
    
    availableResources: {
      tier0: [
        // Basic stones
        'granite', 'sandstone', 'limestone', 'flint'
      ],
      tier1: [
        // Ores
        'copper_ore', 'tin_ore', 'iron_ore',
        // Fuel
        'charcoal'
      ],
      tier2: []
    },
    
    workModifiers: {
      mining: 2.0,
      stoneworking: 1.5
    },
    
    explorationRequirements: {
      population: 8,
      tools: ['copper_pick', 'bronze_tools'],
      research: ['basic_metallurgy']
    },
    
    hazards: ['rockslides', 'cave_ins'],
    specialFeatures: ['mineral_vein', 'natural_caves'],
    emoji: '🏔️',
    color: '#424242'
  },

  {
    id: 'river_valley',
    name: 'River Valley',
    description: 'Fertile valley carved by a meandering river',
    type: 'river',
    tier: 1,
    rarity: 'uncommon',
    discovered: false,
    
    availableResources: {
      tier0: [
        // Fish
        'common_carp',
        // Clay
        'common_clay'
      ],
      tier1: [
        // Better fish
        'river_trout',
        // Advanced clay
        'fire_clay',
        // River materials
        'river_stones', 'water_plants'
      ],
      tier2: []
    },
    
    workModifiers: {
      fishing: 2.5,
      farming: 1.8,
      pottery: 1.4
    },
    
    explorationRequirements: {
      population: 6,
      tools: ['fishing_gear'],
      research: ['fishing_techniques']
    },
    
    hazards: ['flooding', 'river_predators'],
    specialFeatures: ['rich_fishing', 'clay_deposits'],
    emoji: '🏞️',
    color: '#4FC3F7'
  },

  {
    id: 'ancient_ruins',
    name: 'Ancient Ruins',
    description: 'Crumbling structures from a long-lost civilization',
    type: 'ruins',
    tier: 1,
    rarity: 'rare',
    discovered: false,
    
    availableResources: {
      tier0: [],
      tier1: [
        // Processed materials
        'worked_stone', 'ancient_metals',
        // Research materials
        'ancient_ink'
      ],
      tier2: [
        // Magical/rare
        'mysterious_artifacts', 'ancient_knowledge', 'magical_components'
      ]
    },
    
    workModifiers: {
      archaeology: 2.0,
      research: 1.5
    },
    
    explorationRequirements: {
      population: 10,
      tools: ['bronze_tools'],
      research: ['scholarly_methods']
    },
    
    hazards: ['unstable_structures', 'ancient_traps', 'cursed_artifacts'],
    specialFeatures: ['ancient_library', 'hidden_chambers', 'magical_inscriptions'],
    emoji: '🏛️',
    color: '#9C27B0'
  },

  {
    id: 'dangerous_swampland',
    name: 'Dangerous Swampland',
    description: 'Treacherous wetlands hiding rare resources and dangerous creatures',
    type: 'swamp',
    tier: 1,
    rarity: 'uncommon',
    discovered: false,
    
    availableResources: {
      tier0: [
        // Basic swamp resources
        'common_clay'
      ],
      tier1: [
        // Swamp animals
        'wild_boar_carcass',
        // Special clay
        'porcelain_clay',
        // Swamp plants
        'medicinal_plants', 'rare_herbs',
        // Special materials
        'peat', 'bog_iron'
      ],
      tier2: []
    },
    
    workModifiers: {
      hunting: 0.8,
      herbalism: 1.8,
      pottery: 1.6
    },
    
    explorationRequirements: {
      population: 8,
      tools: ['bronze_weapons'],
      research: ['organized_hunting']
    },
    
    hazards: ['disease', 'poisonous_gas', 'swamp_monsters', 'quicksand'],
    specialFeatures: ['rare_clay_deposits', 'medicinal_springs'],
    emoji: '🐊',
    color: '#4E342E'
  },

  // TIER 2 - ADVANCED LOCATIONS
  {
    id: 'deep_mountains',
    name: 'Deep Mountains',
    description: 'Treacherous peaks hiding the most precious minerals',
    type: 'mountains',
    tier: 2,
    rarity: 'rare',
    discovered: false,
    
    availableResources: {
      tier0: [],
      tier1: [
        // Advanced ores
        'iron_ore', 'silver_ore'
      ],
      tier2: [
        // Precious materials
        'gold_ore', 'precious_gems', 'mithril_ore', 'adamantine',
        // Advanced stones
        'marble'
      ]
    },
    
    workModifiers: {
      mining: 3.0,
      metalworking: 1.8
    },
    
    explorationRequirements: {
      population: 15,
      tools: ['iron_pick', 'climbing_gear'],
      research: ['iron_working', 'mountain_exploration'],
      buildings: ['mountain_base_camp']
    },
    
    hazards: ['avalanches', 'extreme_cold', 'mountain_monsters', 'altitude_sickness'],
    specialFeatures: ['precious_veins', 'crystal_caves', 'ancient_mines'],
    emoji: '🗻',
    color: '#37474F'
  },

  {
    id: 'enchanted_grove',
    name: 'Enchanted Grove',
    description: 'Mystical forest where magic flows through every leaf',
    type: 'magical_forest',
    tier: 2,
    rarity: 'epic',
    discovered: false,
    
    availableResources: {
      tier0: [],
      tier1: [
        // Magical plants
        'rare_herbs', 'master_herbs'
      ],
      tier2: [
        // Magical woods
        'yew_wood', 'elder_wood',
        // Magical materials
        'moonstone', 'fairy_dust', 'unicorn_hair',
        // Crystal materials
        'crystal', 'crystal_essence'
      ]
    },
    
    workModifiers: {
      magical_research: 2.5,
      alchemy: 2.0,
      enchanting: 1.8
    },
    
    explorationRequirements: {
      population: 12,
      tools: ['silver_tools'],
      research: ['basic_alchemy', 'nature_magic'],
      buildings: ['magical_laboratory']
    },
    
    hazards: ['magical_storms', 'fey_creatures', 'reality_distortions'],
    specialFeatures: ['ley_line_nexus', 'fairy_ring', 'world_tree_sapling'],
    emoji: '🧚',
    color: '#E1BEE7'
  },

  {
    id: 'underground_caverns',
    name: 'Underground Caverns',
    description: 'Vast subterranean network hiding ancient secrets',
    type: 'caves',
    tier: 2,
    rarity: 'rare',
    discovered: false,
    
    availableResources: {
      tier0: [],
      tier1: [
        // Cave materials
        'cave_crystals', 'underground_water'
      ],
      tier2: [
        // Rare cave resources
        'rare_minerals', 'cave_pearls', 'crystalline_formations', 'deep_mushrooms',
        // Advanced crystals
        'crystal', 'obsidian'
      ]
    },
    
    workModifiers: {
      mining: 2.5,
      crystal_working: 2.0
    },
    
    explorationRequirements: {
      population: 20,
      tools: ['iron_tools', 'torches', 'rope'],
      research: ['underground_exploration', 'crystal_working'],
      buildings: ['cave_entrance_fortification']
    },
    
    hazards: ['cave_ins', 'underground_rivers', 'cave_monsters', 'toxic_gases'],
    specialFeatures: ['crystal_formations', 'underground_lake', 'ancient_cave_paintings'],
    emoji: '🕳️',
    color: '#263238'
  },

  {
    id: 'volcanic_region',
    name: 'Volcanic Region',
    description: 'Active volcanic area with extreme heat and rare materials',
    type: 'volcanic',
    tier: 2,
    rarity: 'rare',
    discovered: false,
    
    availableResources: {
      tier0: [],
      tier1: [
        // Volcanic materials
        'sulfur', 'pumice'
      ],
      tier2: [
        // Rare volcanic materials
        'obsidian', 'volcanic_glass', 'fire_crystals',
        // Heat-resistant materials
        'salamander_scale', 'fire_clay'
      ]
    },
    
    workModifiers: {
      fire_magic: 2.5,
      glass_working: 2.0,
      heat_resistance: 1.8
    },
    
    explorationRequirements: {
      population: 18,
      tools: ['fire_protection_gear', 'heat_resistant_tools'],
      research: ['fire_magic', 'heat_resistance'],
      buildings: ['volcanic_outpost']
    },
    
    hazards: ['lava_flows', 'toxic_gases', 'extreme_heat', 'volcanic_eruptions'],
    specialFeatures: ['natural_forge', 'fire_crystal_veins', 'obsidian_fields'],
    emoji: '🌋',
    color: '#D32F2F'
  },

  {
    id: 'dragon_peaks',
    name: 'Dragon Peaks',
    description: 'Legendary mountain peaks where dragons once nested',
    type: 'legendary_mountains',
    tier: 2,
    rarity: 'legendary',
    discovered: false,
    
    availableResources: {
      tier0: [],
      tier1: [],
      tier2: [
        // Dragon materials
        'dragon_scales', 'dragon_bones', 'dragon_blood',
        // Legendary materials
        'volcanic_glass', 'fire_crystals', 'ancient_gold',
        // Ultimate materials
        'adamantine', 'mithril_ore'
      ]
    },
    
    workModifiers: {
      legendary_crafting: 3.0,
      fire_magic: 2.5
    },
    
    explorationRequirements: {
      population: 25,
      tools: ['steel_tools', 'fire_protection_gear'],
      research: ['steel_making', 'dragon_lore', 'fire_magic'],
      buildings: ['dragon_expedition_base']
    },
    
    hazards: ['dragon_fire', 'volcanic_activity', 'ancient_guardians', 'extreme_heat'],
    specialFeatures: ['dragon_hoard', 'volcanic_forge', 'ancient_dragon_nest'],
    emoji: '🐉',
    color: '#D32F2F'
  },

  // SPECIAL SEASONAL/EVENT LOCATIONS
  {
    id: 'wandering_merchant_camp',
    name: 'Wandering Merchant Camp',
    description: 'Temporary trading post that appears and disappears mysteriously',
    type: 'special',
    tier: 1,
    rarity: 'uncommon',
    discovered: false,
    
    availableResources: {
      tier0: [],
      tier1: [
        // Trade goods
        'exotic_spices', 'foreign_tools', 'rare_textiles'
      ],
      tier2: [
        // Legendary trade items
        'legendary_artifacts', 'ancient_maps', 'divine_relics'
      ]
    },
    
    workModifiers: {
      trading: 3.0,
      diplomacy: 1.5
    },
    
    explorationRequirements: {
      population: 5,
      research: ['commerce']
    },
    
    hazards: [],
    specialFeatures: ['exotic_trader', 'rare_goods', 'cultural_exchange'],
    emoji: '🏕️',
    color: '#FF9800'
  },

  {
    id: 'seasonal_hunting_grounds',
    name: 'Seasonal Hunting Grounds',
    description: 'Rich hunting area that appears during certain seasons',
    type: 'seasonal',
    tier: 1,
    rarity: 'uncommon',
    discovered: false,
    
    availableResources: {
      tier0: [
        // Basic animals
        'rabbit_carcass'
      ],
      tier1: [
        // Seasonal animals
        'deer_carcass', 'wild_boar_carcass',
      ],
      tier2: [
        // Rare animals
        'bear_carcass', 'wolf_carcass', 'elk_carcass'
      ]
    },
    
    workModifiers: {
      hunting: 2.8,
      tracking: 2.0,
      meat_processing: 1.6
    },
    
    explorationRequirements: {
      population: 6,
      tools: ['bronze_weapons'],
      research: ['organized_hunting']
    },
    
    hazards: ['dangerous_predators', 'harsh_weather'],
    specialFeatures: ['animal_migration_routes', 'natural_salt_licks'],
    emoji: '🦌',
    color: '#8D6E63'
  }
];

// Helper functions following the same pattern as Items.ts and Buildings.ts
export function getLocationsByType(locationType: string): Location[] {
  return LOCATIONS_DATABASE.filter(location => location.type === locationType);
}

export function getLocationsByTier(tier: number): Location[] {
  return LOCATIONS_DATABASE.filter(location => location.tier === tier);
}

export function getDiscoveredLocations(): Location[] {
  return LOCATIONS_DATABASE.filter(location => location.discovered);
}

export function getUndiscoveredLocations(): Location[] {
  return LOCATIONS_DATABASE.filter(location => !location.discovered);
}

export function getLocationInfo(locationId: string): Location | undefined {
  return LOCATIONS_DATABASE.find(l => l.id === locationId);
}

export function canExploreLocation(
  location: Location,
  currentPopulation: number,
  availableTools: string[],
  completedResearch: string[],
  availableBuildings: string[]
): boolean {
  // Population requirement
  if (location.explorationRequirements.population && 
      currentPopulation < location.explorationRequirements.population) {
    return false;
  }
  
  // Tool requirements
  if (location.explorationRequirements.tools) {
    const hasRequiredTools = location.explorationRequirements.tools.every(tool => 
      availableTools.includes(tool)
    );
    if (!hasRequiredTools) return false;
  }
  
  // Research requirements
  if (location.explorationRequirements.research) {
    const hasRequiredResearch = location.explorationRequirements.research.every(research => 
      completedResearch.includes(research)
    );
    if (!hasRequiredResearch) return false;
  }
  
  // Building requirements
  if (location.explorationRequirements.buildings) {
    const hasRequiredBuildings = location.explorationRequirements.buildings.every(building => 
      availableBuildings.includes(building)
    );
    if (!hasRequiredBuildings) return false;
  }
  
  return true;
}

export function getAvailableResourcesFromLocation(location: Location): string[] {
  return [
    ...location.availableResources.tier0,
    ...location.availableResources.tier1,
    ...location.availableResources.tier2
  ];
}

export function getLocationRarityColor(rarity: string): string {
  switch (rarity) {
    case 'common': return '#9E9E9E';
    case 'uncommon': return '#4CAF50';
    case 'rare': return '#2196F3';
    case 'epic': return '#9C27B0';
    case 'legendary': return '#FF9800';
    default: return '#9E9E9E';
  }
}
