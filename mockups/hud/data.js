'use strict';
HUD.data = {
  settlement: 'Tharnorn', souls: 5, day: 14, season: 'Autumn', year: 3, moon: 'Waxing moon',
  stock: [
    { group: 'Food', rows: [['wheat', 'Wheat', 212], ['cabbage', 'Cabbage', 86], ['smoked_meat', 'Smoked Meat', 41], ['wild_berries', 'Wild Berries', 18, 'low'], ['bread', 'Bread', 24], ['venison', 'Venison', 12], ['turnip', 'Turnip', 63], ['apple', 'Apple', 30]] },
    { group: 'Materials', rows: [['oak_log', 'Oak Log', 148], ['pine_log', 'Pine Log', 77], ['oak_plank', 'Oak Plank', 62], ['branch', 'Branch', 31], ['small_stone', 'Small Stone', 204], ['limestone_block', 'Limestone Block', 46], ['blue_clay', 'Blue Clay', 37], ['fired_brick', 'Fired Brick', 0, 'low'], ['plant_fiber', 'Plant Fiber', 55], ['goat_wool', 'Goat Wool', 22], ['boarhide', 'Boarhide', 9, 'low'], ['wolf_leather', 'Wolf Leather', 14]] },
    { group: 'Metal', rows: [['hematite', 'Hematite', 26], ['malachite', 'Malachite', 19], ['copper_bar', 'Copper Bar', 12], ['bronze_bar', 'Bronze Bar', 7], ['iron_bar', 'Iron Bar', 4, 'low'], ['charcoal', 'Charcoal', 31]] },
    { group: 'Goods', rows: [['cast_bronze_hatchet', 'Bronze Hatchet', 3], ['copper_pick', 'Copper Pick', 2], ['copper_knife', 'Copper Knife', 1], ['wool_cloak', 'Wool Cloak', 4], ['hide_boots', 'Leather Boots', 5], ['clay_cooking_pot', 'Clay Cooking Pot', 11], ['rope', 'Rope', 16], ['linen_cloth', 'Linen Cloth', 8]] },
    { group: 'Medicine', rows: [['chewed_poultice', 'Chewed Poultice', 6], ['honey_salve', 'Honey Salve', 3], ['burn_dressing', 'Burn Dressing', 4], ['bark', 'Bark', 13], ['bloodroot', 'Bloodroot', 2, 'low']] }
  ],
  log: [
    ['13:52', 'Wolves near the pasture.', 'danger'],
    ['13:40', 'Greta felled an oak by the west fence.'],
    ['13:31', 'Vex Proudfoot is starving.', 'warn'],
    ['13:20', 'Tomas laid the third course of the Stone Hearth.'],
    ['13:02', 'A caravan from the Burgh of Thorn draws near.', 'note'],
    ['12:47', 'Vex hauled 12 Small Stone to the yard.'],
    ['12:15', 'Uma finished a Wool Cloak, fine work.', 'good'],
    ['11:50', 'A fox took a hen from the yard.', 'warn'],
    ['11:34', 'Celia tended Greta’s old burn.'],
    ['11:10', 'Tomas smelted 3 Copper Bar.'],
    ['10:42', 'Greta felled a pine.'],
    ['10:05', 'Tomas lit the bloomery.'],
    ['09:48', 'Uma sheared two goats: 6 Goat Wool.'],
    ['09:20', 'Vex dropped a load of Blue Clay, tired.', 'warn'],
    ['08:30', 'Celia woke from her fever.', 'good'],
    ['08:02', 'Greta ate Bread and Smoked Meat.'],
    ['07:40', 'The well froze over at the rim.'],
    ['06:10', 'First frost on the cabbage beds.', 'warn'],
    ['05:55', 'Night watch ended. Nothing came.'],
    ['04:30', 'Something moved at the tree line.', 'warn'],
    ['02:12', 'Tomas dreamt of the forge god.'],
    ['00:40', 'The hearth burned down to embers.'],
    ['23:15', 'Uma and Celia talked late. They are closer.', 'good'],
    ['22:30', 'Vex went to bed hungry.', 'warn'],
    ['21:05', 'Greta banked the fire.'],
    ['20:20', 'Supper: cabbage stew for five.']
  ],
  pawns: [
    { id: 'greta', kind: 'woodcutter', name: 'Greta Thornfield', first: 'Greta', culture: 'Syleth', role: 'Reaver', state: 'Felling an oak' },
    { id: 'uma', kind: 'weaver', name: 'Uma Starweaver', first: 'Uma', culture: 'Veleth', role: 'Weaver', state: 'Spinning wool' },
    { id: 'tomas', kind: 'smith', name: 'Tomas Quicksilver', first: 'Tomas', culture: 'Vorek', role: 'Smith', state: 'Laying stone' },
    { id: 'vex', kind: 'hauler', name: 'Vex Proudfoot', first: 'Vex', culture: 'Fluxys', role: 'Hauler', state: 'Hauling stone' },
    { id: 'celia', kind: 'mage', name: 'Celia Graymane', first: 'Celia', culture: 'Velung', role: 'Attuner', state: 'Resting' }
  ],
  sel: {
    kind: 'woodcutter', name: 'Greta Thornfield', line: 'Syleth · Marsh-folk · Reaver', job: 'Felling an oak by the west fence', progress: .62,
    bars: [['Health', .88, 'leaf', '88'], ['Mood', .64, 'honey', '64'], ['Hunger', .41, 'ember', 'Peckish'], ['Rest', .72, 'water', 'Rested']],
    conditions: [['Old burn', 'warn', 'burning', 'left arm'], ['Soaked', 'cold', 'drops', 'since the ford'], ['Well fed', 'good', 'wellfed', 'until dusk']],
    carries: 'Cast Bronze Hatchet',
    attrs: [['STR', 9, 52], ['DEX', 14, 50], ['INT', 12, 53], ['PER', 15, 45], ['CHA', 11, 54], ['CON', 15, 41]],
    status: [['Culture', 'Syleth · Marsh-folk'], ['Origin', 'the Village of Ebon'], ['Childhood', 'Caravan-born'], ['Adulthood', 'Reaver'], ['Age', '34 years'], ['Sex', 'Female']],
    toggles: [['Stance', ['Aggressive', 'Defensive', 'Flee'], 1], ['Rest', ['No rest', 'Shelter', 'Always'], 2], ['Medicine', ['Best', 'Herbal', 'None'], 0]],
    pills: [['Blood', '100%', 'good'], ['Pain', '9%', 'warn'], ['Cold tol.', 'to 4°', 'cold'], ['Heat tol.', 'to 31°', 'warn'], ['Hit', '×1.31'], ['Dodge', '×1.04'], ['Aim', '×0.33'], ['Reach', '×0.35']],
    limbs: [
      ['Head', 100, [['Skull', 30, 30], ['Left eye', 8, 8], ['Right eye', 8, 8], ['Jaw', 18, 18]]],
      ['Torso', 97, [['Chest', 58, 60, 'bruised'], ['Belly', 50, 50], ['Spine', 40, 40]]],
      ['Left arm', 96, [['Upper arm', 43, 45, 'old burn'], ['Forearm', 40, 40], ['Hand', 25, 25]]],
      ['Right arm', 100, [['Upper arm', 45, 45], ['Forearm', 40, 40], ['Hand', 25, 25]]],
      ['Left leg', 100, [['Upper leg', 60, 60], ['Lower leg', 50, 50], ['Foot', 25, 25]]],
      ['Right leg', 93, [['Upper leg', 54, 60, 'old frostbite'], ['Lower leg', 50, 50], ['Foot', 22, 25, 'blistered']]]
    ],
    needs: [['Hunger', .41, 'ember', 'Peckish'], ['Rest', .72, 'water', 'Rested'], ['Thirst', .9, 'water', 'Quenched'], ['Hygiene', .33, 'honey', 'Grimy'], ['Dryness', .2, 'violet', 'Soaked'], ['Leisure', .73, 'leaf', 'Content']],
    skills: [
      ['Woodcutting', 14, .8, 2, { from: [['Skill 14', '+38%'], ['Strength 9', '−4%'], ['Bronze hatchet', '+6%']] }],
      ['Foraging', 9, .3, 1, { from: [['Skill 9', '+18%'], ['Perception 15', '+8%']], kids: [['Foraging', 9, .3], ['Fishing', 6, .4]] }],
      ['Mining', 7, .5, 0, { from: [['Skill 7', '+10%'], ['Strength 9', '−4%'], ['Copper pick', '+4%']], kids: [['Mining', 7, .5], ['Digging', 5, .2]] }],
      ['Farming', 6, .35, 1, { from: [['Skill 6', '+6%'], ['Dexterity 14', '+6%']] }],
      ['Building', 6, .2, 0, { from: [['Skill 6', '+6%'], ['Strength 9', '−4%']] }],
      ['Cooking', 4, .1, 0, { from: [['Skill 4', '−2%'], ['Clay cooking pot', '+5%']], kids: [['Meals', 4, .1], ['Butchery', 3, .6], ['Baking', 2, .3], ['Brewing', 1, .1]] }],
      ['Crafting', 5, .45, 0, { from: [['Skill 5', '+2%'], ['Dexterity 14', '+6%']], kids: [['Woodworking', 5, .45], ['Pottery', 3, .2], ['Metalworking', 2, .7]] }],
      ['Stoneworking', 3, .25, 0, { from: [['Skill 3', '−6%'], ['Strength 9', '−4%']], kids: [['Knapping', 3, .25], ['Masonry', 2, .5], ['Bonecarving', 1, .3], ['Lapidary', 0, .1]] }],
      ['Tailoring', 2, .15, 0, { from: [['Skill 2', '−10%'], ['Dexterity 14', '+6%']], kids: [['Leatherwork', 2, .15], ['Weaving', 1, .6]] }],
      ['Alchemy', 1, .4, 0, { from: [['Skill 1', '−14%'], ['Intelligence 12', '+2%']], kids: [['Herbalism', 1, .4], ['Potions', 0, .2]] }],
      ['Caretaking', 3, .25, 0, { from: [['Skill 3', '−6%'], ['Intelligence 12', '+2%']] }],
      ['Research', 2, .3, 0, { from: [['Skill 2', '−10%'], ['Intelligence 12', '+2%']] }]
    ],
    traits: [['Hardy', 'Shrugs off cold that would send another to the fire.', 'pine'], ['Loner', 'Sleeps best with the door between her and the rest.', 'lone'], ['Sharp-eyed', 'Sees the hare before the hare sees her.', 'eye']],
    growth: [['STR', .4], ['DEX', .7], ['PER', .85]],
    worn: [['Head', 'Sackcloth Hood', 'worn', .7, 'sackcloth_hood'], ['Torso', 'Boarhide Jerkin', 'good', .9, 'boarhide_jerkin'], ['Hands', '', '', 0, 'linen_gloves'], ['Legs', 'Linen Trousers', 'frayed', .4, 'linen_hose'], ['Feet', 'Leather Boots', 'good', .85, 'hide_boots'], ['Main hand', 'Cast Bronze Hatchet', 'keen', .8, 'cast_bronze_hatchet'], ['Off hand', '', '', 0, 'plank_round_shield'], ['Back', 'Carry-Basket', 'good', .95, 'woven_basket']],
    armour: [['Cut', 14, 'sword'], ['Pierce', 9, 'bow'], ['Blunt', 11, 'hammer'], ['Cold', 22, 'snow'], ['Rain', 6, 'rain']],
    pack: [['oak_log', 'Oak Log', 2, '18.0'], ['bread', 'Bread', 3, '0.6'], ['smoked_meat', 'Smoked Meat', 1, '0.4'], ['burn_dressing', 'Burn Dressing', 2, '0.1'], ['bark', 'Bark', 1, '0.1'], ['waterskin', 'Waterskin', 1, '0.9']],
    load: [19.2, 42, 6.1, 30],
    derived: [
      ['Body', [['Move', '2.4/s', 'up', ['How fast she crosses open ground.', [['Moving', '×1.00'], ['Load 19 of 42 kg', '−4%'], ['Leather boots', '+3%']]]], ['Carry', '42 kg', '', ['What she can lift and walk with.', [['Strength 9', '38 kg'], ['Carry-basket', '+4 kg']]]], ['Pack room', '30 L', '', ['What fits on her back and belt.', [['Carry-basket', '24 L'], ['Belt', '6 L']]]], ['Blood', '100%', '', ['Blood left in her.', [['Bleeding', 'none']]]], ['Healing', '×0.92', 'down', ['How fast wounds close.', [['Constitution 15', '+4%'], ['Hungry', '−12%']]]],
        ['Pain felt', '×0.85', 'up', ['How sharply pain reaches her.', [['Hardy', '−10%'], ['Willow bark', '−5%']]]], ['Sight', '×1.00', 'up', ['Both eyes whole.', [['Left eye', '100%'], ['Right eye', '100%']]]], ['Hearing', '×0.95', '', ['Both ears, one nicked.', [['Left ear', '100%'], ['Right ear', '90%']]]], ['Wits', '×0.97', 'down', ['How much of her is all there.', [['Consciousness', '×0.97'], ['Manipulation', '×1.00'], ['Moving', '×1.00'], ['Blood pumping', '×1.00'], ['Blood filtration', '×1.00'], ['Breathing', '×0.96'], ['Digestion', '×1.00'], ['Talking', '×1.00']]]]]],
      ['Fight', [['Hit', '×1.31', 'up', ['How often a blow lands.', [['Melee 12', '+24%'], ['Dexterity 14', '+6%']]]], ['Dodge', '×1.04', 'up', ['How often a blow misses her.', [['Dexterity 14', '+6%'], ['Load', '−2%']]]], ['Block', '12%', '', ['Blows a shield or haft turns aside.', [['Hatchet haft', '12%']]]], ['Precision', '3%', '', ['Blows that find a gap or a vital spot.', [['Perception 15', '3%']]]], ['Range', '×0.35', 'down', ['How far she can shoot.', [['No bow', '×0.35']]]],
        ['Aim', '×0.33', 'down', ['How true a shot flies.', [['Archery 5', '−12%'], ['No bow', '×0.40']]]], ['Reload', '×1.11', 'up', ['How fast she nocks the next shot.', [['Dexterity 14', '+11%']]]], ['Shot', '×0.89', 'down', ['How hard her shots strike.', [['Strength 9', '−11%']]]], ['Armour', '14', 'up', ['Best cover on her body.', [['Boarhide jerkin', '14']]]], ['Swing', '×1.08', 'up', ['How quickly she strikes again.', [['Dexterity 14', '+6%'], ['Bronze hatchet', '+2%']]]],
        ['Strike', '×0.96', 'down', ['How hard her blows land.', [['Strength 9', '−6%'], ['Bronze hatchet', '+2%']]]], ['Leverage', '×1.02', '', ['How well her blows bite through armour.', [['Bronze hatchet', '+2%']]]], ['Footing', '×1.10', 'up', ['How hard she is to knock down.', [['Constitution 15', '+10%']]]], ['Draw', '×0.92', 'down', ['How fast she draws and looses.', [['Archery 5', '−8%']]]], ['Stealth', '×0.88', 'down', ['How hard she is to notice.', [['Leather boots', '+4%'], ['Carry-basket', '−16%']]]]]],
      ['Work', [['Felling', '×1.38', 'up', ['Woodcutting 14.', [['Skill 14', '+38%'], ['Bronze hatchet', '+6%']]]], ['Hauling', '×1.10', 'up', ['Carrying loads to store.', [['Strength 9', '−4%'], ['Carry-basket', '+14%']]]], ['Building', '×0.94', 'down', ['Building 6.', [['Skill 6', '+6%'], ['Strength 9', '−10%']]]], ['Crafting', '×0.90', 'down', ['Each craft on its own.', [['Woodworking 5', '×0.90'], ['Pottery 3', '×0.84'], ['Metalworking 2', '×0.80'], ['Stoneworking 3', '×0.84'], ['Tailoring 2', '×0.80'], ['Cooking 4', '×0.88'], ['Alchemy 1', '×0.76']]]], ['Foraging', '×1.06', 'up', ['Foraging 9.', [['Skill 9', '+18%'], ['Hungry', '−12%']]]],
        ['Farming', '×1.00', '', ['Farming 6.', [['Skill 6', '+6%'], ['Hungry', '−6%']]]], ['Tending', '×0.82', 'down', ['Caretaking 3.', [['Skill 3', '−6%'], ['Loner', '−12%']]]], ['Learning', '×1.05', 'up', ['Research 2.', [['Intelligence 12', '+5%']]]]]],
      ['Weather', [['Cold', 'to 4°', 'up', ['Coldest air she bears.', [['Hardy', '−4°'], ['Wool cloak', '−2°']]]], ['Heat', 'to 31°', '', ['Hottest air she bears.', [['Boarhide jerkin', '−2°']]]], ['Wet', 'soaked', 'down', ['Dry, damp, wet, soaked.', [['Rain', 'soaking in'], ['No hood', '+20%']]]], ['Wind', 'still', '', ['Still, breezy, chilled.', [['Sheltered', 'by the fence']]]], ['Night sight', '×0.60', 'down', ['How well she sees by night.', [['Sharp-eyed', '+10%'], ['Human eyes', '×0.50']]]]]],
      ['Mind', [['Mood', '64', '', ['How she feels today.', [['Ate a fine meal', '+6'], ['Soaked', '−4']]]], ['Breaks at', '18', '', ['Mood she cracks at.', [['Hardy', '−4'], ['Loner', '−3']]]], ['Company', '0.30', '', ['How much company she wants.', [['Loner', '−0.40']]]], ['Faith', 'Marsh Mother', '', ['The spirit of the reed beds her people pray to.', []]], ['Grudges', '1', 'down', ['Tomas, over a spilled ale.', []]], ['Friends', '2', 'up', ['Uma and Celia.', []]]]],
      ['Social', [['Trade', '×1.04', 'up', ['How good a bargain she strikes.', [['Charisma 11', '+4%']]]], ['Oratory', '×0.91', 'down', ['How well her words carry a crowd.', [['Loner', '−9%']]]], ['Beauty', '×1.00', '', ['How others see her face.', [['Plain', '×1.00']]]], ['Prestige', '×1.12', 'up', ['How her name stands in the colony.', [['Reaver', '+12%']]]]]]
    ]
  },
  jobs: [['FRG', 'Forage'], ['WOD', 'Woodcut'], ['MNE', 'Mine'], ['HNT', 'Hunt'], ['FSH', 'Fish'], ['PLN', 'Plant'], ['MTL', 'Metalwork'], ['TLR', 'Tailor'], ['WWK', 'Woodwork'], ['STN', 'Stonecut'], ['POT', 'Pottery'], ['DIG', 'Dig'], ['RSH', 'Research'], ['BLD', 'Build'], ['ALH', 'Alchemy'], ['CTK', 'Caretake'], ['COK', 'Cook'], ['HUL', 'Haul']],
  labor: [
    ['Greta Thornfield', '342320020002012013', 'Felling an oak', { 1: 'top', 3: 'top', 6: 'weak' }],
    ['Uma Starweaver', '200012040200001232', 'Spinning wool', { 7: 'top', 16: 'top', 2: 'weak' }],
    ['Tomas Quicksilver', '012000403320130012', 'Laying stone', { 6: 'top', 9: 'top', 4: 'weak' }],
    ['Vex Proudfoot', '221100000003020024', 'Hauling stone', { 17: 'top', 11: 'top', 12: 'weak' }],
    ['Celia Graymane', '200002000000403410', 'Resting', { 12: 'top', 14: 'top', 1: 'weak' }]
  ],
  marked: { count: 5, what: 'oaks', verb: 'Harvest', glyph: 'axe' },
  buildCats: ['Zones', 'Fire & Cooking', 'Workshops', 'Smelting & Forge', 'Arcane', 'Farming & Soil', 'Kitchen & Brewing', 'Food & Hides', 'Traps & Water', 'Beds & Shelter', 'Furniture & Storage'],
  buildCat: 1,
  builds: [
    { kind: 'campfire', name: 'Campfire', work: 12, text: 'A ring of stones around an open fire.', cost: [['branch', 'Branch', 5, 31], ['plant_fiber', 'Plant Fiber', 4, 55]], ok: true },
    { kind: 'hearth', name: 'Stone Hearth', work: 18, text: 'A stone-ringed hearth that holds its fire through the night.', cost: [['branch', 'Branch', 4, 31], ['small_stone', 'Small Stone', 8, 204]], ok: true },
    { kind: 'kiln', name: 'Clay Kiln', work: 32, text: 'A domed oven of clay for firing brick and pot.', cost: [['blue_clay', 'Blue Clay', 30, 37], ['small_stone', 'Small Stone', 12, 204]], ok: true },
    { kind: 'smoking', name: 'Smoking Rack', work: 26, text: 'Poles and green wood for curing meat.', cost: [['oak_log', 'Oak Log', 6, 148], ['boarhide', 'Boarhide', 12, 9]], ok: false },
    { kind: 'bloomery', name: 'Bloomery', work: 44, text: 'A clay stack that sweats iron from ore.', cost: [['fired_brick', 'Fired Brick', 24, 0], ['blue_clay', 'Blue Clay', 10, 37]], ok: false },
    { kind: 'charcoal', name: 'Charcoal Clamp', work: 20, text: 'A turf-covered mound where wood chars slowly.', cost: [['oak_log', 'Oak Log', 20, 148], ['blue_clay', 'Blue Clay', 6, 37]], ok: true },
    { kind: 'quern', name: 'Quern', work: 14, text: 'Two stones for grinding grain to meal.', cost: [['limestone_block', 'Limestone Block', 2, 46]], ok: true }
  ],
  tip: { name: 'Stone Hearth', text: 'A stone-ringed hearth that holds its fire through the night.', rows: [['Warmth', 'six paces'], ['Light', 'five paces'], ['Burns', 'a log every three hours'], ['Cooks', 'stews, roasts, bread']] },
  hand: [['Cast Bronze Hatchet', 'keen'], ['Swing', '1.4 s'], ['Cut', '11 to 16']],
  fuel: {
    building: 'Stone Hearth', level: .34, burning: 'Oak Log · 1h 10m left', tinder: [1, 'Branch', 31], threshold: 40, paused: false,
    fuels: [['oak_log', 'Oak Log', 148, true], ['pine_log', 'Pine Log', 77, true], ['branch', 'Branch', 31, true], ['charcoal', 'Charcoal', 31, false], ['oak_plank', 'Oak Plank', 62, false], ['plant_fiber', 'Plant Fiber', 55, false]],
    who: [['Greta Thornfield', true], ['Uma Starweaver', true], ['Tomas Quicksilver', false], ['Vex Proudfoot', true], ['Celia Graymane', true]]
  },
  nav: [['Pawns', 'F2', 'pawns'], ['Work', 'F3', 'work'], ['Buildings', 'F4', 'build'], ['Crafting', 'F5', 'craft'], ['Explore', 'F6', 'explore'], ['Culture', 'F7', 'culture'], ['Kingdoms', 'F8', 'kingdoms'], ['Research', 'F9', 'research'], ['Entities', 'F10', 'entities']],
  tabs: [['Status', 'status'], ['Attributes', 'attributes'], ['Relations', 'relations'], ['Gear', 'gear']]
};
Object.assign(HUD.data, {
  craftCats: ['Tools', 'Melee Weapons', 'Ranged Weapons', 'Armor', 'Jewelry', 'Meals', 'Drinks', 'Medicine', 'Wood', 'Metals & Ores', 'Hides & Textiles', 'Fuel', 'Containers'],
  queue: [
    ['Bare Craft Spot', [['stone_pick', 'Stone Pick', 1, .37, 'run'], ['cordage', 'Cordage', 8, 0, 'wait']]],
    ['Clay-Brick Smelting Hearth', [['molten_tin', 'Molten Tin', 2, .72, 'run']]],
    ['Log Splitting Stump', []],
    ['Hand Crafting', [['chewed_poultice', 'Chewed Poultice', 2, .1, 'pause']]]
  ],
  recipes: [
    { id: 'stone_pick', name: 'Stone Pick', work: 3, text: 'A flaked granite head lashed to a branch.', at: 'Bare Craft Spot', cost: [['granite', 'Granite', 2, 5], ['branch', 'Branch', 3, 31], ['cordage', 'Cordage', 8, 14]], st: 'craft' },
    { id: 'stone_axe', name: 'Stone Axe', work: 3, text: 'A heavy granite wedge set in a split haft.', at: 'Bare Craft Spot', cost: [['granite', 'Granite', 6, 5], ['branch', 'Branch', 2, 31], ['cordage', 'Cordage', 6, 14]], st: 'queue' },
    { id: 'flint_knife', name: 'Flint Knife', work: 2, text: 'A knapped edge that lasts a day of skinning.', at: 'Bare Craft Spot', cost: [['small_stone', 'Small Stone', 2, 204], ['cordage', 'Cordage', 2, 14]], st: 'craft' },
    { id: 'cast_bronze_hatchet', name: 'Cast Bronze Hatchet', work: 9, text: 'Poured in a clay mould and ground keen.', at: 'Clay-Brick Smelting Hearth', tools: 'tier 2 tools', locked: true, cost: [['bronze_bar', 'Bronze Bar', 2, 7], ['oak_plank', 'Oak Plank', 1, 62]], st: 'blocked' },
    { id: 'copper_pick', name: 'Copper Pick', work: 6, text: 'Soft red metal beaten to a point.', at: 'Stone Anvil', tools: 'tier 1 tools', cost: [['copper_bar', 'Copper Bar', 2, 12], ['oak_plank', 'Oak Plank', 1, 62]], st: 'craft' },
    { id: 'copper_knife', name: 'Copper Knife', work: 5, text: 'Thin enough to flex, sharp enough to shave.', at: 'Stone Anvil', tools: 'tier 1 tools', cost: [['copper_bar', 'Copper Bar', 1, 12], ['oak_plank', 'Oak Plank', 1, 62]], st: 'craft' },
  ],
  research: {
    materials: [['Bark Scrolls', 7], ['Hide Scrolls', 0], ['Parchment', 0], ['Scholar’s Ink', 0], ['Research Notes', 3]],
    active: { name: 'Copper Smelting', cat: 'crafting', prog: .46, left: 4, text: 'Learn to extract pure copper from ore using fire' },
    open: [
      { name: 'Basic Writing', tier: 0, cat: 'knowledge', time: 5, text: 'Learn to record knowledge on bark and hide scrolls', need: [['Bark Scrolls', 3, 7]], unlocks: 'Hide Scrolls, Parchment', st: 'busy' },
      { name: 'Charcoal Making', tier: 0, cat: 'crafting', time: 4, text: 'Convert wood into high-heat fuel through controlled burning', need: [['Bark Scrolls', 3, 7]], unlocks: 'Charcoal Kiln, Charcoal', st: 'busy' },
      { name: 'Stone Masonry', tier: 0, cat: 'building', time: 6, text: 'Advanced building methods using shaped stone', need: [['Bark Scrolls', 4, 7]], unlocks: 'Stone Hut, Cut Stone', st: 'busy' },
      { name: 'Leather Working', tier: 1, cat: 'crafting', time: 10, text: 'Process hides into durable leather goods', need: [['Bark Scrolls', 6, 7]], unlocks: 'Tannery, Leather', st: 'busy' },
      { name: 'Advanced Writing', tier: 1, cat: 'knowledge', time: 12, text: 'Create parchment and develop scholarly methods', need: [['Bark Scrolls', 10, 7], ['Hide Scrolls', 5, 0]], prereq: 'Basic Writing', unlocks: 'Learning Hall, Scholar’s Ink', st: 'no' },
      { name: 'Tin Smelting', tier: 1, cat: 'crafting', time: 10, text: 'Extract tin from cassiterite ore for bronze alloys', need: [['Bark Scrolls', 5, 7]], prereq: 'Copper Smelting', unlocks: 'Tin Ingot', st: 'no' }
    ]
  },
  found: [
    ['plant', 'bloodroot', 'Bloodroot', 'foraging', 6, '41,18'], ['plant', 'glowcap', 'Glowcap', 'foraging', 3, '12,57'], ['plant', 'mandrake', 'Mandrake', 'foraging', 1, '66,40'],
    ['plant', 'berry_bush', 'Berry Bush', 'foraging', 14, '30,22'], ['tree', 'heartwood_grove', 'Heartwood Tree', 'woodcutting', 2, '8,9'], ['tree', 'moonwood_grove', 'Moonwood Tree', 'woodcutting', 4, '71,12'],
    ['tree', 'frostheart_pine', 'Frostheart Pine', 'woodcutting', 1, '77,4'], ['ore', 'malachite', 'Malachite', 'mining', 5, '52,61'], ['ore', 'cassiterite', 'Cassiterite', 'mining', 2, '58,66'],
    ['ore', 'star_geode', 'Star Geode', 'mining', 1, '88,70'], ['ore', 'blue_clay', 'Blue Clay', 'digging', 7, '20,44'], ['site', 'barrow_cache', 'Barrow Mound', 'digging', 1, '63,30'], ['site', 'wolf_den', 'Wolf Den', 'lair', 1, '90,14']
  ],
  cultures: [['Syleth', 'Marsh-folk', 1], ['Veleth', 'River-people', 1], ['Vorek', 'Mountain-born', 1], ['Fluxys', 'Wastrel-nomads', 1], ['Velung', 'Sky-touched', 1], ['Kethara', 'Forest-kin', 0]],
  culture: {
    name: 'Syleth', epithet: 'the Reedborn', lore: 'They pole flat boats through the fens and bury their dead in peat, wrapped in eel-skin and rushes.',
    rows: [['Archetype', 'Marsh-folk'], ['Colony', '1 living'], ['Known via', 'Greta Thornfield'], ['Homeland', 'the drowned fens east of the Ebon'], ['Temperament', 'patient, close-mouthed'], ['Belief', 'the Marsh Mother']],
    body: [['Build', 'medium'], ['Height', '158–176 cm'], ['Weight', '52–74 kg']],
    stats: [['STR', 6, 12], ['DEX', 10, 16], ['INT', 8, 14], ['PER', 12, 18, 2], ['CHA', 7, 13], ['CON', 11, 17]],
    traits: [['Hardy', 'every member', 'Cold that sends others to the fire barely reaches them.', 'pine', [['Cold', '−6°']]], ['Watchful', 'some', 'Nothing moves on the water without being seen.', 'eye', [['Sight', '+2']]], ['Night-Owl', 'some', 'Most awake when the lamps are lit.', 'moon', [['Night sight', 'good']]], ['Frail', 'some', 'Fever finds them first.', 'drop', [['Healing', '×0.8', 'neg']]]],
    rel: [['Veleth', 'friendly', '+12', 'good'], ['Vorek', 'wary', '−8', 'warn'], ['Fluxys', 'neutral', '+1', '']]
  },
  kingdoms: [['the Burgh of Thorn', 'Uma', 'friendly', 'familiar', 'good'], ['Ashen Steading', 'Tomas', 'neutral', 'well known', ''], ['Raven Dominion', '', 'wary', 'acquainted', 'warn'], ['Cinder Reavers', '', 'hostile', 'strangers', 'neg']],
  kingdom: {
    name: 'the Burgh of Thorn', disp: 'friendly', epithet: 'a crown propped up by its caravans', temper: 'slow to promise, slower to forget', via: 'known through contact',
    peoples: [['Veleth', 7], ['Syleth', 2], ['an unfamiliar people', 1]],
    court: [['Ruler', 'Reeve Hakon Ironhand'], ['Wealth', 'Prosperous']], lands: [['Seat', 'Harthaven'], ['Holdings', '2 towns, 5 villages']],
    standing: [['Raven Dominion', 'wary', 'warn'], ['Cinder Reavers', 'hostile', 'neg'], ['Ashen Steading', 'allied', 'good']]
  },
  mobs: [
    ['wolf', 'Grey Wolf', 'hostile', 100, '', 0, 'Hunting', '44,19'],
    ['wolf', 'Grey Wolf', 'hostile', 81, 'left foreleg 40%', 22, 'Hunting', '46,20', true],
    ['goblin', 'Goblin Raider', 'hostile', 100, '', 0, 'Traveling', '91,33'],
    ['deer', 'Red Deer', 'neutral', 100, '', 0, 'Grazing', '28,52'],
    ['boar', 'Wild Boar', 'neutral', 92, 'right hind leg 70%', 6, 'Startled', '35,47'],
    ['rabbit', 'Cottontail', 'neutral', 100, '', 0, 'Fleeing', '17,40'],
    ['elk', 'Woodland Elk', 'neutral', 100, '', 0, 'Sleeping', '60,8']
  ],
  mobLimbs: [['Head', 100, []], ['Body', 88, [['Flank', 30, 40, 'bite · moderate']]], ['Left foreleg', 40, [['Upper leg', 12, 30, 'cut · severe'], ['Paw', 8, 10]], 1.2], ['Right foreleg', 100, []], ['Hind legs', 100, []]],
  family: [['Mother', 'Ilse Thornfield', '', 'away in the Burgh of Thorn · as you last knew', 'stale'], ['Brother', 'Arvid Thornfield †', '', '', 'dead'], ['Cousin', 'Uma Starweaver', 'Friends', '', 'live']],
  bonds: [
    ['Celia Graymane', 'Best Friends', 'good', '', 71, ['saved in the field'], true],
    ['Uma Starweaver', 'Friends', 'good', '', 38, ['battle-forged']],
    ['Tomas Quicksilver', 'Acquaintances', '', '♥ Interested', 12, []],
    ['Vex Proudfoot', 'Rivals', 'neg', '', -27, []]
  ],
  bondLog: [['day 14', 'Time spent together', '+1', 'good'], ['day 12', 'Carried out of danger by Celia', '+12', 'good', ['Celia: “Hold still. It’s only the shoulder.”', 'Greta: “Only.”']], ['day 9', 'Fought side by side', '+6', 'good'], ['day 6', 'Grieved Arvid together', '+5', 'good'], ['day 2', 'Shared a meal', '·', '']],
  trade: {
    who: 'the Burgh of Thorn', by: 'Tomas Quicksilver',
    theirs: [['wolf_leather', 'Wolf Leather', 6, 4, 2], ['copper_bar', 'Copper Bar', 10, 7, 3], ['tin_bar', 'Tin Bar', 3, 9, 0], ['moonwood_plank', 'Moonwood Plank', 8, 5, 0], ['honey', 'Honey', 4, 3, 0], ['salt', 'Salt', 12, 2, 0]],
    yours: [['oak_plank', 'Oak Plank', 62, 2, 10], ['small_stone', 'Small Stone', 204, 1, 0], ['smoked_meat', 'Smoked Meat', 41, 3, 6], ['goat_wool', 'Goat Wool', 22, 2, 0], ['clay_cooking_pot', 'Clay Cooking Pot', 11, 4, 2], ['linen_cloth', 'Linen Cloth', 8, 5, 0]]
  },
  migrants: [['Katla Ashgrove', 'Vorek', 'smith', true, ['strong-armed', 'hardy'], []], ['Doran Fenwick', 'Syleth', 'hauler', false, ['keen-eyed'], ['sickly']]],
  zoneKinds: [['Stockpile', 'crate', 'Ground set aside for the colony’s stores.', 2], ['Drink', 'drop', 'Clean water, upstream of the latrines.', 1], ['Wash', 'rain', 'Where the grime comes off.', 0], ['Restrict', 'shield', 'A line some are bound to keep.', 1], ['Grow', 'sprout', 'Turned soil, sown when the season allows.', 1]],
  zones: [['Stockpile 1', 'crate', ['42 tiles', '3 filtered'], 'Filter', true], ['Stockpile 2', 'crate', ['18 tiles'], 'Filter'], ['Grow 1', 'sprout', ['24 tiles', '2 crops'], 'Seeds'], ['Drink 1', 'drop', ['4 tiles']], ['Restrict 1', 'shield', ['60 tiles', '2 pawns'], 'Pawns']],
  zoneFilter: [['wood', true], ['stone', true], ['ore', true], ['metal', false], ['leather', false], ['binding', false], ['food', false], ['medicine', false], ['tools', false], ['fuel', false]],
  settings: [
    ['Display', [['Window mode', 'pick', ['Windowed', 'Fullscreen'], 1], ['Show FPS', 'chk', false], ['Show TPS', 'chk', false]]],
    ['Audio', [['Master volume', 'slide', 80], ['Music volume', 'slide', 55], ['Ambient volume', 'slide', 70, 'weather, nature, fire'], ['SFX volume', 'slide', 65, 'creatures, work, combat, UI']]],
    ['Graphics', [['Weather effects', 'chk', true], ['Day/night UI tint', 'chk', true], ['Dialog bubbles', 'chk', true]]],
    ['Interface', [['Cinematic layout', 'chk', false]]],
    ['Controls', [['WASD camera panning', 'chk', true, 'alongside arrow keys']]],
    ['Gameplay', [['Default game speed', 'pick', ['1×', '2×', '4×'], 0], ['Autosave', 'chk', true], ['Auto-pause on threat', 'chk', true], ['Auto-pause on death', 'chk', true]]]
  ]
});
