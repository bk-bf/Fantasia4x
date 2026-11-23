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
  const IRON_FRAME = [mark(0, 9, ['llllllmmmmmmmmmmmmdddddd', 'dddddddddddddddddddddddd'], 'iron'), mark(11, 4, times(5, 'ld'), 'iron'), mark(11, 11, times(4, 'ld'), 'iron')];
  const ENGRAVING = [mark(5, 7, [' dd        dd ', 'd  d      d  d', ' d  d    d  d ', '  dd      dd  '], 'gold'), mark(11, 3, ['lm', 'md'], 'ruby')];
  const FUR_COLLAR = mark(5, 0, ['  lmlmmmdmdd  ', ' llmlmmmmdmdd ', 'lmllml  mdmddd'], 'ermine');
  const SIGILS = mark(9, 16, ['   mm   ', '  m  m  ', '   mm   ', '        ', ' l    l ', '        ', '   ll   '], 'glow');
  const BONE_SCALES = [mark(1, 8, ['lmd lmd ', ' lmd lmd', 'lmd lmd '], 'bone'), mark(18, 8, ['lmd lmd ', ' lmd lmd', 'lmd lmd '], 'bone')];
  const KNUCKLE_CLAWS = [mark(0, 5, ['l  l  l  l', 'm  m  m  m'], 'bone'), mark(17, 5, ['l  l  l  l', 'm  m  m  m'], 'bone')];
  const FINGERLESS = [...HANDS.gauntlet.slice(7)];
  const KNUCKLE_SPIKES = [mark(0, -2, [' l  l  l ', 'lm lm lm ', 'md md md '], 'black'), mark(15, -2, [' l  l  l ', 'lm lm lm ', 'md md md '], 'black')];
  const SUTURES = mark(5, 1, ['   d    ', '  d d  d', ' d   dd ', '        ', '      d ', '     d d'], 'bone');
  const BROW_RIDGE = mark(0, 7, [' llllllllmmmmmmmmmmdddd ', 'lllmmllmmmmmmmmdmmmddddd'], 'bone');
  const ELBOW_SPIKES = [mark(-2, 2, [' l', 'lm', 'md'], 'black'), mark(24, 2, ['l ', 'md', 'dd'], 'black')];

  const SCRAP_VEST = [
    '    llll      mmdd    ',
    '    lllm      mmdd    ',
    '    lllmm    mmmdd    ',
    '   llllmmm  mmmmddd   ',
    '   lllllmmmmmmmmdddd  ',
    '  llllllmmmmmmmmmdddd ',
    ' lllllllmmmmmmmmmddddd',
    ...times(13, 'llllllllmmmmmmmmmddddd'),
    'lllllllmmmmmmmmmmdddd ',
    ' llll lmmm mmmmm ddd  ',
    '  ll   mm   mm    d   '
  ];
  const vestPatches = () => PX.layered(
    [0, 0, SCRAP_VEST, 'hide'],
    [2, 6, ['lmlmd ', 'lmlmmd', 'lmlmmd', 'llmlmd', 'lmlmd ', ' lml  '], 'wood'],
    [14, 3, ['lmmd', 'mmmd', 'mdd '], 'boarhide'],
    [12, 12, ['llmmmmd', 'lmmmmmd', 'lmmmmdd', 'mmmmddd', ' mm dd '], 'red'],
    [3, 15, ['lllmd', 'lmmmd', 'mmmdd'], 'ember'],
    [8, 1, ['l    l', ' l  l ', '  ll  '], 'string'],
    [8, 7, ['l', ' ', 'l', ' ', 'l', ' ', 'l'], 'string'],
    [11, 18, ['l l l l l'], 'string']
  );
  const RIVETS = [[4, 16], [6, 16], [4, 17]];
  const scrapVest = () => RIVETS.reduce((sk, [x, y]) => PX.stamp(sk, x, y, ['l'], ['iron']), vestPatches());
  const POT = [
    '  llllmmmmmmdd  ',
    ' lllllmmmmmmmdd ',
    'lllllmmmmmmmmddd',
    'lllllmmmmmmmmddd',
    'llllmmmmmmmmmddd',
    'llllmmmmmmmmmddd',
    'llllmmmmmmmmdddd',
    'lllmmmmmmmmmdddd',
    'lllmmmmmmmmmdddd',
    'lllmmmmmmmmmdddd',
    'llmmmmmmmmmmdddd',
    'llllllmmmmmmmddd',
    'dddddddddddddddd'
  ];
  const potHelm = () => PX.layered(
    [3, 12, ['l              d', 'l              d', 'l              d', ' l            d ', '  ll        dd  ', '    lllmmmmdd    '.slice(0, 16)], 'leather'],
    [3, 0, POT, 'lead'],
    [19, 4, ['md', 'dm', 'm '], 'lead']
  );
  const DENTS = [[6, 3, ['dl']], [12, 6, ['d', 'l']], [8, 8, ['dl']]];
  const RUST = [[4, 6, ['mm', 'dm', ' d']], [12, 1, ['mmd']], [15, 8, ['m', 'd']], [8, 11, ['mmd']]];
  const scrapHelm = () => {
    const sk = potHelm();
    for (const [x, y, rows] of DENTS) PX.stamp(sk, x, y, rows, ['lead']);
    for (const [x, y, rows] of RUST) PX.stamp(sk, x, y, rows, ['ember']);
    for (const [x, y] of [[4, 10], [17, 10]]) PX.stamp(sk, x, y, ['l'], ['iron']);
    return sk;
  };

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
    { id: 'orc_plate_gauntlets', draw: () => dress(FINGERLESS, ORC, ...KNUCKLE_SPIKES) },
    { id: 'orc_plate_greaves', draw: () => dress(LEGS.thighSlab, ORC) },
    { id: 'orc_plate_sabatons', draw: () => shod(FEET.sabaton, Object.assign({}, ORC, { strap: 'boarhide' })) },

    { id: 'goblin_scrap_vest', draw: scrapVest },
    { id: 'goblin_scrap_cap', draw: scrapHelm },
    { id: 'goblin_bark_bracers', draw: () => dress(ARMS.bark, { body: 'wood', strap: 'red' }) },
    { id: 'goblin_ring_vest', draw: () => dress(TORSO.ringVest, { body: 'iron', trim: 'ember', lining: 'black' }) },
    { id: 'goblin_pot_helm', draw: () => dress(HEAD.pot, { body: 'iron', trim: 'ember', lining: 'goblin' }, EYE_SLOTS) },

    { id: 'kobold_scale_vest', draw: () => dress(TORSO.scaleVest, { body: 'drab', lining: 'boarhide' }) },
    { id: 'kobold_dig_cap', draw: () => dress(HEAD.digCap, { body: 'hide', trim: 'bone', strap: 'cord', lining: 'flame' }) },
    { id: 'kobold_bone_bracers', draw: () => dress(ARMS.sticks, { body: 'bone', strap: 'cord' }) },

    { id: 'gnoll_bone_harness', draw: () => dress(TORSO.ribHarness, { body: 'bone', trim: 'bronze', strap: 'leather' }) },
    { id: 'gnoll_skull_helm', draw: () => dress(HEAD.skull, { body: 'bone' }) },
    { id: 'gnoll_hide_greaves', draw: () => dress(LEGS.shinWrap, { body: 'hide', trim: 'fur', strap: 'cord' }) },

    { id: 'great_bone_helm', draw: () => dress(HEAD.boneHelm, GREAT_BONE, SUTURES, BROW_RIDGE) },
    { id: 'great_bone_cuirass', draw: () => dress(TORSO.boneCuirass, BONE_ON_PELT) },
    { id: 'great_bone_vambraces', draw: () => dress(ARMS.sticks, GREAT_BONE) },
    { id: 'great_bone_greaves', draw: () => dress(LEGS.splint, BONE_ON_PELT) },
    { id: 'great_bone_gauntlets', draw: () => dress(HANDS.glove, { body: 'owlpelt', trim: 'bone' }, ...BONE_SCALES, ...KNUCKLE_CLAWS) },
    { id: 'great_bone_sabatons', draw: () => shod(FEET.sabaton, { body: 'bone', trim: 'fur', strap: 'boarhide', lining: 'fur' }) }
  ];
})();
PIXEL_ICONS.push(...PIXEL_ARMOUR_ODD);
