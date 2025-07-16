import type { Item } from './types';

export const ITEMS_DATABASE: Item[] = [
// FOOD MATERIALS (Level 0 - Gathered/Hunted)
{
  id: 'wild_berries',
  name: 'Wild Berries',
  description: 'Foraged berries providing basic sustenance',
  type: 'material',
  category: 'food',
  level: 0,
  rarity: 'common',
  effects: { nutritionValue: 1.0 },
  researchRequired: null,
  emoji: '🫐',
  color: '#673AB7',
  amount: 0,
  workTypes: ['foraging']
},
{
  id: 'common_carp',
  name: 'Carp',
  description: 'Freshwater fish commonly found in rivers and lakes',
  type: 'material',
  category: 'food',
  level: 0,
  rarity: 'common',
  effects: { nutritionValue: 1.6, healthBonus: 0.25 },
  researchRequired: null,
  emoji: '🐟',
  color: '#4FC3F7',
  amount: 0,
  workTypes: ['fishing']
},
{
  id: 'wild_oats',
  name: 'Wild Oats',
  description: 'Seeds from wild oat grasses, an early grain',
  type: 'material',
  category: 'food',
  level: 0,
  rarity: 'common',
  effects: { nutritionValue: 1.3, storageStability: 0.85 },
  researchRequired: null,
  emoji: '🌾',
  color: '#FFA726',
  amount: 0,
  workTypes: ['foraging']
},
{
  id: 'wild_barley',
  name: 'Wild Barley',
  description: 'Hardy wild grain that grows in harsh conditions',
  type: 'material',
  category: 'food',
  level: 0,
  rarity: 'common',
  effects: { nutritionValue: 1.4, coldResistance: 0.3, storageStability: 0.9 },
  researchRequired: null,
  emoji: '🌾',
  color: '#D4AF37',
  amount: 0,
  workTypes: ['foraging']
},
{
  id: 'herbs',
  name: 'Herbs',
  description: 'Various wild herbs used for flavoring purposes',
  type: 'material',
  category: 'food',
  level: 0,
  rarity: 'common',
  effects: { nutritionValue: 0.5, healthBonus: 0.15, flavorEnhancement: 0.2 },
  researchRequired: null,
  emoji: '🌿',
  color: '#4CAF50',
  amount: 0,
  workTypes: ['foraging']
},
{
  id: 'river_trout',
  name: 'River Trout',
  description: 'Delicate freshwater fish prized for its flavor',
  type: 'material',
  category: 'food',
  level: 0,
  rarity: 'uncommon',
  effects: { nutritionValue: 1.8, healthBonus: 0.4, moralBonus: 0.2 },
  researchRequired: null,
  emoji: '🐟',
  color: '#FF8A65',
  amount: 0,
  workTypes: ['fishing']
},
{
  id: 'rabbit_carcass',
  name: 'Rabbits',
  description: 'Freshly hunted rabbit, ready for processing',
  type: 'material',
  category: 'food',
  level: 0,
  rarity: 'common',
  effects: { nutritionValue: 1.5, proteinBonus: 0.3 },
  researchRequired: null,
  emoji: '🐇',
  color: '#8D4E85',
  amount: 0,
  workTypes: ['hunting']
},

// BUTCHERY PROCESSING - Converting Carcasses to Materials
{
  id: 'rabbit_meat',
  name: 'Rabbit Meat',
  description: 'Fresh meat from processed rabbit carcass',
  type: 'material',
  category: 'food',
  level: 0,
  rarity: 'common',
  effects: { nutritionValue: 1.8, proteinBonus: 0.4 },
  researchRequired: null,
  emoji: '🥩',
  color: '#8D4E85',
  amount: 0,
  craftingCost: { rabbit_carcass: 1 },
  craftingTime: 1,
  toolTierRequired: 0,
  buildingRequired: 'butchery_table',
  populationRequired: 1,
  workTypes: ['crafting']
},
{
  id: 'venison',
  name: 'Venison',
  description: 'High-quality meat from deer carcass',
  type: 'material',
  category: 'food',
  level: 0,
  rarity: 'uncommon',
  effects: { nutritionValue: 2.5, proteinBonus: 0.6, morale: 0.2 },
  researchRequired: null,
  emoji: '🥩',
  color: '#8D4E85',
  amount: 0,
  craftingCost: { deer_carcass: 1 },
  craftingTime: 2,
  toolTierRequired: 0,
  buildingRequired: 'butchery_table',
  populationRequired: 1,
  workTypes: ['crafting']
},
{
  id: 'sinew',
  name: 'Sinew',
  description: 'Animal tendons, excellent for bowstrings',
  type: 'material',
  category: 'organic',
  level: 0,
  rarity: 'uncommon',
  effects: { elasticity: 2.0, tensileStrength: 1.8 },
  researchRequired: null,
  emoji: '🦴',
  color: '#F5F5DC',
  amount: 0,
  workTypes: ['hunting']
},
{
  id: 'bone',
  name: 'Bone',
  description: 'Animal bones from hunted game, useful for tools and weapons',
  type: 'material',
  category: 'organic',
  level: 0,
  rarity: 'common',
  effects: { hardness: 1.2, workability: 1.1, lightWeight: 0.8 },
  researchRequired: null,
  emoji: '🦴',
  color: '#F5F5DC',
  amount: 0,
  workTypes: ['hunting']
},
{
  id: 'hide',
  name: 'Raw Hide',
  description: 'Untreated animal skin from hunted game',
  type: 'material',
  category: 'organic',
  level: 0,
  rarity: 'common',
  effects: { flexibility: 0.6, durability: 0.8 },
  researchRequired: null,
  emoji: '🦬',
  color: '#8D6E63',
  amount: 0,
  workTypes: ['hunting']
},
{
  id: 'quality_hide',
  name: 'Quality Hide',
  description: 'Premium hide from large game animals',
  type: 'material',
  category: 'organic',
  level: 0,
  rarity: 'uncommon',
  effects: { leatherQuality: 1.5, durability: 1.3 },
  researchRequired: null,
  emoji: '🦬',
  color: '#8D6E63',
  amount: 0,
  craftingCost: { deer_carcass: 1 },
  craftingTime: 2,
  toolTierRequired: 0,
  buildingRequired: 'butchery_table',
  populationRequired: 1,
  workTypes: ['crafting']
},

// RESEARCH MATERIALS - Knowledge & Documentation Items
{
  id: 'bark_scrolls',
  name: 'Bark Scrolls',
  description: 'Basic writing material made from birch bark and plant fiber',
  type: 'material',
  category: 'research',
  level: 0,
  rarity: 'common',
  effects: { knowledgeStorage: 1.0, basicResearch: 1.2 },
  researchRequired: 'basic_writing',
  emoji: '📜',
  color: '#8D6E63',
  amount: 0,
  craftingCost: { birch_wood: 2, plant_fiber: 3 },
  craftingTime: 2,
  toolTierRequired: 0,
  buildingRequired: 'scroll_hut',
  populationRequired: 1,
  workTypes: ['research']
},
{
  id: 'hide_scrolls',
  name: 'Hide Scrolls',
  description: 'Durable writing material made from processed animal hide',
  type: 'material',
  category: 'research',
  level: 0,
  rarity: 'common',
  effects: { knowledgeStorage: 1.5, durability: 1.3 },
  researchRequired: 'basic_writing',
  emoji: '📜',
  color: '#8D6E63',
  amount: 0,
  craftingCost: { hide: 3, sinew: 2, plant_fiber: 2 },
  craftingTime: 3,
  toolTierRequired: 0,
  buildingRequired: 'scroll_hut',
  populationRequired: 1,
  workTypes: ['research']
},
{
  id: 'parchment',
  name: 'Parchment',
  description: 'High-quality writing material made from specially prepared hide',
  type: 'material',
  category: 'research',
  level: 1,
  rarity: 'uncommon',
  effects: { knowledgeStorage: 2.0, advancedResearch: 1.5, durability: 1.8 },
  researchRequired: 'advanced_writing',
  emoji: '📃',
  color: '#F5F5DC',
  amount: 0,
  craftingCost: { leather: 2, lime: 1, oak_bark: 2, sinew: 1 },
  craftingTime: 6,
  toolTierRequired: 1,
  buildingRequired: 'learning_hall',
  populationRequired: 2,
  workTypes: ['research']
},
{
  id: 'scholars_ink',
  name: 'Scholars Ink',
  description: 'Special ink made from charcoal, tree sap, and bronze vessels',
  type: 'material',
  category: 'research',
  level: 1,
  rarity: 'uncommon',
  effects: { writingQuality: 1.8, knowledgePreservation: 1.4 },
  researchRequired: 'advanced_writing',
  emoji: '🖋️',
  color: '#212121',
  amount: 0,
  craftingCost: { charcoal: 2, tree_sap: 3, bronze_vessel: 1, herbs: 1 },
  craftingTime: 4,
  toolTierRequired: 1,
  buildingRequired: 'learning_hall',
  populationRequired: 2,
  workTypes: ['alchemy']
},
{
  id: 'research_notes',
  name: 'Research Notes',
  description: 'Detailed documentation of experimental procedures and findings',
  type: 'material',
  category: 'research',
  level: 2,
  rarity: 'rare',
  effects: { knowledgeStorage: 3.0, experimentalResearch: 2.0, scientificMethod: 1.5 },
  researchRequired: 'scholarly_methods',
  emoji: '📋',
  color: '#3F51B5',
  amount: 0,
  craftingCost: { parchment: 5, scholars_ink: 3, bronze_tools: 1 },
  craftingTime: 8,
  toolTierRequired: 2,
  buildingRequired: 'scholars_workshop',
  populationRequired: 3,
  workTypes: ['research']
},

// SPECIFIC WOOD TYPES (Level 0-1)
{
  id: 'pine_wood',
  name: 'Pine Wood',
  description: 'Softwood from pine trees, easy to work with but less durable',
  type: 'material',
  category: 'wood',
  level: 0,
  rarity: 'common',
  effects: { workability: 1.6, durability: 0.6, resinContent: 0.3 },
  researchRequired: null,
  emoji: '🌲',
  color: '#4CAF50',
  amount: 0,
  workTypes: ['woodcutting']
},
{
  id: 'fir_wood',
  name: 'Fir Wood',
  description: 'Softwood from fir trees, commonly used for construction',
  type: 'material',
  category: 'wood',
  level: 0,
  rarity: 'common',
  effects: { workability: 1.5, durability: 0.7, resinContent: 0.25 },
  researchRequired: null,
  emoji: '🌲',
  color: '#4CAF50',
  amount: 0,
  workTypes: ['woodcutting']
},
{
  id: 'oak_wood',
  name: 'Oak Wood',
  description: 'Hardwood from oak trees, durable and strong',
  type: 'material',
  category: 'wood',
  level: 0,
  rarity: 'uncommon',
  effects: { workability: 0.9, durability: 1.5, tanninContent: 0.4 },
  researchRequired: null,
  emoji: '🌳',
  color: '#8BC34A',
  amount: 0,
  workTypes: ['woodcutting']
},
{
  id: 'ash_wood',
  name: 'Ash Wood',
  description: 'Hardwood from ash trees, strong and flexible',
  type: 'material',
  category: 'wood',
  level: 0,
  rarity: 'uncommon',
  effects: { workability: 1.0, durability: 1.3, flexibility: 0.4 },
  researchRequired: null,
  emoji: '🌳',
  color: '#8BC34A',
  amount: 0,
  workTypes: ['woodcutting']
},
{
  id: 'birch_wood',
  name: 'Birch Wood',
  description: 'Light hardwood with fine grain, excellent for detailed work',
  type: 'material',
  category: 'wood',
  level: 0,
  rarity: 'uncommon',
  effects: { workability: 1.2, durability: 1.1, fineCrafting: 0.5 },
  researchRequired: null,
  emoji: '🌳',
  color: '#F5F5DC',
  amount: 0,
  workTypes: ['woodcutting']
},
{
  id: 'yew_wood',
  name: 'Yew Wood',
  description: 'Dense, flexible wood prized for bow-making',
  type: 'material',
  category: 'wood',
  level: 1,
  rarity: 'rare',
  effects: { workability: 0.7, durability: 1.8, elasticity: 2.0, bowBonus: 1.5 },
  researchRequired: 'advanced_forestry',
  emoji: '🌲',
  color: '#8B4513',
  amount: 0,
  workTypes: ['woodcutting']
},

// STONE TYPES (Level 0-2)
{
  id: 'sandstone',
  name: 'Sandstone',
  description: 'Soft sedimentary rock, easy to quarry and carve',
  type: 'material',
  category: 'stone',
  level: 0,
  rarity: 'common',
  effects: { workability: 1.5, durability: 0.8, beauty: 0.3 },
  researchRequired: null,
  emoji: '🏜️',
  color: '#FFCC80',
  amount: 0,
  workTypes: ['mining']
},
{
  id: 'limestone',
  name: 'Limestone',
  description: 'Versatile building stone, good for general construction',
  type: 'material',
  category: 'stone',
  level: 0,
  rarity: 'common',
  effects: { workability: 1.2, durability: 1.1, mortarBonus: 0.5 },
  researchRequired: null,
  emoji: '🪨',
  color: '#E0E0E0',
  amount: 0,
  workTypes: ['mining']
},
{
  id: 'granite',
  name: 'Granite',
  description: 'Extremely hard igneous rock, excellent for fortifications',
  type: 'material',
  category: 'stone',
  level: 1,
  rarity: 'uncommon',
  effects: { workability: 0.6, durability: 2.2, defenseBonus: 0.8 },
  researchRequired: 'stone_masonry',
  emoji: '⛰️',
  color: '#9E9E9E',
  amount: 0,
  workTypes: ['mining']
},
{
  id: 'marble',
  name: 'Marble',
  description: 'Beautiful metamorphic stone, prized for art and decoration',
  type: 'material',
  category: 'stone',
  level: 1,
  rarity: 'rare',
  effects: { workability: 1.0, durability: 1.3, beauty: 2.0, tradeValue: 1.5 },
  researchRequired: 'stone_masonry',
  emoji: '🏛️',
  color: '#F5F5F5',
  amount: 0,
  workTypes: ['mining']
},
{
  id: 'flint',
  name: 'Flint',
  description: 'Hard sedimentary rock, used for tools and weapons',
  type: 'material',
  category: 'stone',
  level: 0,
  rarity: 'common',
  effects: { sharpness: 1.5, workability: 1.2, toolQuality: 1.0 },
  researchRequired: null,
  emoji: '🪨',
  color: '#757575',
  amount: 0,
  workTypes: ['mining']
},
{
  id: 'obsidian',
  name: 'Obsidian',
  description: 'Volcanic glass, creates incredibly sharp edges',
  type: 'material',
  category: 'stone',
  level: 0,
  rarity: 'rare',
  effects: { sharpness: 2.5, fragility: 1.8, toolQuality: 1.3 },
  researchRequired: null,
  emoji: '🌋',
  color: '#212121',
  amount: 0,
  workTypes: ['mining']
},

// CLAY TYPES (Level 0-1)
{
  id: 'common_clay',
  name: 'Common Clay',
  description: 'Basic clay suitable for simple pottery',
  type: 'material',
  category: 'clay',
  level: 0,
  rarity: 'common',
  effects: { plasticity: 1.0, fireResistance: 0.7 },
  researchRequired: null,
  emoji: '🧱',
  color: '#8D6E63',
  amount: 0,
  workTypes: ['digging']
},
{
  id: 'fire_clay',
  name: 'Fire Clay',
  description: 'Heat-resistant clay for kilns and furnaces',
  type: 'material',
  category: 'clay',
  level: 1,
  rarity: 'uncommon',
  effects: { plasticity: 0.8, fireResistance: 2.0, furnaceBonus: 0.5 },
  researchRequired: 'advanced_pottery',
  emoji: '🔥',
  color: '#FF5722',
  amount: 0,
  workTypes: ['digging']
},
{
  id: 'porcelain_clay',
  name: 'Porcelain Clay',
  description: 'Fine white clay for delicate ceramics',
  type: 'material',
  category: 'clay',
  level: 1,
  rarity: 'rare',
  effects: { plasticity: 1.5, beauty: 1.8, tradeValue: 2.0 },
  researchRequired: 'fine_ceramics',
  emoji: '🏺',
  color: '#FAFAFA',
  amount: 0,
  workTypes: ['digging']
},

// METAL PROGRESSION (Level 0-2)
{
  id: 'native_copper',
  name: 'Native Copper',
  description: 'Pure copper found naturally, soft and malleable',
  type: 'material',
  category: 'metal',
  level: 0,
  rarity: 'uncommon',
  effects: { workability: 2.0, durability: 0.6, conductivity: 1.5 },
  researchRequired: null,
  emoji: '🟫',
  color: '#FF7043',
  amount: 0,
  workTypes: ['mining']
},
{
  id: 'copper_ore',
  name: 'Copper Ore',
  description: 'Malachite and azurite containing copper',
  type: 'material',
  category: 'ore',
  level: 0,
  rarity: 'common',
  effects: { smeltYield: 0.4 },
  researchRequired: null,
  emoji: '💎',
  color: '#4CAF50',
  amount: 0,
  workTypes: ['mining']
},
{
  id: 'tin_ore',
  name: 'Tin Ore',
  description: 'Cassiterite ore containing tin for bronze making',
  type: 'material',
  category: 'ore',
  level: 0,
  rarity: 'rare',
  effects: { smeltYield: 0.3, bronzeAlloy: 1.0 },
  researchRequired: null,
  emoji: '⚪',
  color: '#B0BEC5',
  amount: 0,
  workTypes: ['mining']
},
{
  id: 'iron_ore',
  name: 'Iron Ore',
  description: 'Hematite and magnetite containing iron',
  type: 'material',
  category: 'ore',
  level: 1,
  rarity: 'common',
  effects: { smeltYield: 0.5, carbonSteel: 1.0 },
  researchRequired: 'iron_smelting',
  emoji: '⛓️',
  color: '#795548',
  amount: 0,
  workTypes: ['mining']
},

// ORGANIC MATERIALS (Level 0-1)
{
  id: 'plant_fiber',
  name: 'Plant Fiber',
  description: 'Fibrous material from plants for cordage',
  type: 'material',
  category: 'organic',
  level: 0,
  rarity: 'common',
  effects: { flexibility: 1.2, tensileStrength: 0.8 },
  researchRequired: null,
  emoji: '🌾',
  color: '#8BC34A',
  amount: 0,
  workTypes: ['foraging']
},
{
  id: 'charcoal',
  name: 'Charcoal',
  description: 'Carbonized wood for high-temperature fuel',
  type: 'material',
  category: 'fuel',
  level: 1,
  rarity: 'common',
  effects: { heatValue: 2.0, smeltingBonus: 1.5 },
  researchRequired: 'charcoal_making',
  emoji: '⚫',
  color: '#212121',
  amount: 0,
  craftingCost: { oak_wood: 3 },
  craftingTime: 4,
  toolTierRequired: 0,
  buildingRequired: 'charcoal_kiln',
  populationRequired: 1,
  workTypes: ['crafting']
},

// REFINED METALS (Level 1-2)
{
  id: 'copper_ingot',
  name: 'Copper Ingot',
  description: 'Pure copper refined from ore',
  type: 'material',
  category: 'refined_metal',
  level: 1,
  rarity: 'common',
  effects: { purity: 1.0, workability: 1.8 },
  researchRequired: 'copper_smelting',
  emoji: '🟫',
  color: '#FF7043',
  amount: 0,
  craftingCost: { copper_ore: 3, charcoal: 1 },
  craftingTime: 2,
  toolTierRequired: 0,
  buildingRequired: 'smelting_furnace',
  populationRequired: 1,
  workTypes: ['metalworking']
},
{
  id: 'tin_ingot',
  name: 'Tin Ingot',
  description: 'Pure tin for bronze alloy creation',
  type: 'material',
  category: 'refined_metal',
  level: 1,
  rarity: 'uncommon',
  effects: { purity: 1.0, alloyBonus: 1.5 },
  researchRequired: 'tin_smelting',
  emoji: '⚪',
  color: '#B0BEC5',
  amount: 0,
  craftingCost: { tin_ore: 4, charcoal: 2 },
  craftingTime: 3,
  toolTierRequired: 1,
  buildingRequired: 'smelting_furnace',
  populationRequired: 1,
  workTypes: ['metalworking']
},
{
  id: 'bronze_ingot',
  name: 'Bronze Ingot',
  description: 'Copper-tin alloy, harder than pure copper',
  type: 'material',
  category: 'refined_metal',
  level: 1,
  rarity: 'uncommon',
  effects: { hardness: 1.8, durability: 1.6, workability: 1.2 },
  researchRequired: 'bronze_working',
  emoji: '🥉',
  color: '#CD7F32',
  amount: 0,
  craftingCost: { copper_ingot: 9, tin_ingot: 1 },
  craftingTime: 4,
  toolTierRequired: 1,
  buildingRequired: 'bronze_foundry',
  populationRequired: 2,
  workTypes: ['metalworking']
},
{
  id: 'wrought_iron',
  name: 'Wrought Iron',
  description: 'Low-carbon iron, tough and malleable',
  type: 'material',
  category: 'refined_metal',
  level: 2,
  rarity: 'uncommon',
  effects: { toughness: 2.0, workability: 1.0, corrosionResistance: 0.8 },
  researchRequired: 'iron_working',
  emoji: '⚫',
  color: '#424242',
  amount: 0,
  craftingCost: { iron_ore: 3, charcoal: 2 },
  craftingTime: 5,
  toolTierRequired: 2,
  buildingRequired: 'iron_forge',
  populationRequired: 2,
  workTypes: ['metalworking']
},
{
  id: 'steel_ingot',
  name: 'Steel Ingot',
  description: 'Carbon-enriched iron, extremely hard and durable',
  type: 'material',
  category: 'refined_metal',
  level: 2,
  rarity: 'rare',
  effects: { hardness: 2.5, durability: 2.2, sharpness: 1.8 },
  researchRequired: 'steel_making',
  emoji: '⚙️',
  color: '#607D8B',
  amount: 0,
  craftingCost: { wrought_iron: 2, charcoal: 3 },
  craftingTime: 8,
  toolTierRequired: 2,
  buildingRequired: 'blast_furnace',
  populationRequired: 3,
  workTypes: ['metalworking']
},

// PROCESSED MATERIALS
{
  id: 'leather',
  name: 'Tanned Leather',
  description: 'Processed hide using oak tannins',
  type: 'material',
  category: 'processed',
  level: 1,
  rarity: 'common',
  effects: { flexibility: 1.5, durability: 1.4, waterResistance: 1.2 },
  researchRequired: 'leather_working',
  emoji: '🦬',
  color: '#8D6E63',
  amount: 0,
  craftingCost: { hide: 2, oak_wood: 1, plant_fiber: 1 },
  craftingTime: 3,
  toolTierRequired: 0,
  buildingRequired: 'tannery',
  populationRequired: 1,
  workTypes: ['leatherworking']
},

// CLAY PRODUCTION ITEMS
{
  id: 'earthenware_pot',
  name: 'Earthenware Pot',
  description: 'Basic fired clay vessel for food storage',
  type: 'material',
  category: 'processed',
  level: 0,
  rarity: 'common',
  effects: { foodStorage: 1.2, cookingBonus: 0.1 },
  researchRequired: null,
  emoji: '🏺',
  color: '#8D6E63',
  amount: 0,
  craftingCost: { common_clay: 3 },
  craftingTime: 2,
  toolTierRequired: 0,
  buildingRequired: 'craftsmens_workshop',
  populationRequired: 1,
  workTypes: ['crafting']
},
{
  id: 'fire_bricks',
  name: 'Fire Bricks',
  description: 'Heat-resistant bricks for furnace construction',
  type: 'material',
  category: 'processed',
  level: 1,
  rarity: 'uncommon',
  effects: { furnaceEfficiency: 1.5, heatResistance: 2.0 },
  researchRequired: 'advanced_pottery',
  emoji: '🔥',
  color: '#FF5722',
  amount: 0,
  craftingCost: { fire_clay: 3 },
  craftingTime: 4,
  toolTierRequired: 1,
  buildingRequired: 'advanced_kiln',
  populationRequired: 2,
  workTypes: ['crafting']
},
{
  id: 'porcelain_vessels',
  name: 'Porcelain Vessels',
  description: 'Delicate white ceramic vessels for trade',
  type: 'material',
  category: 'processed',
  level: 1,
  rarity: 'rare',
  effects: { tradeValue: 2.5, prestigeBonus: 1.8, beauty: 2.0 },
  researchRequired: 'fine_ceramics',
  emoji: '🏺',
  color: '#FAFAFA',
  amount: 0,
  craftingCost: { porcelain_clay: 2 },
  craftingTime: 6,
  toolTierRequired: 1,
  buildingRequired: 'porcelain_workshop',
  populationRequired: 3,
  workTypes: ['crafting']
},

// SPEAR PROGRESSION - Wood -> Copper -> Bronze -> Iron (continued from pine_spear)
{
  id: 'pine_spear',
  name: 'Pine Spear',
  description: 'Lightweight spear with sharpened pine tip and plant fiber binding',
  type: 'weapon',
  category: 'combat',
  level: 0,
  rarity: 'common',
  durability: 30,
  maxDurability: 30,
  effects: { combatPower: 3, huntingBonus: 1.1 },
  researchRequired: null,
  emoji: '🔱',
  color: '#4CAF50',
  weaponProperties: {
    damage: 4,
    attackSpeed: 1.6,
    range: 2
  },
  amount: 0,
  craftingCost: { pine_wood: 4, plant_fiber: 2 },
  craftingTime: 1,
  toolTierRequired: 0,
  buildingRequired: null,
  populationRequired: 0,
  workTypes: ['crafting']
},
{
  id: 'oak_spear',
  name: 'Oak Spear',
  description: 'Heavy hardwood spear with fire-hardened oak tip',
  type: 'weapon',
  category: 'combat',
  level: 0,
  rarity: 'common',
  durability: 50,
  maxDurability: 50,
  effects: { combatPower: 5, huntingBonus: 1.2 },
  researchRequired: null,
  emoji: '🔱',
  color: '#8BC34A',
  weaponProperties: {
    damage: 7,
    attackSpeed: 1.1,
    range: 2
  },
  amount: 0,
  craftingCost: { oak_wood: 3, plant_fiber: 2 },
  craftingTime: 2,
  toolTierRequired: 0,
  buildingRequired: null,
  populationRequired: 0,
  workTypes: ['crafting']
},
{
  id: 'ash_spear',
  name: 'Ash Spear',
  description: 'Flexible ash shaft with fire-hardened tip, ideal balance',
  type: 'weapon',
  category: 'combat',
  level: 0,
  rarity: 'uncommon',
  durability: 45,
  maxDurability: 45,
  effects: { combatPower: 4, huntingBonus: 1.4, throwingBonus: 1.3 },
  researchRequired: null,
  emoji: '🔱',
  color: '#8BC34A',
  weaponProperties: {
    damage: 6,
    attackSpeed: 1.4,
    range: 2
  },
  amount: 0,
  craftingCost: { ash_wood: 3, plant_fiber: 2 },
  craftingTime: 2,
  toolTierRequired: 0,
  buildingRequired: null,
  populationRequired: 0,
  workTypes: ['crafting']
},
{
  id: 'bone_spear',
  name: 'Bone Spear',
  description: 'Sharpened bone tip bound to pine shaft with sinew',
  type: 'weapon',
  category: 'combat',
  level: 0,
  rarity: 'common',
  durability: 40,
  maxDurability: 40,
  effects: { combatPower: 4, huntingBonus: 1.3 },
  researchRequired: null,
  emoji: '🔱',
  color: '#F5F5DC',
  weaponProperties: {
    damage: 6,
    attackSpeed: 1.3,
    range: 2
  },
  amount: 0,
  craftingCost: { pine_wood: 3, bone: 2, sinew: 2 },
  craftingTime: 2,
  toolTierRequired: 0,
  buildingRequired: null,
  populationRequired: 0,
  workTypes: ['crafting']
},
{
  id: 'obsidian_spear',
  name: 'Obsidian Spear',
  description: 'Razor-sharp volcanic glass spearhead on flexible ash shaft',
  type: 'weapon',
  category: 'combat',
  level: 0,
  rarity: 'uncommon',
  durability: 25,
  maxDurability: 25,
  effects: { combatPower: 8, armorPiercing: 1.5 },
  researchRequired: null,
  emoji: '🔱',
  color: '#212121',
  weaponProperties: {
    damage: 12,
    attackSpeed: 1.1,
    range: 2
  },
  amount: 0,
  craftingCost: { obsidian: 3, ash_wood: 2, sinew: 1 },
  craftingTime: 3,
  toolTierRequired: 0,
  buildingRequired: null,
  populationRequired: 0,
  workTypes: ['crafting']
},

// COPPER SPEARS
{
  id: 'copper_pine_spear',
  name: 'Copper Pine Spear',
  description: 'Copper spearhead on lightweight pine shaft with sinew binding',
  type: 'weapon',
  category: 'combat',
  level: 1,
  rarity: 'common',
  durability: 80,
  maxDurability: 80,
  effects: { combatPower: 6, huntingBonus: 1.2 },
  researchRequired: 'copper_smelting',
  emoji: '🔱',
  color: '#FF7043',
  weaponProperties: {
    damage: 8,
    attackSpeed: 1.5,
    range: 2
  },
  amount: 0,
  craftingCost: { copper_ingot: 2, pine_wood: 3, sinew: 2, plant_fiber: 1 },
  craftingTime: 3,
  toolTierRequired: 1,
  buildingRequired: 'smelting_furnace',
  populationRequired: 1,
  workTypes: ['metalworking']
},
{
  id: 'copper_ash_spear',
  name: 'Copper Ash Spear',
  description: 'Copper spearhead on flexible ash shaft with leather grip',
  type: 'weapon',
  category: 'combat',
  level: 1,
  rarity: 'uncommon',
  durability: 90,
  maxDurability: 90,
  effects: { combatPower: 7, huntingBonus: 1.3, throwingBonus: 1.4 },
  researchRequired: 'copper_smelting',
  emoji: '🔱',
  color: '#FF7043',
  weaponProperties: {
    damage: 9,
    attackSpeed: 1.3,
    range: 2
  },
  amount: 0,
  craftingCost: { copper_ingot: 2, ash_wood: 3, sinew: 2, leather: 1 },
  craftingTime: 4,
  toolTierRequired: 1,
  buildingRequired: 'smelting_furnace',
  populationRequired: 1,
  workTypes: ['metalworking']
},

// BRONZE SPEARS
{
  id: 'bronze_oak_spear',
  name: 'Bronze Oak Spear',
  description: 'Bronze spearhead on sturdy oak shaft with leather and sinew binding',
  type: 'weapon',
  category: 'combat',
  level: 1,
  rarity: 'uncommon',
  durability: 120,
  maxDurability: 120,
  effects: { combatPower: 10, huntingBonus: 1.4, armorPiercing: 1.2 },
  researchRequired: 'bronze_working',
  emoji: '🔱',
  color: '#CD7F32',
  weaponProperties: {
    damage: 13,
    attackSpeed: 1.0,
    range: 2
  },
  amount: 0,
  craftingCost: { bronze_ingot: 3, oak_wood: 2, sinew: 2, leather: 1, plant_fiber: 1 },
  craftingTime: 5,
  toolTierRequired: 1,
  buildingRequired: 'bronze_foundry',
  populationRequired: 2,
  workTypes: ['metalworking']
},
{
  id: 'bronze_ash_spear',
  name: 'Bronze Ash Spear',
  description: 'Bronze spearhead on flexible ash shaft, perfectly balanced',
  type: 'weapon',
  category: 'combat',
  level: 1,
  rarity: 'rare',
  durability: 110,
  maxDurability: 110,
  effects: { combatPower: 9, huntingBonus: 1.5, throwingBonus: 1.6 },
  researchRequired: 'bronze_working',
  emoji: '🔱',
  color: '#CD7F32',
  weaponProperties: {
    damage: 12,
    attackSpeed: 1.2,
    range: 2
  },
  amount: 0,
  craftingCost: { bronze_ingot: 3, ash_wood: 2, sinew: 3, leather: 1, plant_fiber: 1 },
  craftingTime: 5,
  toolTierRequired: 1,
  buildingRequired: 'bronze_foundry',
  populationRequired: 2,
  workTypes: ['metalworking']
},
// IRON SPEARS (continued from iron_oak_spear)
{
  id: 'iron_oak_spear',
  name: 'Iron Oak Spear',
  description: 'Iron spearhead on oak shaft with complex leather and sinew wrapping',
  type: 'weapon',
  category: 'combat',
  level: 2,
  rarity: 'rare',
  durability: 180,
  maxDurability: 180,
  effects: { combatPower: 14, huntingBonus: 1.5, armorPiercing: 1.5 },
  researchRequired: 'iron_working',
  emoji: '🔱',
  color: '#424242',
  weaponProperties: {
    damage: 18,
    attackSpeed: 0.9,
    range: 2
  },
  amount: 0,
  craftingCost: { wrought_iron: 3, oak_wood: 2, sinew: 3, leather: 2, plant_fiber: 2 },
  craftingTime: 7,
  toolTierRequired: 2,
  buildingRequired: 'iron_forge',
  populationRequired: 2,
  workTypes: ['metalworking']
},

// STEEL SPEARS - Ultimate Tier
{
  id: 'steel_war_spear',
  name: 'Steel War Spear',
  description: 'Masterwork steel spearhead on yew shaft with bronze fittings',
  type: 'weapon',
  category: 'combat',
  level: 2,
  rarity: 'epic',
  durability: 250,
  maxDurability: 250,
  effects: { combatPower: 18, huntingBonus: 1.6, armorPiercing: 1.8, prestigeBonus: 1.5 },
  researchRequired: 'steel_making',
  emoji: '🔱',
  color: '#607D8B',
  weaponProperties: {
    damage: 25,
    attackSpeed: 0.8,
    range: 2
  },
  amount: 0,
  craftingCost: { steel_ingot: 4, yew_wood: 2, bronze_ingot: 2, leather: 3, sinew: 4 },
  craftingTime: 12,
  toolTierRequired: 2,
  buildingRequired: 'blast_furnace',
  populationRequired: 4,
  workTypes: ['metalworking']
},

// BOW PROGRESSION - Each wood type
{
  id: 'pine_bow',
  name: 'Pine Bow',
  description: 'Simple bow made from flexible pine with plant fiber string',
  type: 'weapon',
  category: 'combat',
  level: 0,
  rarity: 'common',
  durability: 40,
  maxDurability: 40,
  effects: { combatPower: 3, huntingBonus: 1.2, range: 1.1 },
  researchRequired: null,
  emoji: '🏹',
  color: '#4CAF50',
  weaponProperties: {
    damage: 5,
    attackSpeed: 0.9,
    range: 3
  },
  amount: 0,
  craftingCost: { pine_wood: 4, plant_fiber: 3 },
  craftingTime: 2,
  toolTierRequired: 0,
  buildingRequired: null,
  populationRequired: 0,
  workTypes: ['crafting']
},
{
  id: 'oak_bow',
  name: 'Oak Bow',
  description: 'Heavy oak bow with plant fiber string, high draw weight',
  type: 'weapon',
  category: 'combat',
  level: 0,
  rarity: 'uncommon',
  durability: 80,
  maxDurability: 80,
  effects: { combatPower: 6, huntingBonus: 1.3, armorPiercing: 1.1 },
  researchRequired: null,
  emoji: '🏹',
  color: '#8BC34A',
  weaponProperties: {
    damage: 9,
    attackSpeed: 0.6,
    range: 3
  },
  amount: 0,
  craftingCost: { oak_wood: 3, plant_fiber: 4 },
  craftingTime: 3,
  toolTierRequired: 0,
  buildingRequired: null,
  populationRequired: 0,
  workTypes: ['crafting']
},
{
  id: 'ash_bow',
  name: 'Ash Bow',
  description: 'Flexible ash bow with sinew string, excellent balance',
  type: 'weapon',
  category: 'combat',
  level: 0,
  rarity: 'uncommon',
  durability: 70,
  maxDurability: 70,
  effects: { combatPower: 5, huntingBonus: 1.4, range: 1.2 },
  researchRequired: null,
  emoji: '🏹',
  color: '#8BC34A',
  weaponProperties: {
    damage: 7,
    attackSpeed: 0.8,
    range: 4
  },
  amount: 0,
  craftingCost: { ash_wood: 3, sinew: 3, plant_fiber: 2 },
  craftingTime: 3,
  toolTierRequired: 0,
  buildingRequired: null,
  populationRequired: 0,
  workTypes: ['crafting']
},
{
  id: 'yew_bow',
  name: 'Yew Bow',
  description: 'Superior bow made from flexible yew wood with sinew string',
  type: 'weapon',
  category: 'combat',
  level: 1,
  rarity: 'rare',
  durability: 200,
  maxDurability: 200,
  effects: { combatPower: 8, huntingBonus: 1.8, range: 1.5 },
  researchRequired: 'advanced_forestry',
  emoji: '🏹',
  color: '#8B4513',
  weaponProperties: {
    damage: 10,
    attackSpeed: 0.7,
    range: 4
  },
  amount: 0,
  craftingCost: { yew_wood: 3, sinew: 4, leather: 1 },
  craftingTime: 8,
  toolTierRequired: 1,
  buildingRequired: 'advanced_workshop',
  populationRequired: 2,
  workTypes: ['crafting']
},

// COPPER REINFORCED BOWS
{
  id: 'copper_ash_bow',
  name: 'Copper-Reinforced Ash Bow',
  description: 'Ash bow with copper reinforcements and sinew string',
  type: 'weapon',
  category: 'combat',
  level: 1,
  rarity: 'uncommon',
  durability: 120,
  maxDurability: 120,
  effects: { combatPower: 7, huntingBonus: 1.5, range: 1.3, armorPiercing: 1.1 },
  researchRequired: 'copper_smelting',
  emoji: '🏹',
  color: '#FF7043',
  weaponProperties: {
    damage: 9,
    attackSpeed: 0.8,
    range: 4
  },
  amount: 0,
  craftingCost: { ash_wood: 3, copper_ingot: 1, sinew: 3, leather: 1, plant_fiber: 1 },
  craftingTime: 5,
  toolTierRequired: 1,
  buildingRequired: 'smelting_furnace',
  populationRequired: 1,
  workTypes: ['metalworking']
},
{
  id: 'copper_yew_bow',
  name: 'Copper-Reinforced Yew Bow',
  description: 'Yew bow with copper fittings and leather-wrapped grip',
  type: 'weapon',
  category: 'combat',
  level: 1,
  rarity: 'rare',
  durability: 180,
  maxDurability: 180,
  effects: { combatPower: 10, huntingBonus: 1.9, range: 1.6, armorPiercing: 1.2 },
  researchRequired: 'advanced_forestry',
  emoji: '🏹',
  color: '#FF7043',
  weaponProperties: {
    damage: 12,
    attackSpeed: 0.7,
    range: 5
  },
  amount: 0,
  craftingCost: { yew_wood: 3, copper_ingot: 2, sinew: 4, leather: 2, plant_fiber: 1 },
  craftingTime: 8,
  toolTierRequired: 1,
  buildingRequired: 'smelting_furnace',
  populationRequired: 2,
  workTypes: ['metalworking']
},

// BRONZE COMPOSITE BOWS
{
  id: 'bronze_composite_bow',
  name: 'Bronze Composite Bow',
  description: 'Advanced bow combining yew, bronze, and sinew for maximum power',
  type: 'weapon',
  category: 'combat',
  level: 1,
  rarity: 'epic',
  durability: 250,
  maxDurability: 250,
  effects: { combatPower: 12, huntingBonus: 2.0, range: 1.8, armorPiercing: 1.4 },
  researchRequired: 'bronze_working',
  emoji: '🏹',
  color: '#CD7F32',
  weaponProperties: {
    damage: 15,
    attackSpeed: 0.6,
    range: 5
  },
  amount: 0,
  craftingCost: { yew_wood: 2, bronze_ingot: 3, sinew: 5, leather: 2, plant_fiber: 2 },
  craftingTime: 10,
  toolTierRequired: 1,
  buildingRequired: 'bronze_foundry',
  populationRequired: 3,
  workTypes: ['metalworking']
},

// IRON AND STEEL BOWS
{
  id: 'iron_war_bow',
  name: 'Iron War Bow',
  description: 'Heavy war bow with iron reinforcements and steel-tipped arrows',
  type: 'weapon',
  category: 'combat',
  level: 2,
  rarity: 'rare',
  durability: 300,
  maxDurability: 300,
  effects: { combatPower: 15, huntingBonus: 2.2, range: 2.0, armorPiercing: 1.6 },
  researchRequired: 'iron_working',
  emoji: '🏹',
  color: '#424242',
  weaponProperties: {
    damage: 20,
    attackSpeed: 0.5,
    range: 5
  },
  amount: 0,
  craftingCost: { yew_wood: 2, wrought_iron: 4, bronze_ingot: 2, sinew: 6, leather: 3 },
  craftingTime: 12,
  toolTierRequired: 2,
  buildingRequired: 'iron_forge',
  populationRequired: 3,
  workTypes: ['metalworking']
},
{
  id: 'steel_longbow',
  name: 'Steel Longbow',
  description: 'Masterwork longbow with steel core and yew laminate',
  type: 'weapon',
  category: 'combat',
  level: 2,
  rarity: 'epic',
  durability: 400,
  maxDurability: 400,
  effects: { combatPower: 18, huntingBonus: 2.5, range: 2.5, armorPiercing: 1.8, prestigeBonus: 1.5 },
  researchRequired: 'steel_making',
  emoji: '🏹',
  color: '#607D8B',
  weaponProperties: {
    damage: 25,
    attackSpeed: 0.4,
    range: 6
  },
  amount: 0,
  craftingCost: { yew_wood: 3, steel_ingot: 5, bronze_ingot: 3, sinew: 8, leather: 4 },
  craftingTime: 15,
  toolTierRequired: 2,
  buildingRequired: 'blast_furnace',
  populationRequired: 4,
  workTypes: ['metalworking']
},

// BLUNT WEAPONS - Complete Progression
{
  id: 'wooden_club',
  name: 'Wooden Club',
  description: 'Simple oak club, the most basic blunt weapon',
  type: 'weapon',
  category: 'combat',
  level: 0,
  rarity: 'common',
  durability: 50,
  maxDurability: 50,
  effects: { combatPower: 3, stunChance: 1.2 },
  researchRequired: null,
  emoji: '🏏',
  color: '#8BC34A',
  weaponProperties: {
    damage: 5,
    attackSpeed: 1.4,
    range: 1
  },
  amount: 0,
  craftingCost: { oak_wood: 3 },
  craftingTime: 1,
  toolTierRequired: 0,
  buildingRequired: null,
  populationRequired: 0,
  workTypes: ['crafting']
},
{
  id: 'stone_mace',
  name: 'Stone Mace',
  description: 'Heavy stone head bound to ash handle with sinew',
  type: 'weapon',
  category: 'combat',
  level: 0,
  rarity: 'common',
  durability: 80,
  maxDurability: 80,
  effects: { combatPower: 6, stunChance: 1.4, armorCrushing: 1.2 },
  researchRequired: null,
  emoji: '🔨',
  color: '#9E9E9E',
  weaponProperties: {
    damage: 9,
    attackSpeed: 0.9,
    range: 1
  },
  amount: 0,
  craftingCost: { limestone: 4, ash_wood: 2, sinew: 2 },
  craftingTime: 2,
  toolTierRequired: 0,
  buildingRequired: null,
  populationRequired: 0,
  workTypes: ['crafting']
},
{
  id: 'bone_club',
  name: 'Bone Club',
  description: 'Large bone bound to oak handle, intimidating and effective',
  type: 'weapon',
  category: 'combat',
  level: 0,
  rarity: 'uncommon',
  durability: 60,
  maxDurability: 60,
  effects: { combatPower: 5, stunChance: 1.3, intimidation: 1.5 },
  researchRequired: null,
  emoji: '🦴',
  color: '#F5F5DC',
  weaponProperties: {
    damage: 7,
    attackSpeed: 1.1,
    range: 1
  },
  amount: 0,
  craftingCost: { bone: 3, oak_wood: 2, sinew: 1 },
  craftingTime: 2,
  toolTierRequired: 0,
  buildingRequired: null,
  populationRequired: 0,
  workTypes: ['crafting']
},
{
  id: 'copper_mace',
  name: 'Copper Mace',
  description: 'Copper head on oak handle with leather grip and plant fiber wrap',
  type: 'weapon',
  category: 'combat',
  level: 1,
  rarity: 'common',
  durability: 120,
  maxDurability: 120,
  effects: { combatPower: 8, stunChance: 1.5, armorCrushing: 1.3 },
  researchRequired: 'copper_smelting',
  emoji: '🔨',
  color: '#FF7043',
  weaponProperties: {
    damage: 12,
    attackSpeed: 0.8,
    range: 1
  },
  amount: 0,
  craftingCost: { copper_ingot: 3, oak_wood: 2, leather: 1, plant_fiber: 2 },
  craftingTime: 4,
  toolTierRequired: 1,
  buildingRequired: 'smelting_furnace',
  populationRequired: 1,
  workTypes: ['metalworking']
},
{
  id: 'bronze_mace',
  name: 'Bronze Mace',
  description: 'Bronze flanged mace with oak handle and leather-wrapped grip',
  type: 'weapon',
  category: 'combat',
  level: 1,
  rarity: 'uncommon',
  durability: 160,
  maxDurability: 160,
  effects: { combatPower: 11, stunChance: 1.6, armorCrushing: 1.4 },
  researchRequired: 'bronze_working',
  emoji: '🔨',
  color: '#CD7F32',
  weaponProperties: {
    damage: 16,
    attackSpeed: 0.8,
    range: 1
  },
  amount: 0,
  craftingCost: { bronze_ingot: 3, oak_wood: 2, leather: 2, sinew: 1, plant_fiber: 1 },
  craftingTime: 5,
  toolTierRequired: 1,
  buildingRequired: 'bronze_foundry',
  populationRequired: 2,
  workTypes: ['metalworking']
},
{
  id: 'iron_mace',
  name: 'Iron Mace',
  description: 'Iron flanged mace with ash handle, bronze fittings, and leather grip',
  type: 'weapon',
  category: 'combat',
  level: 2,
  rarity: 'uncommon',
  durability: 220,
  maxDurability: 220,
  effects: { combatPower: 14, stunChance: 1.7, armorCrushing: 1.6 },
  researchRequired: 'iron_working',
  emoji: '🔨',
  color: '#424242',
  weaponProperties: {
    damage: 20,
    attackSpeed: 0.8,
    range: 1
  },
  amount: 0,
  craftingCost: { wrought_iron: 3, ash_wood: 2, bronze_ingot: 1, leather: 2, sinew: 2, plant_fiber: 1 },
  craftingTime: 6,
  toolTierRequired: 2,
  buildingRequired: 'iron_forge',
  populationRequired: 2,
  workTypes: ['metalworking']
},
{
  id: 'steel_war_hammer',
  name: 'Steel War Hammer',
  description: 'Masterwork steel hammer with yew handle, bronze fittings, and ornate leather grip',
  type: 'weapon',
  category: 'combat',
  level: 2,
  rarity: 'epic',
  durability: 300,
  maxDurability: 300,
  effects: { combatPower: 20, stunChance: 2.0, armorCrushing: 2.2, reach: 1.4, prestigeBonus: 1.3 },
  researchRequired: 'steel_making',
  emoji: '🔨',
  color: '#607D8B',
  weaponProperties: {
    damage: 30,
    attackSpeed: 0.5,
    range: 1
  },
  amount: 0,
  craftingCost: { steel_ingot: 4, yew_wood: 2, bronze_ingot: 3, leather: 4, sinew: 4, plant_fiber: 3 },
  craftingTime: 12,
  toolTierRequired: 2,
  buildingRequired: 'blast_furnace',
  populationRequired: 4,
  workTypes: ['metalworking']
},

// SWORDS - Complete Progression
{
  id: 'copper_dagger',
  name: 'Copper Dagger',
  description: 'Short copper blade with pine handle, first metal weapon',
  type: 'weapon',
  category: 'combat',
  level: 1,
  rarity: 'common',
  durability: 90,
  maxDurability: 90,
  effects: { combatPower: 6, concealable: 1.5, craftingBonus: 0.2 },
  researchRequired: 'copper_smelting',
  emoji: '🗡️',
  color: '#FF7043',
  weaponProperties: {
    damage: 8,
    attackSpeed: 1.4,
    range: 1
  },
  amount: 0,
  craftingCost: { copper_ingot: 2, pine_wood: 1, plant_fiber: 2 },
  craftingTime: 3,
  toolTierRequired: 1,
  buildingRequired: 'smelting_furnace',
  populationRequired: 1,
  workTypes: ['metalworking']
},
{
  id: 'bronze_sword',
  name: 'Bronze Sword',
  description: 'Full bronze blade with oak handle, leather grip, and bronze pommel',
  type: 'weapon',
  category: 'combat',
  level: 1,
  rarity: 'uncommon',
  durability: 180,
  maxDurability: 180,
  effects: { combatPower: 12, versatility: 1.4 },
  researchRequired: 'bronze_working',
  emoji: '🗡️',
  color: '#CD7F32',
  weaponProperties: {
    damage: 16,
    attackSpeed: 1.0,
    range: 1
  },
  amount: 0,
  craftingCost: { bronze_ingot: 4, oak_wood: 1, leather: 2, sinew: 1, plant_fiber: 1 },
  craftingTime: 6,
  toolTierRequired: 1,
  buildingRequired: 'bronze_foundry',
  populationRequired: 2,
  workTypes: ['metalworking']
},
{
  id: 'steel_sword',
  name: 'Steel Sword',
  description: 'Superior steel blade with yew handle, bronze fittings, and masterwork leather grip',
  type: 'weapon',
  category: 'combat',
  level: 2,
  rarity: 'epic',
  durability: 350,
  maxDurability: 350,
  effects: { combatPower: 20, versatility: 1.8, armorPiercing: 1.6, prestigeBonus: 1.5 },
  researchRequired: 'steel_making',
  emoji: '🗡️',
  color: '#607D8B',
  weaponProperties: {
    damage: 30,
    attackSpeed: 0.9,
    range: 1
  },
  amount: 0,
  craftingCost: { steel_ingot: 4, yew_wood: 1, bronze_ingot: 2, leather: 3, sinew: 3, plant_fiber: 2 },
  craftingTime: 12,
  toolTierRequired: 2,
  buildingRequired: 'blast_furnace',
  populationRequired: 4,
  workTypes: ['metalworking']
},

// ARMOR SYSTEM - Complete Progression
{
  id: 'hide_vest',
  name: 'Hide Vest',
  description: 'Raw hide vest bound with plant fiber for basic protection',
  type: 'armor',
  category: 'light',
  level: 0,
  rarity: 'common',
  durability: 40,
  maxDurability: 40,
  effects: { defense: 2, coldResistance: 0.3 },
  researchRequired: null,
  emoji: '🦺',
  color: '#8D6E63',
  armorProperties: {
    defense: 2,
    armorType: 'light',
    slot: 'chest',
    movementPenalty: 0.0
  },
  amount: 0,
  craftingCost: { hide: 3, plant_fiber: 2 },
  craftingTime: 2,
  toolTierRequired: 0,
  buildingRequired: null,
  populationRequired: 0,
  workTypes: ['crafting']
},
{
  id: 'leather_armor',
  name: 'Leather Armor',
  description: 'Properly tanned leather armor with reinforced stitching',
  type: 'armor',
  category: 'light',
  level: 1,
  rarity: 'common',
  durability: 100,
  maxDurability: 100,
  effects: { defense: 4, mobility: 1.1 },
  researchRequired: 'leather_working',
  emoji: '🦺',
  color: '#8D6E63',
  armorProperties: {
    defense: 4,
    armorType: 'light',
    slot: 'chest',
    movementPenalty: 0.0
  },
  amount: 0,
  craftingCost: { leather: 4, sinew: 2 },
  craftingTime: 4,
  toolTierRequired: 1,
  buildingRequired: 'tannery',
  populationRequired: 1,
  workTypes: ['leatherworking']
},
{
  id: 'bronze_chainmail',
  name: 'Bronze Chainmail',
  description: 'Interlocked bronze rings over leather backing',
  type: 'armor',
  category: 'medium',
  level: 1,
  rarity: 'rare',
  durability: 220,
  maxDurability: 220,
  effects: { defense: 9, flexibility: 1.0, slashResistance: 1.3 },
  researchRequired: 'bronze_working',
  emoji: '🦺',
  color: '#CD7F32',
  armorProperties: {
    defense: 9,
    armorType: 'medium',
    slot: 'chest',
    movementPenalty: 0.2
  },
  amount: 0,
  craftingCost: { bronze_ingot: 6, leather: 2, sinew: 4, plant_fiber: 2 },
  craftingTime: 10,
  toolTierRequired: 1,
  buildingRequired: 'bronze_foundry',
  populationRequired: 3,
  workTypes: ['metalworking']
},
{
  id: 'steel_plate_armor',
  name: 'Steel Plate Armor',
  description: 'Full steel plate with articulated joints, bronze fittings, and leather backing',
  type: 'armor',
  category: 'heavy',
  level: 2,
  rarity: 'epic',
  durability: 500,
  maxDurability: 500,
  effects: { defense: 20, crushResistance: 1.6, slashResistance: 1.4, prestigeBonus: 2.0 },
  researchRequired: 'steel_making',
  emoji: '🦺',
  color: '#607D8B',
  armorProperties: {
    defense: 20,
    armorType: 'heavy',
    slot: 'chest',
    movementPenalty: 0.35
  },
  amount: 0,
  craftingCost: { steel_ingot: 10, bronze_ingot: 4, leather: 5, sinew: 4, plant_fiber: 3 },
  craftingTime: 20,
  toolTierRequired: 2,
  buildingRequired: 'blast_furnace',
  populationRequired: 5,
  workTypes: ['metalworking']
},

// TOOLS - Complete Progression
{
  id: 'stone_axe',
  name: 'Stone Axe',
  description: 'Stone axe with pine handle for cutting softwood',
  type: 'tool',
  category: 'harvesting',
  level: 0,
  rarity: 'common',
  durability: 80,
  maxDurability: 80,
  effects: { pineBonus: 1.6, firBonus: 1.4, hardwoodPenalty: 0.7 },
  researchRequired: null,
  emoji: '🪓',
  color: '#8D6E63',
  amount: 0,
  craftingCost: { sandstone: 4, pine_wood: 3, plant_fiber: 2 },
  craftingTime: 2,
  toolTierRequired: 0,
  buildingRequired: null,
  populationRequired: 0,
  workTypes: ['crafting']
},
{
  id: 'bronze_hammer',
  name: 'Bronze Hammer',
  description: 'Bronze hammer with balanced weight and ash wood handle',
  type: 'tool',
  category: 'crafting',
  level: 1,
  rarity: 'uncommon',
  durability: 220,
  maxDurability: 220,
  effects: { craftingSpeed: 0.25, buildingSpeed: 0.2, durabilityBonus: 0.1 },
  researchRequired: 'bronze_working',
  emoji: '🔨',
  color: '#CD7F32',
  amount: 0,
  craftingCost: { ash_wood: 2, bronze_ingot: 3, leather: 1 },
  craftingTime: 4,
  toolTierRequired: 1,
  buildingRequired: 'bronze_foundry',
  populationRequired: 2,
  workTypes: ['metalworking']
},
{
  id: 'steel_anvil',
  name: 'Steel Anvil',
  description: 'Master craftsmans steel anvil with hardened face and bronze details',
  type: 'tool',
  category: 'metalworking',
  level: 2,
  rarity: 'epic',
  durability: 600,
  maxDurability: 600,
  effects: { 
    metalworkingBonus: 2.0, 
    qualityBonus: 0.5,
    durabilityBonus: 0.4,
    prestigeBonus: 1.5,
    forgingBonus: 1.8
  },
  researchRequired: 'steel_making',
  emoji: '🔨',
  color: '#607D8B',
  amount: 0,
  craftingCost: { steel_ingot: 15, bronze_ingot: 5, granite: 12, yew_wood: 8, leather: 2 },
  craftingTime: 20,
  toolTierRequired: 2,
  buildingRequired: 'blast_furnace',
  populationRequired: 6,
  workTypes: ['metalworking']
},

// CONSUMABLES - Complete Progression
{
  id: 'healing_potion',
  name: 'Healing Potion',
  description: 'Concentrated herbal remedy brewed in bronze vessels',
  type: 'consumable',
  category: 'medical',
  level: 1,
  rarity: 'uncommon',
  effects: { healthRestore: 50, regeneration: 1.3, vitality: 0.5 },
  researchRequired: 'herbalism',
  emoji: '🧪',
  color: '#E91E63',
  consumableProperties: {
    uses: 1,
    consumeTime: 2
  },
  amount: 0,
  craftingCost: { herbs: 4, honey: 2, crystal_water: 1, bronze_vessel: 1 },
  craftingTime: 6,
  toolTierRequired: 1,
  buildingRequired: 'apothecary',
  populationRequired: 2,
  workTypes: ['alchemy']
},
{
  id: 'fresh_bread',
  name: 'Fresh Bread',
  description: 'Warm bread baked in stone oven with grain flour',
  type: 'consumable',
  category: 'meal',
  level: 1,
  rarity: 'common',
  effects: { healthRestore: 25, energyBoost: 1.6, morale: 0.4, carbohydrateBonus: 0.5 },
  researchRequired: 'baking',
  emoji: '🍞',
  color: '#FFCC80',
  consumableProperties: {
    uses: 1,
    consumeTime: 2
  },
  amount: 0,
  craftingCost: { grain: 4, salt: 1, yeast: 1 },
  craftingTime: 6,
  toolTierRequired: 1,
  buildingRequired: 'bakery',
  populationRequired: 1,
  workTypes: ['crafting']
},
{
  id: 'master_crafters_elixir',
  name: 'Master Crafters Elixir',
  description: 'Potent elixir that grants temporary mastery over all crafts',
  type: 'consumable',
  category: 'alchemical',
  level: 2,
  rarity: 'rare',
  effects: { 
    allCraftingBonus: 2.0, 
    masterworkChance: 0.4, 
    resourceEfficiency: 1.6,
    toolMastery: 1.8,
    duration: 10
  },
  researchRequired: 'master_alchemy',
  emoji: '🧙',
  color: '#FFD700',
  consumableProperties: {
    uses: 1,
    consumeTime: 5
  },
  amount: 0,
  craftingCost: { crafters_focus: 2, steel_essence: 1, master_herbs: 3, gold_vessel: 1 },
  craftingTime: 15,
  toolTierRequired: 2,
  buildingRequired: 'grand_laboratory',
  populationRequired: 4,
  workTypes: ['alchemy']
}

];


