'use strict';
(() => {
  const { inked } = WORLD_GEAR;

  const RING = [
    ' LL ',
    'lLMd',
    'l  d',
    'm  d',
    ' md '
  ];
  const SIGNET = [
    'llmd',
    'lood',
    'l  d',
    'm  d',
    ' md '
  ];
  const ARM_RING = [
    ' lllmd ',
    'lWWWWmd',
    'lmmmmdd',
    'ooooood',
    'lmmmmdd',
    ' dddd  '
  ];
  const AMULET = [
    ' yxy   ',
    'x   y  ',
    'y   lm ',
    ' xylLMd',
    '   lMDd',
    '    md '
  ];
  const TWIN_PENDANT = [
    ' yxy   ',
    'x   y  ',
    'y   lLd',
    ' xy lMd',
    '    lZd',
    '    lYd',
    '     d '
  ];
  const LEAF_PENDANT = [
    ' yxy   ',
    'x   y  ',
    'y   lm ',
    ' xyllmd',
    '   lmmd',
    '    md '
  ];
  const TORC = [
    '  lmZmd  ',
    ' l     d ',
    'l       d',
    'm       d',
    'LL     DD'
  ];
  const TOOTH_NECKLACE = [
    ' yxyxy ',
    'x     y',
    'y     x',
    ' lmlml ',
    ' d l d '
  ];
  const FANG_CHARM = [
    ' yxyxy ',
    'x     y',
    'y     x',
    ' LlmlD ',
    ' D l D ',
    '   d   '
  ];
  const CHAIN_OF_OFFICE = [
    ' l l l   ',
    'l     l  ',
    '       l ',
    'l    lmd ',
    ' l llmmd ',
    '    lmod ',
    '     dd  '
  ];
  const CIRCLET = [
    '  mmmmd  ',
    ' m     d ',
    'l  LLM  d',
    'llmLMDmdd',
    ' lmmmmdd '
  ];
  const TWIN_CIRCLET = [
    '  mmmmd  ',
    ' m     d ',
    'l LL ZZ d',
    'llLMmZYdd',
    ' lmmmmdd '
  ];
  const PLAIN_CIRCLET = [
    '  mmmmd  ',
    ' m     d ',
    'l       d',
    'llomomodd',
    ' lmmmmdd '
  ];
  const DIADEM = [
    '    l    ',
    '  l l m  ',
    ' llmlmdd ',
    'llomomodd',
    ' ddddddd '
  ];
  const WAR_CROWN = [
    'l   l   d',
    'l l l m d',
    'lllmmmddd',
    'lZmLMdmYd',
    'lllmmmddd'
  ];
  const HIGH_CROWN = [
    '    L    ',
    '   lmd   ',
    ' lyylyxd ',
    'lyyylyyxd',
    'lllmmmddd',
    'lZmLMdmYd',
    'lllmmmddd'
  ];

  const gold = (gem, second) => ({ body: 'gold', trim: gem, lining: second || gem, strap: 'gold' });
  const silver = (gem, second) => ({ body: 'silver', trim: gem, lining: second || gem, strap: 'silver' });
  const jewel = (rows, wear) => ({ kind: 'jewel', tuck: 'none', ground: () => inked(rows, wear) });
  const GEMS = ['ruby', 'sapphire', 'emerald', 'topaz', 'amethyst', 'citrine'];
  const gemmed = (suffix, rows) => Object.fromEntries([...GEMS.map(gem => [gem + suffix, jewel(rows, gold(gem))]), ['moonstone' + suffix, jewel(rows, silver('moonstone'))]]);

  WORLD_GEAR.add(Object.assign(gemmed('_ring', RING), gemmed('_amulet', AMULET), {
    iron_signet_ring: jewel(SIGNET, { body: 'iron' }),
    bronze_arm_ring: jewel(ARM_RING, { body: 'bronze', lining: 'black' }),
    silver_pendant: jewel(LEAF_PENDANT, { body: 'silver', strap: 'silver' }),
    wayfarers_pendant: jewel(TWIN_PENDANT, silver('topaz', 'moonstone')),
    sages_pendant: jewel(TWIN_PENDANT, gold('sapphire', 'citrine')),
    bronze_torc: jewel(TORC, { body: 'bronze' }),
    gold_torc: jewel(TORC, { body: 'gold', lining: 'emerald' }),
    champions_torc: jewel(TORC, { body: 'gold', trim: 'ruby', lining: 'emerald' }),
    tooth_necklace: jewel(TOOTH_NECKLACE, { body: 'bone', strap: 'leather' }),
    fang_charm: jewel(FANG_CHARM, { body: 'bone', trim: 'horn', strap: 'leather' }),
    gold_chain_of_office: jewel(CHAIN_OF_OFFICE, { body: 'gold' }),
    bone_circlet: jewel(PLAIN_CIRCLET, { body: 'bone' }),
    stargazer_circlet: jewel(CIRCLET, silver('glow')),
    scholars_circlet: jewel(CIRCLET, silver('sapphire')),
    wardens_circlet: jewel(TWIN_CIRCLET, gold('emerald', 'moonstone')),
    filigree_diadem: jewel(DIADEM, { body: 'silver' }),
    champions_crown: jewel(WAR_CROWN, gold('ruby', 'topaz')),
    sovereign_crown: jewel(HIGH_CROWN, { body: 'gold', trim: 'citrine', lining: 'amethyst', strap: 'regal' })
  }));
})();
