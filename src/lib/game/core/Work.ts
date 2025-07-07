// Work.ts - Work Assignment and Priority System
import type { Pawn, Location, GameState } from '$lib/game/core/types';
import { getItemInfo } from './Items';
import { getDiscoveredLocations, getAvailableResourcesFromLocation, getLocationInfo, extractResource } from './Locations';
import { get } from 'svelte/store';
import { pawnAbilities } from '$lib/stores/gameState';

export interface WorkCategory {
  id: string;
  name: string;
  description: string;
  emoji: string;
  color: string;
  
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
    toolsRequired: ['knife'],
    primaryStat: 'dexterity',
    secondaryStat: 'intelligence',
    baseEfficiency: 1.0
  },
  {
    id: 'digging',
    name: 'Digging',
    description: 'Excavate soil, clay, and minerals from the ground',
    emoji: '🪏',
    color: '#8D6E63',
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
    toolsRequired: ['alchemical_apparatus'],
    skillRequired: 'alchemy',
    primaryStat: 'intelligence',
    secondaryStat: 'wisdom',
    baseEfficiency: 1.0
  }
];
// In Work.ts - Fix the harvesting function
export function processWorkHarvesting(state: GameState): GameState {
  if (!state.pawns || state.pawns.length === 0) return state;

  const newState = { ...state };
  const harvestedResources: Record<string, number> = {};

  if (!newState.currentJobIndex) newState.currentJobIndex = {};

  state.pawns.forEach(pawn => {
    const workAssignment = state.workAssignments[pawn.id];
    if (!workAssignment) return;

    const sortedWorks = Object.entries(workAssignment.workPriorities)
      .filter(([_, priority]) => priority > 0)
      .sort(([, a], [, b]) => a - b);

    if (sortedWorks.length === 0) return;

    // Get current job index for this pawn, default to 0
    const idx = newState.currentJobIndex[pawn.id] ?? 0;
    const [workType] = sortedWorks[idx % sortedWorks.length];

    // Get all available resource IDs for this work type
    const availableResourceIds = getAvailableResourceIdsForWork(state, workType);

    // For each available resource, try to extract it from locations
    availableResourceIds.forEach(resourceId => {
      const harvestAmount = calculateHarvestAmount(pawn, workType, 1, state);
      if (harvestAmount > 0) {
        
        // NEW: Extract from location resource nodes
        let totalExtracted = 0;
        for (const location of getDiscoveredLocations()) {
          const availableInLocation = getAvailableResourcesFromLocation(location);
          if (availableInLocation.includes(resourceId)) {
            const extracted = extractResource(location, resourceId, harvestAmount - totalExtracted);
            totalExtracted += extracted;
            
            // Stop if we've extracted enough
            if (totalExtracted >= harvestAmount) break;
          }
        }
        
        // Only add to player inventory what was actually extracted
        if (totalExtracted > 0) {
          harvestedResources[resourceId] = (harvestedResources[resourceId] || 0) + totalExtracted;
        }
      }
    });

    // Advance to next job for next turn
    newState.currentJobIndex[pawn.id] = (idx + 1) % sortedWorks.length;
  });

  // Add extracted resources to player inventory
  Object.entries(harvestedResources).forEach(([resourceId, amount]) => {
    newState.item = newState.item.map(item =>
      item.id === resourceId
        ? { ...item, amount: item.amount + amount }
        : item
    );
    const existingItem = newState.item.find(item => item.id === resourceId);
    if (!existingItem) {
      const itemInfo = getItemInfo(resourceId);
      if (itemInfo) {
        newState.item.push({ ...itemInfo, amount });
      }
    }
  });

  return newState;
}

export function getAvailableResourceIdsForWork(state: GameState, workType: string): string[] {
  const resourceIds = new Set<string>();
  for (const location of getDiscoveredLocations()) {
    const availableResourceIds = getAvailableResourcesFromLocation(location);
    for (const resourceId of availableResourceIds) {
      const item = getItemInfo(resourceId);
      if (item && item.workTypes && item.workTypes.includes(workType)) {
        resourceIds.add(resourceId);
      }
    }
  }
  return Array.from(resourceIds);
}

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

// Update calculateWorkEfficiency to use stored abilities
export function calculateWorkEfficiency(
  pawn: Pawn,
  workCategory: WorkCategory,
  location: Location
): number {
  let efficiency = workCategory.baseEfficiency;
  
  // Get stored abilities for this pawn
  const pawnAbilitiesStore = get(pawnAbilities) as Record<string, Record<string, any>>;
  const storedAbilities = pawnAbilitiesStore[pawn.id] || {};
  
  // Use work efficiency from abilities if available
  const workEfficiencyAbility = storedAbilities[`${workCategory.id}Efficiency`];
  if (workEfficiencyAbility) {
    efficiency = workEfficiencyAbility.value;
  } else {
    // Fallback to stat-based calculation
    const primaryStatValue = pawn.stats[workCategory.primaryStat] || 10;
    efficiency *= (primaryStatValue / 10);
    
    if (workCategory.secondaryStat) {
      const secondaryStatValue = pawn.stats[workCategory.secondaryStat] || 10;
      efficiency *= (1 + (secondaryStatValue - 10) / 50);
    }
  }
  
  // Location work modifiers
  if (location.workModifiers && location.workModifiers[workCategory.id]) {
    efficiency *= location.workModifiers[workCategory.id];
  }
  
  return Math.max(0.1, efficiency);
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
  productionTargets: ProductionTarget[],
  state: GameState // pass the full state for resource lookup
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
      // Use the new function:
      const availableResources = getAvailableResourceIdsForWork(state, target.workCategoryId);

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

// Update calculateHarvestAmount to use stored abilities
export function calculateHarvestAmount(
  pawn: Pawn, 
  workType: string, 
  priority: number, 
  gameState: GameState
): number {
  const workCategory = getWorkCategory(workType);
  if (!workCategory) return 0;
  
  // Get stored abilities for this pawn
  const pawnAbilitiesRecord = gameState.pawnAbilities as Record<string, Record<string, any>> | undefined;
  const storedAbilities: Record<string, any> = pawnAbilitiesRecord?.[pawn.id] || {};
  
  // Use work efficiency from stored abilities
  const efficiencyAbility = storedAbilities[`${workType}Efficiency`];
  let efficiency = efficiencyAbility ? efficiencyAbility.value : 1.0;
  
  // Base harvest rate per priority point
  const baseHarvestRate = 2; // Increase base rate
  
  // Calculate final harvest amount using stored efficiency
  const harvestAmount = Math.floor(priority * baseHarvestRate * efficiency);
  
  return Math.max(1, harvestAmount);
}
// Add function to get work efficiency description for UI
export function getWorkEfficiencyDescription(pawn: Pawn, workType: string, gameState: GameState): string {
const pawnAbilitiesRecord = gameState.pawnAbilities as Record<string, Record<string, any>> | undefined;
const storedAbilities: Record<string, any> = pawnAbilitiesRecord?.[pawn.id] || {};
  const efficiencyAbility = storedAbilities[`${workType}Efficiency`];
  
  if (efficiencyAbility) {
    return `${(efficiencyAbility.value * 100).toFixed(0)}% efficiency (${efficiencyAbility.sources.join(', ')})`;
  }
  
  return 'No efficiency data available';
}