// Helper functions following building system pattern
export function getItemsByType(itemType: string): Item[] {
  return ITEMS_DATABASE.filter(item => item.type === itemType);
}

export function getItemsByCategory(category: string): Item[] {
  return ITEMS_DATABASE.filter(item => item.category === category);
}

// Get basic materials (formerly BASIC_RESOURCES)
export function getBasicMaterials(): Item[] {
  return ITEMS_DATABASE.filter(item => 
    item.type === 'material' && item.category === 'basic'
  );
}

// Enhanced getCraftableItems with category filtering
export function getCraftableItems(
  completedResearch: string[],
  availableBuildings: string[],
  currentToolLevel: number,
  currentPopulation: number,
  itemType?: string,
  category?: string
): Item[] {
  let items = ITEMS_DATABASE.filter(item => 
    item.craftingCost && Object.keys(item.craftingCost).length > 0
  );
  
  // Filter by type if specified
  if (itemType) {
    items = items.filter(item => item.type === itemType);
  }
  
  // Filter by category if specified
  if (category) {
    items = items.filter(item => item.category === category);
  }
  
  return items.filter(item => {
    // Research requirements
    if (item.researchRequired && !completedResearch.includes(item.researchRequired)) return false;
    
    // Tool level requirements
    if (item.toolTierRequired && item.toolTierRequired > currentToolLevel) return false;
    
    // Building requirements
    if (item.buildingRequired && !availableBuildings.includes(item.buildingRequired)) return false;
    
    // Population requirements
    if (item.populationRequired && item.populationRequired > currentPopulation) return false;
    
    return true;
  });
}

