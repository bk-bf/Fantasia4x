import type { Building } from './types';
// Enhanced affordability check using buildingCost
 // BUILDINGS DATABASE - Complete Progression Using Specific Materials
export const AVAILABLE_BUILDINGS: Building[] = [
// BASIC SHELTER & HOUSING - Level 0
{
  id: 'lean_to_shelter',
  name: 'Lean-To Shelter',
  description: 'Basic shelter made from pine branches and plant fiber',
  category: 'housing',
  tier: 0,
  rarity: 'common',
  effects: { 
    populationCapacity: 2, 
    weatherProtection: 0.3,
    morale: 0.1
  },
  researchRequired: null,
  emoji: '🏕️',
  color: '#8BC34A',
  buildingCost: { pine_wood: 8, plant_fiber: 6 },
  buildTime: 2,
  toolTierRequired: 0,
  populationRequired: 1,
  upkeepCost: {},
  productionBonus: {},
  storageCapacity: {}
},
{
  id: 'woodland_shelter',
  name: 'Woodland Shelter',
  description: 'Sturdy shelter built with oak logs and hide covering',
  category: 'housing',
  tier: 0,
  rarity: 'common',
  effects: { 
    populationCapacity: 5, 
    weatherProtection: 0.6,
    morale: 0.2,
    coldResistance: 0.4
  },
  researchRequired: null,
  emoji: '🏠',
  color: '#8BC34A',
  buildingCost: { oak_wood: 15, hide: 4, plant_fiber: 8, sandstone: 5 },
  buildTime: 4,
  toolTierRequired: 0,
  populationRequired: 2,
  upkeepCost: {},
  productionBonus: {},
  storageCapacity: {}
},
{
  id: 'stone_hut',
  name: 'Stone Hut',
  description: 'Durable stone dwelling with oak timber frame',
  category: 'housing',
  tier: 1,
  rarity: 'uncommon',
  effects: { 
    populationCapacity: 8, 
    weatherProtection: 0.9,
    morale: 0.4,
    defenseBonus: 0.2
  },
  researchRequired: 'stone_masonry',
  emoji: '🏠',
  color: '#9E9E9E',
  buildingCost: { limestone: 20, oak_wood: 10, leather: 3, plant_fiber: 5 },
  buildTime: 6,
  toolTierRequired: 1,
  populationRequired: 3,
  upkeepCost: {},
  productionBonus: {},
  storageCapacity: {}
},

// CRAFTING & PRODUCTION - Level 0-2
{
  id: 'simple_butchery',
  name: 'Simple Butchery',
  description: 'Wooden table for processing animal carcasses into meat and hide',
  category: 'food',
  tier: 0,
  rarity: 'common',
  effects: { 
    meatProcessing: 1.5,
    hideProcessing: 1.3,
    wasteReduction: 0.8
  },
  researchRequired: null,
  emoji: '🔪',
  color: '#8D6E63',
  buildingCost: { 
    oak_wood: 8, 
    flint: 4, 
    sinew: 2 
  },
  buildTime: 3,
  toolTierRequired: 0,
  populationRequired: 1,
  upkeepCost: {},
  productionBonus: { 
    meat_processing: 1.5,
    hide_processing: 1.3
  },
  storageCapacity: { 
    carcasses: 20, 
    processed_meat: 30, 
    hides: 15 
  }
},
{
  id: 'craftsmens_workshop',
  name: 'Craftsmens Workshop',
  description: 'Basic workshop with stone tools and oak workbenches',
  category: 'production',
  tier: 0,
  rarity: 'common',
  effects: { 
    craftingSpeed: 1.3,
    toolEfficiency: 1.2,
    qualityBonus: 0.1
  },
  researchRequired: null,
  emoji: '🔨',
  color: '#FF7043',
  buildingCost: { oak_wood: 20, sandstone: 10, plant_fiber: 5 },
  buildTime: 3,
  toolTierRequired: 0,
  populationRequired: 2,
  upkeepCost: {},
  productionBonus: { 
    crafting_tools: 1.3,
    woodworking_tools: 1.2,
    basic_weapons: 1.1
  },
   storageCapacity: {}
},
{
  id: 'smelting_furnace',
  name: 'Smelting Furnace',
  description: 'Clay and stone furnace for basic metal smelting',
  category: 'production',
  tier: 1,
  rarity: 'uncommon',
  effects: { 
    smeltingEfficiency: 1.5,
    fuelEfficiency: 1.3,
    metalQuality: 1.2
  },
  researchRequired: 'copper_smelting',
  emoji: '🔥',
  color: '#FF5722',
  buildingCost: { 
    common_clay: 15, 
    limestone: 12, 
    charcoal: 5, 
    oak_wood: 8,
    plant_fiber: 3
  },
  buildTime: 5,
  toolTierRequired: 1,
  populationRequired: 1,
  upkeepCost: { charcoal: 1 },
  productionBonus: { 
    copper_ingot: 1.5,
    tin_ingot: 1.4,
    refined_metals: 1.3
  },
  storageCapacity: {}
},
{
  id: 'bronze_foundry',
  name: 'Bronze Foundry',
  description: 'Advanced foundry with fire bricks and bronze tools',
  category: 'production',
  tier: 1,
  rarity: 'uncommon',
  effects: { 
    alloyEfficiency: 1.8,
    castingQuality: 1.5,
    productionSpeed: 1.4
  },
  researchRequired: 'bronze_working',
  emoji: '🏭',
  color: '#CD7F32',
  buildingCost: { 
    fire_bricks: 10, 
    bronze_ingot: 5, 
    limestone: 15, 
    oak_wood: 12,
    leather: 3
  },
  buildTime: 8,
  toolTierRequired: 1,
  populationRequired: 2,
  upkeepCost: { charcoal: 2 },
  productionBonus: { 
    bronze_ingot: 1.8,
    bronze_weapons: 1.5,
    bronze_armor: 1.4,
    bronze_tools: 1.6
  },
  storageCapacity: {}
},
{
  id: 'iron_forge',
  name: 'Iron Forge',
  description: 'Heavy-duty forge with granite base and bronze fittings',
  category: 'production',
  tier: 2,
  rarity: 'rare',
  effects: { 
    ironWorkingBonus: 2.0,
    toolQuality: 1.8,
    weaponCrafting: 1.6
  },
  researchRequired: 'iron_working',
  emoji: '⚒️',
  color: '#424242',
  buildingCost: { 
    granite: 20, 
    fire_bricks: 15, 
    bronze_ingot: 8, 
    wrought_iron: 5,
    leather: 5,
    oak_wood: 10
  },
  buildTime: 12,
  toolTierRequired: 2,
  populationRequired: 3,
  upkeepCost: { charcoal: 3 },
  productionBonus: { 
    wrought_iron: 2.0,
    iron_weapons: 1.6,
    iron_armor: 1.5,
    iron_tools: 1.7
  },
  storageCapacity: {}
},
{
  id: 'blast_furnace',
  name: 'Blast Furnace',
  description: 'Massive furnace for steel production with water wheel power',
  category: 'production',
  tier: 2,
  rarity: 'epic',
  effects: { 
    steelProduction: 2.5,
    massProduction: 2.0,
    fuelEfficiency: 1.8
  },
  researchRequired: 'steel_making',
  emoji: '🏭',
  color: '#607D8B',
  buildingCost: { 
    granite: 30, 
    fire_bricks: 25, 
    wrought_iron: 15, 
    bronze_ingot: 10,
    yew_wood: 8,
    leather: 6
  },
  buildTime: 20,
  toolTierRequired: 2,
  populationRequired: 5,
  upkeepCost: { charcoal: 5, water: 2 },
  productionBonus: { 
    steel_ingot: 2.5,
    steel_weapons: 2.0,
    steel_armor: 1.8,
    masterwork_items: 1.5
  },
  storageCapacity: {}
},

// SPECIALIZED WORKSHOPS - Level 1-2
{
  id: 'tannery',
  name: 'Tannery',
  description: 'Leather processing facility with oak bark vats',
  category: 'production',
  tier: 1,
  rarity: 'common',
  effects: { 
    leatherQuality: 1.6,
    hideProcessing: 1.8,
    armorCrafting: 1.3
  },
  researchRequired: 'leather_working',
  emoji: '🦬',
  color: '#8D6E63',
  buildingCost: { 
    oak_wood: 15, 
    common_clay: 8, 
    limestone: 6,
    plant_fiber: 10,
    bone: 5
  },
  buildTime: 4,
  toolTierRequired: 1,
  populationRequired: 1,
  upkeepCost: { oak_wood: 1 },
  productionBonus: { 
    leather: 1.8,
    leather_armor: 1.5,
    leather_goods: 1.6
  },
   storageCapacity: {}
},
{
  id: 'advanced_kiln',
  name: 'Advanced Kiln',
  description: 'High-temperature kiln for fire bricks and fine ceramics',
  category: 'production',
  tier: 1,
  rarity: 'uncommon',
  effects: { 
    ceramicQuality: 1.8,
    firebrickProduction: 2.0,
    heatEfficiency: 1.5
  },
  researchRequired: 'advanced_pottery',
  emoji: '🔥',
  color: '#FF5722',
  buildingCost: { 
    fire_clay: 12, 
    limestone: 10, 
    bronze_ingot: 3,
    oak_wood: 8
  },
  buildTime: 6,
  toolTierRequired: 1,
  populationRequired: 2,
  upkeepCost: { charcoal: 2 },
  productionBonus: { 
    fire_bricks: 2.0,
    porcelain_vessels: 1.6,
    ceramic_goods: 1.8
  },
  storageCapacity: {}
},
{
  id: 'porcelain_workshop',
  name: 'Porcelain Workshop',
  description: 'Delicate workshop for fine porcelain and luxury ceramics',
  category: 'production',
  tier: 1,
  rarity: 'rare',
  effects: { 
    luxuryProduction: 2.2,
    tradeValue: 1.8,
    prestigeBonus: 1.5
  },
  researchRequired: 'fine_ceramics',
  emoji: '🏺',
  color: '#FAFAFA',
  buildingCost: { 
    porcelain_clay: 8, 
    bronze_ingot: 5, 
    yew_wood: 6,
    leather: 4,
    crystal: 1
  },
  buildTime: 10,
  toolTierRequired: 1,
  populationRequired: 3,
  upkeepCost: { charcoal: 1 },
  productionBonus: { 
    porcelain_vessels: 2.2,
    luxury_goods: 2.0,
    trade_items: 1.8
  },
  storageCapacity: {}
},

// KNOWLEDGE & RESEARCH - Level 0-2 (Revised Names)
{
  id: 'scroll_hut',
  name: 'Scroll Hut',
  description: 'Simple hut where knowledge keepers store birch bark records',
  category: 'knowledge',
  tier: 0,
  rarity: 'common',
  effects: { 
    knowledgeGeneration: 25,
    researchSpeed: 1.2,
    wisdomBonus: 0.3
  },
  researchRequired: null,
  emoji: '📜',
  color: '#8D6E63',
  buildingCost: { 
    birch_wood: 25, 
    limestone: 15, 
    plant_fiber: 8,
    hide: 3
  },
  buildTime: 5,
  toolTierRequired: 0,
  populationRequired: 1,
  upkeepCost: {},
  productionBonus: {},
   storageCapacity: {}
},
{
  id: 'study_hall',
  name: 'Study Hall',
  description: 'Bronze Age hall where scribes teach and copy texts',
  category: 'knowledge',
  tier: 1,
  rarity: 'uncommon',
  effects: { 
    knowledgeGeneration: 50,
    researchSpeed: 1.5,
    scholarTraining: 1.4
  },
  researchRequired: 'advanced_writing',
  emoji: '🏫',
  color: '#3F51B5',
  buildingCost: { 
    limestone: 15, 
    bronze_ingot: 8, 
    clay_tablets: 5,
    oak_wood: 12,
    leather: 6
  },
  buildTime: 8,
  toolTierRequired: 1,
  populationRequired: 3,
  upkeepCost: { writing_materials: 1 },
  productionBonus: { 
    knowledge: 50,
    research_speed: 1.5,
    scholar_training: 1.4
  },
    storageCapacity: {}
},
{
  id: 'scholars_workshop',
  name: 'Scholars Workshop',
  description: 'Iron Age workshop where learned craftsmen experiment and document',
  category: 'knowledge',
  tier: 2,
  rarity: 'rare',
  effects: { 
    knowledgeGeneration: 100,
    researchSpeed: 2.0,
    allKnowledgeBonus: 1.8
  },
  researchRequired: 'scholarly_methods',
  emoji: '🔬',
  color: '#607D8B',
  buildingCost: { 
    granite: 20, 
    wrought_iron: 15, 
    bronze_ingot: 8,
    yew_wood: 20,
    glass_vessels: 10,
    parchment: 15
  },
  buildTime: 15,
  toolTierRequired: 2,
  populationRequired: 4,
  upkeepCost: { ink: 2, lamp_oil: 1 },
  productionBonus: { 
    knowledge: 100,
    research_speed: 2.0,
    experimental_research: 1.8
  },
    storageCapacity: {}
},

// FOOD PRODUCTION - Level 0-2
{
  id: 'foraging_camp',
  name: 'Foraging Camp',
  description: 'Organized gathering area with woven baskets and drying racks',
  category: 'food',
  tier: 0,
  rarity: 'common',
  effects: { 
    foodGathering: 1.5,
    berryYield: 1.8,
    foodPreservation: 1.2
  },
  researchRequired: null,
  emoji: '🧺',
  color: '#4CAF50',
  buildingCost: { 
    pine_wood: 12, 
    plant_fiber: 15, 
    hide: 4
  },
  buildTime: 2,
  toolTierRequired: 0,
  populationRequired: 1,
  upkeepCost: {},
  productionBonus: { 
    wild_berries: 1.8,
    nuts: 1.5,
    herbs: 1.4
  },
   storageCapacity: {}
},
{
  id: 'fishing_dock',
  name: 'Fishing Dock',
  description: 'Wooden pier with bronze hooks and nets for river fishing',
  category: 'food',
  tier: 1,
  rarity: 'common',
  effects: { 
    fishingYield: 2.0,
    riverAccess: 1.5,
    foodVariety: 1.3
  },
  researchRequired: 'fishing_techniques',
  emoji: '🎣',
  color: '#4FC3F7',
  buildingCost: { 
    oak_wood: 18, 
    bronze_ingot: 4, 
    plant_fiber: 8,
    sinew: 6
  },
  buildTime: 4,
  toolTierRequired: 1,
  populationRequired: 2,
  upkeepCost: {},
  productionBonus: { 
    common_carp: 2.0,
    river_trout: 1.8,
    fish: 1.6
  },
    storageCapacity: {}
},
{
  id: 'hunting_lodge',
  name: 'Hunting Lodge',
  description: 'Base for organized hunting with weapon storage and meat processing',
  category: 'food',
  tier: 1,
  rarity: 'uncommon',
  effects: { 
    huntingEfficiency: 1.8,
    meatProcessing: 1.6,
    hideYield: 1.5
  },
  researchRequired: 'organized_hunting',
  emoji: '🏹',
  color: '#8D6E63',
  buildingCost: { 
    oak_wood: 20, 
    bronze_ingot: 6, 
    leather: 8,
    bone: 10,
    sinew: 5
  },
  buildTime: 6,
  toolTierRequired: 1,
  populationRequired: 3,
  upkeepCost: {},
  productionBonus: { 
    venison: 1.8,
    hide: 1.5,
    bone: 1.4,
    meat: 1.6
  },
   storageCapacity: {}
},
{
  id: 'granary',
  name: 'Granary',
  description: 'Large storage facility with bronze-lined containers for grain preservation',
  category: 'food',
  tier: 1,
  rarity: 'uncommon',
  effects: { 
    foodPreservation: 2.0,
    storageEfficiency: 1.8,
    spoilageReduction: 0.3
  },
  researchRequired: 'food_preservation',
  emoji: '🌾',
  color: '#FFA726',
  buildingCost: { 
    oak_wood: 25, 
    bronze_ingot: 8, 
    limestone: 15,
    porcelain_vessels: 6
  },
  buildTime: 7,
  toolTierRequired: 1,
  populationRequired: 2,
  upkeepCost: {},
  productionBonus: { 
    food_preservation: 2.0,
    grain_storage: 1.8
  },
   storageCapacity: {}
},

// COOKING & PROCESSING - Level 1-2
{
  id: 'kitchen',
  name: 'Community Kitchen',
  description: 'Cooking facility with clay pots and bronze utensils',
  category: 'food',
  tier: 1,
  rarity: 'common',
  effects: { 
    cookingEfficiency: 1.6,
    nutritionBonus: 1.4,
    mealQuality: 1.3
  },
  researchRequired: 'cooking',
  emoji: '🍲',
  color: '#FF6F00',
  buildingCost: { 
    limestone: 12, 
    common_clay: 10, 
    bronze_ingot: 4,
    oak_wood: 8
  },
  buildTime: 4,
  toolTierRequired: 1,
  populationRequired: 1,
  upkeepCost: { charcoal: 1 },
  productionBonus: { 
    hearty_stew: 1.6,
    cooked_meals: 1.5,
    nutrition_value: 1.4
  },
    storageCapacity: {}
},
{
  id: 'bakery',
  name: 'Bakery',
  description: 'Stone oven facility for bread and baked goods production',
  category: 'food',
  tier: 1,
  rarity: 'uncommon',
  effects: { 
    breadProduction: 2.0,
    grainProcessing: 1.8,
    bakingQuality: 1.6
  },
  researchRequired: 'baking',
  emoji: '🍞',
  color: '#FFCC80',
  buildingCost: { 
    fire_bricks: 15, 
    limestone: 20, 
    bronze_ingot: 6,
    oak_wood: 12
  },
  buildTime: 8,
  toolTierRequired: 1,
  populationRequired: 2,
  upkeepCost: { charcoal: 2 },
  productionBonus: { 
    fresh_bread: 2.0,
    baked_goods: 1.8,
    grain_processing: 1.6
  },
    storageCapacity: {}
},
{
  id: 'brewery',
  name: 'Brewery',
  description: 'Fermentation facility with bronze vessels and aging chambers',
  category: 'food',
  tier: 1,
  rarity: 'uncommon',
  effects: { 
    alcoholProduction: 1.8,
    fermentationBonus: 1.6,
    morale: 0.4
  },
  researchRequired: 'fermentation',
  emoji: '🍺',
  color: '#8E24AA',
  buildingCost: { 
    oak_wood: 18, 
    bronze_ingot: 8, 
    common_clay: 12,
    limestone: 10
  },
  buildTime: 6,
  toolTierRequired: 1,
  populationRequired: 2,
  upkeepCost: {},
  productionBonus: { 
    berry_wine: 1.8,
    alcoholic_beverages: 1.6,
    fermented_goods: 1.5
  },
    storageCapacity: {}
},
{
  id: 'distillery',
  name: 'Distillery',
  description: 'Advanced alcohol production with bronze distillation apparatus',
  category: 'food',
  tier: 2,
  rarity: 'rare',
  effects: { 
    spiritsProduction: 2.2,
    purityBonus: 1.8,
    luxuryDrinks: 1.6
  },
  researchRequired: 'distillation',
  emoji: '🥃',
  color: '#FF8F00',
  buildingCost: { 
    bronze_ingot: 15, 
    crystal: 3, 
    fire_bricks: 10,
    yew_wood: 8,
    leather: 5
  },
  buildTime: 12,
  toolTierRequired: 2,
  populationRequired: 3,
  upkeepCost: { charcoal: 3 },
  productionBonus: { 
    distilled_spirits: 2.2,
    high_quality_alcohol: 2.0,
    luxury_beverages: 1.8
  },
    storageCapacity: {}
},

// MILITARY & DEFENSE - Level 1-2
{
  id: 'training_ground',
  name: 'Training Ground',
  description: 'Open area with wooden practice weapons and targets',
  category: 'military',
  tier: 0,
  rarity: 'common',
  effects: { 
    combatTraining: 1.4,
    weaponSkill: 1.3,
    militaryMorale: 1.2
  },
  researchRequired: null,
  emoji: '⚔️',
  color: '#F44336',
  buildingCost: { 
    oak_wood: 15, 
    plant_fiber: 8, 
    sandstone: 10
  },
  buildTime: 3,
  toolTierRequired: 0,
  populationRequired: 2,
  upkeepCost: {},
  productionBonus: { 
    combat_effectiveness: 1.4,
    weapon_training: 1.3
  },
  storageCapacity: {}
},
{
  id: 'armory',
  name: 'Armory',
  description: 'Secure storage for weapons and armor with bronze locks',
  category: 'military',
  tier: 1,
  rarity: 'uncommon',
  effects: { 
    weaponMaintenance: 1.6,
    equipmentQuality: 1.4,
    militaryReadiness: 1.3
  },
  researchRequired: 'military_organization',
  emoji: '🛡️',
  color: '#424242',
  buildingCost: { 
    limestone: 20, 
    bronze_ingot: 10, 
    oak_wood: 15,
    leather: 8
  },
  buildTime: 6,
  toolTierRequired: 1,
  populationRequired: 2,
  upkeepCost: {},
  productionBonus: { 
    weapon_durability: 1.6,
    armor_effectiveness: 1.4
  },
  storageCapacity: {}
},
{
  id: 'war_camp',
  name: 'War Camp',
  description: 'Military encampment with strategic planning facilities',
  category: 'military',
  tier: 1,
  rarity: 'uncommon',
  effects: { 
    militaryStrategy: 1.5,
    combatPreparation: 1.4,
    troopMorale: 1.3
  },
  researchRequired: 'combat_alchemy',
  emoji: '⛺',
  color: '#F44336',
  buildingCost: { 
    oak_wood: 25, 
    bronze_ingot: 8, 
    leather: 12,
    iron_ingot: 4
  },
  buildTime: 8,
  toolTierRequired: 1,
  populationRequired: 3,
  upkeepCost: { food: 2 },
  productionBonus: { 
    warriors_brew: 1.4,
    military_tactics: 1.5,
    combat_readiness: 1.3
  },
  storageCapacity: {}
},
{
  id: 'fortress_wall',
  name: 'Fortress Wall',
  description: 'Defensive stone wall with bronze-reinforced gates',
  category: 'military',
  tier: 2,
  rarity: 'rare',
  effects: { 
    defenseBonus: 2.0,
    siegeResistance: 1.8,
    populationProtection: 1.5
  },
  researchRequired: 'fortification',
  emoji: '🏰',
  color: '#9E9E9E',
  buildingCost: { 
    granite: 40, 
    wrought_iron: 15, 
    bronze_ingot: 12,
    limestone: 25,
    oak_wood: 10
  },
  buildTime: 15,
  toolTierRequired: 2,
  populationRequired: 5,
  upkeepCost: {},
  productionBonus: { 
    defensive_strength: 2.0,
    siege_resistance: 1.8
  },
  storageCapacity: {}
},

// MAGICAL & ALCHEMICAL - Level 1-2
{
  id: 'alchemist_lab',
  name: 'Alchemist Laboratory',
  description: 'Chemical laboratory with bronze apparatus and crystal focuses',
  category: 'magical',
  tier: 1,
  rarity: 'uncommon',
  effects: { 
    alchemicalResearch: 1.6,
    potionQuality: 1.5,
    magicalKnowledge: 1.3
  },
  researchRequired: 'basic_alchemy',
  emoji: '⚗️',
  color: '#9C27B0',
  buildingCost: { 
    bronze_ingot: 12, 
    crystal: 5, 
    porcelain_vessels: 8,
    yew_wood: 10,
    leather: 6
  },
  buildTime: 10,
  toolTierRequired: 1,
  populationRequired: 2,
  upkeepCost: { crystal_essence: 1 },
  productionBonus: { 
    alchemical_consumables: 1.6,
    magical_research: 1.5,
    potion_brewing: 1.4
  },
 storageCapacity: {}
},
{
  id: 'crystal_workshop',
  name: 'Crystal Workshop',
  description: 'Specialized facility for crystal cutting and magical focus creation',
  category: 'magical',
  tier: 1,
  rarity: 'rare',
  effects: { 
    crystalWorking: 1.8,
    magicalFoci: 1.6,
    spellcasting: 1.4
  },
  researchRequired: 'crystal_working',
  emoji: '🔮',
  color: '#E1F5FE',
  buildingCost: { 
    crystal: 10, 
    bronze_ingot: 8, 
    marble: 12,
    yew_wood: 6,
    silver_vessel: 3
  },
  buildTime: 12,
  toolTierRequired: 1,
  populationRequired: 3,
  upkeepCost: { crystal_essence: 2 },
  productionBonus: { 
    crystal_focus: 1.8,
    magical_tools: 1.6,
    enchanted_items: 1.4
  },
  storageCapacity: {}
},
{
  id: 'grand_laboratory',
  name: 'Grand Laboratory',
  description: 'Master alchemical facility with steel equipment and rare reagents',
  category: 'magical',
  tier: 2,
  rarity: 'epic',
  effects: { 
    masterAlchemy: 2.2,
    advancedResearch: 2.0,
    legendaryPotions: 1.8
  },
  researchRequired: 'master_alchemy',
  emoji: '🧙',
  color: '#FFD700',
  buildingCost: { 
    steel_ingot: 20, 
    crystal: 15, 
    marble: 25,
    gold_vessel: 8,
    rare_components: 10
  },
  buildTime: 25,
  toolTierRequired: 2,
  populationRequired: 5,
  upkeepCost: { crystal_essence: 3, rare_reagents: 1 },
  productionBonus: { 
    master_crafters_elixir: 2.2,
    legendary_potions: 2.0,
    magical_research: 1.8
  },
  storageCapacity: {}
},

// TRADE & COMMERCE - Level 1-2
{
  id: 'marketplace',
  name: 'Marketplace',
  description: 'Trading center with bronze scales and porcelain display vessels',
  category: 'commerce',
  tier: 1,
  rarity: 'common',
  effects: { 
    tradeEfficiency: 1.5,
    commerceBonus: 1.4,
    wealthGeneration: 1.3
  },
  researchRequired: 'commerce',
  emoji: '🏪',
  color: '#FF9800',
  buildingCost: { 
    oak_wood: 20, 
    bronze_ingot: 8, 
    porcelain_vessels: 6,
    leather: 10,
    limestone: 15
  },
  buildTime: 6,
  toolTierRequired: 1,
  populationRequired: 3,
  upkeepCost: {},
  productionBonus: { 
    trade_value: 1.5,
    luxury_goods: 1.4,
    commerce_income: 1.3
  },
 storageCapacity: {}
},
{
  id: 'trading_post',
  name: 'Trading Post',
  description: 'Fortified trading facility with secure storage and bronze locks',
  category: 'commerce',
  tier: 1,
  rarity: 'uncommon',
  effects: { 
    foreignTrade: 1.8,
    tradeRoutes: 1.6,
    diplomaticBonus: 1.4
  },
  researchRequired: 'foreign_trade',
  emoji: '🏛️',
  color: '#FF9800',
  buildingCost: { 
    granite: 18, 
    bronze_ingot: 12, 
    steel_ingot: 4,
    yew_wood: 15,
    porcelain_vessels: 8
  },
  buildTime: 10,
  toolTierRequired: 2,
  populationRequired: 4,
  upkeepCost: { trade_goods: 1 },
  productionBonus: { 
    foreign_trade: 1.8,
    diplomatic_relations: 1.6,
    exotic_goods: 1.5
  },
  storageCapacity: {}
}
];

