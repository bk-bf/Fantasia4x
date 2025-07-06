// Work.ts - Work Assignment and Priority System
import type { Pawn, Location } from '$lib/game/core/types';
import { getDiscoveredLocations, getLocationInfo } from './Locations';
import { getItemInfo } from './Items';

export interface WorkCategory {
  id: string;
  name: string;
  description: string;
  emoji: string;
  color: string;
  
  // What this work category can produce
  produces: string[]; // Item IDs that can be harvested/produced
  
  // Requirements
  toolsRequired?: string[];
  skillRequired?: string;
  locationTypesRequired?: string[]; // Location types where this work can be done
  
  // Efficiency modifiers
  primaryStat: 'strength' | 'dexterity' | 'intelligence' | 'wisdom' | 'charisma' | 'constitution';
  secondaryStat?: 'strength' | 'dexterity' | 'intelligence' | 'wisdom' | 'charisma' | 'constitution';
  
  // Base efficiency
  baseEfficiency: number;
}

export interface WorkAssignment {
  pawnId: string;
  workPriorities: Record<string, number>; // workCategoryId -> priority (0-10)
  authorizedLocations: string[]; // Location IDs where pawn can work
  activeLocation?: string; // Currently working location
  currentWork?: string; // Current work category
}

export interface ProductionTarget {
  workCategoryId: string;
  locationId: string;
  resourceTargets: Record<string, number>; // resourceId -> percentage (0-100)
  assignedPawns: string[]; // Pawn IDs assigned to this production
}

