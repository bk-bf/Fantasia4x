/**
 * LocationsData.ts - Pure location data definitions
 * Contains only data structures and templates, no business logic
 */

// Resource Node Template for randomization
export interface ResourceNodeTemplate {
	id: string;
	currentAmountRange: [number, number]; // [min, max] for current amount
	maxAmountRange: [number, number]; // [min, max] for max capacity
	renewalRate: number; // Amount renewed per turn (0 for non-renewable)
	renewalType: 'none' | 'slow' | 'fast' | 'seasonal';
	depletion: number; // How much is lost per extraction (usually 1)
}

// Actual Resource Node with generated values
export interface ResourceNode {
	id: string;
	currentAmount: number;
	maxAmount: number;
	renewalRate: number;
	renewalType: 'none' | 'slow' | 'fast' | 'seasonal';
	depletion: number;
}

// Location Template for generation
export interface LocationTemplate {
	id: string;
	name: string;
	description: string;
	type: string;
	tier: number;
	rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
	discovered: boolean;

	// Legacy format for compatibility
	availableResources: {
		tier0: string[];
		tier1: string[];
		tier2: string[];
	};

	// Resource templates for randomization
	resourceTemplates: Record<string, ResourceNodeTemplate>;

	workModifiers?: Record<string, number>;

	explorationRequirements: {
		population?: number;
		tools?: string[];
		research?: string[];
		buildings?: string[];
	};

	hazards: string[];
	specialFeatures: string[];
	emoji: string;
	color: string;
}

// Generated Location with actual resource nodes
export interface LocationWithResources {
	id: string;
	name: string;
	description: string;
	type: string;
	tier: number;
	rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
	discovered: boolean;

	// Legacy format for compatibility
	availableResources: {
		tier0: string[];
		tier1: string[];
		tier2: string[];
	};

	// Generated resource nodes
	resourceNodes: Record<string, ResourceNode>;

	workModifiers?: Record<string, number>;

	explorationRequirements: {
		population?: number;
		tools?: string[];
		research?: string[];
		buildings?: string[];
	};

	hazards: string[];
	specialFeatures: string[];
	emoji: string;
	color: string;
}

