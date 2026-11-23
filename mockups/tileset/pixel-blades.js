'use strict';
const PIXEL_BLADES = (() => {
  const { assemble, part, run, profile } = PX, { POMMEL, BLADE, grip, haft, binding, quillons, crossbar } = PARTS;
  const sword = (pommel, hilt, guard, blade) => assemble([pommel, hilt, guard, -1, blade]);
  const knife = (hilt, collar, blade) => assemble([hilt, collar, -1, blade]);

  const copperShortsword = () => sword([POMMEL.block, 'copper'], [grip(3), 'wood'], [quillons(4), 'copper'], [BLADE.broad(11), 'copper']);
  const bronzeLeafSword = () => sword([POMMEL.wheel, 'bronze'], [grip(4, 'ml'), 'bronze'], [quillons(2), 'bronze'], [BLADE.leaf(17, 7), 'bronze']);
  const shortSeax = () => knife([run(-1, ['lm', 'md'], 6), 'wood'], [crossbar(2), 'iron'], [BLADE.seax(13), 'iron']);
  const spatha = () => sword([POMMEL.block, 'bone'], [grip(4), 'wood'], [quillons(2), 'iron'], [BLADE.spatha(18), 'iron']);
  const steelLongsword = () => sword([POMMEL.plus, 'steel'], [grip(5), 'leather'], [quillons(6), 'steel'], [BLADE.arming(16), 'steel']);
  const steelGreatsword = () => sword([POMMEL.wheel, 'steel'], [grip(7), 'leather'], [quillons(8), 'steel'], [BLADE.fullered(17, 11), 'steel']);
  const runeArmingSword = () => sword([POMMEL.jewel, 'gold', 'sapphire'], [grip(5), 'wool'], [quillons(4), 'gold'], [BLADE.runed(16), 'runed', 'glow']);
  const gravemaker = () => sword([POMMEL.ring, 'black'], [binding(7), 'red'], [crossbar(5), 'black'], [BLADE.jagged(17), 'black']);

  const flintDagger = () => knife([grip(5, 'md'), 'wood'], [binding(2), 'cord'], [BLADE.broad(9), 'flint']);
  const copperDagger = () => sword([POMMEL.dot, 'bone'], [grip(4, 'ml'), 'bone'], [quillons(2), 'copper'], [BLADE.leaf(9, 2), 'copper']);
  const ironRondel = () => sword([part(-2, ['l', 'm', 'm', 'd', 'd']), 'iron'], [grip(4), 'wood'], [crossbar(3), 'iron'], [BLADE.spike(12, 6), 'iron']);
  const steelStiletto = () => sword([POMMEL.dot, 'steel'], [grip(4), 'leather'], [quillons(2), 'steel'], [BLADE.needle(12), 'steel']);

  function curved(n, root, bend) {
    const centre = i => bend * (i / n) ** 2, half = i => root * (1 - (i / n) ** 1.6);
    const tone = (b, i) => b < centre(i) - half(i) / 3 ? 'l' : b > centre(i) + half(i) / 3 ? 'd' : 'm';
    const bands = Array.from({ length: Math.ceil(root + bend) + Math.ceil(root) + 1 }, (_, k) => k - Math.ceil(root));
    const cell = (b, i) => Math.abs(b - centre(i)) <= half(i) + .25 ? tone(b, i) : ' ';
    return part(bands[0], bands.map(b => Array.from({ length: n }, (_, i) => cell(b, i)).join('')));
  }
  const PUNCH_HILT = part(-3, [
    'llllll',
    '  L  l',
    '  M  m',
    '  M  m',
    '  M  m',
    '  D  d',
    'dddddd'
  ]);
  const greatLeaf = n => profile([[-3, 8, n - 6, 'l'], [-2, 4, n - 3, 'l'], [-1, 0, n - 1, 'm'], [0, 1, n + 1, 'm'], [1, 0, n - 1, 'm'], [2, 4, n - 3, 'd'], [3, 8, n - 6, 'd']]);
  const splinter = n => profile([[-2, 2, 4, 'l'], [-1, 0, n - 3, 'l'], [0, 0, n, 'm'], [1, 0, n - 5, 'd'], [1, n - 4, n - 2, 'd'], [2, 1, 5, 'd']]);
  const triangle = n => profile([[-2, 0, n - 8, 'l'], [-1, 0, n - 4, 'l'], [0, 1, n + 1, 'm'], [1, 0, n - 4, 'd'], [2, 0, n - 8, 'd']]);
  const scrap = n => profile([[-2, 1, 3, 'l'], [-2, 6, 8, 'l'], [-1, 0, n - 3, 'l'], [0, 0, n, 'm'], [0, n - 6, n - 2, 'L'], [1, 0, n - 2, 'd'], [1, n - 6, n - 3, 'M'], [2, 2, 5, 'd']]);
  const slotted = n => profile([[-1, 0, n - 4, 'l'], [0, 1, n + 1, 'm'], [0, 1, n - 3, 'L'], [1, 0, n - 4, 'd']]);

  const BUTT_PLATE = part(-3, ['l ', 'll', 'Lm', 'mm', 'Lm', 'dd', 'd ']);
  const bowed = (n, wrap, bow) => profile([[0, 0, n, wrap], [bow, 1, n, 'ml'], ...PARTS.span(1, bow - 1).map(b => [b, 0, 1, 'm'])]);
  const swept = (reach, bow) => part(-reach, PARTS.span(-reach, bow).map(b => b < -reach / 3 ? 'l' : b > 1 ? 'd' : 'm'));
  const rapier = (n, ricasso) => profile([[-1, 0, ricasso, 'l'], [0, 0, n + 1, 'lm'], [1, 0, ricasso, 'd']]);
  const runeNeedle = n => profile([[-1, 0, 4, 'l'], [0, 0, n + 1, 'LLM'], [1, 0, 4, 'd']]);
  const leafPoint = n => profile([[-1, 0, n - 6, 'l'], [0, 0, n + 1, 'm'], [1, 0, n - 6, 'd']]);

  const steelRapier = () => sword([POMMEL.plus, 'steel'], [bowed(6, 'MD', 5), 'steel', 'leather'], [swept(4, 5), 'steel'], [rapier(19, 5), 'steel']);
  const warrenNeedle = () => sword([POMMEL.dot, 'iron'], [bowed(5, 'MD', 5), 'copper', 'hide'], [swept(2, 5), 'copper'], [rapier(18, 3), 'iron']);
  const ironEstoc = () => sword([POMMEL.wheel, 'iron'], [grip(6), 'leather'], [crossbar(4), 'iron'], [BLADE.spike(18, 15), 'iron']);
  const bronzeRapier = () => sword([POMMEL.dot, 'bronze'], [grip(4), 'wood'], [BUTT_PLATE, 'bronze', 'copper'], [leafPoint(19), 'bronze']);
  const runeNeedleRapier = () => sword([POMMEL.jewel, 'gold', 'sapphire'], [bowed(6, 'MD', 5), 'gold', 'wool'], [swept(4, 5), 'gold'], [runeNeedle(19), 'runed', 'glow']);

  const ferrule = part(-1, ['l', 'm', 'd']);
  const past = (t, from) => Math.max(0, (t - from) / (1 - from));
  function hewer(n, root, belly, o) {
    const opts = Object.assign({ bend: 3, spine: 1, teeth: 0, tooth: ' ', lines: [] }, o);
    const back = t => 1 + Math.round(opts.bend * t * t);
    const width = t => Math.max(1, Math.round((root + (belly - root) * Math.min(1, t / .6)) * (1 - past(t, .74) ** 1.4)));
    const line = (b, i, hi) => opts.lines.find(([offset, from, to]) => b === hi - offset && i >= from && i < n - to);
    const cell = (b, i) => {
      const t = i / (n - 1), hi = back(t), lo = hi - width(t) + 1, mark = line(b, i, hi);
      if (b < lo || b > hi) return ' ';
      if (b === lo && opts.teeth && i % opts.teeth === 0 && i < n - 3) return opts.tooth;
      if (mark) return mark[3][i % mark[3].length];
      return b <= lo + 1 ? 'l' : b > hi - opts.spine ? 'd' : 'm';
    };
    const top = 1 - belly, bottom = 1 + opts.bend;
    return part(top, PARTS.span(top, bottom).map(b => Array.from({ length: n }, (_, i) => cell(b, i)).join('')));
  }
  const BUTCHER = (n, belly) => hewer(n, belly - 2, belly, { spine: 2, bend: 2 });
  const FLARED = (n, belly) => hewer(n, belly - 4, belly, { bend: 2 });
  const FALCHION = (n, belly) => hewer(n, belly - 3, belly, { bend: 3, lines: [[2, 1, 6, 'd']] });
  const TOOTHED = (n, belly) => hewer(n, belly - 3, belly, { bend: 3, teeth: 2, lines: [[2, 2, 5, 'M ']] });
  const JAW = (n, belly) => hewer(n, belly - 3, belly, { bend: 2, teeth: 2, tooth: 'M', spine: 2, lines: [[2, 2, 6, 'l  ']] });
  const ROLLED = (n, depth) => chopper(n, depth, () => 0, () => n, [[1, 0, n, 'D'], [0, 0, n, 'L'], [-1, 0, n, 'M']]);
  const FANGED = (n, belly) => hewer(n, belly - 3, belly, { bend: 3, teeth: 3, tooth: 'M', lines: [[2, 2, 6, 'L ']] });
  const HACKED = (n, belly) => hewer(n, belly - 2, belly, { spine: 2, bend: 2, teeth: 5, lines: [[3, 3, 7, 'm  d ']] });
  const bevel = (k, depth) => k >= depth - 2 ? 'l' : k <= 1 ? 'd' : 'm';
  const chopper = (n, depth, from, to, extras) => profile([
    ...Array.from({ length: depth }, (_, k) => [1 - k, from(k), to(k), bevel(k, depth)]),
    ...(extras || [])
  ]);

  const bronzeCleaver = () => knife([binding(6), 'wood'], [ferrule, 'bronze'], [FLARED(12, 9), 'bronze']);
  const ironCleaver = () => knife([binding(6), 'wood'], [ferrule, 'iron'], [BUTCHER(12, 9), 'iron']);
  const steelCleaver = () => sword([POMMEL.dot, 'steel'], [grip(5), 'leather'], [crossbar(2), 'steel'], [FALCHION(14, 8), 'steel']);
  const runeToothedCleaver = () => sword([POMMEL.dot, 'runed'], [grip(5), 'black'], [crossbar(2), 'runed'], [TOOTHED(14, 8), 'runed', 'glow']);
  const gnollBoneCleaver = () => knife([binding(6), 'hide'], [ferrule, 'bone'], [JAW(14, 8), 'bone', 'flint']);
  const flenser = () => knife([binding(8), 'leather'], [ferrule, 'steel'], [ROLLED(14, 12), 'iron', 'steel']);
  const bronzeGreatcleaver = () => knife([haft(9), 'wood'], [ferrule, 'bronze'], [FLARED(15, 11), 'bronze']);
  const ironGreatcleaver = () => knife([haft(9), 'wood'], [ferrule, 'iron'], [BUTCHER(15, 11), 'iron']);
  const steelGreatcleaver = () => sword([POMMEL.block, 'steel'], [grip(7), 'leather'], [crossbar(3), 'steel'], [FALCHION(17, 10), 'steel']);
  const runeFangedGreatcleaver = () => sword([POMMEL.jewel, 'gold', 'ruby'], [grip(7), 'black'], [crossbar(3), 'gold'], [FANGED(17, 10), 'runed', 'glow']);

  const ironGreatsword = () => sword([POMMEL.block, 'iron'], [grip(7), 'leather'], [crossbar(6), 'iron'], [BLADE.broad(18), 'iron']);
  const bronzeGreatLeaf = () => sword([POMMEL.wheel, 'bronze'], [grip(6, 'ml'), 'bronze'], [quillons(2), 'bronze'], [greatLeaf(19), 'bronze']);
  const runeSungGreatsword = () => sword([POMMEL.jewel, 'gold', 'ruby'], [grip(7), 'wool'], [crossbar(7), 'gold'], [BLADE.verse(17, 14), 'runed', 'glow']);
  const fangReaver = () => knife([haft(7), 'wood'], [binding(3), 'hide'], [curved(17, 3, 6), 'bone']);

  const boneKnife = () => knife([grip(3, 'ml'), 'bone'], [binding(3), 'hide'], [splinter(12), 'bone']);
  const bronzePunchDagger = () => knife([PUNCH_HILT, 'bronze', 'bone'], [part(0, ['m']), 'bronze'], [triangle(11), 'bronze']);
  const goblinShank = () => knife([binding(5), 'leather'], [part(0, ['d']), 'iron'], [scrap(12), 'iron', 'sapwood']);
  const greatFangDirk = () => knife([binding(5), 'leather'], [part(0, ['d']), 'bone'], [curved(13, 2.2, 4), 'bone']);
  const runeSlottedStiletto = () => sword([POMMEL.dot, 'runed'], [grip(4), 'black'], [quillons(2), 'runed'], [slotted(13), 'runed', 'glow']);

  const orcCleaver = () => knife([binding(6), 'leather'], [crossbar(1), 'black'], [HACKED(19, 8), 'black']);

  return [
    { id: 'copper_shortsword', draw: copperShortsword },
    { id: 'bronze_leaf_sword', draw: bronzeLeafSword },
    { id: 'short_seax', draw: shortSeax },
    { id: 'spatha', draw: spatha },
    { id: 'steel_longsword', draw: steelLongsword },
    { id: 'steel_greatsword', draw: steelGreatsword },
    { id: 'rune_etched_arming_sword', draw: runeArmingSword },
    { id: 'gravemaker', draw: gravemaker },
    { id: 'flint_dagger', draw: flintDagger },
    { id: 'copper_dagger', draw: copperDagger },
    { id: 'iron_rondel', draw: ironRondel },
    { id: 'steel_stiletto', draw: steelStiletto },
    { id: 'orc_cleaver', draw: orcCleaver },
    { id: 'iron_greatsword', draw: ironGreatsword },
    { id: 'bronze_great_leaf_sword', draw: bronzeGreatLeaf },
    { id: 'rune_sung_greatsword', draw: runeSungGreatsword },
    { id: 'fang_reaver', draw: fangReaver },
    { id: 'bone_knife', draw: boneKnife },
    { id: 'bronze_punch_dagger', draw: bronzePunchDagger },
    { id: 'goblin_shank', draw: goblinShank },
    { id: 'great_fang_dirk', draw: greatFangDirk },
    { id: 'rune_slotted_stiletto', draw: runeSlottedStiletto },
    { id: 'steel_rapier', draw: steelRapier },
    { id: 'warren_needle', draw: warrenNeedle },
    { id: 'iron_estoc', draw: ironEstoc },
    { id: 'bronze_rapier', draw: bronzeRapier },
    { id: 'rune_needle_rapier', draw: runeNeedleRapier },
    { id: 'bronze_cleaver', draw: bronzeCleaver },
    { id: 'iron_cleaver', draw: ironCleaver },
    { id: 'steel_cleaver', draw: steelCleaver },
    { id: 'rune_toothed_cleaver', draw: runeToothedCleaver },
    { id: 'gnoll_bone_cleaver', draw: gnollBoneCleaver },
    { id: 'flenser', draw: flenser },
    { id: 'bronze_greatcleaver', draw: bronzeGreatcleaver },
    { id: 'iron_greatcleaver', draw: ironGreatcleaver },
    { id: 'steel_greatcleaver', draw: steelGreatcleaver },
    { id: 'rune_fanged_greatcleaver', draw: runeFangedGreatcleaver }
  ];
})();
PIXEL_ICONS.push(...PIXEL_BLADES);
