'use strict';
const GOODS = (() => {
  const { sketch, stamp } = PX;
  const REGIONS = ['body', 'fill', 'trim', 'mark'];
  const SETS = ['odml', 'ODML', 'wxyz', 'WXYZ'];
  const LIGHT = (() => { const v = [-.5, -.62, .6], n = Math.hypot(...v); return v.map(c => c / n); })();
  const NEAR = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const fail = message => { throw new Error('GOODS: ' + message); };

  const inks = wear => REGIONS.map(region => wear[region] || wear.body);
  const region = name => { const i = REGIONS.indexOf(name); if (i < 0) fail('no region ' + name); return i; };
  const recast = (rows, set) => rows.map(row => [...row].map(g => { const t = SETS[0].indexOf(g); return t < 0 ? g : SETS[set][t]; }).join(''));
  const widest = rows => Math.max(...rows.map(row => row.length));
  const boxed = rows => rows.map(row => row.padEnd(widest(rows)));

  function tone(s, cut) { return s > cut[0] ? 'l' : s < cut[1] ? 'd' : 'm'; }
  const facing = n => n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2];
  function shade(w, h, normalAt, cut) {
    const c = cut || [.8, .42];
    return Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => {
      const n = normalAt(x + .5, y + .5);
      return n ? tone(facing(n), c) : ' ';
    }).join(''));
  }
  function crop(rows) {
    const used = rows.map(row => /[^ ]/.test(row));
    const top = used.indexOf(true), bottom = used.lastIndexOf(true);
    const cols = rows.flatMap(row => [...row].map((g, i) => g === ' ' ? null : i).filter(i => i !== null));
    const left = Math.min(...cols), right = Math.max(...cols);
    return rows.slice(top, bottom + 1).map(row => row.slice(left, right + 1).padEnd(right - left + 1));
  }
  function ellipsoid(rx, ry, angle, cut) {
    const a = (angle || 0) * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a), size = Math.ceil(Math.max(rx, ry)) * 2 + 2, c = size / 2;
    return crop(shade(size, size, (px, py) => {
      const dx = px - c, dy = py - c, p = (dx * cs + dy * sn) / rx, q = (-dx * sn + dy * cs) / ry, r = p * p + q * q;
      if (r > 1) return null;
      const z = Math.sqrt(1 - r), nx = p * cs - q * sn, ny = p * sn + q * cs;
      return [nx, ny, z];
    }, cut));
  }
  function lathe(widths, cut) {
    const w = Math.max(...widths);
    return widths.map((width, y) => Array.from({ length: w }, (_, x) => {
      const u = (x + .5 - w / 2) / (width / 2);
      if (Math.abs(u) > 1) return ' ';
      return tone(facing([u * .9, -.15, Math.sqrt(Math.max(0, 1 - u * u * .81))]), cut || [.86, .45]);
    }).join(''));
  }
  const fillRows = (w, h, g) => Array.from({ length: h }, () => g.repeat(w));
  const band = (rows, from, to, map) => rows.map((row, y) => y >= from && y <= to ? [...row].map(g => map[g] || g).join('') : row);
  const blank = (rows, from, to) => rows.map((row, y) => y >= from && y <= to ? ' '.repeat(row.length) : row);
  const beside = (...grids) => { const h = Math.max(...grids.map(g => g.length)); return Array.from({ length: h }, (_, y) => grids.map(g => (g[y] || '').padEnd(widest(g))).join('')); };

  const layer = (x, y, rows, part, opts) => ({ x, y, rows: boxed(rows), part: part || 'body', front: !(opts && opts.behind), keep: opts && opts.keep });
  const at = (x, y) => (x + ',' + y);
  function cellsOf(l) {
    const out = [];
    l.rows.forEach((row, j) => [...row].forEach((g, i) => { if (g !== ' ') out.push([l.x + i, l.y + j, g]); }));
    return out;
  }
  function draw(wear, ...layers) {
    const sk = sketch(), all = inks(wear);
    for (const l of layers) {
      const set = region(l.part), rows = recast(l.rows, set), cells = cellsOf(l), own = new Set(cells.map(c => at(c[0], c[1])));
      if (l.front && !l.keep) for (const [x, y] of cells) for (const [dx, dy] of NEAR) {
        const k = at(x + dx, y + dy);
        if (!own.has(k) && sk.has(k)) stamp(sk, x + dx, y + dy, [SETS[set][0]], all);
      }
      if (l.front) stamp(sk, l.x, l.y, rows, all);
      else rows.forEach((row, j) => [...row].forEach((g, i) => { if (g !== ' ' && !sk.has(at(l.x + i, l.y + j))) stamp(sk, l.x + i, l.y + j, [g], all); }));
    }
    return sk;
  }

  function column(pieces) {
    const w = Math.max(...pieces.map(p => widest(p.rows)));
    let y = 0;
    return pieces.map(p => {
      const pw = widest(p.rows);
      if ((w - pw) % 2) fail('piece of width ' + pw + ' cannot be centred in ' + w);
      const l = layer((w - pw) / 2, y, p.rows, p.part, { keep: true });
      y += p.rows.length;
      return l;
    });
  }
  const piece = (rows, part) => ({ rows, part: part || 'body' });
  const surface = rows => band(rows, 0, 0, { m: 'l', d: 'm' });
  const liquid = (rows, level) => [...rows.slice(0, level), ...recast(surface(rows.slice(level)), 1)];

  const STOPPER = {
    cork: piece(['lmmd', 'lmmd'], 'trim'),
    knob: piece([' lm ', 'lmmd', ' md '], 'mark'),
    wax: piece(['lmmd', 'lmmmmd'], 'mark')
  };
  const BODY = {
    round: [10, 14, 16, 18, 18, 18, 18, 16, 14, 10],
    tall: [8, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 10],
    cone: [6, 6, 8, 8, 10, 12, 14, 16, 18, 18],
    phial: [6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 4],
    squat: [10, 14, 18, 20, 20, 20, 18, 16],
    gourd: [10, 14, 16, 16, 16, 14, 10],
    bottle: [4, 4, 6, 8, 10, 12, 12, 12, 12, 12, 12, 12, 12, 12]
  };
  const WAIST = { gourd: [6, 8, 10, 8, 6, 4] };
  function flask(shape, opts) {
    const o = Object.assign({ neck: 3, level: 2, stopper: 'cork', band: false, label: false }, opts);
    const body = liquid(lathe([...(WAIST[shape] || []), ...BODY[shape]]), (WAIST[shape] || []).length + o.level);
    const neck = Array.from({ length: o.neck }, (_, i) => o.band && i === o.neck - 2 ? 'WYYX' : 'lmmd');
    const layers = column([STOPPER[o.stopper], piece(o.neck ? ['lmmmmd'] : ['lmmd']), piece(neck), piece(body)]);
    const vessel = layers[layers.length - 1], wide = widest(vessel.rows), glintY = vessel.y + (WAIST[shape] || []).length + o.level + 1;
    if (o.label) layers.push(layer(vessel.x, vessel.y + o.label[0], recast(lathe(new Array(o.label[1]).fill(wide)), 3), 'mark', { keep: true }));
    layers.push(layer(vessel.x + (wide > 6 ? 2 : 1), glintY, wide > 6 ? ['l', 'l'] : ['l'], 'body', { keep: true }));
    return layers;
  }

  function spindle(heights, cut) {
    const h = Math.max(...heights);
    return Array.from({ length: h }, (_, y) => heights.map(height => {
      const v = (y + .5 - h / 2) / (height / 2);
      if (Math.abs(v) > 1) return ' ';
      return tone(facing([-.2, v * .9, Math.sqrt(Math.max(0, 1 - v * v * .81))]), cut || [.86, .45]);
    }).join(''));
  }
  function disc(w, h) {
    const rows = shade(w, h, (px, py) => {
      const u = (px - w / 2) / (w / 2), v = (py - h / 2) / (h / 2);
      return u * u + v * v <= 1.05 ? [0, 0, 1] : null;
    });
    return rows.map((row, y) => y >= h - 1 ? row.replace(/l/g, 'm') : row);
  }


  const lipRows = w => disc(w, 5).map((row, y) => y >= 3 ? row.replace(/[lm]/g, 'l') : row.replace(/l/g, 'm'));
  const fillTop = w => disc(w, 3).map((row, y) => y ? row.replace(/[ld]/g, 'm') : row.replace(/[lm]/g, 'd'));
  const centreOf = (w, inner) => (w - inner) / 2;
  function open(mouth, widths, inset, part) {
    const w = Math.max(mouth, ...widths), p = part || 'body';
    return [
      layer(centreOf(w, Math.max(...widths)), 2, lathe(widths), p, { keep: true }),
      layer(centreOf(w, mouth), 0, lipRows(mouth), p, { keep: true }),
      layer(centreOf(w, mouth) + inset, 1, fillTop(mouth - inset * 2), 'fill', { keep: true })
    ];
  }
  function bands(layers, rows, part) {
    const body = layers[0];
    return [...layers, ...rows.map(r => layer(body.x, body.y + r, [body.rows[r]], part || 'mark', { keep: true }))];
  }
  const shift = (layers, dx, dy) => layers.map(l => Object.assign({}, l, { x: l.x + dx, y: l.y + dy }));
  const widthOf = layers => Math.max(...layers.map(l => l.x + widest(l.rows)));
  const HANDLE = ['mmm', '  m', '  m', '  d', '  d', 'ddd'];
  const SMALL_HANDLE = ['mm ', '  m', '  d', 'dd '];
  const handled = (layers, y, rows, part) => [...layers, layer(widthOf(layers) - 1, y, rows || HANDLE, part || 'body', { behind: true })];

  const bowl = w => open(w, [w, w, w, w - 2, w - 2, w - 4, w - 8], 1);
  const deepPot = w => open(w, [w, w + 2, w + 2, w + 2, w + 2, w + 2, w, w - 2], 2);
  const crock = w => open(w, [w, w + 2, w + 4, w + 4, w + 4, w + 4, w + 4, w + 2, w], 1);
  const crucible = () => open(16, [16, 16, 16, 14, 14, 14, 12, 12, 10], 1);
  const tin = () => open(16, [16, 16, 16, 16, 16], 1);
  const tankard = () => handled(bands(open(12, new Array(10).fill(12), 1), [1, 7]), 2);
  const mug = () => handled(open(12, [12, 12, 12, 12, 12, 12, 12, 10], 1), 2);
  const cup = () => handled(open(14, [14, 14, 14, 12, 10, 8], 1), 2, ['mmm', '  m', '  d', 'ddd']);
  const pail = () => bands(open(16, [16, 16, 16, 14, 14, 14, 14], 1), [1, 5]);
  const BAIL = ['   yyyyyyyyyy   ', '  y          y  ', ' y            y ', 'y              y'];
  const jug = () => {
    const base = open(10, [8, 8, 10, 12, 14, 14, 14, 14, 14, 12, 10], 1);
    return [layer(1, 1, ['l', 'm'], 'body', { keep: true }), ...handled(base, 3, HANDLE)];
  };
  const FOAM = ['  lm  llm   ', ' llmmllmmmd ', 'llmmmmmmmmmd', 'lmmmmmmmmmmd', ' m  d   d   '];

  const keg = () => bands([layer(0, 3, lathe([10, 12, 14, 14, 14, 14, 14, 12, 10])), layer(2, 0, disc(10, 4), 'body', { keep: true })], [1, 7]);

  const CLOTH = ['  lllmmm  ', ' llmmmmmmd', 'llmmmmmmdd', 'lmmmmmmddd', ' yyyyyyyx '];
  function jar(o) {
    const opts = Object.assign({ level: 1, top: 'cork' }, o);
    const top = opts.top === 'cloth' ? piece(['   lllmmm   ', ' llllmmmmmd ', 'llmmmmmmmmdd', ' lmmmmmmmdd ', '  WYYYYYYX  '], 'trim') : piece(['lmmmmmmd', 'lmmmmmmd'], 'trim');
    const layers = column([top, piece(['lmmmmmmmmd']), piece(liquid(lathe([12, 14, 14, 14, 14, 14, 14, 12]), opts.level))]);
    const body = layers[2];
    return [...layers, layer(body.x + 2, body.y + opts.level + 1, ['l', 'l'], 'body', { keep: true })];
  }
  const wheel = (w, side) => [layer(0, 2, lathe([w - 2, ...new Array(side).fill(w), w - 2])), layer(0, 0, disc(w, 6).map((row, y) => y >= 4 ? row.replace(/[lm]/g, 'l') : row.replace(/d/g, 'm')), 'body', { keep: true })];
  const flatDisc = (w, h) => disc(w, h).map(row => row.replace(/[ld]/g, 'm'));
  const plate = w => [layer(0, 0, disc(w, 7), 'trim', { keep: true }), layer(2, 1, flatDisc(w - 4, 5).map(r => r.replace(/m/g, 'l')), 'trim', { keep: true })];

  const SPIRAL = ['  dddddd  ', ' d      d ', 'd  dddd  d', 'd d    d d', 'd  dd   d ', ' d      d ', '  dddddd  '];
  const roll = () => [
    layer(0, 3, lathe(new Array(7).fill(14))),
    layer(0, 0, disc(14, 7).map(row => row.replace(/[md]/g, 'l')), 'body', { keep: true }),
    layer(2, 0, SPIRAL.map(r => r.replace(/d/g, 'm')), 'body', { keep: true }),
    layer(12, 6, ['mm ', 'lmd', 'lmd', 'lmd', ' md', ' md', '  d'])
  ];
  const POUCH = [
    '    yxxy    ',
    '   zyyyyx   ',
    '    llmm    ',
    '   llmmmd   ',
    '  llmmmmmd  ',
    ' llmmmmmmmd ',
    'llmmmmmmmmdd',
    'lmmmmmmmmmdd',
    'lmmmmmmmmddd',
    'mmmmmmmmmddd',
    ' mmmmmmmddd ',
    '  dddddddd  '];
  const BUNDLE = [
    '      lm     ',
    '     llmd    ',
    '   lllmmmd   ',
    '  llyyyyyx   ',
    ' llmmmmmmmd  ',
    'llmmmmmmmmdd ',
    'lmmmmmmmmmmdd',
    'lmmmyyyyyxmdd',
    ' mmmmmmmmmdd ',
    '  ddddddddd  '];

  return { REGIONS, draw, layer, jar, wheel, open, bands, shift, widthOf, handled, HANDLE, SMALL_HANDLE, bowl, deepPot, crock, crucible, tin, tankard, mug, cup, pail, BAIL, jug, FOAM, keg, plate, roll, POUCH, BUNDLE, flatDisc, spindle, disc, shade, crop, ellipsoid, lathe, fillRows, band, blank, beside, boxed, recast, column, piece, surface, liquid, flask, BODY };
})();
