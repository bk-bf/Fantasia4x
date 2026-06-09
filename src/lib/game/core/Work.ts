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
    color: '#4CAF50',
    locationTypesRequired: ['plains', 'forest'],
    primaryStat: 'perception',
    secondaryStat: 'constitution',
    baseEfficiency: 1.0
  },
  {
    id: 'woodcutting',
    name: 'Woodcutting',
    description: 'Harvest wood from trees in forests and groves',
    color: '#8D6E63',
    toolsRequired: ['stone_axe', 'iron_axe', 'steel_axe'],
    locationTypesRequired: ['forest', 'plains'],
    primaryStat: 'strength',
    secondaryStat: 'constitution',
    baseEfficiency: 1.0
  },
  {
    id: 'mining',
    name: 'Mining',
    description: 'Extract stone, ore, and minerals from quarries and mines',
    color: '#607D8B',
    toolsRequired: ['stone_pick', 'iron_pick', 'steel_pick'],
    locationTypesRequired: ['hills', 'mountains', 'caves'],
    primaryStat: 'strength',
    secondaryStat: 'constitution',
    baseEfficiency: 1.0
  },
  {
    id: 'hunting',
    name: 'Hunting',
    description: 'Hunt animals for meat, hide, and other materials',
    color: '#8D4E85',
    toolsRequired: ['stone_spear', 'iron_spear', 'shortbow', 'longbow'],
    locationTypesRequired: ['forest', 'plains', 'hills'],
    primaryStat: 'dexterity',
    secondaryStat: 'perception',
    baseEfficiency: 1.0
  },
  {
    id: 'butchery',
    name: 'Butchery',
    description: 'Process animal carcasses into meat, hide, and bone at a butcher spot',
    color: '#C62828',
    toolsRequired: ['flint_knife', 'bone_cleaver'],
    primaryStat: 'strength',
    secondaryStat: 'dexterity',
    baseEfficiency: 1.0
  },
  {
    id: 'fishing',
    name: 'Fishing',
    description: 'Catch fish from rivers, lakes, and streams',
    color: '#4FC3F7',
    toolsRequired: ['digging_stick', 'fishing_spear', 'fishing_rod'],
    locationTypesRequired: ['river'],
    primaryStat: 'dexterity',
    secondaryStat: 'perception',
    baseEfficiency: 1.0
  },

  // CRAFTING WORK
  {
    id: 'crafting',
    name: 'General Crafting',
    description: 'Create tools, weapons, and basic equipment',
    color: '#FF9800',
    primaryStat: 'dexterity',
    secondaryStat: 'intelligence',
    baseEfficiency: 1.0
  },
  {
    id: 'metalworking',
    name: 'Metalworking',
    description: 'Smelt ores and forge metal items',
    color: '#FF5722',
    toolsRequired: ['iron_tongs', 'steel_tongs'],
    primaryStat: 'strength',
    secondaryStat: 'intelligence',
    baseEfficiency: 1.0
  },
  {
    id: 'leatherworking',
    name: 'Leatherworking',
    description: 'Process hides into leather and create leather goods',
    color: '#8D6E63',
    toolsRequired: ['flint_knife', 'iron_knife', 'steel_knife'],
    primaryStat: 'dexterity',
    secondaryStat: 'intelligence',
    baseEfficiency: 1.0
  },
  {
    id: 'digging',
    name: 'Digging',
    description: 'Excavate soil, clay, and minerals from the ground',
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
    color: '#9C27B0',
    skillRequired: 'scholarship',
    primaryStat: 'intelligence',
    secondaryStat: 'perception',
    baseEfficiency: 1.0
  },
  {
    id: 'construction',
    name: 'Construction',
    description: 'Build structures, roads, and infrastructure',
    color: '#4CAF50',
    primaryStat: 'strength',
    secondaryStat: 'intelligence',
    baseEfficiency: 1.0
  },
  {
    id: 'alchemy',
    name: 'Alchemy',
    description: 'Create potions, elixirs, and magical compounds',
    color: '#9C27B0',
    toolsRequired: ['alchemical_apparatus'],
    skillRequired: 'alchemy',
    primaryStat: 'intelligence',
    secondaryStat: 'perception',
    baseEfficiency: 1.0
  },
  // Phase 6: cooking over campfire
  {
    id: 'cooking',
    name: 'Cooking',
    description: 'Prepare food at a campfire or cooking station',
    color: '#FF9800',
    primaryStat: 'intelligence',
    secondaryStat: 'dexterity',
    baseEfficiency: 1.0
  },
  // Phase 7: hauling — carry dropped items to storage
  {
    id: 'hauling',
    name: 'Hauling',
    description: 'Pick up resources left on the ground and carry them to a storage building',
    color: '#FFB300',
    primaryStat: 'strength',
    secondaryStat: 'constitution',
    baseEfficiency: 1.0
  }
];
