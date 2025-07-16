// Work.ts - Work Categories Database
// Business logic has been moved to WorkService
import type { WorkCategory } from './types';

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
