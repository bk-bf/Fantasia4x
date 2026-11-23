'use strict';
const PIXEL_ARMOUR_ODD = (() => {
  const { dress, shod, mark, times, HEAD, TORSO, ARMS, HANDS, LEGS, FEET, MEDICAL } = ARMOUR;

  const ORC = { body: 'black', trim: 'iron', strap: 'leather', lining: 'black' };
  const SCRAP = { body: 'iron', trim: 'ember', strap: 'leather', lining: 'sackcloth' };
  const GREAT_BONE = { body: 'bone', trim: 'bone', strap: 'fur', lining: 'fur' };
  const BONE_ON_PELT = { body: 'owlpelt', trim: 'bone', strap: 'cord', lining: 'fur' };

  const CREST = mark(7, -7, ['  lm  ', ' llmd ', 'llmmdd', 'llmmdd', 'llmmdd', ' lmmd ', ' lmmd '], 'red');
  const STUB_HORNS = [mark(-3, 5, [' lm', 'lmm', 'mmd', ' dd'], 'horn'), mark(22, 5, ['ml ', 'mmd', 'mdd', 'dd '], 'horn')];
  const EYE_SLOTS = mark(4, 9, ['oooo      oooo', 'oooo      oooo'], 'iron');
  const BRIM = mark(2, 5, ['llllllmmmmmmmmmmdddddd', ' dddddddddddddddddddd '], 'moss');
  const PATCHES = [mark(11, 9, ['llmd', 'lmmd', 'lmdd', 'mddd'], 'wood'), mark(6, 15, ['lmd', 'mmd', 'mdd'], 'red'), mark(13, 16, ['lmmd', 'mmdd'], 'cord')];
  const IRON_FRAME = [mark(0, 9, ['llllllmmmmmmmmmmmmdddddd', 'dddddddddddddddddddddddd'], 'iron'), mark(11, 4, times(5, 'ld'), 'iron'), mark(11, 11, times(4, 'ld'), 'iron')];
  const ENGRAVING = [mark(5, 7, [' dd        dd ', 'd  d      d  d', ' d  d    d  d ', '  dd      dd  '], 'gold'), mark(11, 3, ['lm', 'md'], 'ruby')];
  const FUR_COLLAR = mark(5, 0, ['  lmlmmmdmdd  ', ' llmlmmmmdmdd ', 'lmllml  mdmddd'], 'ermine');
  const SIGILS = mark(9, 16, ['   mm   ', '  m  m  ', '   mm   ', '        ', ' l    l ', '        ', '   ll   '], 'glow');
  const ELBOW_SPIKES = [mark(-2, 2, [' l', 'lm', 'md'], 'black'), mark(24, 2, ['l ', 'md', 'dd'], 'black')];

  return [
    { id: 'wooden_arm_splint', draw: () => dress(MEDICAL.armSplint, { body: 'linen', trim: 'wood', strap: 'leather' }) },
    { id: 'wooden_leg_splint', draw: () => dress(MEDICAL.legSplint, { body: 'linen', trim: 'wood', strap: 'leather' }) },
    { id: 'lime_arm_cast', draw: () => dress(MEDICAL.armCast, { body: 'plaster', lining: 'black' }) },
    { id: 'lime_leg_cast', draw: () => dress(MEDICAL.legCast, { body: 'plaster', lining: 'black' }) },

    { id: 'wool_cloak', draw: () => dress(TORSO.cloak, { body: 'drab', trim: 'bronze', lining: 'boarhide' }) },
    { id: 'leather_cloak', draw: () => dress(TORSO.cloak, { body: 'moss', trim: 'bone', lining: 'black' }) },
    { id: 'direwolf_warcloak', draw: () => dress(TORSO.cloak, { body: 'direpelt', trim: 'bone', lining: 'black' }, FUR_COLLAR) },
    { id: 'brimmed_leather_hood', draw: () => dress(HEAD.hood, { body: 'moss', strap: 'cord', lining: 'black' }, BRIM) },

    { id: 'soot_darkened_jerkin', draw: () => dress(TORSO.jerkin, { body: 'black', strap: 'lead', lining: 'black' }) },
    { id: 'cave_bear_plate', draw: () => dress(TORSO.breastplate, { body: 'boarhide', trim: 'iron', strap: 'iron' }, ...IRON_FRAME) },
    { id: 'croc_scale_cuirass', draw: () => dress(TORSO.scaleVest, { body: 'croc', lining: 'leather' }) },
    { id: 'layered_boarhide_plate', draw: () => dress(TORSO.layeredPlate, { body: 'boarhide', strap: 'cord' }) },
    { id: 'bone_plated_cuirass', draw: () => dress(TORSO.boneCuirass, { body: 'leather', trim: 'bone', lining: 'leather' }) },
    { id: 'ceremonial_plate', draw: () => dress(TORSO.cuirass, { body: 'gold', trim: 'gold' }, ...ENGRAVING) },
    { id: 'silk_robe', draw: () => dress(TORSO.robe, { body: 'silk', trim: 'silver', strap: 'silk', lining: 'silk' }) },
    { id: 'arcane_robe', draw: () => dress(TORSO.robe, { body: 'arcane', trim: 'gold', strap: 'gold', lining: 'arcane' }, SIGILS) },
    { id: 'regal_robes', draw: () => dress(TORSO.robe, { body: 'regal', trim: 'ermine', strap: 'gold', lining: 'regal' }) },

    { id: 'bronze_crested_helm', draw: () => dress(HEAD.barbute, { body: 'bronze', lining: 'black' }, CREST) },
    { id: 'spangenhelm', draw: () => dress(HEAD.spangen, { body: 'iron', trim: 'bronze', lining: 'black' }) },
    { id: 'kettle_hat', draw: () => dress(HEAD.kettle, { body: 'iron', trim: 'iron', strap: 'leather' }) },
    { id: 'sallet', draw: () => dress(HEAD.sallet, { body: 'steel', lining: 'black' }) },
    { id: 'barbute', draw: () => dress(HEAD.barbute, { body: 'steel', lining: 'black' }) },
    { id: 'horned_helm', draw: () => dress(HEAD.horned, { body: 'bone', trim: 'horn', lining: 'black' }) },

    { id: 'orc_scrap_plate', draw: () => dress(TORSO.slabPlate, SCRAP) },
    { id: 'orc_horned_helm', draw: () => dress(HEAD.pot, Object.assign({}, ORC, { lining: 'sackcloth' }), ...STUB_HORNS) },
    { id: 'orc_iron_greaves', draw: () => dress(LEGS.band, { body: 'boarhide', trim: 'black' }) },
    { id: 'orc_warplate', draw: () => dress(TORSO.slabPlate, ORC) },
    { id: 'orc_warhelm', draw: () => dress(HEAD.warhelm, ORC) },
    { id: 'orc_plate_vambraces', draw: () => dress(ARMS.vambrace, ORC, ...ELBOW_SPIKES) },
    { id: 'orc_plate_gauntlets', draw: () => dress(HANDS.gauntlet, ORC) },
    { id: 'orc_plate_greaves', draw: () => dress(LEGS.thighSlab, ORC) },
    { id: 'orc_plate_sabatons', draw: () => shod(FEET.sabaton, Object.assign({}, ORC, { strap: 'boarhide' })) },

    { id: 'goblin_scrap_vest', draw: () => dress(TORSO.jerkin, { body: 'goblin', strap: 'cord', lining: 'black' }, ...PATCHES) },
    { id: 'goblin_scrap_cap', draw: () => dress(HEAD.cookpot, { body: 'lead', trim: 'lead', strap: 'leather' }) },
    { id: 'goblin_bark_bracers', draw: () => dress(ARMS.bark, { body: 'wood', strap: 'red' }) },
    { id: 'goblin_ring_vest', draw: () => dress(TORSO.ringVest, { body: 'iron', trim: 'ember', lining: 'black' }) },
    { id: 'goblin_pot_helm', draw: () => dress(HEAD.pot, { body: 'iron', trim: 'ember', lining: 'goblin' }, EYE_SLOTS) },

    { id: 'kobold_scale_vest', draw: () => dress(TORSO.scaleVest, { body: 'drab', lining: 'boarhide' }) },
    { id: 'kobold_dig_cap', draw: () => dress(HEAD.digCap, { body: 'hide', trim: 'bone', strap: 'cord', lining: 'flame' }) },
    { id: 'kobold_bone_bracers', draw: () => dress(ARMS.sticks, { body: 'bone', strap: 'cord' }) },

    { id: 'gnoll_bone_harness', draw: () => dress(TORSO.ribHarness, { body: 'bone', trim: 'bronze', strap: 'leather' }) },
    { id: 'gnoll_skull_helm', draw: () => dress(HEAD.skull, { body: 'bone' }) },
    { id: 'gnoll_hide_greaves', draw: () => dress(LEGS.shinWrap, { body: 'hide', trim: 'fur', strap: 'cord' }) },

    { id: 'great_bone_helm', draw: () => dress(HEAD.boneHelm, GREAT_BONE) },
    { id: 'great_bone_cuirass', draw: () => dress(TORSO.boneCuirass, BONE_ON_PELT) },
    { id: 'great_bone_vambraces', draw: () => dress(ARMS.sticks, GREAT_BONE) },
    { id: 'great_bone_greaves', draw: () => dress(LEGS.splint, BONE_ON_PELT) },
    { id: 'great_bone_gauntlets', draw: () => dress(HANDS.scaleGlove, { body: 'owlpelt', trim: 'bone' }) },
    { id: 'great_bone_sabatons', draw: () => shod(FEET.sabaton, { body: 'bone', trim: 'fur', strap: 'boarhide', lining: 'fur' }) }
  ];
})();
PIXEL_ICONS.push(...PIXEL_ARMOUR_ODD);