// Helper functions for building management
export function canAffordBuilding(building: Building, resources: Record<string, number>): boolean {
  if (!building.buildingCost) return false;
  return Object.entries(building.buildingCost).every(([resourceId, cost]) => 
    (resources[resourceId] || 0) >= cost
  );
}

// Enhanced population and requirements check
export function canBuildWithPopulation(building: Building, currentPop: number, maxPop: number): boolean {
  // Check minimum population requirement
  if (currentPop < building.populationRequired) return false;
  
  // Check if building would exceed max population (for non-housing buildings)
  if (building.category !== 'housing' && currentPop >= maxPop) return false;
  
  return true;
}

// Comprehensive requirements check
export function canBuildWithRequirements(
  building: Building,
  currentPop: number,
  maxPop: number,
  currentToolLevel: number,
  completedResearch: string[]
): boolean {
  // Population requirements
  if (!canBuildWithPopulation(building, currentPop, maxPop)) return false;
  
  // Tool level requirements
  if (building.toolTierRequired && building.toolTierRequired > currentToolLevel) return false;
  
  // Research requirements
  if (building.researchRequired && !completedResearch.includes(building.researchRequired)) return false;
  
  return true;
}

// Check building state restrictions
export function canBuildWithState(
  building: Building,
  existingBuildings: Record<string, number>
): boolean {
  if (!building.buildingState) return true;
  
  const currentCount = existingBuildings[building.id] || 0;
  
  // Check if building is unique and already exists
  if (building.buildingState.isUnique && currentCount > 0) return false;
  
  // Check maximum count
  if (building.buildingState.maxCount && currentCount >= building.buildingState.maxCount) return false;
  
  return true;
}