// Work Categories Database
export const WORK_CATEGORIES: WorkCategory[] = [
  // HARVESTING WORK
  {
    id: 'foraging',
    name: 'Foraging',
    description: 'Gather berries, nuts, and edible plants from the wild',
    emoji: '🫐',
    color: '#4CAF50',
    produces: ['wild_berries', 'wild_oats', 'wild_barley', 'nuts', 'herbs'],
    locationTypesRequired: ['plains', 'forest'],
    primaryStat: 'wisdom',
    secondaryStat: 'constitution',
    baseEfficiency: 1.0
  },
  {
    id: 'woodcutting',
    name: 'Woodcutting',
    description: 'Harvest wood from trees in forests and groves',
    emoji: '🪓',
    color: '#8D6E63',
    produces: ['pine_wood', 'fir_wood', 'oak_wood', 'ash_wood', 'birch_wood', 'yew_wood'],
    toolsRequired: ['axe'],
    locationTypesRequired: ['forest', 'plains'],
    primaryStat: 'strength',
    secondaryStat: 'constitution',
    baseEfficiency: 1.0
  },
  {
    id: 'mining',
    name: 'Mining',
    description: 'Extract stone, ore, and minerals from quarries and mines',
    emoji: '⛏️',
    color: '#607D8B',
    produces: ['sandstone', 'limestone', 'granite', 'flint', 'copper_ore', 'tin_ore', 'iron_ore'],
    toolsRequired: ['pick'],
    locationTypesRequired: ['hills', 'mountains', 'caves'],
    primaryStat: 'strength',
    secondaryStat: 'constitution',
    baseEfficiency: 1.0
  },
  {
    id: 'hunting',
    name: 'Hunting',
    description: 'Hunt animals for meat, hide, and other materials',
    emoji: '🏹',
    color: '#8D4E85',
    produces: ['rabbit_carcass', 'deer_carcass', 'wild_boar_carcass'],
    toolsRequired: ['weapon'],
    locationTypesRequired: ['forest', 'plains', 'hills'],
    primaryStat: 'dexterity',
    secondaryStat: 'wisdom',
    baseEfficiency: 1.0
  },
  {
    id: 'fishing',
    name: 'Fishing',
    description: 'Catch fish from rivers, lakes, and streams',
    emoji: '🎣',
    color: '#4FC3F7',
    produces: ['common_carp', 'river_trout'],
    toolsRequired: ['fishing_gear'],
    locationTypesRequired: ['river'],
    primaryStat: 'dexterity',
    secondaryStat: 'wisdom',
    baseEfficiency: 1.0
  },
  
  // CRAFTING WORK
  {
    id: 'crafting',
    name: 'General Crafting',
    description: 'Create tools, weapons, and basic equipment',
    emoji: '🔨',
    color: '#FF9800',
    produces: ['tools', 'weapons', 'basic_equipment'],
    toolsRequired: ['hammer'],
    primaryStat: 'dexterity',
    secondaryStat: 'intelligence',
    baseEfficiency: 1.0
  },
  {
    id: 'metalworking',
    name: 'Metalworking',
    description: 'Smelt ores and forge metal items',
    emoji: '⚒️',
    color: '#FF5722',
    produces: ['copper_ingot', 'bronze_ingot', 'iron_ingot', 'steel_ingot'],
    toolsRequired: ['hammer', 'tongs'],
    primaryStat: 'strength',
    secondaryStat: 'intelligence',
    baseEfficiency: 1.0
  },
  {
    id: 'leatherworking',
    name: 'Leatherworking',
    description: 'Process hides into leather and create leather goods',
    emoji: '🦬',
    color: '#8D6E63',
    produces: ['leather', 'leather_armor', 'leather_goods'],
    toolsRequired: ['knife'],
    primaryStat: 'dexterity',
    secondaryStat: 'intelligence',
    baseEfficiency: 1.0
  },
  {
    id: 'pottery',
    name: 'Pottery',
    description: 'Shape clay into vessels, containers, and decorative items',
    emoji: '🏺',
    color: '#8D6E63',
    produces: ['clay_pot', 'ceramic_goods', 'porcelain_vessels'],
    locationTypesRequired: ['river'], // Need clay deposits
    primaryStat: 'dexterity',
    secondaryStat: 'intelligence',
    baseEfficiency: 1.0
  },
  
  // SPECIALIZED WORK
  {
    id: 'research',
    name: 'Research',
    description: 'Study scrolls, conduct experiments, and advance knowledge',
    emoji: '📚',
    color: '#9C27B0',
    produces: ['research_progress', 'knowledge_advancement'],
    skillRequired: 'scholarship',
    primaryStat: 'intelligence',
    secondaryStat: 'wisdom',
    baseEfficiency: 1.0
  },
  {
    id: 'construction',
    name: 'Construction',
    description: 'Build structures, roads, and infrastructure',
    emoji: '🏗️',
    color: '#4CAF50',
    produces: ['building_progress'],
    toolsRequired: ['hammer'],
    primaryStat: 'strength',
    secondaryStat: 'intelligence',
    baseEfficiency: 1.0
  },
  {
    id: 'alchemy',
    name: 'Alchemy',
    description: 'Create potions, elixirs, and magical compounds',
    emoji: '⚗️',
    color: '#9C27B0',
    produces: ['potions', 'elixirs', 'alchemical_compounds'],
    toolsRequired: ['alchemical_apparatus'],
    skillRequired: 'alchemy',
    primaryStat: 'intelligence',
    secondaryStat: 'wisdom',
    baseEfficiency: 1.0
  }
];

// Helper Functions
export function getWorkCategory(workId: string): WorkCategory | undefined {
  return WORK_CATEGORIES.find(work => work.id === workId);
}

export function getWorkCategoriesByLocation(locationId: string): WorkCategory[] {
  const location = getLocationInfo(locationId);
  if (!location) return [];
  
  return WORK_CATEGORIES.filter(work => 
    !work.locationTypesRequired || 
    work.locationTypesRequired.includes(location.type)
  );
}

export function getAvailableResourcesForWork(
  workCategoryId: string, 
  locationId: string
): string[] {
  const workCategory = getWorkCategory(workCategoryId);
  const location = getLocationInfo(locationId);
  
  if (!workCategory || !location) return [];
  
  // Get intersection of what work can produce and what location has
  const locationResources = [
    ...location.availableResources.tier0,
    ...location.availableResources.tier1,
    ...location.availableResources.tier2
  ];
  
  return workCategory.produces.filter(resource => 
    locationResources.includes(resource)
  );
}

