'use strict';
const ARMOUR = (() => {
  const { sketch, stamp, mirrored, tile } = PX;
  const REGIONS = ['body', 'trim', 'strap', 'lining'];
  const RELIT = { l: 'd', d: 'l', L: 'D', D: 'L', z: 'x', x: 'z', Z: 'X', X: 'Z' };
  const NEAR = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const fail = message => { throw new Error('ARMOUR: ' + message); };

  const widest = rows => Math.max(...rows.map(row => row.length));
  const boxed = rows => rows.map(row => row.padEnd(widest(rows)));
  function centred(rows) {
    const width = widest(rows);
    return rows.map(row => {
      if ((width - row.length) % 2) fail('row "' + row + '" cannot be centred in ' + width);
      return ' '.repeat((width - row.length) / 2) + row + ' '.repeat((width - row.length) / 2);
    });
  }
  const plate = rows => mirrored(centred(rows));
  const flipped = rows => rows.map(row => [...row].reverse().map(glyph => RELIT[glyph] || glyph).join(''));
  const beside = (left, gap, right) => left.map((row, i) => row + ' '.repeat(gap) + right[i]);
  const twin = (rows, gap) => beside(boxed(rows), gap, boxed(rows));
  const pair = (rows, gap) => beside(boxed(rows), gap, flipped(boxed(rows)));
  const times = (n, row) => new Array(n).fill(row);
  const cut = (rows, widths) => rows.map((row, i) => {
    const edge = (row.length - widths[i]) / 2;
    return ' '.repeat(edge) + row.slice(edge, row.length - edge) + ' '.repeat(edge);
  });
  const weave = (patterns, x, y) => tile(patterns[y % patterns.length], x + 1)[x];
  const textured = (rows, planes) => rows.map((row, y) => [...row].map((glyph, x) => planes[glyph] ? weave(planes[glyph], x, y) : glyph).join(''));
  const shifted = (patterns, tones) => patterns.map(pattern => [...pattern].map(glyph => tones[glyph] || glyph).join(''));
  const planes = patterns => ({ '+': shifted(patterns, { m: 'l', d: 'm' }), '#': patterns, '-': shifted(patterns, { l: 'm', m: 'd', d: 'o' }) });
  const trimmed = textures => Object.fromEntries(Object.entries(textures).map(([glyph, patterns]) => [glyph, patterns.map(pattern => pattern.toUpperCase())]));
  const MAIL = planes(['mmmm', 'dmdm']);
  const SCALE = planes(['llmmmd', 'lmmmdo', 'mmdllm', 'mdolmm']);
  const LAMELLAR = { '+': ['lld', 'lld', 'lld', 'ddd'], '#': ['lmd', 'lmd', 'lmd', 'ddd'], '-': ['mdo', 'mdo', 'mdo', 'ooo'] };
  const QUILT = planes(['mmmd']);
  const WEAVE = planes(['lmmd', 'mdlm']);
  const SACK = planes(['mmmd', 'mdmm']);
  const PLAIN = planes(['m']);
  const SPLINTS = trimmed({ '+': ['lld'], '#': ['lmd'], '-': ['mdo'] });

  const inks = wear => REGIONS.map(region => wear[region] || wear.body);
  const mark = (x, y, rows, ...mats) => ({ x, y, rows: boxed(rows), mats });
  function dress(rows, wear, ...marks) {
    const sk = stamp(sketch(), 0, 0, rows, inks(wear));
    for (const m of marks) stamp(sk, m.x, m.y, m.rows, m.mats);
    return sk;
  }
  const cells = (x0, y0, rows) => rows.flatMap((row, j) => [...row].map((glyph, i) => glyph === ' ' ? null : [x0 + i, y0 + j]).filter(Boolean));
  function overlaid(sk, x0, y0, rows, wear) {
    const front = cells(x0, y0, rows), own = new Set(front.map(c => c.join(',')));
    for (const [x, y] of front) for (const [dx, dy] of NEAR) {
      const k = (x + dx) + ',' + (y + dy);
      if (!own.has(k) && sk.has(k)) stamp(sk, x + dx, y + dy, ['o'], inks(wear));
    }
    return stamp(sk, x0, y0, rows, inks(wear));
  }
  const shod = (rows, wear) => overlaid(stamp(sketch(), 9, 0, boxed(rows), inks(wear)), 0, 3, boxed(rows), wear);

  const GREAT_HELM = plate([
    'llllllllmmmmmmmm',
    'llllllllllmmmmmmmmdd',
    'llllllllllmmmmmmmmmddd',
    'oooooooooooooooooooooo',
    'llllllmmmmLDmmmmmddddd',
    'llllllmmmmLDmmmmmddddd',
    'lllllllmmmmLDmmmmmmddddd',
    'lllllllmmmmLDmmmmmmddddd',
    'lllllllmmmmLDmmmmmmddddd',
    'LLLLLLLLMMMLDMMMMMMDDDDD',
    'lmoooooooooLDooooooooodd',
    'LLLLLMMMMMMLDMMMMMDDDDDD',
    'lllllllmmmmLDmmmmmmddddd',
    'llllllmomomLDmomommddddd',
    'lllllllmomoLDomommmddddd',
    'llllllmomomLDmomommddddd',
    'lllllllmmmmLDmmmmmmddddd',
    'lllllllmmmmLDmmmmmmddddd',
    'llllllmmmmLDmmmmmddddd',
    'llllllmmmmLDmmmmmddddd',
    'lllllmmmmLDmmmmddddd',
    'dddddddddLDddddddd'
  ]);
  const CLOSED_HELM = plate([
    'llllllmmmm',
    'lllllllllmmmmm',
    'lllllllllmmmmmmmdd',
    'lllllllllmmmmmmmmmdd',
    'llllllllmmmmmmmmmmdddd',
    'lllllllmmmmmmmmmmmdddd',
    'lllllllmmmmmmmmmmmmddddd',
    'oooooooooooooooooooooooo',
    'dyydyydyydyydyydyydyydyy',
    'oooooooooooooooooooooooo',
    'lllllllmmmmmmmmmmmmddddd',
    'lmoooooooooooooooooooodd',
    'lllllllmmmmldmmmmmmddddd',
    'lllllllmomoldomommmddddd',
    'lllllllmomoldomommmddddd',
    'llllllmmmmldmmmmmddddd',
    'llllllmmmmldmmmmmddddd',
    'lllllmmmmldmmmmddddd',
    'llllmmmmldmmmddddd',
    'oooooooooooooooooo',
    'dyydyydyydyydyydyy',
    'oooooooooooooooooooo',
    'lllllllmmmmmmmmddddd',
    'lllllmmmmmmmmmmmdddddd'
  ]);
  const CUIRASS = plate([
    'lllllm    mmmmmd',
    'llllmmLLMMmmmmdd',
    'lllmmmmmmmmmmmdd',
    'lllmmmmmmmmmmmmddd',
    'llllmmmmmldmmmmmmddd',
    'lllllmmmmmldmmmmmmmddd',
    'llllllmmmmmldmmmmmmmdddd',
    'llllllmmmmmldmmmmmmmdddd',
    'lllllmmmmmmldmmmmmmmdddd',
    'llllmmmmmmmldmmmmmmddddd',
    'lllmmmmmmmmldmmmmmdddddd',
    'llmmmmmmmmldmmmmmddddd',
    'lmmmmmmmmldmmmmddddd',
    'lmmmmmdddddddddddd',
    'oooooooooooooooo',
    'lllmmmmmmmmddddd',
    'oooooooooooooooooo',
    'llllmmmmmmmmmddddd',
    'oooooooooooooooooooo',
    'llllmmmmmmmmmmmddddd',
    'lllmmmmmmmmmmmdddddd'
  ]);
  const DOME = plate([
    'llllllmmmm',
    'lllllllllmmmmmdd',
    'llllllllllmmmmmmdddd',
    'lllllllllmmmmmmmmmdddd',
    'llllllllmmmmmmmmmmmddddd',
    'lllllllmmmmmmmmmmmmddddd',
    'llllllmmmmmmmmmmmmdddddd',
    'llllllmmmmmmmmmmmmdddddd',
    'lllllmmmmmmmmmmmmmdddddd',
    'lllllmmmmmmmmmmmmddddddd',
    'llllmmmmmmmmmmmmmddddddd',
    'oooooooooooooooooooooooo',
    'LLLLLLMMMMMMMMMMMMDDDDDD',
    'LLLLMMMMMMMMMMMMMDDDDDDD',
    'WWWWWWWWWWWWWWWWWWWWWW'
  ]);
  const SCALE_CAP = plate(textured([
    '+++###----',
    '+++++#####------',
    '++++++######--------',
    '+++++++#######--------',
    '++++++++########--------',
    '++++++++########--------',
    '+++++++#########--------',
    '+++++++#########--------',
    '++++++##########--------',
    '++++++##########--------',
    '+++++###########--------',
    'oooooooooooooooooooooooo',
    'LLLLLLMMMMMMMMMMMMDDDDDD',
    'LLLLMMMMMMMMMMMMMDDDDDDD',
    'WWWWWWWWWWWWWWWWWWWWWW'
  ], SCALE));
  const NASAL_HELM = plate([
    'lllm',
    'lllllmmd',
    'llllllmmmmdd',
    'lllllllmmmmmmddd',
    'lllllllmmmmmmmmddd',
    'llllllllmmmmmmmmdddd',
    'lllllllmmmmmmmmmmddddd',
    'lllllllmmmmmmmmmmddddd',
    'llllllmmmmmmmmmmmddddd',
    'llllllmmmmmmmmmmdddddd',
    'lllllmmmmmmmmmmmdddddd',
    'oooooooooooooooooooooo',
    'LLOLLMMOMMMMMMOMMDDODD',
    'LLLLMMMMMMMMMMMMDDDDDD',
    'WWWWWWWWWLLMDWWWWWWWWW',
    'LMMD',
    'LMMD',
    'LMMD',
    'LMMD',
    'LMMD',
    'MMDD',
    'DD'
  ]);
  const SPANGENHELM = plate([
    'LMMD',
    'llLMMDmd',
    'llllLMMDmmdd',
    'lllllmLMMDmmmddd',
    'llllllmLMMDmmmmddd',
    'lllllllmLMMDmmmmdddd',
    'lllllllmmLMMDmmmmmdddd',
    'lllllllmmLMMDmmmmmdddd',
    'llllllmmmLMMDmmmmmdddd',
    'llllllmmmLMMDmmmmddddd',
    'lllllmmmmLMMDmmmmddddd',
    'oooooooooooooooooooooo',
    'LLOLLMMOMMMMMMOMMDDODD',
    'LLLLMMMMMMMMMMMMDDDDDD',
    'lllmWWWWWWWWWWWWWWmddd',
    'lllmWWWWWWWWWWWWWWmddd',
    'lllm              mddd',
    'lllm              mddd',
    'llmm              mddd',
    ' lmm              mdd '
  ]);
  const KETTLE_HAT = plate([
    'llllmmmm',
    'lllllmmmmmdd',
    'llllllmmmmmddd',
    'llllllmmmmmmdddd',
    'lllllmmmmmmmdddd',
    'lllllmmmmmmmdddd',
    'llllmmmmmmmddddd',
    'oooooooooooooooo',
    'LLLLLLLLMMMMMMMMMDDDDD',
    'LLLLLLLLLMMMMMMMMMMMDDDDDD',
    'LLLLLLLMMMMMMMMMMMMMDDDDDDDD',
    'DDDDDDDDDDDDDDDDDDDDDDDDDD',
    'y            x',
    'y            x',
    'y          x',
    'yyyyyyxxxx'
  ]);
  const SALLET = plate([
    'lllllmmd',
    'llllllldmmmmdd',
    'lllllllllmdmmmmddd',
    'lllllllllmdmmmmmmddd',
    'lllllllmmmmdmmmmmmdddd',
    'lllllllmmmmdmmmmmmdddd',
    'llllllmmmmmdmmmmmddddd',
    'oooooooooooooooooooooo',
    'llmoooooooooooooooomdd',
    'llllllmmmmmdmmmmmddddd',
    'lllllmmmmmmdmmmmmddddd',
    'lllllmmmmmmdmmmmdddddd',
    'llllllmmmmmmdmmmmmmddddd',
    'lllllllmmmmmmdmmmmmmmddddd',
    'llllllllmmmmmmdmmmmmmmdddddd',
    'WWWWWWWWWWWWWWWWWWWWWWWWWW'
  ]);
  const BARBUTE = plate([
    'llllmmmm',
    'llllllmmmmdd',
    'lllllllmmmmmmddd',
    'lllllllmmmmmmmmddd',
    'lllllllmmmmmmmmmdddd',
    'llllllmmmmmmmmmmdddd',
    'llllllmmmmmmmmmmdddd',
    'lllllmmmmmmmmmmddddd',
    'lllmWWWWWWWWWWWXmddd',
    'lllmWWWWWWWWWWWXmddd',
    'lllmmmmWWWWWXmmmmddd',
    'llllmmmmWWWXmmmmdddd',
    'llllmmmmWWWXmmmmdddd',
    'llllmmmmWWWXmmmmdddd',
    'llllmmmmWWWXmmmmdddd',
    'llllmmmmWWWXmmmmdddd',
    'llllmmmmWWWXmmmmdddd',
    'lllmmmmmWWWXmmmmdddd',
    'lllmmmmmWWWXmmmddddd',
    'lllmmmmmWWWXmmmddddd',
    'llmmmmmWWWXmmmdddd',
    'ddddddd    ddddddd'
  ]);
  const BURGONET = plate([
    'LD',
    'LLDD',
    'lllllLDmmmdd',
    'lllllllLDmmmmddd',
    'llllllllLDmmmmmddd',
    'lllllllllLDmmmmmdddd',
    'lllllllmmmLDmmmmmmdddd',
    'lllllllmmmLDmmmmmmdddd',
    'llllllmmmmLDmmmmmddddd',
    'oooooooooooooooooooooo',
    'LLLLLLLLMMMMMMMMMMDDDDDD',
    'DDDDDDDDDDDDDDDDDDDDDD',
    'llmmWWWWWWWWWWWWWWmddd',
    'llmmdWWWWWWWWWWWWmmddd',
    'llmmmd          mmmddd',
    'llmmmd          mmmddd',
    'lllmmd          mmmddd',
    'llmmmd          mmmddd',
    ' lmmmd          mmddd ',
    ' llmmmd        mmmddd ',
    '  lmmdd        mmddd  '
  ]);
  const COIF_MASK = [
    '++##--',
    '++++###---',
    '+++++#####----',
    '++++++#####-----',
    '++++++######------',
    '+++++#WWWWWW#-----',
    '++++#WWWWWWWX-----',
    '++++#WWWWWWWX-----',
    '++++#WWWWWWWX-----',
    '++++#WWWWWWWX-----',
    '++++#WWWWWWWX-----',
    '++++#WWWWWWWX-----',
    '+++++#WWWWWX#-----',
    '++++++######------',
    '++++++######------',
    '+++++++######-------',
    '++++++++#######-------',
    '+++++++++########-------',
    '++++++++++########--------',
    '++++++++++########--------',
    'dd dd dd dd dd dd dd dd dd'
  ];
  const MAIL_COIF = plate(textured(COIF_MASK, MAIL));
  const QUILT_CAP = plate(textured([
    '+++##---',
    '++++####----',
    '+++++######-----',
    '++++++######------',
    ...times(3, '++++++########------'),
    '+++++#########------',
    'LLLLLLMMMMMMMMDDDDDD',
    ...times(3, '++++            ----'),
    '++#            ---',
    'y              x',
    'y              x',
    'y            x',
    'y          x'
  ], QUILT));
  const POT_HELM = plate([
    'llllmmmmmmdd',
    'lllllmmmmmmmmddd',
    'llllllmmmmmmmmmddd',
    'llllllmmmmommmmmdddd',
    'llllllmmmmommmmmdddd',
    'lllllmmmmmommmmmdddd',
    'oooooooooooooooooooo',
    'llLllmmmmLmmmmLmdddLdd',
    'llllllmmmmmmmmmmdddddd',
    'llllllmmmmmmmmmmdddddd',
    'lllllmmmmmmmmmmmdddddd',
    'lllllmmmmmmmmmmmdddddd',
    'lllllmmmmmommmmddddddd',
    'llllmmmmmmommmmddddddd',
    'llllmmmmmmommmmddddddd',
    'oooooooooooooooooooooo',
    'YYYXYYYYXYYYXXYXXXYXXX',
    'YY YX YYX YX XYX XX XX'
  ]);
  const WARHELM = plate([
    'l  mm  d',
    'll mm dd',
    'lllmmmmmmd',
    'llllllmmmmmmdd',
    'lllllllmmmmmmmdddd',
    'lllllllmmmmmmmmmdddd',
    'lllllllmmmmmmmmmmddddd',
    'llllllmmmmmmmmmmmddddd',
    'llllllmmmmmmmmmmdddddd',
    'oooooooooooooooooooooo',
    'LLLLLLMMMMMMMMMMDDDDDD',
    'llWWWWWWWWWWWWWWWWWXdd',
    'llWWWWWWWWWWWWWWWWWXdd',
    'lllmmWWWWWLDWWWWXmmddd',
    'lllmmWWWWWLDWWWWXmmddd',
    'lllmmWWWWWLDWWWWXmmddd',
    'lllmmmWWWWLDWWWXmmmddd',
    'lllmmmWWWWLDWWWXmmmddd',
    'llmmmmWWWLDWWXmmmddd',
    'llmmmmmmmLDmmmmmmddd',
    'lmmmmmmmLDmmmmmddd',
    'dddddddddddddddd'
  ]);
  const COOKPOT = plate([
    'llllllmmmmmm',
    'lllllllmmmmmmmdd',
    'llllllllmmmmmmmddd',
    'lllllllmmmmmmmmmdddd',
    'lllllllmmmmmmmmmdddd',
    'llllllmmmommmmmmdddd',
    'llllllmmmmommmmddddd',
    'llllllmmmmmmmmmddddd',
    'lllllmmmmmmmmmmddddd',
    'lllllmmmmmmmmmdddddd',
    'oooooooooooooooooooo',
    'LLLLLLLMMMMMMMMMMDDDDDDD',
    'DDDDDDDDDDDDDDDDDDDDDD',
    'y              x',
    'y              x',
    'y            x',
    'yy        xx',
    'yyyyxxxx'
  ]);
  const SKULL_HELM = plate([
    'llllmmmm',
    'lllllllmmmmmdd',
    'llllllllmmmmmmdddd',
    'llllllllmmmmmmmmdddd',
    'lllllllmmmmmmmmmdddd',
    'llllllmmmmmmmmmmdddd',
    'lllloooommmmoooodddd',
    'lllooooommmmoooooddd',
    'llllooommmmmmooodddd',
    'lllllmmmmmmmmmmddd',
    'llllmmmmmmmmdddd',
    'llllmmmoommmdddd',
    'lllmmmoommmddd',
    'lllmmmoommmddd',
    'lllmmmmmmmmddd',
    'llmmmmmmmddd',
    'llmmmmmmmddd',
    'llmmmmmmmddd',
    'lmlmlmdmdmdd',
    'll ll  dd dd'
  ]);
  const BONE_HELM = plate([
    'lllllmmmmm',
    'lllllllmmmmmmmdd',
    'llllllllmmmmmmmmdddd',
    'lllllllmmmmdmmmmmmdddd',
    'lllllllmmmmmmdmmmmdddd',
    'llllllmmmmmmmmmmmmdddd',
    'llllllmmmmmmmmmmmddddd',
    'lllllmmmmmmmmmmmmddddd',
    'oooooooooooooooooooooo',
    'llllllllllmmmmmmmmmmdddd',
    'lllllllmmmmmmmmmmmdddddd',
    'dddddddddddddddddddddddd',
    'ZYYZYYYZYYXYYXYYXYXXYXXX',
    'YZYYXYYZYXYYXYXYYXYXXYXX',
    'YY YX YYX YX XYX XX XX'
  ]);
  const HORNED_HELM = plate([
    'L                        M',
    'LL                      MD',
    'LLM                    MDD',
    'LMM                  MMD',
    'LLMM    llllmmmm    MMDD',
    'LMMD llllllmmmmdd MMDD',
    'LMMlllllllmmmmmmdddMDD',
    'LMllllllllmmmmmmddddDD',
    'llllllllmmmmmmmmdddd',
    'lllllllmmmmmmmmmmddddd',
    'llllllmmmmmmmmmmdddddd',
    'lllllmmmmmmmmmmmdddddd',
    'lllllmmmmmmmmmmmdddddd',
    'oooooooooooooooooooooo',
    'LLLLLLMMMMMMMMMMDDDDDD',
    'LLLLMMMMMLLMDMMMDDDDDD',
    'WWWWWWWWWLMMDWWWWWWWWW',
    'LMMD',
    'LMMD',
    'MMDD',
    'DD'
  ]);
  const DIG_CAP = plate([
    'ZZ',
    'ZYYZ',
    'YY',
    'LLMD',
    'LMMD',
    'lllLMMDmmd',
    'llllllLMMDmmmmdd',
    'llllllyyyyxxmmmddd',
    'lllllllmmmmmmmmmdddd',
    'lllllllmmmmmmmmmmddddd',
    'llllllmmmmmmmmmmmddddd',
    'llllllmmmmmmmmmmdddddd',
    'lllllmmmmmmmmmmmdddddd',
    'oooooooooooooooooooooo',
    'lllllmmmmmmmmmmmdddddd',
    'dddddddddddddddddddddd'
  ]);
  const VAMBRACE = twin([
    '  lllllll  ',
    ' lWWWWWWWd ',
    'lmWWWWWWWdd',
    'lllmWWWmddd',
    'llllmmmmddd',
    ' ooooooooo ',
    ' lllmmmddd ',
    ' lllmmmddd ',
    ' lllmmmddd ',
    ' llmmmmddd ',
    ' zzyyyLyxx ',
    ' llmmmmddd ',
    ' llmmmmddd ',
    '  llmmmdd  ',
    '  llmmmdd  ',
    '  llmmmdd  ',
    '  zyyLyxx  ',
    '  llmmmdd  ',
    '  llmmddd  ',
    '  ooooooo  ',
    ' lllmmmddd ',
    ' llmmmmddd '
  ], 2);
  const GAUNTLET = pair([
    '      ll     ',
    '   ll lm ll  ',
    'll lm lm lm  ',
    'lm lm lm lm  ',
    'lm ld ld ld  ',
    'ld lm lm lm  ',
    'lm lm lm lm  ',
    'ooooooooooo  ',
    'LLLLMMMMDDD  ',
    'ooooooooooo l',
    'lllmmmmmdddlm',
    'llmmmmmmdddmd',
    'ooooooooooomd',
    'lllmmmmmdddd ',
    ' ooooooooo   ',
    ' llmmmmddd   ',
    ' ooooooooo   ',
    'lllmmmmmddd  ',
    'lllmmmmmdddd ',
    'llmmmmmmdddd ',
    'LLLMMMMMDDDD '
  ], 2);
  const GREAVE = pair([
    '      llmm  ',
    '     lllmmd ',
    '    llllmmdd',
    '  llllllmmdd',
    ' lllllllmmdd',
    '  lllllmmmdd',
    '    lllmmddd',
    '    oooooooo',
    '    lllmlmdd',
    '   llllmlmdd',
    '   llllmlmdd',
    '   lllmmlmdd',
    '   lllmmlmdd',
    '   lllmmlddd',
    '    llmmlmdd',
    '    llmmlmdd',
    '    llmmlmdd',
    '    llmmlddd',
    '     lmmlmd ',
    '     lmmlmd ',
    '     lmmldd ',
    '     lmmmdd ',
    '     dddddd '
  ], 2);
  const BOOT = [
    '       llllll ',
    '      lWWWWWWd',
    '      lmWWWWmd',
    '      LLLMMMDD',
    '      LLMMMDDD',
    '      oooooooo',
    '       llmmmdd',
    '       llmmmdd',
    '       llmmmdd',
    '       llmmmdd',
    '       llmmmdd',
    '       llmmddd',
    '      lllmmddd',
    '     lllmmdmdd',
    '    llllmmmmdd',
    '   llllmmmmmdd',
    '  lldllmmmmddd',
    ' lldllmmmmmddd',
    'lldlmmmmmmdddx',
    'lmdmmmmmmdddxx',
    'xxmmmmmddddxxx',
    'xxxxxxxxxx xxx',
    ' xxxxxxxx     '
  ];
  const ANKLE_BOOT = BOOT.filter((_, row) => row < 7 || row > 10);
  const HOOD = plate([
    'lllmmd',
    'llllldmmmd',
    'llllllldmmmmdd',
    'llllllmmdmmmmddd',
    'llllllmmmdmmmmdddd',
    'lllllmmmmmdmmmmddddd',
    'lllllmmWWWWWWmmddddd',
    'llllmmWWWWWWWWmmdddd',
    'llllmWWWWWWWWWXmdddd',
    'llllmWWWWWWWWWXmdddd',
    'llllmWWWWWWWWWXmdddd',
    'llllmWWWWWWWWWXmdddd',
    'llllmWWWWWWWWWXmdddd',
    'llllmWWWWWWWWWXmdddd',
    'llllmmWWWWWWWXmmdddd',
    'lllllmmWWWWWXmmddddd',
    'lllllmmmmyymmmmddddd',
    'llllmmmmyymmmmdddd',
    'lllmmmmyymmmmddd',
    'llllmmmmmyymmmmmdddd',
    'lllllmmmmmymmymmmmmddddd',
    'llllllmmmmmymmymmmmmdddddd',
    'DDDDDDDDDDDyDDyDDDDDDDDDDD'
  ]);
  const COIF = plate([
    'llllmmmd',
    'lllllldmmmdd',
    'lllllllmdmmmmddd',
    'lllllllmmdmmmmdddd',
    'llllllmmmmdmmmmddddd',
    'llllllmmmmdmmmmddddd',
    'llllllmYYYYYYmmddddd',
    'lllllmYWWWWWWXmddddd',
    'lllllYWWWWWWWWXddddd',
    'lllllYWWWWWWWWXddddd',
    'lllllYWWWWWWWWXddddd',
    'lllllYWWWWWWWWXddddd',
    'lllllYWWWWWWWWXddddd',
    'lllllmYWWWWWWXmddddd',
    'llllllmXXXXXXmmddddd',
    'llllllmmyooymmmddddd',
    'lllllmmmoyyommmddddd',
    'llllmmmyooymmmdddd',
    'llllmmmoyyommmdddd',
    'lllmmmmyooymmmmddd',
    'LLLLMMMMMyyMMMMMDDDD',
    'DDDDDDDDDyyDDDDDDDDD'
  ]);
  const WRAP_BRACER = twin([
    '  lllllll  ',
    ' lWWWWWWWd ',
    'llWWWWWWWdd',
    'lllmWWWmddd',
    'LLLMMMMMDDD',
    'lllmymymddd',
    'lllmmymmddd',
    'lllmymymddd',
    ' llmmymmdd ',
    ' llmymymdd ',
    ' llmmymmdd ',
    ' llmymymdd ',
    ' llmmymmdd ',
    ' llmymymdd ',
    ' llmmymmdd ',
    '  lmymymd  ',
    '  lmmymmd  ',
    '  lmymymd  ',
    '  lmmymmd  ',
    '  lmmmmmd  ',
    '  DDDDDDD  '
  ], 2);
  const GLOVE_ROWS = [
    '      ll     ',
    '   ll lm ll  ',
    'll lm lm lm  ',
    'lm lm lm lm  ',
    'lm lm lm lm  ',
    'lm lm lm lm  ',
    'lm lm lm ld  ',
    'llmlmmlmmdd  ',
    'lllmmmmmddd l',
    'llmmmmmmdddlm',
    'lldmmdmmdddmd',
    'lldmmdmmddmdd',
    'llmmmmmmdddd ',
    ' lmmmmmmdd   ',
    ' ooooooooo   ',
    'lllmmmmmddd  ',
    'lllmmmmmdddd ',
    'llmmmmmmdddd ',
    'LLLMMMMMDDDD '
  ];
  const GLOVE = pair(GLOVE_ROWS, 2);
  const PLATED_GLOVE = [
    ...GLOVE_ROWS.slice(0, 7),
    '++####---dd  ',
    '++####---dd l',
    '++####---ddlm',
    '++####---ddmd',
    '++####---dmdd',
    ...GLOVE_ROWS.slice(12)
  ];
  const SCALE_GLOVE = pair(textured(PLATED_GLOVE, trimmed(SCALE)), 2);
  const SPLINT_GLOVE = pair(textured(PLATED_GLOVE, SPLINTS), 2);
  const MITT = pair([
    '   llmmm     ',
    '  lllmmmdd   ',
    ' llllmmmmdd  ',
    'llllmmmmmddd ',
    'lllmmmmmmddd ',
    'lllmmmmmmddd ',
    'lllmmmmmmddd l',
    'lllmmmmmmdddlm',
    'llmmmmmmmdddmd',
    'llmmmmmmmddmdd',
    'llmmmmmmmdddd ',
    ' lmmmmmmmdd   ',
    ' zyyyyyyyxx   ',
    'lllmmmmmmddd  ',
    'llmmmmmmmdddd ',
    'd dd d dd dd d'
  ], 1);
  const THREE_FINGER = plate([
    'llm',
    'llm lmd llm',
    ...times(6, 'lmd lmd lmd'),
    'lmdllmdllmd',
    'lllmmmmmddd',
    'llmmommmddd',
    'llmmmmomddd',
    'llmmommmddd',
    'llmmmmmdddd',
    'zzyyyyyxx',
    'zyyLDyyxx',
    'lllmmmddd',
    'ddddddd'
  ]);
  const LEG_WRAP = twin([
    'LLLLMMMDDD',
    'lllmmmmddd',
    'zyyyyyyyxx',
    'lllmmmmddd',
    'lllmmmmddd',
    ' llmmmmdd ',
    ' zyyyyyyx ',
    ' llmmmmdd ',
    ' llmmmddd ',
    '  y    x  ',
    '  y    x  ',
    ' lllmmmdd ',
    ' llmmmmdd ',
    ' zyyyyyyx ',
    ' llmmmmdd ',
    ' llmmmmdd ',
    ' llmmmddd ',
    '  lmmmdd  ',
    '  zyyyyx  ',
    '  lmmmdd  ',
    '  lmmmdd  ',
    '  lmmddd  ',
    '  dddddd  '
  ], 3);
  const JERKIN = plate([
    'lll        mdd',
    'lllm      mmdd',
    'lllmmWWWWmmmdd',
    'llllmmWWWWmmmddd',
    'llllmmmWWmmmmddd',
    'lllllmmmmmmmmmdddd',
    'lllllmmmmmmmmmdddd',
    'llllllmmmmmmmmmmdddd',
    'llllllmmmmmmmmmmmddddd',
    'llyoylmmmmmmmmmmmddddd',
    'lllollmmmmmmmmmmmddddd',
    'llyoylmmmmmmmmmmmddddd',
    'lllollmmmmmmmmmmmddddd',
    'llyoylmmmmmmmmmmmddddd',
    'lllollmmmmmmmmmmmddddd',
    'llyoylmmmmmmmmmmmddddd',
    'lllollmmmmmmmmmmmddddd',
    'llyoylmmmmmmmmmmmddddd',
    'lllollmmmmmmmmmmmddddd',
    'llyoylmmmmmmmmmmmddddd',
    'llllllmmmmmmmmmmmddddd',
    'oooooooooooooooooooooo',
    'LLLLLMMMMMMMMMMMDDDDDD'
  ]);
  const SKIRT = plate([
    'zzzyyyyyyyxxxx',
    'zyyyyyLDyyyxxx',
    'llllmmmmmomddd',
    'lllldmmmmmmomddd',
    'lllldmmmmmmomddd',
    'lllldmmmmmmomddd',
    'llllldmmmmmmommddd',
    'llllldmmmmmmommddd',
    'llllldmmmmmmommddd',
    'llllldmmmmmmmommdddd',
    'llllldmmmmmmmommdddd',
    'llllldmmmmmmmommdddd',
    'lllllldmmmmmmmommmdddd',
    'lllllldmmmmmmmommmdddd',
    'lllllldmmmmmmmommmdddd',
    'lllllldmmmmmmmmommmddddd',
    'lllllldmmmmmmmmommmddddd',
    'lllllldmmmmmmmmommmddddd',
    'ddd ddd ddd  ddd ddd ddd'
  ]);
  const TROUSER_MASK = [
    'zzzzyyyyyyyyyyxxxx',
    'zyyyyyyyLDyyyyyxxx',
    '++++##########----',
    '+++++##########-----',
    '+++++##########-----',
    '+++++####od####-----',
    ...times(6, '++++####-  +####----'),
    ...times(6, '+++####-    +###----'),
    ...times(5, '+++###-      +###---'),
    'LLLMMMD      LMMMDDD'
  ];
  const TROUSERS = plate(textured(TROUSER_MASK, PLAIN));
  const QUILT_TROUSERS = plate(textured(TROUSER_MASK, QUILT));
  const VEST_MASK = [
    'l++        --d',
    'l+++      ---d',
    'l++##WWWW#---d',
    'l+++##WWWW##---d',
    'l+++###WW###---d',
    'l++++########----d',
    'l++++########----d',
    'l+++++########-----d',
    ...times(13, 'l+++++##########-----d'),
    'dddddddddddddddddddddd'
  ];
  const WICKER_VEST = plate(textured(VEST_MASK, WEAVE));
  const SCALE_VEST = plate(textured(VEST_MASK, SCALE));
  const SCALE_COIF = plate(textured(COIF_MASK, SCALE));
  const LAMELLAR_VEST = plate(textured(VEST_MASK, LAMELLAR));
  const RING_VEST = plate(textured([...VEST_MASK.slice(0, 15), 'LLL LM MM MM MM MD DDD', 'LL  M  MM  MM  M  DD'], MAIL));
  const SHIRT_TOP = [
    'l+++##    ##---d',
    'l+++++##WWWW###----d',
    'l++++++####WW#####-----d',
    ...times(4, 'l+++++++##########------dd'),
    ...times(4, 'l++++########----d'),
    'zzzyyyyyLDyyyyxxxx',
    ...times(3, 'l+++++########-----d')
  ];
  const TUNIC_MASK = [...SHIRT_TOP, ...times(5, 'l+++++##########-----d'), 'dddddddddddddddddddddd'];
  const HAUBERK_MASK = [...SHIRT_TOP, ...times(3, 'l+++++##########-----d'), ...times(4, 'l+++++####  ####-----d'), 'dddddddddd  dddddddddd'];
  const TUNIC = plate(textured(TUNIC_MASK, SACK));
  const SCALE_SHIRT = plate(textured(TUNIC_MASK, SCALE));
  const HAUBERK = plate(textured(HAUBERK_MASK, MAIL));
  const COAT = plate(textured([
    'l+++##    ##---d',
    'l+++++##WWWW###----d',
    'l++++++####WW#####-----d',
    ...times(3, 'l+++++++####od####------dd'),
    'l++## l+++##od##---d ##--d',
    'l++## l+++##LD##---d ##--d',
    'l++## l+++##od##---d ##--d',
    'l++## l+++##od##---d ##--d',
    'l++## l+++##LD##---d ##--d',
    'l++## l+++##od##---d ##--d',
    'l++## l+++##od##---d ##--d',
    'l++## l+++##LD##---d ##--d',
    'l++## l+++##od##---d ##--d',
    'LLMMD l+++##od##---d LMMDD',
    ...times(4, 'l++++##od##----d'),
    ...times(3, 'l++++###od###----d'),
    'dddddddddddddddddd'
  ], QUILT));
  const BREASTPLATE = plate([
    'zyx      zyx',
    'zLx      zLx',
    'lllllm    mmmmmd',
    'llllmmLLMMmmmmdd',
    'lllmmmmmmmmmmmdd',
    'lllmmmmmmmmmmmmddd',
    'llllmmmmmldmmmmmmddd',
    'lllllmmmmmldmmmmmmmddd',
    'llllllmmmmmldmmmmmmmdddd',
    'llllllmmmmmldmmmmmmmdddd',
    'lllllmmmmmmldmmmmmmmdddd',
    'llllmmmmmmmldmmmmmmddddd',
    'lllmmmmmmmmldmmmmmdddddd',
    'llmmmmmmmmldmmmmmddddd',
    'llmmmmmmmldmmmmddddd',
    'lmmmmmmmmldmmmmddddd',
    'lmmmmmmmldmmmddddd',
    'lmmmmmdddddddddddd',
    'oooooooooooooooooo',
    'llllmmmmmmmmmmmddddd',
    'lllllmmmmmmmmmmmdddddd',
    'dddddddddddddddddddddd'
  ]);
  const SLAB_PLATE = plate([
    'llllmm      mmmddd',
    'lllllmmm  mmmmmddd',
    'llllllmmmmmmmmmmdddd',
    'lLllllmmmmommmmmmddLdd',
    'llllllmmmmommmmmmddddd',
    'lllllllmmmmommmmmmmddddd',
    'lllllllmmmmommmmmmmddddd',
    'llllllmmmmmommmmmmdddddd',
    'lLlllmmmmmmommmmmmdddLdd',
    'oooooooooooooooooooooooo',
    'llllllmmmmmmmmmmmddddd',
    'lLllllmmmmmmmmmmmdddLd',
    'lllllmmmmmmmmmmmdddddd',
    'lllllmmmmmmmmmmmdddddd',
    'oooooooooooooooooooooo',
    'lllllmmmm  mmmmmdddd',
    'lLlllmmmm  mmmmmdLdd',
    'llllmmmmm  mmmmddddd',
    'ddddddddd  ddddddddd'
  ]);
  const LAYERED_PLATE = plate([
    'lllm      mmmd',
    'lllm      mmmd',
    'llllmmmmmmmmmmdddd',
    'lllmmmmmyymmmmmddd',
    'oooooooooooooooooo',
    'llllllmmmmmmmmmmdddd',
    'llllmmmmmyymmmmmmddd',
    'oooooooooooooooooooo',
    'lllllllmmmmmmmmmmddddd',
    'lllllmmmmmyymmmmmmdddd',
    'oooooooooooooooooooooo',
    'lllllllmmmmmmmmmmddddd',
    'lllllmmmmmyymmmmmmdddd',
    'oooooooooooooooooooooo',
    'lllllllmmmmmmmmmmddddd',
    'lllllmmmmmyymmmmmmdddd',
    'oooooooooooooooooooooo',
    'llllllmmmmmmmmmmdddd',
    'llllmmmmmyymmmmmmddd',
    'oooooooooooooooooooo',
    'llllllmmmmmmmmmmdddd',
    'lllmmmmmmyymmmmmdddd'
  ]);
  const BONE_CUIRASS = plate([
    'lllm      mmmd',
    'lllmm    mmmdd',
    'llllmmWWWWmmmddd',
    'lllllmmmmmmmmmdddd',
    'lLLLMdLLLMddLLLMdLLMDd',
    ...times(5, 'lLLMDdLLMDddLLMDdLMDDd'),
    'lMMDDdMMDDddMMDDdMDDDd',
    'dddddddddddddddddddddd',
    'lLLLMdLLLMddLLLMdLLMDd',
    ...times(5, 'lLLMDdLLMDddLLMDdLMDDd'),
    'lMMDDdMMDDddMMDDdMDDDd',
    'YYXYYXYYXYYXXYXXYXXYXX'
  ]);
  const RIB_HARNESS = plate([
    'zyx          zyx',
    'lllmm      mmmdd',
    'llllmmm  mmmmddd',
    'lllmmmmlmmmmmddd',
    'lm',
    'llllmmmmlmmmmmmddd',
    'lll     lm     ddd',
    'lllllmmmmlmmmmmmdddd',
    'lll      lm      ddd',
    'lllllmmmmlmmmmmmdddd',
    'lll      lm      ddd',
    'llllmmmmlmmmmmmddd',
    'll     lm     dd',
    'lllmmmlmmmmddd',
    'lm',
    'zzyyyyyyLDyyyyxxxx',
    'zyyyyyyyLDyyyyyxxx'
  ]);
  const ROBE = plate([
    'llmm    mmdd',
    'lllmmmWWWWmmmddd',
    'llllmmmmmWWmmmmddddd',
    'lllllmmmmmmmmmmmmmdddddd',
    'llllllmmmmmmmmmmmmmmdddddd',
    'llllllmmmmmmmmmmmmmmdddddd',
    ...times(5, 'lllmmmd llmmmmmddd lmmmddd'),
    'lllmmmd zzyyyyyxxx lmmmddd',
    'lllmmmd llmmymmddd lmmmddd',
    'LLLMMMD llmmymmddd LMMMDDD',
    'WWWWWWW llmmmmmddd WWWWWWW',
    'lllmmmmmdddd',
    'lllmmmmmdddd',
    'lllmmmdmmmdddd',
    'lllmmmdmmmdddd',
    'llllmmmdmmmmdddd',
    'llllmmmdmmmmdddd',
    'llllmmmmdmmmmmdddd',
    'llllmmmmdmmmmmdddd',
    'lllllmmmmdmmmmmddddd',
    'lllllmmmmdmmmmmddddd',
    'LLLLLMMMMMMMMMMDDDDD'
  ]);
  const CLOAK = plate([
    'llmmmmmmdd',
    'lllmmmmmmddd',
    'lllllmLDmmdddd',
    'lllllmmWWmmddddd',
    ...times(2, 'llllldmmWWmmdmdddd'),
    ...times(3, 'llllldmmmWWmmmdmdddd'),
    'llllldmmWWWXmmdmdddd',
    ...times(8, 'lllllldmmWWWXmmdmddddd'),
    ...times(6, 'lllllldmmmWWWXmmmdmddddd'),
    'dddd ddd dd  dd ddd dddd'
  ]);
  const STICK_BRACER = twin([
    '   lmd   ',
    'lmdlmd   ',
    'lmdlmdlmd',
    'lmdlmdlmd',
    'lmdlmdlmd',
    'zyzyzyzyx',
    'yxyxyxyxx',
    'lmdlmdlmd',
    'lmdlmdlmd',
    'lmdlmdlmd',
    'lmdlmdlmd',
    'lmdlmdlmd',
    'lmdlmdlmd',
    'lmdlmdlmd',
    'zyzyzyzyx',
    'yxyxyxyxx',
    'lmdlmdlmd',
    'lmdlmdlmd',
    'lmd   lmd',
    '      lmd'
  ], 3);
  const STICK_GREAVE = twin([
    '      lmd   ',
    'lmd   lmdlmd',
    'lmdlmdlmdlmd',
    'lmdlmdlmdlmd',
    'zyzyzyzyzyzx',
    'yxyxyxyxyxxx',
    ...times(6, 'lmdlmdlmdlmd'),
    'zyzyzyzyzyzx',
    'yxyxyxyxyxxx',
    ...times(6, 'lmdlmdlmdlmd'),
    'zyzyzyzyzyzx',
    'yxyxyxyxyxxx',
    'lmdlmdlmdlmd',
    'lmdlmd   lmd',
    '   lmd      '
  ], 2);
  const BARK_BRACER = twin([
    'llmd     ',
    'llmd llmd',
    'lmmd lmmd',
    'lmmd lmod',
    'zyyyyyyyx',
    'lomd lmmd',
    'lmmd lmmd',
    'lmmd lmmd',
    'lmmd lomd',
    'lmod lmmd',
    'lmmd lmmd',
    'zyyyyyyyx',
    'yxxyyxyxx',
    'lmmd lmmd',
    'lmmd lmod',
    'lmdd lmmd',
    'ldd  lmdd',
    '     ldd '
  ], 3);
  const SPLINT_BRACER = twin([
    '  lllllll  ',
    ' lWWWWWWWd ',
    'llWWWWWWWdd',
    'lllmWWWmddd',
    'lLMmLMmLDdd',
    'lLMmLMmLDdd',
    'lOMmOMmODdd',
    'lLMmLMmLDdd',
    'lLMmLMmLDdd',
    'zzyyyyyLyxx',
    'lLMmLMmLDdd',
    ' LMmLMmLDd ',
    ' LMmLMmLDd ',
    ' OMmOMmODd ',
    ' LMmLMmLDd ',
    ' zyyyyLyxx ',
    ' LMmLMmLDd ',
    ' LMmLMmLDd ',
    ' OMmOMmODd ',
    ' LMmLMmLDd ',
    ' ddddddddd '
  ], 2);
  const SCALE_BRACER = twin(textured([
    '  lllllll  ',
    ' lWWWWWWWd ',
    'llWWWWWWWdd',
    'lllmWWWmddd',
    ...times(8, '+++####----'),
    ...times(7, ' ++####--- '),
    ' LLMMMMDDD ',
    ' ddddddddd '
  ], SCALE), 2);
  const SPLINT_GREAVE = twin([
    ' LLMMMMDD ',
    'lLMmLMmLDd',
    'lLMmLMmLDd',
    'lOMmOMmODd',
    'lLMmLMmLDd',
    'lLMmLMmLDd',
    'zzyyyyyyxx',
    'lLMmLMmLDd',
    'lLMmLMmLDd',
    'lOMmOMmODd',
    'lLMmLMmLDd',
    'lLMmLMmLDd',
    'lLMmLMmLDd',
    'zzyyyyyyxx',
    'lLMmLMmLDd',
    'lLMmLMmLDd',
    'lOMmOMmODd',
    'lLMmLMmLDd',
    ' LMmLMLDd ',
    ' LMmLMLDd ',
    ' zyyyyyxx ',
    ' LMmLMLDd ',
    ' dddddddd '
  ], 3);
  const SHIN_MASK = [
    ' LLMMMMDD ',
    ' ++####-- ',
    ...times(8, '+++####---'),
    ' zyyyyyyx ',
    ...times(6, ' ++####-- '),
    ' zyyyyyyx ',
    ...times(4, '  +###--  '),
    '  dddddd  '
  ];
  const SCALE_GREAVE = twin(textured(SHIN_MASK, SCALE), 3);
  const SHIN_WRAP = twin(textured(SHIN_MASK, PLAIN), 3);
  const BAND_GREAVE = twin([
    ' llmmmmdd ',
    'LLLMMMMDDD',
    'LLMMMMMDDD',
    'oooooooooo',
    'lllmmmmddd',
    'LLLMMMMDDD',
    'LLMMMMMDDD',
    'oooooooooo',
    'lllmmmmddd',
    'LLLMMMMDDD',
    'LLMMMMMDDD',
    'oooooooooo',
    ' llmmmmdd ',
    ' LLMMMMDD ',
    ' LMMMMMDD ',
    ' oooooooo ',
    ' llmmmmdd ',
    ' LLMMMMDD ',
    ' LMMMMDDD ',
    ' oooooooo ',
    '  lmmmdd  ',
    '  LLMMDD  ',
    '  dddddd  '
  ], 3);
  const THIGH_SLAB = twin([
    ' zyx  zyx ',
    ' zyx  zyx ',
    'lllllmmmdd',
    'lLllmmmmLd',
    'llllmmmmdd',
    'lllmmmmmdd',
    'lllmmmmddd',
    'lllmmmmddd',
    'zzyyyyyyxx',
    'lllmmmmddd',
    'llmmmmmddd',
    'llmmmmdddd',
    'lLmmmmddLd',
    'llmmmmdddd',
    'oooooooooo',
    ' llmmmmdd ',
    ' lLmmmdLd ',
    ' llmmmddd ',
    ' lmmmmddd ',
    '  ldmdod  '
  ], 3);
  const SANDAL = pair([
    '   llll   ',
    '  llmmmm  ',
    ' llmmmmmm ',
    ' llmmmymmd',
    ' llmmmymmd',
    ' llmmyymmd',
    ' llmyymymd',
    ' llyymmyd ',
    ' yyymmmyy ',
    '  lmmmmmd ',
    '  lmmmmd  ',
    '  lmmomd  ',
    '  lmmmmd  ',
    '  lmmmmmd ',
    ' llmmmmmd ',
    ' llommmmd ',
    ' llmmmmdd ',
    '  lmmmdd  ',
    '   dddd   '
  ], 3);
  const SABATON = [
    '       llllll ',
    '      lWWWWWWd',
    '      lmWWWWmd',
    '      LLLMMDDD',
    '      LLMMMDDD',
    '      oooooooo',
    '      lllmmddd',
    '     lllmommdd',
    '    llllommmdd',
    '   lllomommmdd',
    '  lololommmddd',
    ' lollolommmddd',
    'llolomommmdddx',
    'lommomommdddxx',
    'xxmmmmmddddxxx',
    'xxxxxxxxxx xxx',
    ' xxxxxxxx     '
  ];
  const FOOTWRAP = [
    '       lllll  ',
    '      lWWWWWd ',
    '      lmWWWmd ',
    '      lllmmdd ',
    '      ddddddd ',
    '      llmmmdd ',
    '      lmmmddd ',
    '     dddddddd ',
    '     lllmmmdd ',
    '    llllmdddd ',
    '   llllddmmdd ',
    '  lllddmmmmdd ',
    ' llddlmmmmddd ',
    'lddllmmmmdddd ',
    'llmmmmmmdddd  ',
    ' ddddddddd y  ',
    '           yx '
  ];
  const SHOE = [
    '      lllllll ',
    '     lWWWWWWWd',
    '    llmWWWWWmd',
    '   lllLLMMMMdd',
    '  lldLLLMMDDdd',
    ' lldllLMMMDDdd',
    'lldlmmmmmmdddx',
    'lmdmmmmmmdddxx',
    'xxmmmmmddddxxx',
    'xxxxxxxxxx xxx',
    ' xxxxxxxx     '
  ];
  const ARM_SPLINT = plate([
    'llmmmmdd',
    'lllmmmmddd',
    ...times(2, 'LDllmmmmddLD'),
    'zyyyyyyyyyyx',
    ...times(4, 'LDllmmmmddLD'),
    'zyyyyyyyyyyx',
    ...times(4, 'LDllmmmmddLD'),
    'zyyyyyyyyyyx',
    ...times(2, 'LDllmmmmddLD'),
    'lllmmmmddd',
    'llmmmddd'
  ]);
  const LEG_SPLINT = plate([
    'llmmmmdd',
    'lllmmmmddd',
    'LDllmmmmddLD',
    'zyyyyyyyyyyx',
    ...times(5, 'LDllmmmmddLD'),
    'zyyyyyyyyyyx',
    ...times(5, 'LDllmmmmddLD'),
    'zyyyyyyyyyyx',
    ...times(5, 'LDllmmddLD'),
    'zyyyyyyyyx',
    ...times(4, 'LDllmmddLD'),
    'zyyyyyyyyx',
    'LDllmmddLD',
    'llmmdd'
  ]);
  const ARM_CAST = [
    '  llllmm            ',
    ' llWWWWWWd          ',
    ' llmWWWWmdd         ',
    ' lllmmmmddd         ',
    ' lllmmmmddd         ',
    ' llmmmmdddd         ',
    ' lllmmmmddd         ',
    ' llmdmmmddd         ',
    ' lllmmmdddd         ',
    ' lllmmmmddd         ',
    ' llllmmmmdddd       ',
    ' lllllllllllllllll  ',
    ' llllmmmmmmmmmmmmml ',
    ' lllmmmdmmmmmdmmmWWd',
    '  llmmmmmmmmmmmmmWWd',
    '   lmmmmdmmmmmmmmmdd',
    '    ddddddddddddddd ',
    '                    '
  ].slice(0, 17);
  const LEG_CAST = [
    '   llllmm       ',
    '  llWWWWWWd     ',
    '  llmWWWWmdd    ',
    '  lllmmmmddd    ',
    ...['  lllmmmmddd    ', '  llmmmmdddd    ', '  lllmdmmddd    ', '  lllmmmmddd    '],
    ...['  lllmmmmddd    ', '  llmmmmdddd    ', '  lllmmmdddd    ', '  lllmmmmddd    '],
    ...['  lllmmmmddd    ', '  llmmdmdddd    ', '  lllmmmmddd    ', '  lllmmmmddd    '],
    ...['  lllmmmmddd    ', '  llmmmmdddd    '],
    '  lllmmmmdddd   ',
    ' llllmmmmmddd   ',
    'lllllmmmmmdddd  ',
    'llllmmmmmmdddd  ',
    'lllmmmmmmddddd  ',
    ' dddddddddddd   '
  ];

  const MEDICAL = { armSplint: ARM_SPLINT, legSplint: LEG_SPLINT, armCast: ARM_CAST, legCast: LEG_CAST };
  const HEAD = { scaleCoif: SCALE_COIF, greatHelm: GREAT_HELM, closedHelm: CLOSED_HELM, hood: HOOD, coif: COIF, dome: DOME, scaleCap: SCALE_CAP, nasal: NASAL_HELM, spangen: SPANGENHELM, kettle: KETTLE_HAT, sallet: SALLET, barbute: BARBUTE, burgonet: BURGONET, mailCoif: MAIL_COIF, quiltCap: QUILT_CAP, pot: POT_HELM, warhelm: WARHELM, cookpot: COOKPOT, skull: SKULL_HELM, boneHelm: BONE_HELM, horned: HORNED_HELM, digCap: DIG_CAP };
  const TORSO = { cuirass: CUIRASS, breastplate: BREASTPLATE, slabPlate: SLAB_PLATE, layeredPlate: LAYERED_PLATE, boneCuirass: BONE_CUIRASS, ribHarness: RIB_HARNESS, jerkin: JERKIN, wickerVest: WICKER_VEST, scaleVest: SCALE_VEST, lamellarVest: LAMELLAR_VEST, ringVest: RING_VEST, tunic: TUNIC, scaleShirt: SCALE_SHIRT, hauberk: HAUBERK, coat: COAT, robe: ROBE, cloak: CLOAK };
  const ARMS = { vambrace: VAMBRACE, wrap: WRAP_BRACER, splint: SPLINT_BRACER, scale: SCALE_BRACER, sticks: STICK_BRACER, bark: BARK_BRACER };
  const HANDS = { gauntlet: GAUNTLET, glove: GLOVE, scaleGlove: SCALE_GLOVE, splintGlove: SPLINT_GLOVE, mitt: MITT, threeFinger: THREE_FINGER };
  const LEGS = { greave: GREAVE, wrap: LEG_WRAP, splint: SPLINT_GREAVE, scale: SCALE_GREAVE, shinWrap: SHIN_WRAP, band: BAND_GREAVE, thighSlab: THIGH_SLAB, sticks: STICK_GREAVE, skirt: SKIRT, trousers: TROUSERS, quiltTrousers: QUILT_TROUSERS };
  const FEET = { boot: BOOT, ankleBoot: ANKLE_BOOT, sabaton: SABATON, footwrap: FOOTWRAP, shoe: SHOE, sandal: SANDAL };

  return { WEAVE, plate, boxed, times, cut, mark, dress, shod, HEAD, TORSO, ARMS, HANDS, LEGS, FEET, MEDICAL };
})();