// Additional helper for getting items by both type and category
export function getItemsByTypeAndCategory(itemType?: string, category?: string): Item[] {
  let items = ITEMS_DATABASE;
  
  if (itemType) {
    items = items.filter(item => item.type === itemType);
  }
  
  if (category) {
    items = items.filter(item => item.category === category);
  }
  
  return items;
}

// Get all available categories for a given type
export function getCategoriesForType(itemType: string): string[] {
  const categories = new Set<string>();
  ITEMS_DATABASE
    .filter(item => item.type === itemType)
    .forEach(item => categories.add(item.category));
  return Array.from(categories).sort();
}

// Get all available types
export function getAllItemTypes(): string[] {
  const types = new Set<string>();
  ITEMS_DATABASE.forEach(item => types.add(item.type));
  return Array.from(types).sort();
}

// Get all available categories
export function getAllItemCategories(): string[] {
  const categories = new Set<string>();
  ITEMS_DATABASE.forEach(item => categories.add(item.category));
  return Array.from(categories).sort();
}

// Check if item can be crafted (similar to canAffordBuilding)
export function canCraftItem(item: Item, currentInventory: Record<string, number>): boolean {
  if (!item.craftingCost) return false;
  
  return Object.entries(item.craftingCost).every(([itemId, amount]) => 
    (currentInventory[itemId] || 0) >= amount
  );
}