// LOCATION TEMPLATES DATABASE - Pure data, no logic
export const LOCATION_TEMPLATES: LocationTemplate[] = [
	// TIER 0 - STARTING LOCATIONS
	{
		id: 'plains',
		name: 'Plains',
		description: 'Gentle grasslands where your civilization first took root',
		type: 'plains',
		tier: 0,
		rarity: 'common',
		discovered: true,

		availableResources: {
			tier0: [
				'pine_wood', 'fir_wood', 'wild_berries', 'wild_oats', 'wild_barley',
				'rabbit_carcass', 'plant_fiber', 'common_clay', 'sandstone', 'flint'
			],
			tier1: [],
			tier2: []
		},

		resourceTemplates: {
			pine_wood: {
				id: 'pine_wood',
				currentAmountRange: [1000, 1500],
				maxAmountRange: [500, 1500],
				renewalRate: 0.02,
				renewalType: 'slow',
				depletion: 1
			},
			fir_wood: {
				id: 'fir_wood',
				currentAmountRange: [300, 1000],
				maxAmountRange: [600, 1000],
				renewalRate: 0.02,
				renewalType: 'slow',
				depletion: 1
			},
			wild_berries: {
				id: 'wild_berries',
				currentAmountRange: [500, 1200],
				maxAmountRange: [800, 1500],
				renewalRate: 0.3,
				renewalType: 'seasonal',
				depletion: 1
			},
			wild_oats: {
				id: 'wild_oats',
				currentAmountRange: [400, 800],
				maxAmountRange: [600, 1000],
				renewalRate: 0.2,
				renewalType: 'seasonal',
				depletion: 1
			},
			wild_barley: {
				id: 'wild_barley',
				currentAmountRange: [300, 700],
				maxAmountRange: [500, 900],
				renewalRate: 0.15,
				renewalType: 'seasonal',
				depletion: 1
			},
			rabbit_carcass: {
				id: 'rabbit_carcass',
				currentAmountRange: [150, 350],
				maxAmountRange: [250, 500],
				renewalRate: 0.05,
				renewalType: 'fast',
				depletion: 1
			},
			plant_fiber: {
				id: 'plant_fiber',
				currentAmountRange: [800, 1500],
				maxAmountRange: [1200, 2000],
				renewalRate: 0.4,
				renewalType: 'fast',
				depletion: 1
			},
			common_clay: {
				id: 'common_clay',
				currentAmountRange: [500, 800],
				maxAmountRange: [300, 1000],
				renewalRate: 0,
				renewalType: 'none',
				depletion: 1
			},
			sandstone: {
				id: 'sandstone',
				currentAmountRange: [200, 400],
				maxAmountRange: [200, 400],
				renewalRate: 0,
				renewalType: 'none',
				depletion: 1
			},
			flint: {
				id: 'flint',
				currentAmountRange: [200, 400],
				maxAmountRange: [400, 500],
				renewalRate: 0,
				renewalType: 'none',
				depletion: 1
			}
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
			tier0: ['sandstone', 'limestone', 'flint', 'pine_wood', 'fir_wood', 'herbs', 'plant_fiber'],
			tier1: [],
			tier2: []
		},

		resourceTemplates: {
			sandstone: {
				id: 'sandstone',
				currentAmountRange: [400, 600],
				maxAmountRange: [400, 600],
				renewalRate: 0,
				renewalType: 'none',
				depletion: 1
			},
			limestone: {
				id: 'limestone',
				currentAmountRange: [300, 500],
				maxAmountRange: [300, 500],
				renewalRate: 0,
				renewalType: 'none',
				depletion: 1
			},
			flint: {
				id: 'flint',
				currentAmountRange: [100, 200],
				maxAmountRange: [100, 200],
				renewalRate: 0,
				renewalType: 'none',
				depletion: 1
			},
			pine_wood: {
				id: 'pine_wood',
				currentAmountRange: [50, 120],
				maxAmountRange: [80, 150],
				renewalRate: 1,
				renewalType: 'slow',
				depletion: 1
			},
			fir_wood: {
				id: 'fir_wood',
				currentAmountRange: [40, 100],
				maxAmountRange: [60, 130],
				renewalRate: 1,
				renewalType: 'slow',
				depletion: 1
			},
			herbs: {
				id: 'herbs',
				currentAmountRange: [25, 60],
				maxAmountRange: [40, 80],
				renewalRate: 3,
				renewalType: 'seasonal',
				depletion: 1
			},
			plant_fiber: {
				id: 'plant_fiber',
				currentAmountRange: [50, 100],
				maxAmountRange: [70, 130],
				renewalRate: 5,
				renewalType: 'fast',
				depletion: 1
			}
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

	{
		id: 'old_forest',
		name: 'Old Forest',
		description: 'Ancient woodland with towering oaks and hidden groves',
		type: 'forest',
		tier: 1,
		rarity: 'uncommon',
		discovered: false,

		availableResources: {
			tier0: ['pine_wood', 'fir_wood', 'wild_berries'],
			tier1: [
				'oak_wood', 'ash_wood', 'birch_wood', 'deer_carcass',
				'rare_herbs', 'medicinal_plants', 'tree_sap', 'oak_bark'
			],
			tier2: []
		},

		resourceTemplates: {
			pine_wood: {
				id: 'pine_wood',
				currentAmountRange: [2000, 4000],
				maxAmountRange: [3000, 5000],
				renewalRate: 0.03,
				renewalType: 'slow',
				depletion: 1
			},
			fir_wood: {
				id: 'fir_wood',
				currentAmountRange: [1800, 3500],
				maxAmountRange: [2500, 4500],
				renewalRate: 0.03,
				renewalType: 'slow',
				depletion: 1
			},
			oak_wood: {
				id: 'oak_wood',
				currentAmountRange: [1500, 3000],
				maxAmountRange: [2000, 4000],
				renewalRate: 0.03,
				renewalType: 'slow',
				depletion: 1
			},
			ash_wood: {
				id: 'ash_wood',
				currentAmountRange: [1000, 2500],
				maxAmountRange: [1500, 3500],
				renewalRate: 0.03,
				renewalType: 'slow',
				depletion: 1
			},
			birch_wood: {
				id: 'birch_wood',
				currentAmountRange: [120, 280],
				maxAmountRange: [180, 380],
				renewalRate: 0.03,
				renewalType: 'slow',
				depletion: 1
			},
			deer_carcass: {
				id: 'deer_carcass',
				currentAmountRange: [80, 250],
				maxAmountRange: [150, 350],
				renewalRate: 0.02,
				renewalType: 'slow',
				depletion: 1
			},
			wild_berries: {
				id: 'wild_berries',
				currentAmountRange: [800, 1800],
				maxAmountRange: [1200, 2200],
				renewalRate: 0.4,
				renewalType: 'seasonal',
				depletion: 1
			},
			rare_herbs: {
				id: 'rare_herbs',
				currentAmountRange: [50, 150],
				maxAmountRange: [250, 300],
				renewalRate: 0.1,
				renewalType: 'seasonal',
				depletion: 1
			},
			medicinal_plants: {
				id: 'medicinal_plants',
				currentAmountRange: [100, 400],
				maxAmountRange: [200, 400],
				renewalRate: 0.1,
				renewalType: 'slow',
				depletion: 1
			},
			tree_sap: {
				id: 'tree_sap',
				currentAmountRange: [400, 1000],
				maxAmountRange: [600, 1200],
				renewalRate: 0.4,
				renewalType: 'seasonal',
				depletion: 1
			},
			oak_bark: {
				id: 'oak_bark',
				currentAmountRange: [1500, 3000],
				maxAmountRange: [1500, 3000],
				renewalRate: 0.03,
				renewalType: 'slow',
				depletion: 1
			}
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
			tier0: ['granite', 'sandstone', 'limestone', 'flint'],
			tier1: ['copper_ore', 'tin_ore', 'iron_ore', 'charcoal'],
			tier2: []
		},

		resourceTemplates: {
			granite: {
				id: 'granite',
				currentAmountRange: [600, 1000],
				maxAmountRange: [600, 1000],
				renewalRate: 0,
				renewalType: 'none',
				depletion: 1
			},
			sandstone: {
				id: 'sandstone',
				currentAmountRange: [400, 800],
				maxAmountRange: [400, 800],
				renewalRate: 0,
				renewalType: 'none',
				depletion: 1
			},
			limestone: {
				id: 'limestone',
				currentAmountRange: [300, 700],
				maxAmountRange: [300, 700],
				renewalRate: 0,
				renewalType: 'none',
				depletion: 1
			},
			flint: {
				id: 'flint',
				currentAmountRange: [150, 300],
				maxAmountRange: [150, 300],
				renewalRate: 0,
				renewalType: 'none',
				depletion: 1
			},
			copper_ore: {
				id: 'copper_ore',
				currentAmountRange: [80, 200],
				maxAmountRange: [80, 200],
				renewalRate: 0,
				renewalType: 'none',
				depletion: 1
			},
			tin_ore: {
				id: 'tin_ore',
				currentAmountRange: [40, 120],
				maxAmountRange: [40, 120],
				renewalRate: 0,
				renewalType: 'none',
				depletion: 1
			},
			iron_ore: {
				id: 'iron_ore',
				currentAmountRange: [60, 180],
				maxAmountRange: [60, 180],
				renewalRate: 0,
				renewalType: 'none',
				depletion: 1
			},
			charcoal: {
				id: 'charcoal',
				currentAmountRange: [20, 80],
				maxAmountRange: [50, 150],
				renewalRate: 0,
				renewalType: 'none',
				depletion: 1
			}
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
			tier0: ['common_carp', 'common_clay'],
			tier1: ['river_trout', 'fire_clay', 'river_stones', 'water_plants'],
			tier2: []
		},

		resourceTemplates: {
			common_carp: {
				id: 'common_carp',
				currentAmountRange: [300, 800],
				maxAmountRange: [500, 1200],
				renewalRate: 0.05,
				renewalType: 'fast',
				depletion: 1
			},
			river_trout: {
				id: 'river_trout',
				currentAmountRange: [200, 600],
				maxAmountRange: [350, 900],
				renewalRate: 0.05,
				renewalType: 'seasonal',
				depletion: 1
			},
			common_clay: {
				id: 'common_clay',
				currentAmountRange: [1000, 3000],
				maxAmountRange: [1000, 3000],
				renewalRate: 0,
				renewalType: 'none',
				depletion: 1
			},
			fire_clay: {
				id: 'fire_clay',
				currentAmountRange: [500, 1500],
				maxAmountRange: [500, 1500],
				renewalRate: 0,
				renewalType: 'none',
				depletion: 1
			},
			river_stones: {
				id: 'river_stones',
				currentAmountRange: [800, 2000],
				maxAmountRange: [800, 2000],
				renewalRate: 0,
				renewalType: 'none',
				depletion: 1
			},
			water_plants: {
				id: 'water_plants',
				currentAmountRange: [400, 1000],
				maxAmountRange: [600, 1400],
				renewalRate: 6,
				renewalType: 'fast',
				depletion: 1
			}
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
	}
];