export function calculateWorkEfficiency(
  pawn: Pawn,
  workCategory: WorkCategory,
  location: Location
): number {
  let efficiency = workCategory.baseEfficiency;
  
  // Primary stat bonus
  const primaryStatValue = pawn.stats[workCategory.primaryStat] || 10;
  efficiency *= (primaryStatValue / 10);
  
  // Secondary stat bonus (smaller effect)
  if (workCategory.secondaryStat) {
    const secondaryStatValue = pawn.stats[workCategory.secondaryStat] || 10;
    efficiency *= (1 + (secondaryStatValue - 10) / 50);
  }
  
  // Location work modifiers
  if (location.workModifiers && location.workModifiers[workCategory.id]) {
    efficiency *= location.workModifiers[workCategory.id];
  }
  
  // Tool bonuses (simplified - would check pawn's equipped tools)
  // if (pawn.hasRequiredTools(workCategory.toolsRequired)) {
  //   efficiency *= 1.2;
  // }
  
  return Math.max(0.1, efficiency); // Minimum 10% efficiency
}

export function getOptimalWorkAssignment(
  pawns: Pawn[],
  productionTargets: ProductionTarget[]
): Record<string, WorkAssignment> {
  const assignments: Record<string, WorkAssignment> = {};
  
  // Initialize assignments for all pawns
  pawns.forEach(pawn => {
    assignments[pawn.id] = {
      pawnId: pawn.id,
      workPriorities: {},
      authorizedLocations: getDiscoveredLocations().map(loc => loc.id)
    };
  });
  
  // Assign pawns to production targets based on efficiency
  productionTargets.forEach(target => {
    const location = getLocationInfo(target.locationId);
    const workCategory = getWorkCategory(target.workCategoryId);
    
    if (!location || !workCategory) return;
    
    // Calculate efficiency for each pawn
    const pawnEfficiencies = pawns.map(pawn => ({
      pawn,
      efficiency: calculateWorkEfficiency(pawn, workCategory, location)
    }));
    
    // Sort by efficiency and assign best pawns
    pawnEfficiencies
      .sort((a, b) => b.efficiency - a.efficiency)
      .slice(0, target.assignedPawns.length)
      .forEach(({ pawn }) => {
        assignments[pawn.id].currentWork = workCategory.id;
        assignments[pawn.id].activeLocation = location.id;
        assignments[pawn.id].workPriorities[workCategory.id] = 10;
      });
  });
  
  return assignments;
}

export function processWorkProduction(
  assignments: Record<string, WorkAssignment>,
  pawns: Pawn[],
  productionTargets: ProductionTarget[]
): Record<string, number> {
  const production: Record<string, number> = {};
  
  productionTargets.forEach(target => {
    const workCategory = getWorkCategory(target.workCategoryId);
    const location = getLocationInfo(target.locationId);
    
    if (!workCategory || !location) return;
    
    // Calculate total production from assigned pawns
    target.assignedPawns.forEach(pawnId => {
      const pawn = pawns.find(p => p.id === pawnId);
      const assignment = assignments[pawnId];
      
      if (!pawn || !assignment || assignment.currentWork !== target.workCategoryId) return;
      
      const efficiency = calculateWorkEfficiency(pawn, workCategory, location);
      const availableResources = getAvailableResourcesForWork(target.workCategoryId, target.locationId);
      
      // Distribute production based on target percentages
      Object.entries(target.resourceTargets).forEach(([resourceId, percentage]) => {
        if (availableResources.includes(resourceId)) {
          const baseProduction = efficiency * (percentage / 100);
          production[resourceId] = (production[resourceId] || 0) + baseProduction;
        }
      });
    });
  });
  
  return production;
}
