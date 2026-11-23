'use strict';
const PIXEL_DRINKS = (() => {
  const { draw, layer, flask, tankard, mug, cup, jug, pail, keg, bowl, deepPot, crock, shift, FOAM, BAIL, ellipsoid } = GOODS;

  const TIERS = [{}, { band: true }, { stopper: 'knob', band: true }];
  const potion = (shape, fill, tier) => () => draw({ body: 'glass', fill, trim: 'wood', mark: 'gold' }, ...flask(shape, TIERS[tier]));
  const LINES = [
    ['potion_of_might', 'round', 'ruby'],
    ['draught_of_vigor', 'round', 'emerald'],
    ['nightglow_draught', 'round', 'glow'],
    ['elixir_of_grace', 'tall', 'sky'],
    ['calming_draught', 'tall', 'calm'],
    ['tonic_of_fortitude', 'squat', 'amethyst'],
    ['ironhide_tonic', 'squat', 'topaz'],
    ['bloodrage_draught', 'cone', 'blood'],
    ['frenzy_draught', 'cone', 'wolfpelt'],
    ['farsight_tonic', 'cone', 'sapphire'],
    ['vigor_draught', 'gourd', 'rose'],
    ['antivenin_tonic', 'gourd', 'jade'],
    ['restful_tonic', 'gourd', 'wool']
  ];
  const potions = LINES.flatMap(([id, shape, fill]) => ['', 'greater_', 'grand_'].map((prefix, tier) => ({ id: prefix + id, draw: potion(shape, fill, tier) })));

  const BEASTS = [
    ['feral', 'alpha', 'blood'],
    ['hide', 'ironhide', 'direpelt'],
    ['predator', 'sabretooth', 'owlpelt'],
    ['sight', 'third_eye', 'dun']
  ];
  const BEAST_MARKS = {
    blood: [layer(3, 4, ['m  m  m ', ' m  m  m', '  m  m  '], 'mark', { keep: true })],
    direpelt: [layer(3, -3, ['l l l l ', 'l m l m ', 'm m m m '], 'mark')],
    owlpelt: [layer(6, -4, ['  M  ', ' LMD ', 'L M D', '  m  ', '  m  '], 'mark')],
    dun: [layer(4, 5, [' lll ', 'lmoml', ' lll '], 'mark', { keep: true })]
  };
  const BEAST_INK = { blood: 'red', direpelt: 'fur', owlpelt: 'leaf', dun: 'milk' };
  const crude = fill => () => draw({ body: 'clay', fill, mark: BEAST_INK[fill] }, ...crock(10), ...BEAST_MARKS[fill]);
  const transfusion = fill => () => draw({ body: 'glass', fill, trim: 'wood' }, ...flask('phial', {}));
  const essence = fill => () => draw({ body: 'glass', fill, mark: 'gold' }, ...flask('phial', { stopper: 'knob', band: true }));
  const beasts = BEASTS.flatMap(([line, prefix, fill]) => [
    { id: 'crude_' + line + '_draught', draw: crude(fill) },
    { id: line + '_transfusion', draw: transfusion(fill) },
    { id: prefix + '_essence', draw: essence(fill) }
  ]);

  const foamed = (fill, hoops) => () => draw({ body: 'wood', fill, trim: 'linen', mark: hoops }, ...shift(tankard(), 0, 2), layer(0, 0, FOAM, 'trim', { keep: true }));
  const clayMug = fill => () => draw({ body: 'clay', fill, trim: 'linen' }, ...shift(mug(), 0, 2), layer(0, 0, FOAM, 'trim', { keep: true }));
  const bottle = (fill, opts, mark) => () => draw({ body: 'glass', fill, trim: 'wood', mark: mark || 'linen' }, ...flask('bottle', Object.assign({ neck: 2, level: 0 }, opts)));
  const decanter = fill => () => draw({ body: 'glass', fill, trim: 'wood', mark: 'red' }, ...flask('squat', { stopper: 'wax', neck: 2, level: 1 }));
  const pitcher = (body, fill) => () => draw({ body, fill }, ...jug());
  const DRIP = ['M', 'D'];
  const water = () => draw({ body: 'clay', fill: 'water' }, ...jug(), layer(0, 3, DRIP, 'fill', { keep: true }));
  const whisky = () => draw({ body: 'wood', fill: 'amber', trim: 'iron', mark: 'iron' }, ...keg(), layer(14, 6, ['zyy', 'x  '], 'trim'), layer(15, 8, ['L', 'D'], 'fill', { keep: true }));
  const LEAF_FLOAT = ['zy', 'yx'];
  const tea = () => draw({ body: 'plaster', fill: 'calm', trim: 'leaf' }, ...cup(), layer(6, 1, LEAF_FLOAT, 'trim', { keep: true }));
  const milkPail = () => draw({ body: 'wood', fill: 'milk', trim: 'iron', mark: 'iron' }, ...shift(pail(), 0, 4), layer(0, 0, BAIL, 'trim', { keep: true }));
  const stock = () => draw({ body: 'clay', fill: 'broth' }, ...bowl(18));
  const sapCrock = () => draw({ body: 'glass', fill: 'birch', trim: 'cord', mark: 'birch' }, ...flask('gourd', { label: [4, 3], level: 2 }));

  const HORN_PATH = [[3.5, 3.5, 3.6], [6, 5.5, 3.3], [8.5, 7.5, 3], [11, 9, 2.6], [13.5, 10, 2.2], [16, 10.2, 1.8], [18, 9.4, 1.4], [19.5, 8, 1.1]];
  const hornBody = () => HORN_PATH.slice().reverse().map(([x, y, r]) => { const rows = ellipsoid(r, r); return layer(Math.round(x - rows[0].length / 2), Math.round(y - rows.length / 2), rows, 'body', { keep: true }); });
  const mead = () => draw({ body: 'horn', fill: 'honey', mark: 'silver' },
    ...hornBody(),
    layer(0, 0, ['  yyyy  ', ' y    y ', 'y      y', 'y      y', 'x      x', ' x    x ', '  xxxx  '], 'mark', { keep: true }),
    layer(1, 1, ['  LL  ', ' LMMM ', 'LMMMMD', 'MMMMDD', ' MMDD '], 'fill', { keep: true }));

  return [
    ...potions,
    ...beasts,
    { id: 'water', draw: water },
    { id: 'ale', draw: foamed('ale', 'iron') },
    { id: 'hopped_ale', draw: foamed('cider', 'leaf') },
    { id: 'barley_beer', draw: clayMug('ale') },
    { id: 'cider', draw: pitcher('stone', 'cider') },
    { id: 'wine', draw: bottle('wine', { label: [6, 4] }) },
    { id: 'grape_wine', draw: bottle('claret', { stopper: 'wax', label: [6, 4] }, 'red') },
    { id: 'fortified_wine', draw: decanter('port') },
    { id: 'apple_brandy', draw: decanter('amber') },
    { id: 'grain_whisky', draw: whisky },
    { id: 'birch_sap_wine', draw: sapCrock },
    { id: 'mead', draw: mead },
    { id: 'herbal_tea', draw: tea },
    { id: 'milk', draw: milkPail },
    { id: 'bone_stock', draw: stock }
  ];
})();
PIXEL_ICONS.push(...PIXEL_DRINKS);
