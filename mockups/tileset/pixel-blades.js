'use strict';
const SABRE = (() => {
  const ease = (t, from, to) => Math.min(1, Math.max(0, (t - from) / (to - from)));
  const SHAPE = {
    side: 1, start: 0, base: 0, turn: 25, sweep: 1.25, taper: 1.5, root: 1, back: 1, belly: 4, swell: .75, clip: .8, round: .75, point: 0, hook: 1, square: false,
    spur: false, wideAt: 5, edge: 'l', bevel: 'd', flat: 'm', spine: 'm', roll: '', rune: '', runeAt: 1, fangs: 0, fang: 'L', fangLen: 1, from: .3
  };

  function bounds(t, s) {
    const grow = s.root + (s.belly - s.root) * ease(t, 0, s.swell) ** .9;
    if (s.square) return [-s.back, grow - (t === 1 ? .6 : 0)];
    const edge = grow - (s.belly - s.point) * ease(t, s.round, 1) ** s.taper;
    const spine = -s.back + (s.back + s.point) * ease(t, s.clip, 1) ** s.hook;
    return [spine, edge];
  }

  function columns(n, s) {
    const tilt = Math.atan(s.base), turn = s.side * s.turn * Math.PI / 180;
    let shift = 0, spurred = !s.spur;
    const cols = Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1), angle = tilt - turn * t ** s.sweep, stretch = 1 / Math.cos(angle), [spine, edge] = bounds(t, s);
      const along = (s.start + i) * s.base, band = u => s.side * (Math.round(along + shift + s.side * u * stretch) - Math.floor(along));
      const lo = band(spine), hi = Math.max(lo, band(edge));
      shift += Math.tan(angle) - s.base;
      return { i, t, lo, hi };
    });
    for (const c of cols) if (!spurred && c.t > s.clip) { c.lo -= 1; c.spur = spurred = true; }
    cols.forEach((c, i) => { c.reach = cols[i + 1] ? Math.max(0, cols[i + 1].hi - c.hi - 1) : 0; });
    return cols;
  }

  function glyph(s, b, c) {
    const d = c.hi - b, wide = c.hi - c.lo >= s.wideAt, inClip = !s.square && c.t > s.clip;
    const bevel = wide ? 2 : 1;
    if (d < bevel - c.reach) return s.edge;
    if (d <= bevel) return d === bevel || c.t < s.clip ? s.bevel : s.edge;
    if (b === c.lo) return inClip || c.spur ? s.edge : s.spine[c.i % s.spine.length];
    if (s.roll && b === c.lo + 1) return s.roll[c.i % s.roll.length];
    if (s.rune && b === c.lo + s.runeAt && c.i > 1 && !inClip) return s.rune[c.i % s.rune.length];
    return s.flat;
  }

  function fangCells(cols, s) {
    const at = new Map(), mark = (i, b) => i >= 0 && b > cols[i].hi && at.set(i + ',' + b, s.fang);
    for (const c of cols) {
      if (!s.fangs || c.i % s.fangs !== s.fangs - 1 || c.t <= s.from || c.t >= s.round) continue;
      mark(c.i, c.hi + 1);
      if (s.fangLen > 1) { mark(c.i - 1, c.hi + 1); mark(c.i - 1, c.hi + 2); }
    }
    return at;
  }

  function blade(n, shape) {
    const s = Object.assign({}, SHAPE, shape);
    const cols = columns(n, s), fangs = fangCells(cols, s);
    const cell = (b, c) => fangs.get(c.i + ',' + b) || (b < c.lo || b > c.hi ? ' ' : glyph(s, b, c));
    const top = Math.min(...cols.map(c => c.lo)), bottom = Math.max(...cols.map(c => c.hi + 2)), rows = [];
    for (let b = top; b <= bottom; b++) rows.push(cols.map(c => cell(b, c)).join(''));
    return s.side < 0 ? PX.mirror(PX.part(top, rows), {}) : PX.part(top, rows);
  }

  return { blade };
})();
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

  const copperDagger = () => sword([POMMEL.dot, 'bone'], [grip(4, 'ml'), 'bone'], [quillons(2), 'copper'], [BLADE.leaf(9, 2), 'copper']);
  const ironRondel = () => sword([part(-2, ['l', 'm', 'm', 'd', 'd']), 'iron'], [grip(4), 'wood'], [crossbar(3), 'iron'], [BLADE.spike(12, 6), 'iron']);
  const steelStiletto = () => sword([POMMEL.dot, 'steel'], [grip(4), 'leather'], [quillons(2), 'steel'], [BLADE.needle(12), 'steel']);

  const FANG = PX.patch([
    '        llll ',
    '      llmmmmd',
    '     lmmmmddd',
    '    lmmmmd  d',
    '   lmmmmd    ',
    '  lmmmmd     ',
    ' lmmmmd      ',
    ' lmmmd       ',
    'lmmmdd       ',
    'mmmdd        '
  ], [0, 9]);
  const PUNCH_GRIP = [
    ' L       ',
    'LMM      ',
    'LMMM     ',
    ' DMMM    ',
    '  DMMM   ',
    '   DMMM  ',
    '    DMMM ',
    '     DMD ',
    '      D  '
  ];
  const greatLeaf = n => profile([[-3, 8, n - 6, 'l'], [-2, 4, n - 3, 'l'], [-1, 0, n - 1, 'm'], [0, 1, n + 1, 'm'], [1, 0, n - 1, 'm'], [2, 4, n - 3, 'd'], [3, 8, n - 6, 'd']]);
  const KNUCKLE = part(-2, [' l', 'll', 'mm', 'md', ' d']);
  const PUSH_BLADE = profile([[-3, 1, 4, 'l'], [-2, 0, 7, 'l'], [-1, 0, 10, 'm'], [0, 0, 14, 'm'], [1, 0, 10, 'd'], [2, 0, 7, 'd'], [3, 1, 4, 'd']]);
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
  const HACKED = (n, belly) => hewer(n, belly - 2, belly, { spine: 2, bend: 2, teeth: 5, lines: [[3, 3, 7, 'm  d ']] });

  const ROWS = (step, band) => [step + band, -step];
  const lengthOf = parts => parts.reduce((n, p) => n + p[0].len, 0);
  function hewn(pommel, hilt, guard, blade) {
    const hilted = [pommel, hilt, guard], sk = assemble(hilted);
    PX.lay(sk, lengthOf(hilted) - 1, blade[0], blade.slice(1), ROWS);
    return sk;
  }
  const cleaver = (n, shape) => SABRE.blade(n, shape);
  const ONE = { base: 1, turn: 24, sweep: 1.1, root: 1.5, back: 1.2, belly: 4.4, point: .5, clip: .8, round: .7, hook: .8 };
  const TWO = { base: 1, turn: 24, sweep: 1.1, root: 1.7, back: 1.4, belly: 5.4, point: .8, clip: .78, round: .68, hook: .7 };
  const tuned = (base, extra) => Object.assign({}, base, extra);
  const bronzeCleaver = () => hewn([POMMEL.wheel, 'bronze'], [grip(5), 'wood'], [quillons(2), 'bronze'], [cleaver(17, tuned(ONE, { root: 1.2, belly: 4.8, swell: .8 })), 'bronze']);
  const ironCleaver = () => hewn([POMMEL.block, 'iron'], [grip(5), 'leather'], [crossbar(2), 'iron'], [cleaver(17, tuned(ONE, { spine: 'd', roll: 'd' })), 'iron']);
  const steelCleaver = () => hewn([POMMEL.plus, 'steel'], [grip(5), 'leather'], [quillons(3), 'steel'], [cleaver(18, tuned(ONE, { root: 1.1, belly: 4.2 })), 'steel']);
  const runeToothedCleaver = () => hewn([POMMEL.dot, 'runed'], [grip(5), 'black'], [crossbar(2), 'runed'], [cleaver(18, tuned(ONE, { fangs: 2, fang: 'l', rune: 'mL', from: .2 })), 'runed', 'glow']);
  const gnollBoneCleaver = () => hewn([POMMEL.dot, 'bone'], [binding(6), 'hide'], [crossbar(1), 'bone'], [cleaver(17, tuned(ONE, { edge: 'm', bevel: 'm', spine: 'l', fangs: 3, fang: 'L', fangLen: 2, from: .15 })), 'bone', 'flint']);
  const flenser = () => hewn([POMMEL.block, 'steel'], [binding(7), 'leather'], [crossbar(2), 'steel'], [cleaver(18, { base: 1, turn: 24, sweep: 1.1, root: 2, back: 1.2, belly: 5, square: true, spine: 'L', roll: 'D' }), 'iron', 'steel']);
  const bronzeGreatcleaver = () => hewn([POMMEL.wheel, 'bronze'], [grip(7), 'wood'], [quillons(2), 'bronze'], [cleaver(18, tuned(TWO, { root: 1.3, belly: 5.8, swell: .8 })), 'bronze']);
  const ironGreatcleaver = () => hewn([POMMEL.block, 'iron'], [grip(7), 'leather'], [crossbar(3), 'iron'], [cleaver(18, tuned(TWO, { spine: 'd', roll: 'd', spur: true })), 'iron']);
  const steelGreatcleaver = () => hewn([POMMEL.wheel, 'steel'], [grip(7), 'leather'], [quillons(4), 'steel'], [cleaver(18, tuned(TWO, { spur: true })), 'steel']);
  const runeFangedGreatcleaver = () => hewn([POMMEL.jewel, 'gold', 'ruby'], [grip(7), 'black'], [crossbar(3), 'gold'], [cleaver(18, tuned(TWO, { spur: true, fangs: 3, fang: 'M', fangLen: 2, rune: 'mL', from: .2 })), 'runed', 'glow']);

  const ironGreatsword = () => sword([POMMEL.block, 'iron'], [grip(7), 'leather'], [crossbar(6), 'iron'], [BLADE.broad(18), 'iron']);
  const bronzeGreatLeaf = () => sword([POMMEL.wheel, 'bronze'], [grip(6, 'ml'), 'bronze'], [quillons(2), 'bronze'], [greatLeaf(19), 'bronze']);
  const runeSungGreatsword = () => sword([POMMEL.jewel, 'gold', 'ruby'], [grip(7), 'wool'], [crossbar(7), 'gold'], [BLADE.verse(17, 14), 'runed', 'glow']);
  const fangReaver = () => assemble([[haft(13), 'wood'], [binding(4), 'string'], [FANG, 'bone']]);

  const boneKnife = () => knife([KNUCKLE, 'bone'], [binding(5), 'hide'], [BLADE.seax(11), 'bone']);
  const bronzePunchDagger = () => assemble([[part(-1, ['l', 'm', 'd']), 'bronze'], [PUSH_BLADE, 'bronze']], PX.stamp(PX.sketch(), -5, -3, PUNCH_GRIP, ['bronze', 'bone']));
  const goblinShank = () => knife([binding(5), 'leather'], [part(0, ['d']), 'iron'], [scrap(12), 'iron', 'sapwood']);
  const greatFangDirk = () => assemble([[POMMEL.dot, 'bone'], [binding(6), 'leather'], [FANG, 'bone']]);
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