// Complete build validation
export function canBuild(
  building: Building,
  resources: Record<string, number>,
  currentPop: number,
  maxPop: number,
  currentToolLevel: number,
  completedResearch: string[],
  existingBuildings: Record<string, number>
): boolean {
  return canAffordBuilding(building, resources) &&
         canBuildWithRequirements(building, currentPop, maxPop, currentToolLevel, completedResearch) &&
         canBuildWithState(building, existingBuildings);
}

// Check if any buildings of a specific category exist
export function hasBuildings(buildingCounts: Record<string, number>, category: string): boolean {
  return Object.entries(buildingCounts).some(([buildingId, count]) => {
    if (count > 0) {
      const building = getBuildingInfo(buildingId);
      return building?.category === category;
    }
    return false;
  });
}

// Get buildings by category
export function getBuildingsByCategory(category: string): Building[] {
  return AVAILABLE_BUILDINGS.filter(building => building.category === category);
}

// Get buildings by tier
export function getBuildingsByTier(tier: number): Building[] {
  return AVAILABLE_BUILDINGS.filter(building => building.tier === tier);
}

// Get buildings by rarity
export function getBuildingsByRarity(rarity: string): Building[] {
  return AVAILABLE_BUILDINGS.filter(building => building.rarity === rarity);
}

