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
    // Tool-free (the bootstrap activity) — a knife/sickle speeds it up but is never required.
    boostTools: ['flint_knife', 'flint_sickle'],
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
    primaryStat: 'dexterity',
    secondaryStat: 'perception',
    baseEfficiency: 1.0
  },
  {
    id: 'planting',
    name: 'Planting',
    description: 'Sow seeds, tend crops, and manage farmland',
    color: '#66BB6A',
    toolsRequired: ['flint_sickle', 'stone_hoe', 'iron_hoe', 'steel_hoe'],
    primaryStat: 'dexterity',
    secondaryStat: 'intelligence',
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
    toolsRequired: ['wooden_tongs', 'iron_tongs', 'steel_tongs'],
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
    // Tool-free (dig interactions require no tool) — a stick/spade/shovel speeds it up, never gates.
    boostTools: ['digging_stick', 'stone_spade', 'iron_shovel', 'steel_shovel'],
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
    // Tool-free (you can build bare-handed) — a hammer held by the builder speeds it up, never gates.
    // Same boost-only pattern as digging's spade/shovel: a stone→iron→steel hammer adds its
    // `toolBoost.speed` (items.jsonc) to the construction work multiplier.
    boostTools: ['stone_hammer', 'iron_hammer', 'steel_hammer'],
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
  {
    id: 'caretaking',
    name: 'Caretaking',
    description: 'Treat injuries, administer medicine, and care for the sick',
    color: '#E53935',
    toolsRequired: ['herbal_kit', 'bandages', 'medicine'],
    skillRequired: 'medicine',
    primaryStat: 'intelligence',
    secondaryStat: 'dexterity',
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
