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
        '  lmmddmmd  ',
        '   lmmmmd   '
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
        '  mmmmmddd ',
        '    mmmmd  '
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

  const BUN = {
    f: { x: -2, y: -4, rows: [' LM ', 'LLMD', 'LMMD'] },
    s: { x: -5, y: -3, rows: [' LM ', 'LLMD', 'LMMD'] },
    b: { x: -2, y: -4, rows: [' LM ', 'LLMD', 'LMMD'] }
  };
  const MOHAWK = {
    f: { x: -1, y: -3, rows: ['LM', 'LM', 'LD', 'LM', 'LD', 'LM', 'MD'] },
    s: { x: -4, y: -3, rows: ['  LLMLM  ', ' LMLMLMD ', 'LMDLMDLMD'] },
    b: { x: -1, y: -3, rows: ['LM', 'LM', 'LD', 'LM', 'LD', 'LM', 'LD', 'LM', 'LD', 'LM', 'MD'] }
  };
  const BEARD = {
    f: { x: -4, y: 7, rows: ['LMMMMMMD', 'LMMddMMD', 'LMMMMMMD', ' LMMMMD ', '  LMMD  '] },
    s: { x: 0, y: 7, rows: ['LMMMM', 'LMMdd', 'LMMMD', ' LMMD', '  LD '] }
  };
  const CAP = { short: 'short', long: 'long', bun: 'short', ponytail: 'short', braids: 'short', topknot: 'short', curls: 'short', pigtails: 'short', fringe: 'short' };
  const CROWN = { bun: BUN, mohawk: MOHAWK };

  const HEAD_ROWS = 10, SWAY_FROM = 11, REF = { hw: 5, tl: 12, legs: 10, br: 0, sway: 0, neck: 1, belly: 0 };
  const spread = (i, n, N, head, tail) => {
    const a = Math.min(head, (n + 1) >> 1), b = Math.min(tail, n - a);
    if (i < a) return i;
    if (i >= n - b) return N - (n - i);
    return Math.min(N - 1, a + Math.floor((i - a) * (N - a - b) / Math.max(1, n - a - b)));
  };
  const stretch = (text, n, head, tail) => Array.from({ length: n }, (_, i) => text[spread(i, n, text.length, head, tail)]).join('');
  const wider = (rows, n, head, tail) => rows.map(row => stretch(row, n, head, tail));
  const taller = (rows, n, head, tail) => Array.from({ length: n }, (_, j) => rows[spread(j, n, rows.length, head, tail)]);
  const shoulderRows = d => Math.max(2, Math.min(d.tl - d.neck - 4, Math.round((d.hw + d.aw) / 4)));
  const armRows = d => d.tl - d.neck - shoulderRows(d) + Math.round(2 * d.legs / REF.legs);
  const slope = (k, n) => Math.round(Math.pow((n - k) / n, 1.6) * n * 1.2);
  const centred = (text, width) => { const left = (width - text.length) >> 1; return ' '.repeat(left) + text + ' '.repeat(width - text.length - left); };
  const bellyRows = (n, d) => [Math.min(n - 2, Math.round(n * (d.belly > 1 ? .4 : .55))), n - 2];
  function girdled(row, arm, belly) {
    const cells = [...row], end = cells.length - arm;
    let first = arm, last = end - 1;
    while (first < last && cells[first] === ' ') first++;
    while (last > first && cells[last] === ' ') last--;
    if (belly < 0 && last - first < 5) return row;
    if (belly < 0) { cells[first] = ' '; cells[first + 1] = 'l'; cells[last] = ' '; cells[last - 1] = 'd'; return cells.join(''); }
    for (let k = 1; k <= (belly > 1 ? arm + cells.length : 1); k++) { if (first - k >= arm) cells[first - k] = 'l'; if (last + k < end) cells[last + k] = 'd'; }
    return cells.join('');
  }
  const creased = row => { const cells = [...row], first = row.search(/\S/), last = row.trimEnd().length - 1; for (let i = first + 2; i <= last - 1; i++) cells[i] = 'd'; return cells.join(''); };
  const paunch = (row, extra) => { const flesh = row.trimEnd(); return flesh.slice(0, -1) + 'm'.repeat(extra) + flesh.slice(-1); };
  function shaped(body, d, front, arm) {
    if (!d.belly) return body;
    const [from, to] = bellyRows(body.length, d), mid = (from + to) / 2;
    return body.map((row, j) => {
      if (j < from || j > to) return row;
      if (!front) return d.belly < 0 ? row : paunch(row, d.belly > 1 && Math.abs(j - mid) < (to - from) / 2 ? 2 : 1);
      const girt = girdled(row, arm, d.belly);
      return d.belly > 1 && j === to ? creased(girt) : girt;
    });
  }
  function torsoOf(rows, arm, d) {
    const wide = row => stretch(row.slice(0, arm), d.aw, 1, 1) + stretch(row.slice(arm, -arm), 2 * d.hw, 3, 3) + stretch(row.slice(-arm), d.aw, 1, 1);
    const total = 2 * (d.hw + d.aw), n = shoulderRows(d), neck = centred(stretch(rows[0].trim(), Math.min(d.hw >= 8 ? 6 : 4, 2 * d.hw - 2), 1, 1), total);
    const shoulders = Array.from({ length: n }, (_, k) => centred(stretch(rows[k ? 2 : 1].trim(), total - 2 * slope(k, n), 2, 3), total));
    return [...Array(d.neck).fill(neck), ...shoulders, ...shaped(taller(rows.slice(3).map(wide), d.tl + d.br - d.neck - n, 1, 3), d, true, d.aw)];
  }
  function torsoSide(rows, d) {
    const wide = wider(rows, rows[0].length + d.hw - REF.hw, 3, 3);
    return [...Array(d.neck).fill(wide[0]), ...shaped(taller(wide.slice(1), d.tl + d.br - d.neck, 2, 3), d, false, 0)];
  }

  function layers(sex, face, hair, dims) {
    const arm0 = ARM[sex][0].length, d = { ...REF, aw: arm0, ...dims }, lw = d.hw - 1, more = d.hw - REF.hw;
    const legTop = 1 - d.legs, sTop = legTop - d.tl - d.br, hTop = sTop - HEAD_ROWS, half = d.hw + d.aw;
    const head = HEAD[sex][face], cut = HAIR[CAP[hair]] && HAIR[CAP[hair]][face], crown = CROWN[hair] && CROWN[hair][face], beard = d.beard && BEARD[face];
    const stump = Math.ceil(d.legs * .4), lost = (limb, mirror) => d[limb] && mirror === (face === 'b');
    const out = [];
    if (face === 's') {
      const leg = taller(wider(LEG_SIDE, LEG_SIDE[0].length + lw - LEG[0].length, 1, 4), d.legs, 2, 2);
      out.push({ name: 'Far leg', x: -2, y: legTop, rows: shaded(leg) }, { name: 'Near leg', x: -3, y: legTop, rows: leg });
      out.push({ name: 'Torso', x: -5 - (more >> 1), y: sTop, rows: torsoSide(TORSO[sex].s, d) }, { name: 'Head', x: -5, y: hTop, rows: head });
    } else {
      const leg = taller(wider(LEG, lw, 1, 1), d.legs, 2, 2), arm = taller(wider(ARM[sex], d.aw, 1, 1), armRows(d), 3, 4);
      out.push({ name: 'Leg', x: -lw, y: legTop, rows: leg, cut: lost('oneLeg', false) ? stump : 0 }, { name: 'Leg, mirrored', x: 0, y: legTop, rows: flipped(leg), cut: lost('oneLeg', true) ? stump : 0 });
      out.push({ name: 'Torso', x: -half, y: sTop, rows: torsoOf(TORSO[sex][face], arm0, d) });
      out.push({ name: 'Arm', x: -half, y: sTop + d.neck + shoulderRows(d), rows: arm, cut: lost('oneArm', false) ? 3 : 0 }, { name: 'Arm, mirrored', x: d.hw, y: sTop + d.neck + shoulderRows(d), rows: flipped(arm), cut: lost('oneArm', true) ? 3 : 0 });
      out.push({ name: 'Head', x: -6, y: hTop, rows: head });
    }
    const hx = face === 's' ? -5 : -6;
    if (cut && d.sway) out.push({ name: 'Hair', x: hx, y: hTop - 1, rows: cut.slice(0, SWAY_FROM) }, { name: 'Hair ends', x: hx + d.sway, y: hTop - 1 + SWAY_FROM, rows: cut.slice(SWAY_FROM) });
    else if (cut) out.push({ name: 'Hair', x: hx, y: hTop - 1, rows: cut });
    if (beard) out.push({ name: 'Beard', x: beard.x, y: hTop + beard.y, rows: beard.rows });
    if (crown) out.push({ name: 'Crown', x: crown.x, y: hTop + crown.y, rows: crown.rows });
    if (face === 's') out.push({ name: 'Arm', x: sex === 'woman' ? -2 : -3, y: sTop + d.neck + shoulderRows(d) - 1, rows: taller(ARM_SIDE[sex], armRows(d), 2, 2) });
    return out.filter(layer => layer.rows.length);
  }

  function sprite(list, look) {
    const inks = ['skin' + look.skin, 'hair' + look.hair, 'eye' + look.eyes, 'lip'], sk = sketch();
    for (const layer of list) stamp(sk, layer.x, layer.y, layer.rows, inks);
    outline(sk);
    const b = bounds(sk), s = new Spr(b.w, b.h, -b.x, -b.y);
    for (const cell of sk.values()) s.set(cell.x - b.x, cell.y - b.y, cell.rgb);
    return s;
  }

  const WHITE = PX.MATERIALS.eyedark.tones[3], LIP = PX.MATERIALS.lip.tones, SALLOW = { olive: 'sallow' }, TONE = { o: 0, d: 2, m: 3, l: 4 }, LINE = .34;
  const five = t => [t[0], toward(t[0], t[1], .5), t[1], t[2], t[3]];
  const kitTones = name => five(PX.MATERIALS[name].tones);
  const inkOf = (glyph, c) => {
    if (glyph in TONE) return c.skin[TONE[glyph]];
    if (glyph.toLowerCase() in TONE) return c.hair[TONE[glyph.toLowerCase()]];
    return glyph === 'z' ? WHITE : glyph === 'y' ? c.eye : LIP['WXYZ'.indexOf(glyph)];
  };
  function put(s, layer, c) {
    const rows = layer.cut ? layer.rows.slice(0, layer.cut) : layer.rows;
    rows.forEach((row, j) => [...row].forEach((glyph, i) => {
      if (glyph === ' ') return;
      const x = RG.CX + layer.x + i, y = RG.BASE + layer.y + j;
      s.set(x, y, layer.cut && j === rows.length - 1 ? WRAP[x & 1] : inkOf(glyph, c));
    }));
  }

  function eyes(s, face, pose, c, X, er) {
    if (face === 'b') return;
    const cells = face === 's' ? [X + 2, X + 3] : [X - 3, X - 2, X + 1, X + 2];
    if (pose.blink) for (const x of cells) s.set(x, er, c.skin[1]);
  }

  function beastHead(s, f, face, c, X, hTop, er) {
    const hd = f.hd, bare = (x, y, w, col) => { for (let i = 0; i < w; i++) if (!s.get(x + i, y)) s.set(x + i, y, col); };
    if (f.tusks && face === 's') { s.rect(X + hd - 2, er + 3, 1, 2, P.bone[5]); s.rect(X, er - 1, hd, 1, c.skin[1]); s.rect(X + 1, er + 4, hd - 2, 1, c.skin[2]); }
    if (f.tusks && face === 'f') { s.rect(X - 4, er + 3, 1, 2, P.bone[5]); s.rect(X + 3, er + 3, 1, 2, P.bone[4]); s.rect(X - 4, er - 1, 8, 1, c.skin[1]); s.rect(X - 3, er + 4, 6, 1, c.skin[2]); }
    if (f.pointears) for (let k = 0; k < 5; k++) {
      const w = Math.max(1, 3 - (k >> 1)), y = hTop - 1 - k;
      if (face === 's') { bare(X + 1 - (k >> 1), y, w, c.skin[2]); bare(X - 3 - (k >> 1), y, w, c.skin[3]); }
      else { bare(X - hd + (k >> 1), y, w, c.skin[3]); bare(X + hd - 3, y, w, c.skin[2]); }
    }
  }

  function edged(s, c) {
    const { w, h, c: cells } = s, n = w * h, near = [-1, 1, -w, w], lines = new Map([...c.skin.map(t => [t, c.skin[0]]), ...c.hair.map(t => [t, c.hair[0]]), ...LIP.map(t => [t, LIP[0]])]);
    const lineOf = col => { if (!lines.has(col)) lines.set(col, dark(col, LINE)); return lines.get(col); };
    const loose = [];
    for (let i = 0; i < n; i++) if (cells[i] === P.ink && near.some(k => !cells[i + k])) loose.push(i);
    for (let k = 0; k < loose.length; k++) { const i = loose[k]; if (cells[i] !== P.ink) continue; cells[i] = null; for (const step of near) if (cells[i + step] === P.ink) loose.push(i + step); }
    const drawn = [];
    for (let i = 0; i < n; i++) {
      if (cells[i]) continue;
      let best = null;
      for (const step of near) { const q = cells[i + step]; if (!q) continue; const line = lineOf(q); if (!best || luma(line) < luma(best)) best = line; }
      if (best) drawn.push([i, best]);
    }
    for (const [i, line] of drawn) cells[i] = line;
    return s;
  }
  const luma = col => col[0] * .3 + col[1] * .59 + col[2] * .11;

  const coloursOf = (lk, f) => ({ skin: tinted(kitTones('skin' + (SALLOW[lk.skin] || lk.skin)), skinTint(lk)), hair: kitTones('hair' + lk.hair), eye: f.eyes });
  function dimsOf(lk, o) {
    const b = lk.body, sex = lk.sex === 'female' ? 'woman' : 'man';
    const hw = Math.max(3, Math.round(REF.hw * b.tall * (1 + (b.girth - 1) * .5)));
    const aw = Math.max(1, Math.min(b.aw, Math.round(ARM[sex][0].length * Math.max(3, Math.round(REF.hw * b.tall)) / REF.hw)));
    const neck = b.tl >= 23 ? 3 : b.tl >= 17 ? 2 : 1, belly = b.girth >= 1.36 ? 2 : b.girth >= 1.1 ? 1 : b.girth < .9 ? -1 : 0;
    return { hw, aw, neck, belly, tl: b.tl, legs: b.legs, oneArm: o.oneArm, oneLeg: o.oneLeg, beard: o.beard };
  }

  function look(lk, face, time) {
    face = face || 'f';
    const pose = idlePose(lk, time), rig = lookRig(lk), f = FOLK[rig.o.race], b = lk.body, sex = lk.sex === 'female' ? 'woman' : 'man';
    const c = coloursOf(lk, f), d = { ...dimsOf(lk, rig.o), br: pose.br, sway: Math.round(pose.wave() * 1.2) };
    const X = RG.CX, legTop = RG.BASE + 1 - d.legs, sTop = legTop - d.tl - d.br, hTop = sTop - HEAD_ROWS, er = hTop + (HEAD_ROWS >> 1), half = d.hw + d.aw, hy = sTop + d.neck + shoulderRows(d) + armRows(d) - 2;
    const s = new Spr(RG.W, RG.H, RG.CX, RG.BASE);
    for (const layer of layers(sex, face, lk.style, d)) put(s, layer, c);
    eyes(s, face, pose, c, X, er);
    beastHead(s, f, face, c, X, hTop, er);
    const hands = [[X - half + (d.aw >> 1), hy], [X + d.hw + d.aw - 1 - (d.aw >> 1), hy]].filter((hand, i) => !(d.oneArm && i === (face === 'b' ? 1 : 0)));
    s.pts = { hip: [X, legTop], torso: [X, sTop, 0], head: [X, hTop - 3], hands };
    s.placed = true;
    paintLook(s, { ...lk, body: { ...b, hw: d.hw, aw: d.aw } }, c.skin, c.hair, face, pose);
    return edged(s, c);
  }

  const HEAD_LAYERS = ['Head', 'Hair', 'Hair ends', 'Beard', 'Crown'];
  const along = (rows, j, n, head, tail) => rows[spread(clamp(j, 0, n - 1), n, rows.length, head, tail)] || '';
  const trimmedAt = (row, k, w) => { const flesh = row.trim(); return flesh ? stretch(flesh, w, 1, 1)[k] : ' '; };

  function shapeOf(sex, style, d, c, f) {
    const laid = new Map(), from = d.neck + shoulderRows(d) - 1, fromSide = Math.max(0, from - 1), skin = new Set(c.skin);
    const at = (face, br, sway) => {
      const key = face + br + ',' + sway;
      if (!laid.has(key)) laid.set(key, Object.fromEntries(layers(sex, face, style, { ...d, br, sway, oneArm: 0, oneLeg: 0 }).map(layer => [layer.name, layer])));
      return laid.get(key);
    };
    const sideArm = { near: ARM_SIDE[sex].map(row => row.length > d.aw ? row.substr((row.length - d.aw) >> 1, d.aw) : stretch(row, d.aw, 1, 1)) }, frontArm = ARM[sex].map(row => { const fit = stretch(row, d.aw, 1, 1), flesh = row.trim(); return fit.trim() ? fit : centred(stretch(flesh, Math.min(d.aw, flesh.length), 1, 1), d.aw); });
    sideArm.far = shaded(sideArm.near);
    const arms = { lit: frontArm, dim: flipped(frontArm) };
    return {
      skin: c.skin,
      torso: (face, br) => at(face, br, 0).Torso,
      arm(face, br, lit, far, raised) {
        if (face === 's') { const rows = far ? sideArm.far : sideArm.near; return (j, k, len) => j < fromSide ? ' ' : along(rows, j - fromSide, len - fromSide, 2, 2)[k] || ' '; }
        const torso = at(face, br, 0).Torso.rows, rows = lit ? arms.lit : arms.dim;
        return (j, k, len) => {
          if (raised) return along(rows, j, len, 3, 4)[k] || ' ';
          if (j < from) { const row = torso[j + 1] || ''; return (lit ? row.slice(0, d.aw) : row.slice(-d.aw))[k] || ' '; }
          return along(rows, j - from, len - from, 3, 4)[k] || ' ';
        };
      },
      leg(face, right, far) {
        const L = at(face, 0, 0);
        if (face === 's') { const rows = (far ? L['Far leg'] : L['Near leg']).rows; return (j, k, n, w) => trimmedAt(along(rows, j, n, 2, 2), k, w); }
        const rows = (right ? L['Leg, mirrored'] : L.Leg).rows;
        return (j, k, n) => along(rows, j, n, 2, 2)[k] || ' ';
      },
      tone(col, glyph, far) {
        if (!glyph || glyph === ' ') return null;
        if (skin.has(col)) return c.skin[TONE[glyph] === undefined ? 3 : TONE[glyph]];
        return far ? dark(col, .82) : col;
      },
      head(t, face, X, hTop, p) {
        const br = p.br ? 1 : 0, L = at(face, br, Math.round(p.hair || 0)), dx = X - RG.CX, dy = hTop - (RG.BASE + 1 - d.legs - d.tl - br - HEAD_ROWS), er = hTop + (HEAD_ROWS >> 1);
        for (const name of HEAD_LAYERS) if (L[name]) put(t, { ...L[name], x: L[name].x + dx, y: L[name].y + dy }, c);
        eyes(t, face, p, c, X, er);
        beastHead(t, f, face, c, X, hTop, er);
      },
      lined: s => lined(s, c),
    };
  }

  function lined(s, c) {
    const { w, c: cells } = s, near = [-1, 1, -w, w], lines = new Map([...c.skin.map(t => [t, c.skin[0]]), ...c.hair.map(t => [t, c.hair[0]]), ...LIP.map(t => [t, LIP[0]])]);
    const lineOf = col => { if (!lines.has(col)) lines.set(col, dark(col, LINE)); return lines.get(col); };
    const inked = i => cells[i] === P.ink, loose = [], seen = new Set(), drawn = [];
    for (let i = 0; i < cells.length; i++) if (inked(i) && near.some(k => !cells[i + k] || inked(i + k))) { loose.push(i); seen.add(i); }
    for (let n = 0; n < loose.length; n++) for (const k of near) { const q = loose[n] + k; if (inked(q) && !seen.has(q)) { seen.add(q); loose.push(q); } }
    for (const i of loose) {
      let best = null;
      for (const k of near) { const q = cells[i + k]; if (!q || q === P.ink) continue; const line = lineOf(q); if (!best || luma(line) < luma(best)) best = line; }
      if (best) drawn.push([i, best]);
    }
    for (const [i, line] of drawn) cells[i] = line;
    return s;
  }

  const RIGGED = new WeakMap();
  function rigged(lk) {
    const known = RIGGED.get(lk);
    if (known) { FOLK[known.o.race] = known.folk; return known; }
    const made = fresh(lk);
    RIGGED.set(lk, made);
    return made;
  }
  function fresh(lk) {
    const rig = lookRig(lk), sex = lk.sex === 'female' ? 'woman' : 'man', d = dimsOf(lk, rig.o), race = 'placed:' + lk.id, base = FOLK[rig.o.race];
    const c = coloursOf(lk, base), folk = FOLK[race] = { ...base, hw: d.hw, aw: d.aw, skin: c.skin };
    const shape = shapeOf(sex, lk.style, d, c, folk);
    return { o: { ...rig.o, race, shape }, c, folk, look: { ...lk, body: { ...lk.body, hw: d.hw, aw: d.aw } } };
  }

  return { look, layers, sprite, rigged };
})();