// Get available buildings based on current game state
export function getAvailableBuildings(
  completedResearch: string[],
  currentToolLevel: number,
  currentPop: number,
  maxPop: number,
  resources: Record<string, number>,
  existingBuildings: Record<string, number>,
  category?: string
): Building[] {
  let buildings = AVAILABLE_BUILDINGS;
  
  // Filter by category if specified
  if (category) {
    buildings = buildings.filter(building => building.category === category);
  }
  
  return buildings.filter(building => 
    canBuild(building, resources, currentPop, maxPop, currentToolLevel, completedResearch, existingBuildings)
  );
}

// Get building dependencies (what research/buildings are needed)
export function getBuildingDependencies(building: Building): string[] {
  const dependencies = [];
  
  if (building.researchRequired) {
    dependencies.push(`Research: ${building.researchRequired}`);
  }
  
  if (building.toolTierRequired && building.toolTierRequired > 0) {
    dependencies.push(`Tool Level: ${building.toolTierRequired}`);
  }
  
  if (building.populationRequired > 0) {
    dependencies.push(`Population: ${building.populationRequired}`);
  }
  
  return dependencies;
}

// Get buildings that this building unlocks or enhances
export function getBuildingUnlocks(buildingId: string): Building[] {
  return AVAILABLE_BUILDINGS.filter(building => {
    // Check if this building is required for construction
    if (building.researchRequired === buildingId) return true;
    
    // Check synergies
    if (building.synergies?.chainBonus?.includes(buildingId)) return true;
    
    return false;
  });
}

