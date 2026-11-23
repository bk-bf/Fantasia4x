'use strict';
const PIXEL_ARMOUR_SETS = (() => {
  const { dress, shod, mark, HEAD, TORSO, ARMS, HANDS, LEGS, FEET } = ARMOUR;

  const soled = (wear, sole) => Object.assign({}, wear, { strap: sole || 'boarhide' });
  const both = (x, far, y, rows, ...mats) => [mark(x, y, rows, ...mats), mark(far, y, rows, ...mats)];

  const SCAR = ['  o o', ' o o ', 'o o  '];
  const MOTTLE = ['l   d  ', '   l   ', ' d    l', '    d  '];
  const BARS = ['dd dd dd', '', 'd dd dd ', '', 'dd dd dd'];
  const UNMARKED = { coif: [], jerkin: [], gloves: [] };
  const corner = rows => rows.slice(0, 2).map(row => row.slice(0, 4));
  const emblem = (rows, mat) => ({ coif: [mark(12, 2, rows.slice(0, 3), mat)], jerkin: [mark(9, 10, rows, mat)], gloves: both(3, 21, 8, corner(rows), mat) });

  function leatherSet(name, wear, marks, legs) {
    return [
      { id: name + '_head', draw: () => dress(HEAD.coif, wear, ...marks.coif) },
      { id: name + '_bodybase', draw: () => dress(TORSO.jerkin, wear, ...marks.jerkin) },
      { id: name + '_bracers', draw: () => dress(ARMS.wrap, wear) },
      { id: name + '_gloves', draw: () => dress(HANDS.glove, wear, ...marks.gloves) },
      { id: name + '_greaves', draw: () => dress(legs, wear) },
      { id: name + '_boots', draw: () => shod(FEET.ankleBoot, soled(wear)) }
    ];
  }

  const JACKAL = { body: 'dun', trim: 'dun', strap: 'cord', lining: 'leather' };
  const WOLF = { body: 'wolfpelt', trim: 'fur', strap: 'cord', lining: 'fur' };
  const ELK = { body: 'elkhide', trim: 'buckskin', strap: 'cord', lining: 'boarhide' };
  const SABRE = { body: 'sabrehide', trim: 'boarhide', strap: 'bone', lining: 'boarhide' };
  const OWLBEAR = { body: 'owlpelt', trim: 'fur', strap: 'cord', lining: 'fur' };
  const DIREWOLF = { body: 'direpelt', trim: 'ermine', strap: 'black', lining: 'ermine' };
  const HIPPOGRIFF = { body: 'plume', trim: 'elkhide', strap: 'cord', lining: 'elkhide' };
  const BUCKSKIN = { body: 'buckskin', trim: 'buckskin', strap: 'cord', lining: 'leather' };
  const BOAR = { body: 'boarhide', trim: 'boarhide', strap: 'cord', lining: 'black' };
  const LEATHER = { body: 'leather', trim: 'leather', strap: 'cord', lining: 'boarhide' };
  const HIDE = { body: 'hide', trim: 'leather', strap: 'cord', lining: 'leather' };
  const SACK = { body: 'sackcloth', trim: 'sackcloth', strap: 'cord', lining: 'boarhide' };
  const LINEN = { body: 'linen', trim: 'linen', strap: 'leather', lining: 'drab' };
  const WOAD = { body: 'woad', trim: 'woad', strap: 'cord', lining: 'black' };
  const QUILTED = { body: 'cord', trim: 'cord', strap: 'leather', lining: 'boarhide' };
  const ARMING = { body: 'linen', trim: 'linen', strap: 'red', lining: 'drab' };
  const COPPER = { body: 'copper', trim: 'leather', strap: 'leather', lining: 'black' };
  const BRONZE = { body: 'bronze', trim: 'bronze', strap: 'bronze', lining: 'black' };
  const IRON = { body: 'iron', trim: 'iron', strap: 'leather', lining: 'black' };
  const IRON_ON_LEATHER = { body: 'leather', trim: 'iron', strap: 'boarhide', lining: 'black' };
  const STEEL = { body: 'steel', trim: 'steel', strap: 'leather', lining: 'black' };
  const STEEL_ON_LEATHER = { body: 'leather', trim: 'steel', strap: 'boarhide', lining: 'black' };
  const GRAVEN = { body: 'runed', trim: 'gold', strap: 'glow', lining: 'black' };
  const STITCHED = { body: 'runed', trim: 'glow', strap: 'glow', lining: 'black' };
  const STITCHED_SCALE = { body: 'runecloth', trim: 'glow', strap: 'glow', lining: 'black' };
  const WOVEN = { body: 'runecloth', trim: 'glow', strap: 'glow', lining: 'black' };
  const WICKER = { body: 'ash', trim: 'wood', strap: 'cord', lining: 'wood' };
  const BRANCH = { body: 'wood', strap: 'cord' };

  const GRAVEN_CHEST = mark(6, 5, ['m          m', 'l          l', ' m        m ', ' l        l ', '  m      m  ', '  l      l  ', '   m    m   ', '   l    l   '], 'glow');
  const GRAVEN_SHINS = both(8, 17, 9, ['m', 'l', 'm', 'l', 'm', 'l', 'm', 'l', 'm', 'l'], 'glow');
  const GRAVEN_KNUCKLES = both(2, 21, 10, ['m m m'], 'glow');
  const STITCHES = mark(3, 11, ['m m m m m m m m', '', '', '', ' m m m m m m m m'], 'glow');
  const SPIRAL = mark(9, 15, ['  m', ' l   m', 'm   l', '', '   m', '  l   m', ' m   l'], 'glow');
  const RIVET_ROWS = mark(7, 7, ['d  d    d  d', '', '', 'd  d    d  d', '', '', 'd  d    d  d', '', '', 'd  d    d  d', '', '', 'd  d    d  d'], 'iron');
  const POINTS = [...both(2, 22, 4, ['mm', ' d'], 'cord'), ...both(8, 16, 17, ['mm', ' d'], 'cord')];
  const CALF_LACING = both(2, 16, 12, ['m', '', 'm', '', 'm', '', 'm', '', 'm', '', 'm'], 'cord');

  return [
    ...leatherSet('jackal', JACKAL, UNMARKED, LEGS.wrap),
    ...leatherSet('wolf', WOLF, UNMARKED, LEGS.wrap),
    ...leatherSet('elk', ELK, UNMARKED, LEGS.greave),
    ...leatherSet('sabretooth', SABRE, emblem(SCAR, 'sabrehide'), LEGS.wrap),
    ...leatherSet('owlbear', OWLBEAR, emblem(MOTTLE, 'fur'), LEGS.greave),
    ...leatherSet('direwolf', DIREWOLF, UNMARKED, LEGS.wrap),
    ...leatherSet('hippogriff', HIPPOGRIFF, emblem(BARS, 'elkhide'), LEGS.greave),

    { id: 'leather_coif', draw: () => dress(HEAD.coif, LEATHER) },
    { id: 'stitched_gauntlets', draw: () => dress(HANDS.glove, LEATHER) },
    { id: 'hide_boots', draw: () => shod(FEET.ankleBoot, soled({ body: 'leather', trim: 'fur', lining: 'fur' })) },

    { id: 'boarhide_jerkin', draw: () => dress(TORSO.jerkin, BOAR) },
    { id: 'boarhide_bracers', draw: () => dress(ARMS.wrap, BOAR) },
    { id: 'boarhide_greaves', draw: () => dress(LEGS.wrap, BOAR) },
    { id: 'boar_head', draw: () => dress(HEAD.coif, BOAR) },
    { id: 'boar_gloves', draw: () => dress(HANDS.glove, BOAR) },
    { id: 'boar_boots', draw: () => shod(FEET.ankleBoot, soled(BOAR, 'black')) },
    { id: 'cast_bronze_skullcap', draw: () => dress(HEAD.dome, BRONZE) },
    { id: 'cast_bronze_bracers', draw: () => dress(ARMS.vambrace, BRONZE) },
    { id: 'cast_bronze_greaves', draw: () => dress(LEGS.greave, BRONZE) },

    { id: 'deer_bodybase', draw: () => dress(TORSO.jerkin, BUCKSKIN) },
    { id: 'deer_boots', draw: () => shod(FEET.ankleBoot, soled(BUCKSKIN)) },
    { id: 'deer_greaves', draw: () => dress(LEGS.trousers, BUCKSKIN, ...CALF_LACING) },
    { id: 'leather_vambraces', draw: () => dress(ARMS.wrap, LEATHER) },
    { id: 'three_finger_glove', draw: () => dress(HANDS.threeFinger, { body: 'leather', trim: 'bronze', strap: 'boarhide' }) },

    { id: 'cured_hide_hood', draw: () => dress(HEAD.hood, HIDE) },
    { id: 'cured_hide_vest', draw: () => dress(TORSO.jerkin, HIDE) },
    { id: 'cured_hide_skirt', draw: () => dress(LEGS.skirt, HIDE) },
    { id: 'cured_hide_boots', draw: () => shod(FEET.ankleBoot, soled({ body: 'hide', trim: 'hide', lining: 'leather' }, 'leather')) },

    { id: 'wicker_vest', draw: () => dress(TORSO.wickerVest, WICKER) },
    { id: 'branch_bracers', draw: () => dress(ARMS.sticks, BRANCH) },
    { id: 'branch_greaves', draw: () => dress(LEGS.sticks, BRANCH) },
    { id: 'bark_sandals', draw: () => dress(FEET.sandal, BRANCH) },

    { id: 'sackcloth_hood', draw: () => dress(HEAD.hood, SACK) },
    { id: 'sackcloth_tunic', draw: () => dress(TORSO.tunic, Object.assign({}, SACK, { trim: 'cord' })) },
    { id: 'sackcloth_mitts', draw: () => dress(HANDS.mitt, SACK) },
    { id: 'sackcloth_footwraps', draw: () => shod(FEET.footwrap, Object.assign({}, SACK, { strap: 'sackcloth' })) },

    { id: 'linen_gambeson', draw: () => dress(TORSO.coat, LINEN) },
    { id: 'linen_hose', draw: () => dress(LEGS.trousers, LINEN) },
    { id: 'linen_robe', draw: () => dress(TORSO.robe, WOAD) },
    { id: 'linen_cap', draw: () => dress(HEAD.coif, WOAD) },
    { id: 'linen_gloves', draw: () => dress(HANDS.glove, WOAD) },
    { id: 'linen_boots', draw: () => shod(FEET.ankleBoot, soled(WOAD)) },

    { id: 'quilted_jack', draw: () => dress(TORSO.coat, QUILTED) },
    { id: 'quilted_head', draw: () => dress(HEAD.coif, QUILTED) },
    { id: 'quilted_gloves', draw: () => dress(HANDS.glove, QUILTED) },
    { id: 'quilted_boots', draw: () => shod(FEET.ankleBoot, soled(QUILTED)) },
    { id: 'quilted_hose', draw: () => dress(LEGS.quiltTrousers, QUILTED) },

    { id: 'arming_cap', draw: () => dress(HEAD.quiltCap, ARMING) },
    { id: 'arming_doublet', draw: () => dress(TORSO.coat, ARMING, ...POINTS) },
    { id: 'arming_hose', draw: () => dress(LEGS.quiltTrousers, ARMING) },

    { id: 'copper_scale_shirt', draw: () => dress(TORSO.scaleShirt, COPPER) },
    { id: 'copper_scale_cap', draw: () => dress(HEAD.scaleCap, COPPER) },
    { id: 'copper_scale_bracers', draw: () => dress(ARMS.scale, COPPER) },
    { id: 'copper_scale_greaves', draw: () => dress(LEGS.scale, COPPER) },
    { id: 'copper_scale_gloves', draw: () => dress(HANDS.scaleGlove, { body: 'leather', trim: 'copper' }) },
    { id: 'copper_scale_shoes', draw: () => shod(FEET.shoe, { body: 'leather', trim: 'copper', strap: 'boarhide', lining: 'black' }) },

    { id: 'mail_coif', draw: () => dress(HEAD.mailCoif, IRON) },
    { id: 'mail_hauberk', draw: () => dress(TORSO.hauberk, Object.assign({}, IRON, { trim: 'bronze' })) },
    { id: 'iron_gauntlets', draw: () => dress(HANDS.gauntlet, IRON) },
    { id: 'iron_shod_boots', draw: () => shod(FEET.boot, { body: 'leather', trim: 'iron', strap: 'iron', lining: 'black' }) },
    { id: 'iron_bracers', draw: () => dress(ARMS.splint, IRON_ON_LEATHER) },
    { id: 'iron_greaves', draw: () => dress(LEGS.greave, IRON) },

    { id: 'iron_nasal_helm', draw: () => dress(HEAD.nasal, IRON) },
    { id: 'iron_plated_jack', draw: () => dress(TORSO.coat, { body: 'drab', trim: 'iron', lining: 'black' }, RIVET_ROWS) },
    { id: 'iron_plate_bracers', draw: () => dress(ARMS.vambrace, IRON) },
    { id: 'iron_plate_greaves', draw: () => dress(LEGS.wrap, IRON) },

    { id: 'great_helm', draw: () => dress(HEAD.greatHelm, Object.assign({}, STEEL, { trim: 'bronze' })) },
    { id: 'plate_cuirass', draw: () => dress(TORSO.cuirass, STEEL) },
    { id: 'steel_vambraces', draw: () => dress(ARMS.vambrace, Object.assign({}, STEEL, { trim: 'bronze' })) },
    { id: 'steel_gauntlets', draw: () => dress(HANDS.gauntlet, STEEL) },
    { id: 'steel_greaves', draw: () => dress(LEGS.greave, STEEL) },
    { id: 'steel_sabatons', draw: () => shod(FEET.sabaton, soled(STEEL, 'black')) },

    { id: 'open_burgonet', draw: () => dress(HEAD.burgonet, STEEL) },
    { id: 'munition_breastplate', draw: () => dress(TORSO.breastplate, Object.assign({}, STEEL, { trim: 'bronze' })) },
    { id: 'splint_bracers', draw: () => dress(ARMS.splint, STEEL_ON_LEATHER) },
    { id: 'splint_greaves', draw: () => dress(LEGS.splint, STEEL_ON_LEATHER) },
    { id: 'munition_half_plate_gloves', draw: () => dress(HANDS.splintGlove, STEEL_ON_LEATHER) },
    { id: 'munition_half_plate_boots', draw: () => shod(FEET.ankleBoot, soled(STEEL_ON_LEATHER, 'black')) },

    { id: 'rune_graven_helm', draw: () => dress(HEAD.closedHelm, GRAVEN) },
    { id: 'rune_graven_cuirass', draw: () => dress(TORSO.cuirass, GRAVEN, GRAVEN_CHEST) },
    { id: 'rune_graven_vambraces', draw: () => dress(ARMS.vambrace, GRAVEN) },
    { id: 'rune_graven_gauntlets', draw: () => dress(HANDS.gauntlet, GRAVEN, ...GRAVEN_KNUCKLES) },
    { id: 'rune_graven_greaves', draw: () => dress(LEGS.greave, GRAVEN, ...GRAVEN_SHINS) },
    { id: 'rune_graven_sabatons', draw: () => shod(FEET.sabaton, soled(GRAVEN, 'black')) },

    { id: 'rune_stitched_lamellar', draw: () => dress(TORSO.lamellarVest, STITCHED, STITCHES) },
    { id: 'rune_stitched_coif', draw: () => dress(HEAD.scaleCoif, STITCHED_SCALE) },
    { id: 'rune_stitched_bracers', draw: () => dress(ARMS.scale, STITCHED_SCALE) },
    { id: 'rune_stitched_gloves', draw: () => dress(HANDS.scaleGlove, { body: 'wool', trim: 'runed' }) },
    { id: 'rune_stitched_greaves', draw: () => dress(LEGS.scale, STITCHED_SCALE) },
    { id: 'rune_stitched_boots', draw: () => shod(FEET.shoe, { body: 'wool', trim: 'runed', strap: 'black', lining: 'black' }) },

    { id: 'rune_woven_robe', draw: () => dress(TORSO.robe, Object.assign({}, WOVEN, { trim: 'gold' }), SPIRAL) },
    { id: 'rune_woven_hood', draw: () => dress(HEAD.hood, WOVEN) },
    { id: 'rune_woven_gloves', draw: () => dress(HANDS.glove, WOVEN) },
    { id: 'rune_woven_boots', draw: () => shod(FEET.ankleBoot, soled(WOVEN, 'black')) },
    { id: 'rune_woven_hose', draw: () => dress(LEGS.trousers, WOVEN) }
  ];
})();
PIXEL_ICONS.push(...PIXEL_ARMOUR_SETS);
