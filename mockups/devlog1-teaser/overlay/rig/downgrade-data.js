'use strict';
const DOWNGRADES = (() => {
  const FORMS = {
    gaunt: { cause: 'starvation', permanent: false, recoversTo: 'adult', recovery: 'fed for a season', pace: .82 },
    crippled: { cause: 'wound', permanent: true, pace: .55 },
    grizzled: { cause: 'age', permanent: true, pace: .68, onlyTier: 2 },
  };
  const LINES = {
    wolf: { adult: 'wolf', noun: 'Wolf', group: 'Grey Wolf', sub: 'Animal', color: '#b3b8c7', carcassItemId: 'wolf_carcass', young: 'wolf_pup', threatLevel: 2, raw: { entityClass: 'animal', behaviour: 'neutral', diet: 'carnivore', predator: true, grazes: false, intelligence: 'primitive', pack: [1, 3], bodyScale: 1.1, biomeWeights: { forest: 1, plains: .7, mountain: .5 }, lair: 'wolf_den', lairRange: 55, naturalWeapons: ['bite', 'claw'], limbMap: 'quadruped' } },
    jackal: { adult: 'jackal', noun: 'Jackal', group: 'Golden Jackal', sub: 'Animal', color: '#99804d', carcassItemId: 'jackal_carcass', young: 'jackal_pup', threatLevel: 1, raw: { entityClass: 'animal', behaviour: 'neutral', diet: 'carnivore', predator: true, intelligence: 'primitive', pack: [3, 6], bodyScale: 1.1, biomeWeights: { plains: 1, swamp: .5 }, lair: 'wolf_den', lairRange: 60, naturalWeapons: ['bite', 'claw'], limbMap: 'quadruped' } },
    worg: { adult: 'worg', noun: 'Worg', group: 'Grey Worg', sub: 'Animal', color: '#595466', carcassItemId: 'worg_carcass', young: null, threatLevel: 2, raw: { entityClass: 'animal', behaviour: 'neutral', diet: 'carnivore', predator: true, intelligence: 'primitive', pack: [2, 5], bodyScale: 1.3, biomeWeights: { forest: 1, plains: .8 }, lair: 'wolf_den', lairRange: 50, naturalWeapons: ['bite', 'claw'], limbMap: 'quadruped' } },
    bear: { adult: 'bear', noun: 'Bear', group: 'Brown Bear', sub: 'Animal', color: '#8c6640', carcassItemId: 'bear_carcass', young: 'bear_cub', threatLevel: 3, raw: { entityClass: 'animal', behaviour: 'neutral', diet: 'omnivore', predator: true, grazes: false, intelligence: 'primitive', pack: [1, 1], bodyScale: 1.8, biomeWeights: { mountain: 1, forest: .6 }, lair: 'predator_den', lairRange: 32, naturalWeapons: ['claw', 'slam'], limbMap: 'quadruped' } },
    sabretooth: { adult: 'sabretooth', noun: 'Sabretooth', group: 'Sabretooth Cat', sub: 'Animal', color: '#b39959', carcassItemId: 'sabretooth_carcass', young: null, threatLevel: 3, raw: { entityClass: 'animal', behaviour: 'neutral', diet: 'carnivore', predator: true, intelligence: 'primitive', pack: [1, 2], bodyScale: 1.5, biomeWeights: { forest: .8, swamp: .6 }, lair: 'predator_den', lairRange: 30, naturalWeapons: ['bite', 'claw'], limbMap: 'quadruped' } },
    owlbear: { adult: 'owlbear', noun: 'Owlbear', group: 'Tawny Owlbear', sub: 'Animal', color: '#8c6b47', carcassItemId: 'owlbear_carcass', young: null, threatLevel: 4, raw: { entityClass: 'animal', behaviour: 'aggressive', diet: 'carnivore', predator: true, intelligence: 'primitive', pack: [1, 1], bodyScale: 2, biomeWeights: { forest: 1 }, lair: 'predator_den', lairRange: 28, naturalWeapons: ['claw', 'bite', 'slam'], limbMap: 'quadruped' } },
    boar: { adult: 'boar', noun: 'Boar', group: 'Wild Boar', sub: 'Animal', color: '#ffffff', carcassItemId: 'boar_carcass', young: 'piglet', threatLevel: 2, raw: { entityClass: 'animal', behaviour: 'neutral', diet: 'omnivore', grazes: false, intelligence: 'primitive', pack: [3, 8], bodyScale: 1.3, biomeWeights: { forest: 1, swamp: .6 }, naturalWeapons: ['boar_tusk', 'boar_charge'], limbMap: 'quadruped_hooved' } },
    deer: { adult: 'deer', noun: 'Deer', group: 'Red Deer', sub: 'Animal', color: '#ffffff', carcassItemId: 'deer_carcass', young: 'fawn', threatLevel: 1, raw: { entityClass: 'animal', behaviour: 'passive', diet: 'herbivore', grazes: true, intelligence: 'primitive', pack: [3, 8], bodyScale: 1.2, biomeWeights: { forest: 1, plains: 1 }, naturalWeapons: ['kick'], limbMap: 'quadruped_hooved' } },
    elk: { adult: 'elk', noun: 'Elk', group: 'Woodland Elk', sub: 'Animal', color: '#ffffff', carcassItemId: 'elk_carcass', young: null, threatLevel: 2, raw: { entityClass: 'animal', behaviour: 'passive', diet: 'herbivore', grazes: true, intelligence: 'primitive', pack: [3, 8], bodyScale: 1.4, biomeWeights: { forest: .8, mountain: .6 }, naturalWeapons: ['kick', 'antler'], limbMap: 'quadruped_hooved' } },
    aurochs: { adult: 'aurochs', noun: 'Ox', group: 'Wild Ox', sub: 'Animal', color: '#735233', carcassItemId: 'aurochs_carcass', young: null, threatLevel: 4, raw: { entityClass: 'animal', behaviour: 'neutral', diet: 'herbivore', grazes: true, intelligence: 'primitive', pack: [2, 5], bodyScale: 2, biomeWeights: { plains: 1, forest: .5 }, naturalWeapons: ['tusk', 'charge'], limbMap: 'quadruped_hooved' } },
    woolly_mammoth: { adult: 'woolly_mammoth', noun: 'Tusker', group: 'Grey Tusker', sub: 'Animal', color: '#66472e', carcassItemId: 'woolly_mammoth_carcass', young: null, threatLevel: 9, raw: { entityClass: 'animal', behaviour: 'neutral', diet: 'herbivore', grazes: true, intelligence: 'primitive', pack: [2, 4], bodyScale: 3.5, biomeWeights: { plains: 1, forest: .3 }, naturalWeapons: ['tusk', 'slam'], limbMap: 'quadruped' } },
    mountain_goat: { adult: 'mountain_goat', noun: 'Bighorn', group: 'Bighorn', sub: 'Animal', color: '#ffffff', carcassItemId: 'mountain_goat_carcass', young: 'goat_kid', threatLevel: 1, raw: { entityClass: 'animal', behaviour: 'passive', diet: 'herbivore', grazes: true, intelligence: 'primitive', pack: [3, 8], biomeWeights: { plains: .8, forest: .8, swamp: .4 }, naturalWeapons: ['headbutt'], limbMap: 'quadruped_hooved' } },
    goblin: { adult: 'goblin', noun: 'Goblin', group: 'Goblin Raider', sub: 'Mob', color: '#66a64d', carcassItemId: 'goblin_carcass', young: 'goblin_whelp', threatLevel: 1, raw: { entityClass: 'mob', behaviour: 'aggressive', diet: 'omnivore', predator: true, grazes: false, intelligence: 'primitive', pack: [1, 3], biomeWeights: { swamp: 1, forest: .5 }, lair: 'goblin_warren', lairRange: 65, naturalWeapons: ['fists', 'kick'], limbMap: 'humanoid', lootPool: 'goblin_warband' } },
    orc: { adult: 'orc_reaver', noun: 'Orc', group: 'Orc', sub: 'Mob', color: '#668c59', carcassItemId: 'orc_reaver_carcass', young: 'orc_whelp', threatLevel: 6, raw: { entityClass: 'mob', behaviour: 'aggressive', diet: 'omnivore', predator: true, intelligence: 'primitive', pack: [2, 4], bodyScale: 1.2, biomeWeights: { forest: .8, plains: .8 }, lair: 'goblin_warren', lairRange: 60, naturalWeapons: ['fists', 'slam'], limbMap: 'humanoid', lootPool: 'orc_warband' } },
  };
  const NAME = { gaunt: 'Gaunt', crippled: 'Crippled', grizzled: 'Grizzled' };
  const DESC = {
    gaunt: n => `A ${n.toLowerCase()} that has gone hungry a long while, hips and ribs standing out under a dull coat, head carried low. The frame underneath is still full grown.`,
    crippled: n => `A ${n.toLowerCase()} that took a wound it never healed from. It favours one leg and wears the scars of the fight on its hide.`,
    grizzled: n => `A ${n.toLowerCase()} gone grey past its best years, stiff in the joints and thin over the shoulders.`,
  };
  const HUMANOID_DESC = {
    gaunt: n => `A starved ${n.toLowerCase()}, all knuckles and ribs, wrapped in what is left of its gear.`,
    crippled: n => `A ${n.toLowerCase()} lamed in some old raid, leaning its weight on a crutch.`,
    grizzled: n => `A ${n.toLowerCase()} grown old and grey among its own kind, slow on its feet.`,
  };
  const objects = [];
  for (const [species, L] of Object.entries(LINES)) for (const form of Object.keys(FORMS)) {
    const id = species + '_' + form, name = NAME[form] + ' ' + L.noun, desc = (L.sub === 'Mob' ? HUMANOID_DESC : DESC)[form](L.noun);
    const raw = { ...L.raw, species, variantOf: L.adult, tier: 2, downgrade: form, threatLevel: L.threatLevel, carcassItemId: L.carcassItemId };
    objects.push({ cat: 'creature', group: L.group, sub: L.sub, id, name, desc, color: L.color, src: { entityClass: L.raw.entityClass, species, variantOf: L.adult, tier: 2, downgrade: form, threatLevel: L.threatLevel, limbMap: L.raw.limbMap }, raw });
  }
  return { forms: FORMS, lines: LINES, objects, byId: new Map(objects.map(o => [o.id, o])) };
})();
if (typeof module !== 'undefined') module.exports = DOWNGRADES;
