'use strict';
const FOLK_SHAPE = (() => {
  const TORSO = {
    man: {
      head: 5, tail: 4,
      f: [
        'lllllmmmmmmd',
        'lllllmmmmmmd',
        'llllmmmmmmdd',
        'llllmmmmmmdd',
        'llmddmmddmdd',
        'llmmmmmmmmdd',
        'llmmmmmmmmdd',
        'llmmmmmmmmdd',
        'llmmmmmmmmdd',
        'llmmmdmmmmdd',
        'llmmmmmmmmdd',
        'llmmmmmmmmdd',
        'llmmmmmmmmdd',
        'lmmmmddmmmmd'
      ],
      s: [
        '    lmmmmd  ',
        '  llmmmmmmd ',
        ' llmmmmmmmmd',
        ' lmmmmmmmmmd',
        ' lmmmmmmmmdd',
        ' lmmmmmmmmd ',
        '  lmmmmmmmd ',
        '  lmmmmmmmd ',
        '  lmmmmmmdd ',
        '  lmmmmmmdd ',
        ' llmmmmmmmd ',
        ' llmmmmmmmd ',
        ' llmmmmmmdd ',
        '  lmmmmmmd  '
      ],
      b: [
        'lllllmmmmmmd',
        'lllllmmmmmmd',
        'llllmdmmmmdd',
        'llllmdmmmmdd',
        'lllmmdmmmmdd',
        ' llmmdmmmmd ',
        ' lmmmdmmmmd ',
        ' lmmmdmmmmd ',
        ' lmmmdmmmmd ',
        ' lmmmdmmmmd ',
        ' lmmmmmmmmd ',
        'llmmmmmmmmdd',
        'llmmmdmmmmdd',
        'lmmmmdmmmmmd'
      ]
    },
    woman: {
      head: 6, tail: 5,
      f: [
        ' lllmmmmd ',
        'llllmmmmmd',
        'lllmmmmmdd',
        'llmlmmlmmd',
        'lmmmdmmmdd',
        'lldddmdddd',
        ' lmmmmmmd ',
        ' lmmmmmmd ',
        ' lmmmmmmd ',
        ' lmmdmmmd ',
        'llmmmmmmdd',
        'llmmmmmmdd',
        'llmmmmmmdd',
        ' lmmddmmd '
      ],
      s: [
        '   lmmd ',
        '  lmmmmd',
        ' lmmmmmd',
        ' lmmmmld',
        ' lmmmmmd',
        ' lmmmmdd',
        '  lmmmd ',
        '  lmmmd ',
        '  lmmdd ',
        ' lmmmmd ',
        'llmmmmd ',
        'llmmmmd ',
        ' lmmmdd ',
        '  lmmmd '
      ],
      b: [
        ' lllmmmmd ',
        'llllmmmmmd',
        'lllmdmmmdd',
        'lllmdmmmdd',
        'lllmdmmmdd',
        'llmmdmmmdd',
        ' lmmdmmmd ',
        ' lmmdmmmd ',
        ' lmmdmmmd ',
        ' lmmdmmmd ',
        'llmmmmmmdd',
        'llmmdmmmdd',
        'llmmdmmmdd',
        ' lmmdmmmd '
      ]
    },
    heavy: {
      head: 5, tail: 4,
      f: [
        'lllllmmmmmmd',
        'lllllmmmmmmd',
        'llllmmmmmmdd',
        'llllmmmmmmdd',
        'lldddmmdddmd',
        'lllmmmmmmmdd',
        'lllmmmmmmmdd',
        'llllmmmmmmdd',
        'llllmmmmmmdd',
        'lllmmdmmmmdd',
        'llmmmmmmmddd',
        'lmdddddddddd',
        'llmmmmmmmmdd',
        'lmmmmddmmmmd'
      ],
      s: [
        '     lmmd   ',
        '    llmmmd  ',
        '   llmmmmmd ',
        '   llmmmmmmd',
        '   llmmmmmmd',
        '   lllmmmmmd',
        '   lllmmmmmm',
        '   lllmmmmmm',
        '   lllmmmmmm',
        '   llmmmmmmd',
        '   llmmmmmdd',
        '   llmmmmdd ',
        '   llmmmmdd ',
        '    lmmmmd  '
      ],
      b: [
        'lllllmmmmmmd',
        'lllllmmmmmmd',
        'llllmdmmmmdd',
        'llllmdmmmmdd',
        'lllmmdmmmmdd',
        'lllmmdmmmmdd',
        'llmmmdmmmmdd',
        'llmmmdmmmmdd',
        'llmmmdmmmmdd',
        'llmmmdmmmmdd',
        'llmmmmmmmmdd',
        'llmmmmmmmmdd',
        'llmmmdmmmmdd',
        'lmmmmdmmmmmd'
      ]
    }
  };
  const LEG = {
    f: {
      head: 3, tail: 3,
      5: ['lmmmd', 'lmmmd', 'lmmmd', 'lmmmd', 'lmmd ', 'lmmd ', 'lmmd ', 'lmmd ', ' lmd ', 'lmmmd'],
      4: ['lmmd', 'lmmd', 'lmmd', 'lmmd', 'lmd ', 'lmd ', 'lmd ', 'lmd ', 'lmd ', 'lmmd']
    },
    s: {
      head: 3, tail: 3,
      5: ['lmmmd', 'lmmmd', 'lmmmd', 'lmmmd', ' lmmd', ' lmmd', ' lmmd', ' lmmd', ' lmmd', ' lmmd'],
      4: ['lmmd', 'lmmd', 'lmmd', 'lmmd', ' lmd', ' lmd', ' lmd', ' lmd', ' lmd', ' lmd']
    }
  };
  const ARM = {
    head: 3, tail: 4,
    lit: ['lmd', 'lmd', 'lmd', 'lmd', 'lmd', 'lmd', 'lmd', 'lm ', 'lmd', 'lmd', ' m '],
    dim: ['lmd', 'lmd', 'lmd', 'lmd', 'lmd', 'lmd', 'lmd', ' md', 'lmd', 'lmd', ' m ']
  };
  const TONE = { l: 0, m: 1, d: 2, o: 3 };

  const slot = (i, n, N, head, tail) => {
    const a = Math.min(head, (n + 1) >> 1), b = Math.min(tail, n - a);
    if (i < a) return i;
    if (i >= n - b) return N - (n - i);
    return head + Math.floor((i - a) * (N - head - tail) / Math.max(1, n - a - b));
  };
  const glyphAt = (rows, head, tail, at, mirrored) => {
    const row = rows[clamp(slot(clamp(at.j, 0, at.len - 1), at.len, rows.length, head, tail), 0, rows.length - 1)], C = row.length;
    const k = mirrored ? at.w - 1 - at.k : at.k;
    return row[clamp(slot(k, at.w, C, C >> 1, C - (C >> 1) - 1 || 1), 0, C - 1)];
  };

  function shaper(look, skin, face) {
    const sn = skin.length - 1, heavy = look.body.build >= 1.3, sex = heavy ? 'heavy' : look.sex === 'female' ? 'woman' : 'man', torso = TORSO[sex];
    const flesh = (c, glyph, dim) => skin.includes(c) ? skin[clamp(sn - TONE[glyph] - (dim ? 1 : 0), 0, sn)] : dim > 1 ? dark(c, .8) : c;
    return (part, c, at) => {
      if (part === 'torso') { const g = glyphAt(torso[face], torso.head, torso.tail, at); return g === ' ' ? null : flesh(c, g, 0); }
      if (part === 'leg') {
        const cut = at.side ? LEG.s : LEG.f, g = glyphAt(cut[at.w >= 5 ? 5 : 4], cut.head, cut.tail, at, !at.side && at.sd > 0);
        return g === ' ' ? null : flesh(c, !at.side && at.sd > 0 && g === 'l' ? 'm' : g, at.far ? 2 : 0);
      }
      const g = face === 's' ? (at.j >= at.len - 1 ? (at.k ? ' ' : 'l') : at.k === at.w - 1 ? 'd' : 'l') : at.w < 3 ? (at.k ? 'm' : 'l') : glyphAt(at.lit ? ARM.lit : ARM.dim, ARM.head, ARM.tail, at);
      return g === ' ' ? null : flesh(c, g, at.far ? 2 : at.lit ? 0 : 1);
    };
  }

  const KIT = { skin: { pale: 'skinpale', fair: 'skinfair', tan: 'skintan', dark: 'skindark', ashen: 'skinashen', green: 'skingreen', olive: 'skinsallow' }, hair: { brown: 'hairbrown', fair: 'hairfair', black: 'hairblack', red: 'hairred', copper: 'haircopper', white: 'hairwhite', grey: 'hairgrey' } };
  const nearest = (tones, c) => tones.reduce((best, t) => { const d = (t[0] - c[0]) ** 2 + (t[1] - c[1]) ** 2 + (t[2] - c[2]) ** 2; return d < best[0] ? [d, t] : best; }, [Infinity, null])[1];
  const lum = c => c[0] * .3 + c[1] * .59 + c[2] * .11;
  const EDGE = .34;

  const key = c => Math.round(c[0]) << 16 | Math.round(c[1]) << 8 | Math.round(c[2]);

  function restyle(s, look, skin, hair) {
    const flat = new Map(), edge = new Map(), plain = SKINS[look.skin].ramp === skin;
    const kit = (ramp, name) => {
      const tones = PX.MATERIALS[name].tones;
      for (const c of ramp) { const to = nearest(tones, c); flat.set(key(c), to); flat.set(key(shade(c)), tones[Math.max(0, tones.indexOf(to) - 1)]); }
      tones.forEach(t => edge.set(t, tones[0]));
    };
    if (plain) kit(skin, KIT.skin[look.skin]);
    if (KIT.hair[look.hair]) kit(hair, KIT.hair[look.hair]);
    const { w, h, c } = s, n = w * h, near = [-1, 1, -w, w], inked = [];
    for (let i = 0; i < n; i++) {
      if (!c[i]) continue;
      if (c[i] === P.ink) { if (near.some(d => !c[i + d] || c[i + d] === P.ink)) inked.push(i); continue; }
      const to = flat.get(key(c[i]));
      if (to) c[i] = to;
    }
    const edgeOf = col => { if (!edge.has(col)) edge.set(col, dark(col, EDGE)); return edge.get(col); };
    const lines = inked.map(i => {
      let best = null;
      for (const d of near) { const q = c[i + d]; if (q && q !== P.ink && (!best || lum(q) < lum(best))) best = q; }
      return best ? edgeOf(best) : null;
    });
    inked.forEach((i, k) => { if (lines[k]) c[i] = lines[k]; });
    return s;
  }

  return { shaper, restyle, TORSO, LEG, ARM };
})();