// Calculate total construction cost including upgrades
export function getTotalBuildingCost(building: Building, includeUpgrades: boolean = false): Record<string, number> {
  let totalCost = { ...building.buildingCost };
  
  if (includeUpgrades && building.upgradeOptions?.upgradeCost) {
    Object.entries(building.upgradeOptions.upgradeCost).forEach(([resource, cost]) => {
      totalCost[resource] = (totalCost[resource] || 0) + cost;
    });
  }
  
  return totalCost;
}

// Calculate building efficiency based on synergies
export function getBuildingEfficiency(
  building: Building,
  existingBuildings: Record<string, number>,
  adjacentBuildings?: string[]
): number {
  let efficiency = 1.0;
  
  if (!building.synergies) return efficiency;
  
  // Network effects (based on number of similar buildings)
  if (building.synergies.networkEffects) {
    const count = existingBuildings[building.id] || 0;
    Object.entries(building.synergies.networkEffects).forEach(([effect, bonus]) => {
      efficiency += bonus * count;
    });
  }
  
  // Adjacency bonuses
  if (building.synergies.adjacencyBonus && adjacentBuildings) {
    Object.entries(building.synergies.adjacencyBonus).forEach(([requiredBuilding, bonus]) => {
      if (adjacentBuildings.includes(requiredBuilding)) {
        efficiency += bonus;
      }
    });
  }
  
  return efficiency;
}

