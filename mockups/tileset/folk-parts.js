'use strict';
const FOLK_PARTS = (() => {
  const { sketch, stamp, outline, bounds } = PX;
  const RELIT = { l: 'd', d: 'l', L: 'D', D: 'L' };
  const SHADED = { l: 'm', m: 'd', d: 'o' };
  const flipped = rows => rows.map(row => [...row].reverse().map(g => RELIT[g] || g).join(''));
  const shaded = rows => rows.map(row => [...row].map(g => SHADED[g] || g).join(''));

  const HEAD = {
    man: {
      f: [
        '   llllmm   ',
        '  llllmmmm  ',
        ' lllllmmmmd ',
        ' llllmmmmmd ',
        ' llMMmmMMmd ',
        'lllzymmyzmdd',
        'lllmmlmmmmdd',
        ' llmmmmmmmd ',
        ' llmmddmmmd ',
        '  lmmmmmmd  '
      ],
      s: [
        '  lllmmm   ',
        ' llllmmmmm ',
        'lllllmmmmm ',
        'llllmmmmmm ',
        'lllmmmMMMm ',
        'llmmdmmzym ',
        'llmmdlmmmml',
        'lmmmmmmmmmd',
        ' mmmmmmddd ',
        '  mmmmmmd  '
      ],
      b: [
        '   llllmm   ',
        '  llllmmmm  ',
        ' lllllmmmmd ',
        ' llllmmmmmd ',
        ' llllmmmmmd ',
        'lllllmmmmmdd',
        'lllllmmmmmdd',
        ' llllmmmmmd ',
        ' lllmmmmmdd ',
        '  lmmmmmmd  '
      ]
    },
    woman: {
      f: [
        '   llllmm   ',
        '  llllmmmm  ',
        ' lllllmmmmd ',
        ' llllmmmmmd ',
        ' llMMmmMMmd ',
        'lllzymmyzmdd',
        'lllmmlmmmmdd',
        ' llmmmmmmmd ',
        '  lmmYYmmd  ',
        '   lmmmmd   '
      ],
      s: [
        '  lllmmm   ',
        ' llllmmmmm ',
        'lllllmmmmm ',
        'llllmmmmmm ',
        'lllmmmmMMm ',
        'llmmdmmzym ',
        'llmmdlmmmml',
        'lmmmmmmmmm ',
        ' mmmmmmmdY ',
        '  mmmmmmd  '
      ],
      b: [
        '   llllmm   ',
        '  llllmmmm  ',
        ' lllllmmmmd ',
        ' llllmmmmmd ',
        ' llllmmmmmd ',
        'lllllmmmmmdd',
        'lllllmmmmmdd',
        ' llllmmmmmd ',
        '  llmmmmdd  ',
        '   lmmmmd   '
      ]
    }
  };

  const TORSO = {
    man: {
      f: [
        '      lmmd      ',
        '  llllllmmmmdd  ',
        ' lllllllmmmmddd ',
        '   lllmmmmmdd   ',
        '   llmmmmmmdd   ',
        '   llmmmmmmdd   ',
        '   ldddmmdddd   ',
        '    lmmmmmmd    ',
        '    lmmmmmmd    ',
        '    lmmdmmmd    ',
        '    lmmmmmmd    ',
        '    lmmddmmd    '
      ],
      s: [
        '    lmd  ',
        '  llmmmd ',
        ' lllmmmmd',
        ' llmmmmmd',
        ' llmmmmmd',
        ' llmmmmd ',
        '  lmmmmd ',
        '  lmmmmd ',
        '  lmmmmd ',
        ' llmmmmd ',
        ' llmmmmd ',
        ' llmmmmd '
      ],
      b: [
        '      lmmd      ',
        '  llllllmmmmdd  ',
        ' lllllllmmmmddd ',
        '   lllmdmmmdd   ',
        '   llmmdmmmdd   ',
        '   llmmdmmmdd   ',
        '   llmmdmmmdd   ',
        '    lmmdmmmd    ',
        '    lmmdmmmd    ',
        '    lmmdmmmd    ',
        '    lmmmmmmd    ',
        '    lmmddmmd    '
      ]
    },
    woman: {
      f: [
        '     lmmd     ',
        '  lllllmmmdd  ',
        ' llllllmmmmdd ',
        '  lllmmmmmdd  ',
        '  lmlmmmlmmd  ',
        '  lmmmdmmmdd  ',
        '  mdddmmdddd  ',
        '    lmmmmd    ',
        '    lmmmmd    ',
        '   lmmdmmmd   ',
        '   lmmmmmmd   ',
        '   lmmddmmd   '
      ],
      s: [
        '    lmd  ',
        '   lmmmd ',
        '  llmmmd ',
        '  llmmmmd',
        '  llmmmmm',
        '  llmmmdd',
        '   lmmmd ',
        '   lmmmd ',
        '  llmmmd ',
        ' lllmmmd ',
        ' lllmmmd ',
        '  llmmmd '
      ],
      b: [
        '     lmmd     ',
        '  lllllmmmdd  ',
        ' llllllmmmmdd ',
        '  lllmdmmmdd  ',
        '  llmmdmmmdd  ',
        '  llmmdmmmdd  ',
        '  llmmdmmmdd  ',
        '    lmdmmd    ',
        '    lmdmmd    ',
        '   lmmdmmmd   ',
        '   lmmmmmmd   ',
        '   lmmddmmd   '
      ]
    }
  };

  const ARM = {
    man: ['lmd', 'lmd', 'llm', 'lmd', 'lmd', 'lmd', 'lmd', 'lm ', 'lmd', 'lmd', ' m '],
    woman: ['lm', 'lm', 'lm', 'lm', 'lm', 'lm', 'lm', 'lm', 'lm', 'lm', ' m']
  };
  const ARM_SIDE = {
    man: [' lm ', 'dlmd', 'dlmd', 'dlmd', 'dlmd', 'dlmd', 'dlmd', 'dlmd', 'dlmd', 'dlmd', ' lm '],
    woman: [' l ', 'dld', 'dld', 'dld', 'dld', 'dld', 'dld', 'dld', 'dld', 'dld', ' l ']
  };
  const LEG = ['lmmd', 'lmmd', 'lmmd', 'lmmd', ' lmd', ' lmd', ' lmd', ' lmd', ' lmd', 'lmmd'];
  const LEG_SIDE = ['lmmmd  ', 'lmmmd  ', 'lmmmd  ', ' lmmd  ', ' lmmd  ', ' lmmd  ', ' lmmd  ', '  lmd  ', '  lmd  ', '  lmmmd'];

  const HAIR = {
    short: {
      f: [
        '    LLLM    ',
        '  LLLLLMMM  ',
        ' LLLLLMMMMD ',
        ' LLLLMMMMMD ',
        ' LLL M MM D ',
        ' L        D '
      ],
      s: [
        '   LLLMM   ',
        ' LLLLLMMMM ',
        'LLLLLLMMMMD',
        'LLLLLMMMM  ',
        'LLLLMM M   ',
        'LLLL       ',
        'LLL        ',
        ' L         '
      ],
      b: [
        '    LLLM    ',
        '  LLLLLMMM  ',
        ' LLLLLMMMMD ',
        ' LLLLMMMMMD ',
        ' LLLLMMMMMD ',
        ' LLLLMMMMDD ',
        ' LLLMMMMMDD ',
        '  LLMMMMDD  '
      ]
    },
    long: {
      f: [
        '    LLLM    ',
        '  LLLLLMMM  ',
        ' LLLLLMMMMD ',
        ' LLLLMMMMMD ',
        ' LLM    MMD ',
        'LL        MD',
        'LL        MD',
        'LL        MD',
        'LL        MD',
        'LL        DD',
        'LM        DD',
        'LM        DD',
        ' M        D '
      ],
      s: [
        '   LLLMM   ',
        ' LLLLLMMMM ',
        'LLLLLLMMMMD',
        'LLLLLMMMM  ',
        'LLLLLM M   ',
        'LLLLL      ',
        'LLLL       ',
        'LLLL       ',
        'LLLL       ',
        'LLLM       ',
        'LLMM       ',
        ' LMM       ',
        ' LM        '
      ],
      b: [
        '    LLLM    ',
        '  LLLLLMMM  ',
        ' LLLLLMMMMD ',
        ' LLLLMMMMMD ',
        'LLLLLMMMMMDD',
        'LLLLLMMMMMDD',
        'LLLLMMMMMMDD',
        'LLLLMMMMMDDD',
        'LLLMLMMMDMDD',
        'LLLMLMMMDMDD',
        ' LLMLMMDMDD ',
        ' LLMLMMDMDD ',
        '  L LM MD   '
      ]
    }
  };

  const TOP = -31, SHOULDER = -21, HIP = -9;
  function layers(sex, face, hair) {
    const torso = TORSO[sex][face], head = HEAD[sex][face], half = torso[0].length >> 1, arm = ARM[sex], cut = HAIR[hair] && HAIR[hair][face];
    const out = [];
    if (face === 's') {
      out.push({ name: 'Far leg', x: -2, y: HIP, rows: shaded(LEG_SIDE) }, { name: 'Near leg', x: -3, y: HIP, rows: LEG_SIDE });
      out.push({ name: 'Torso', x: -5, y: SHOULDER, rows: torso }, { name: 'Head', x: -5, y: TOP, rows: head });
      if (cut) out.push({ name: 'Hair', x: -5, y: TOP - 1, rows: cut });
      out.push({ name: 'Arm', x: sex === 'woman' ? -2 : -3, y: SHOULDER + 2, rows: ARM_SIDE[sex] });
      return out;
    }
    out.push({ name: 'Leg', x: -4, y: HIP, rows: LEG }, { name: 'Leg, mirrored', x: 0, y: HIP, rows: flipped(LEG) });
    out.push({ name: 'Torso', x: -half, y: SHOULDER, rows: torso });
    out.push({ name: 'Arm', x: -half, y: SHOULDER + 3, rows: arm }, { name: 'Arm, mirrored', x: half - arm[0].length, y: SHOULDER + 3, rows: flipped(arm) });
    out.push({ name: 'Head', x: -6, y: TOP, rows: head });
    if (cut) out.push({ name: 'Hair', x: -6, y: TOP - 1, rows: cut });
    return out;
  }

  function sprite(list, look) {
    const inks = ['skin' + look.skin, 'hair' + look.hair, 'eye' + look.eyes, 'lip'], sk = sketch();
    for (const layer of list) stamp(sk, layer.x, layer.y, layer.rows, inks);
    outline(sk);
    const b = bounds(sk), s = new Spr(b.w, b.h, -b.x, -b.y);
    for (const cell of sk.values()) s.set(cell.x - b.x, cell.y - b.y, cell.rgb);
    return s;
  }
  const figure = (sex, face, look) => sprite(layers(sex, face, look.style), look);

  return { figure, layers, sprite };
})();