// Check if item can be crafted with current game state (similar to canBuildWithPopulation)
export function canCraftWithRequirements(
  item: Item, 
  currentToolLevel: number,
  availableBuildings: string[],
  currentPopulation: number,
  completedResearch: string[]
): boolean {
  // Research requirements
  if (item.researchRequired && !completedResearch.includes(item.researchRequired)) return false;
  
  // Tool level requirements
  if (item.toolTierRequired && item.toolTierRequired > currentToolLevel) return false;
  
  // Building requirements
  if (item.buildingRequired && !availableBuildings.includes(item.buildingRequired)) return false;
  
  // Population requirements
  if (item.populationRequired && item.populationRequired > currentPopulation) return false;
  
  return true;
}

// Enhanced item information helpers
export function getItemInfo(itemId: string): Item | undefined {
  return ITEMS_DATABASE.find(i => i.id === itemId);
}

export function getItemsByLevel(level: number): Item[] {
  return ITEMS_DATABASE.filter(item => item.level === level);
}

export function getItemsByRarity(rarity: string): Item[] {
  return ITEMS_DATABASE.filter(item => item.rarity === rarity);
}

// Unified icon/color functions
export function getItemIcon(itemId: string): string {
  const item = ITEMS_DATABASE.find(i => i.id === itemId);
  return item?.emoji || '📦';
}