// Get building maintenance requirements
export function getBuildingMaintenanceNeeds(building: Building): {
  upkeep: Record<string, number>;
  requirements: string[];
} {
  const upkeep = building.upkeepCost || {};
  const requirements = [];
  
  if (building.itemInteractions?.requires) {
    requirements.push(...building.itemInteractions.requires);
  }
  
  if (building.buildingState?.environmentalNeeds) {
    requirements.push(...building.buildingState.environmentalNeeds);
  }
  
  return { upkeep, requirements };
}

// Visual and UI helpers
export function getBuildingIcon(buildingId: string): string {
  const building = AVAILABLE_BUILDINGS.find(b => b.id === buildingId);
  if (building?.emoji) return building.emoji;
  
  // Fallback based on category
  switch (building?.category) {
    case 'housing': return '🏠';
    case 'production': return '⚒️';
    case 'knowledge': return '📚';
    case 'military': return '⚔️';
    case 'food': return '🍖';
    case 'commerce': return '🏪';
    case 'magical': return '🔮';
    case 'exploration': return '🗺️';
    case 'social': return '👥';
    default: return '🏗️';
  }
}

export function getBuildingColor(buildingId: string): string {
  const building = AVAILABLE_BUILDINGS.find(b => b.id === buildingId);
  return building?.color || '#4CAF50';
}

