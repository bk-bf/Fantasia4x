'use strict';
const SMALL_PREDATORS = (() => {
  const LINES = {
    fox: {
      group: 'Red Fox', limbMap: 'quadruped', lair: 'fox_earth', lairRange: 45, pack: [1, 2], diet: 'carnivore', naturalWeapons: ['bite', 'claw'],
      tiers: [
        ['fox_kit', 'Fox Kit', 1, 1, 'neutral', .7, { forest: 1, plains: .9, mountain: .3 }, 'fox_carcass'],
        ['fox', 'Red Fox', 2, 2, 'neutral', 1, { forest: 1, plains: .9, mountain: .3 }, 'fox_carcass'],
        ['sand_fox', 'Sand Fox', 2, 2, 'neutral', .92, { plains: 1, swamp: .2 }, 'fox_carcass'],
        ['silver_fox', 'Silver Fox', 3, 4, 'neutral', 1.18, { forest: 1, mountain: .6 }, 'silver_fox_carcass'],
        ['foxfire_vixen', 'Foxfire Vixen', 4, 8, 'neutral', 1.32, { forest: 1, swamp: .6 }, 'foxfire_vixen_carcass'],
      ],
    },
    hawk: {
      group: 'Goshawk', limbMap: 'avian', lair: 'raptor_eyrie', lairRange: 70, pack: [1, 2], diet: 'carnivore', naturalWeapons: ['claw', 'peck'],
      tiers: [
        ['hawk_eyas', 'Eyas', 1, 1, 'passive', .74, { forest: 1, plains: .8, mountain: .6 }, 'hawk_carcass'],
        ['hawk', 'Goshawk', 2, 2, 'neutral', 1.05, { forest: 1, plains: .8, mountain: .6 }, 'hawk_carcass'],
        ['moor_harrier', 'Moor Harrier', 2, 2, 'neutral', 1, { plains: 1, swamp: .7 }, 'hawk_carcass'],
        ['crag_eagle', 'Crag Eagle', 3, 5, 'neutral', 1.38, { mountain: 1, plains: .5 }, 'crag_eagle_carcass'],
        ['stormcrest_eagle', 'Stormcrest Eagle', 4, 10, 'aggressive', 1.62, { mountain: 1 }, 'stormcrest_eagle_carcass'],
      ],
    },
    stoat: {
      group: 'Stoat', limbMap: 'quadruped', lair: 'stoat_holt', lairRange: 30, pack: [1, 2], diet: 'carnivore', naturalWeapons: ['bite'],
      tiers: [
        ['stoat_kit', 'Stoat Kit', 1, 1, 'neutral', .68, { plains: 1, forest: .8, mountain: .6 }, 'stoat_carcass'],
        ['stoat', 'Stoat', 2, 1, 'neutral', 1, { plains: 1, forest: .8, mountain: .6 }, 'stoat_carcass'],
        ['ermine', 'Ermine', 2, 1, 'neutral', 1, { mountain: 1, forest: .6 }, 'stoat_carcass'],
        ['pine_marten', 'Pine Marten', 3, 3, 'neutral', 1.38, { forest: 1 }, 'marten_carcass'],
        ['bloodneck_marten', 'Bloodneck Marten', 4, 7, 'aggressive', 1.62, { forest: 1, swamp: .5 }, 'bloodneck_marten_carcass'],
      ],
    },
  };
  const CARCASS = {
    fox_carcass: ['Fox Carcass', 6, 9], silver_fox_carcass: ['Silver Fox Carcass', 8, 12], foxfire_vixen_carcass: ['Foxfire Vixen Carcass', 11, 16],
    hawk_carcass: ['Hawk Carcass', 1.2, 3], crag_eagle_carcass: ['Eagle Carcass', 5, 10], stormcrest_eagle_carcass: ['Stormcrest Carcass', 8, 15],
    stoat_carcass: ['Stoat Carcass', .3, .6], marten_carcass: ['Marten Carcass', 1.5, 2.5], bloodneck_marten_carcass: ['Bloodneck Carcass', 4, 6],
  };
  const SITES = { fox_earth: 'Fox Earth', raptor_eyrie: 'Raptor Eyrie', stoat_holt: 'Stoat Holt' };

  const objects = [];
  for (const [species, L] of Object.entries(LINES)) for (const [id, name, tier, threatLevel, behaviour, bodyScale, biomeWeights, carcassItemId] of L.tiers) {
    const raw = { species, tier, threatLevel, entityClass: 'animal', behaviour, diet: L.diet, predator: true, intelligence: 'primitive', pack: L.pack, bodyScale, biomeWeights, lair: L.lair, lairRange: L.lairRange, carcassItemId, naturalWeapons: L.naturalWeapons, limbMap: L.limbMap };
    if (id !== species) raw.variantOf = species;
    objects.push({ cat: 'creature', group: L.group, sub: 'Animal', id, name, raw });
  }
  for (const [id, [name, weightKg, volumeL]] of Object.entries(CARCASS)) objects.push({ cat: 'item', group: 'Material', sub: 'Carcass', id, name, raw: { type: 'material', category: 'carcass', weightKg, volumeL, gatheringTypes: ['hunting'], processingType: ['butchery'], decaysTo: 'rotten_carcass' } });
  for (const [id, name] of Object.entries(SITES)) objects.push({ cat: 'site', group: 'Lair', id, name });
  return { objects, LINES };
})();
if (typeof module !== 'undefined') module.exports = SMALL_PREDATORS;