export function getItemColor(itemId: string): string {
  const item = ITEMS_DATABASE.find(i => i.id === itemId);
  return item?.color || '#4CAF50';
}

export function getItemRarityColor(rarity: string): string {
  switch (rarity) {
    case 'common': return '#9E9E9E';
    case 'uncommon': return '#4CAF50';
    case 'rare': return '#2196F3';
    case 'epic': return '#9C27B0';
    case 'legendary': return '#FF9800';
    default: return '#9E9E9E';
  }
}

// Helper for getting crafting chain dependencies
export function getCraftingDependencies(itemId: string): string[] {
  const item = ITEMS_DATABASE.find(i => i.id === itemId);
  if (!item?.craftingCost) return [];
  
  return Object.keys(item.craftingCost);
}

// Helper for getting items that use this item as a material
export function getItemUsages(itemId: string): Item[] {
  return ITEMS_DATABASE.filter(item => 
    item.craftingCost && Object.keys(item.craftingCost).includes(itemId)
  );
}

// Helper for calculating total crafting time including dependencies
export function getTotalCraftingTime(itemId: string, depth: number = 0): number {
  if (depth > 10) return 0; // Prevent infinite recursion
  
  const item = ITEMS_DATABASE.find(i => i.id === itemId);
  if (!item) return 0;
  
  let totalTime = item.craftingTime || 0;
  
  if (item.craftingCost) {
    const dependencyTimes = Object.keys(item.craftingCost).map(depId => 
      getTotalCraftingTime(depId, depth + 1)
    );
    totalTime += Math.max(...dependencyTimes, 0);
  }
  
  return totalTime;
}


// Magical resource creation (now creates magical materials)
export function createMagicalMaterial(): Item {
  const magicalTypes = ['Crystal', 'Essence', 'Rune', 'Shard'];
  const properties = ['Fire', 'Ice', 'Lightning', 'Shadow', 'Light'];
  
  const type = magicalTypes[Math.floor(Math.random() * magicalTypes.length)];
  const property = properties[Math.floor(Math.random() * properties.length)];
  
  return {
    id: `${property.toLowerCase()}_${type.toLowerCase()}`,
    name: `${property} ${type}`,
    description: `Magical ${type.toLowerCase()} infused with ${property.toLowerCase()} energy`,
    type: 'material',
    category: 'magical',
    level: 2,
    rarity: 'rare',
    effects: { magicalPower: Math.floor(Math.random() * 10) + 1 },
    researchRequired: null,
    emoji: '🔮',
    color: '#9C27B0',
    amount: 0,
    craftingCost: {},
    craftingTime: 0,
    toolTierRequired: 0,
    buildingRequired: null,
    populationRequired: 0
  };
}