export function getBuildingRarityColor(rarity: string): string {
  switch (rarity) {
    case 'common': return '#9E9E9E';
    case 'uncommon': return '#4CAF50';
    case 'rare': return '#2196F3';
    case 'epic': return '#9C27B0';
    case 'legendary': return '#FF9800';
    default: return '#9E9E9E';
  }
}

// Get building information
export function getBuildingInfo(buildingId: string): Building | undefined {
  return AVAILABLE_BUILDINGS.find(b => b.id === buildingId);
}

// Calculate building impact on game state
export function calculateBuildingImpact(building: Building): {
  populationChange: number;
  resourceProduction: Record<string, number>;
  storageIncrease: Record<string, number>;
  specialEffects: Record<string, number>;
} {
  const impact = {
    populationChange: 0,
    resourceProduction: {},
    storageIncrease: building.storageCapacity || {},
    specialEffects: building.effects || {}
  };
  
  // Calculate population impact
  if (building.effects.populationCapacity) {
    impact.populationChange = building.effects.populationCapacity;
  }
  
  // Calculate resource production
  if (building.itemInteractions?.produces) {
    impact.resourceProduction = building.itemInteractions.produces;
  }
  
  return impact;
}

// Event integration helpers
export function getBuildingEvents(building: Building, eventType: 'construction' | 'operation' | 'upgrade' | 'destruction'): string[] {
  if (!building.eventTriggers) return [];
  
  switch (eventType) {
    case 'construction': return building.eventTriggers.onConstruction || [];
    case 'operation': return building.eventTriggers.onOperation || [];
    case 'upgrade': return building.eventTriggers.onUpgrade || [];
    case 'destruction': return building.eventTriggers.onDestruction || [];
    default: return [];
  }
}
