'use strict';
const PX = (() => {
  const SIZE = 32, TONES = 'odml', GLYPHS = ['odml', 'ODML', 'wxyz', 'WXYZ'], NEAR = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const PALETTE = {
    flint: '#15181e #3d4650 #6a7580 #a3aeb6',
    bone: '#3d3023 #a39373 #d9cba8 #f7f0dc',
    copper: '#35160d #9c4827 #d87c46 #f8b98a',
    bronze: '#2f1d0b #8c5c1b #d09c38 #f7da7e',
    iron: '#191b24 #565c6a #8b919c #c4c8cd',
    steel: '#1d1f33 #7d87a4 #c3c9d8 #f6f7fb',
    runed: '#15193b #5068b4 #a4bcec #eef7ff',
    glow: '#0d3350 #1f86c4 #58d2f2 #d0f8ff',
    black: '#0b0b11 #2b2d3a #4d5160 #808695',
    wood: '#25160d #5c3d22 #8c6338 #ba8c57',
    ash: '#33230f #8a6a3c #bd9c62 #e2c998',
    sapwood: '#262410 #6c6a30 #a3a050 #d2d088',
    stone: '#201e1c #59554e #8a857a #c0baab',
    ember: '#2a0f0c #6e2a1a #a44a26 #d47a3c',
    leather: '#27120b #5f2f1b #904d2a #be7645',
    hide: '#33230f #7c5a30 #ab8650 #d3b47e',
    cord: '#3a2c17 #8b744a #c1a86f #e7d7a5',
    gold: '#3b2605 #b27a10 #ebb92e #fff19c',
    red: '#2d090d #7b191d #b62b29 #e25f49',
    wool: '#131f2d #2c4a60 #44708a #6f9cb0',
    linen: '#3b3526 #a39878 #d5cbad #f3eddb',
    fur: '#2c2117 #6c5a44 #a8957a #d8cbb0',
    ruby: '#3a0714 #a8122c #ea3c4a #ffb0a8',
    sapphire: '#0c1b4b #2350ba #4a8df2 #b4dcff',
    dun: '#3a2e1c #94805a #c2ab7e #e4d4ae',
    buckskin: '#3a2710 #9a6e36 #c9994f #ecc682',
    boarhide: '#1f120a #4a2d18 #6e4526 #96663a',
    wolfpelt: '#211e1a #555047 #7f786a #aaa394',
    elkhide: '#2a1a0e #6a4a2e #946a46 #bc9068',
    sabrehide: '#2e1a0c #8a5222 #c27a34 #eca860',
    owlpelt: '#1e0f08 #4e2818 #74402a #a06446',
    direpelt: '#22252c #646b78 #9aa0ac #cdd2da',
    plume: '#3a3426 #8c846c #b8b09a #e0dac8',
    sackcloth: '#33291a #857657 #b8a982 #d9cdaa',
    woad: '#1c1c3a #4a4a7c #6c6ca6 #9a9ccc',
    silk: '#2a2440 #6a6096 #948cbc #c4bee0',
    arcane: '#1a1236 #3e3270 #5e4e96 #8a78c0',
    runecloth: '#1a2050 #5a64b4 #8a94dc #bcc6f6',
    regal: '#2a0a26 #5c1c50 #842e72 #b0509a',
    ermine: '#3a3a40 #a8a8ae #d8d8dc #f8f8f8',
    moss: '#161c10 #38452a #556640 #7a8c5e',
    drab: '#2a2216 #66583e #8c7a5a #b4a380',
    croc: '#10180c #2c3a20 #46582f #6a7c48',
    goblin: '#1c2012 #48523a #6a7652 #929e78',
    plaster: '#3a3832 #a8a498 #d8d4c6 #f6f4ec',
    silver: '#2a2c34 #8e949e #c8ccd4 #f4f6f8',
    emerald: '#06301c #128a4a #3fc878 #b0f4c8',
    citrine: '#3a3406 #b0a012 #e8dc40 #fffcb0',
    amethyst: '#260a40 #6a2aa8 #a060d8 #dcb8fa',
    moonstone: '#26303c #8098b0 #c0d4e4 #f4fbff',
    string: '#3a3528 #8a8474 #c8c2b0 #ece8dc',
    topaz: '#3d1a04 #a8520c #e8901c #ffd27a',
    clay: '#2a1610 #6e3c28 #a0644a #c89878',
    lead: '#16171f #4a4f5e #737a8a #a3a9b6',
    horn: '#1c130e #4b3426 #7d5c42 #b8946a',
    moonwood: '#1f2430 #5f6b80 #98a6b8 #d4dde8',
    flame: '#3a0d05 #b8300c #f07a1a #ffd54a',
    venom: '#10180c #2f4a1e #5a7a2a #8fae4a',
    gleam: '#0d3350 #1f86c4 #58d2f2 #d0f8ff',
    glass: '#1d2a33 #6f8f9c #a9c8d0 #e6f6f8',
    water: '#0f2a44 #2468a8 #3f9ad6 #8fd6f6',
    ale: '#2e1806 #7c4a12 #b7791f #e8b45a',
    cider: '#33200a #8c5e16 #c8912a #f0c868',
    honey: '#3a2004 #a86a0c #e0a52a #fde08a',
    wine: '#22060e #4e1022 #7b2d43 #b05a70',
    claret: '#1a040a #45101e #6e2038 #a04a62',
    port: '#200808 #4e1414 #7a2a2a #b05a4a',
    amber: '#2a1204 #6e3510 #a8642a #e0a260',
    birch: '#3a3420 #9a9060 #d9cfa0 #f6f0d0',
    milk: '#3a3834 #b8b4a6 #e6e2d6 #ffffff',
    broth: '#2a1a08 #6a4a1e #8c6b3a #c09a5e',
    blood: '#1e0408 #4a0c16 #7a1a24 #b03838',
    rose: '#300810 #7a1626 #b02a3a #e86a70',
    calm: '#1c2a22 #4e6e5c #8fb0a0 #c8e0d4',
    mist: '#1a2a32 #4a7080 #7aa0b0 #bcdce4',
    jade: '#0a2618 #1e6a40 #3a8a5a #7ec894',
    sky: '#122a40 #3a7aa8 #80c0e0 #d0f0fc',
    tar: '#0e0c06 #2a2410 #4a4220 #706636',
    caustic: '#141808 #3a4418 #6b7a2a #a4b450',
    resin: '#2e1a04 #7a4a10 #c68a2e #f0c46a',
    flesh: '#2a0808 #7a1e1e #b4423a #e88272',
    tallow: '#3a3428 #b4a890 #e2d8c0 #fbf6ea',
    roast: '#2a1206 #6e3414 #a85a26 #dc9450',
    smoked: '#1c0f06 #4a2c14 #6e4b2a #9c7448',
    ham: '#2a0c0a #6e2622 #b0524a #e08a7a',
    salami: '#240a08 #5c2420 #8c4038 #c07060',
    carp: '#162230 #3e6680 #78a8c4 #c4e6f2',
    trout: '#30120c #9a4a34 #e08868 #ffc4a4',
    crust: '#2c1806 #84501c #c48a40 #ecc27c',
    leaf: '#0e200c #2a5418 #4e8a2c #94c858',
    cabbage: '#142410 #3e6e2a #7fb04e #c4e094',
    kale: '#0e1e0a #2e5420 #5e8c42 #94c070',
    straw: '#36280a #9a7a26 #d9b24a #f6e08c',
    cheese: '#3a2a08 #b08a2a #e2c878 #fcf0b4',
    pea: '#18240c #4a6a22 #8fa64e #c8d888',
    sage: '#1e2614 #5a6a40 #9dae78 #d0dcac',
    mint: '#0c2618 #2a6a44 #5fa67a #a6e0b8',
    dye: '#2a0834 #6a1a80 #9c27b0 #d070e0',
    brine: '#241a08 #4a3612 #6e5326 #9a7a46',
    rot: '#141008 #2e2a14 #4e4a26 #76703a',
    carrion: '#1a0e0a #3e2723 #5e4234 #84664a',
    putrid: '#1a0c12 #46242c #6b3d3f #8c5f52',
    mould: '#232c1e #6e8468 #aec4a2 #e2efd8',
    stench: '#3a3c14 #8a8e3a #c9cf7a #eef0b4',
    midge: '#0e0c0a #26221c #7c8690 #aab4bc',
    pickle: '#1c200a #545a26 #a8b060 #d8de98',
    jam: '#200610 #5a1430 #a03a5c #d8748e',
    poppy: '#2e1424 #7a4a66 #c88ba8 #f0c8dc',
    poultice: '#18260c #4a7a24 #9ccc65 #d4f0a4',
    tincture: '#1e2618 #66745a #b8c7a8 #e4eedc',
    skinpale: '#5c4038 #d2ad9f #eed6ca #fdf3ec',
    skinfair: '#4a2c20 #b88462 #e0b490 #f6dcc0',
    skintan: '#3a1f14 #8f5a3c #bc8660 #dcae86',
    skindark: '#1e100c #523122 #7e503a #a0705a',
    skinashen: '#24242c #5a5e68 #8a8e96 #b4b8bc',
    skingreen: '#1e2618 #55664a #84946c #aab890',
    skinsallow: '#2c2816 #75693e #a69a62 #c9bf88',
    hairbrown: '#1e1410 #3e2a1e #644630 #8c6c46',
    hairfair: '#4a3e14 #96802e #c8b04a #e6d272',
    hairblack: '#0e0c0a #26201c #3c332a #584c40',
    hairred: '#2e160a #74400f #b06a20 #dc9a30',
    haircopper: '#2c140a #6a3218 #a45a26 #c88240',
    hairwhite: '#4e525c #9a9ea4 #d0d2d0 #f2f2ee',
    hairgrey: '#1a1c22 #44484e #7c8084 #b0b2b0',
    eyedark: '#0d0a10 #0d0a10 #0d0a10 #ece6d8',
    eyebrown: '#0d0a10 #3e2a1e #644630 #ece6d8',
    eyeblue: '#0d0a10 #23406e #3f72b8 #ece6d8',
    eyegreen: '#0d0a10 #2a482a #558246 #ece6d8',
    lip: '#3a1418 #8a3a3a #b85a52 #d88a7a'
  };
  const THREADS = new Set(['string', 'venom', 'gleam', 'stench', 'midge']);

  const fail = message => { throw new Error('PX: ' + message); };
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const luma = c => c[0] * .3 + c[1] * .59 + c[2] * .11;
  const key = (x, y) => x + ',' + y;

  function material(name, hexes) {
    const tones = hexes.split(' ').map(rgb);
    if (tones.length !== TONES.length) fail(name + ' has ' + tones.length + ' tones, a material has ' + TONES.length);
    return { name, tones, thread: THREADS.has(name) };
  }
  const MATERIALS = Object.fromEntries(Object.entries(PALETTE).map(([name, hexes]) => [name, material(name, hexes)]));

  function ink(glyph, inks) {
    for (let set = 0; set < GLYPHS.length; set++) {
      const tone = GLYPHS[set].indexOf(glyph);
      if (tone < 0) continue;
      const mat = MATERIALS[inks[set]];
      if (!mat) fail('glyph "' + glyph + '" needs material ' + (set + 1) + ' of [' + inks.join(', ') + ']');
      return { mat, rgb: mat.tones[tone] };
    }
    return fail('unknown glyph "' + glyph + '"');
  }

  const sketch = () => new Map();
  function put(sk, x, y, glyph, inks) {
    if (glyph === ' ') return;
    if (glyph === '.') { sk.delete(key(x, y)); return; }
    sk.set(key(x, y), Object.assign({ x, y }, ink(glyph, inks)));
  }

  const lean = band => band >= 0 ? [(band + 1) >> 1, band >> 1] : [-(-band >> 1), -((1 - band) >> 1)];
  function diagonal(step, band) {
    const [dx, dy] = lean(band);
    return [step + dx, dy - step];
  }

  function grid(rows, what) {
    if (!rows.length || rows.some(r => r.length !== rows[0].length)) fail('ragged ' + what + ': ' + JSON.stringify(rows));
    return rows;
  }
  const part = (top, rows) => ({ top, rows: grid(rows, 'part'), len: rows[0].length });
  const tile = (pattern, n) => pattern.repeat(Math.ceil(n / pattern.length)).slice(0, n);
  const run = (top, patterns, n) => part(top, patterns.map(p => tile(p, n)));

  function join(...parts) {
    const top = Math.min(...parts.map(p => p.top)), bottom = Math.max(...parts.map(p => p.top + p.rows.length - 1));
    const rows = [];
    for (let band = top; band <= bottom; band++) rows.push(parts.map(p => p.rows[band - p.top] || ' '.repeat(p.len)).join(''));
    return part(top, rows);
  }

  const strip = (band, from, to, pattern) => part(band, [' '.repeat(from) + tile(pattern, to - from)]);
  function stack(...parts) {
    const top = Math.min(...parts.map(p => p.top)), bottom = Math.max(...parts.map(p => p.top + p.rows.length - 1)), len = Math.max(...parts.map(p => p.len));
    const rows = [];
    for (let band = top; band <= bottom; band++) {
      const row = new Array(len).fill(' ');
      for (const p of parts) [...(p.rows[band - p.top] || '')].forEach((glyph, c) => { if (glyph !== ' ') row[c] = glyph; });
      rows.push(row.join(''));
    }
    return part(top, rows);
  }
  const profile = spans => stack(...spans.map(span => strip(...span)));

  const patch = (rows, anchor, len) => ({ rows: grid(rows, 'patch'), anchor, len: len || 0 });
  function mirror(p, swap) {
    const flip = glyph => swap[glyph] || glyph;
    return part(-(p.top + p.rows.length - 1), p.rows.slice().reverse().map(row => [...row].map(flip).join('')));
  }

  function lay(sk, step, p, inks, axis) {
    const at = axis || diagonal;
    if (p.anchor) {
      const [x, y] = at(step, 0);
      stamp(sk, x - p.anchor[0], y - p.anchor[1], p.rows, inks);
      return step + p.len;
    }
    p.rows.forEach((row, r) => [...row].forEach((glyph, c) => put(sk, ...at(step + c, p.top + r), glyph, inks)));
    return step + p.len;
  }

  function assemble(pieces, sk, axis) {
    let step = 0;
    sk = sk || sketch();
    for (const piece of pieces) step = typeof piece === 'number' ? step + piece : lay(sk, step, piece[0], piece.slice(1), axis);
    return sk;
  }

  function stamp(sk, x0, y0, rows, inks) {
    grid(rows, 'stamp').forEach((row, j) => [...row].forEach((glyph, i) => put(sk, x0 + i, y0 + j, glyph, inks)));
    return sk;
  }

  function transposed(rows) {
    const n = Math.max(rows.length, ...rows.map(r => r.length)), cell = (x, y) => (rows[y] || '')[x] || ' ';
    return Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => cell(x, y) !== ' ' ? cell(x, y) : cell(y, x)).join(''));
  }

  function mirrored(rows) {
    for (const row of grid(rows, 'stamp')) for (let i = 0; i < row.length >> 1; i++) {
      if ((row[i] === ' ') !== (row[row.length - 1 - i] === ' ')) fail('lopsided row "' + row + '"');
    }
    return rows;
  }

  function outline(sk) {
    const edge = new Map();
    for (const cell of sk.values()) {
      if (cell.mat.thread) continue;
      for (const [dx, dy] of NEAR) {
        const x = cell.x + dx, y = cell.y + dy, k = key(x, y), dark = cell.mat.tones[0], had = edge.get(k);
        if (!sk.has(k) && (!had || luma(dark) < luma(had.rgb))) edge.set(k, { x, y, mat: cell.mat, rgb: dark });
      }
    }
    for (const [k, cell] of edge) sk.set(k, cell);
    return sk;
  }

  function bounds(sk) {
    const xs = [...sk.values()].map(c => c.x), ys = [...sk.values()].map(c => c.y);
    if (!xs.length) fail('empty icon');
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x + 1, h: Math.max(...ys) - y + 1 };
  }

  function fit(sk) {
    const b = bounds(sk), rgba = new Uint8ClampedArray(SIZE * SIZE * 4);
    if (b.w > SIZE || b.h > SIZE) fail('icon is ' + b.w + ' x ' + b.h + ' with its outline, the canvas is ' + SIZE + ' x ' + SIZE);
    const ox = ((SIZE - b.w) >> 1) - b.x, oy = ((SIZE - b.h) >> 1) - b.y;
    for (const cell of sk.values()) rgba.set([...cell.rgb, 255], ((cell.y + oy) * SIZE + cell.x + ox) * 4);
    return { w: SIZE, h: SIZE, rgba };
  }

  const icon = sk => fit(outline(sk));

  function edge(sk, fresh) {
    for (const cell of fresh.values()) {
      if (cell.mat.thread) continue;
      for (const [dx, dy] of NEAR) {
        const x = cell.x + dx, y = cell.y + dy, k = key(x, y);
        if (!fresh.has(k) && sk.has(k)) sk.set(k, { x, y, mat: cell.mat, rgb: cell.mat.tones[0] });
      }
    }
  }
  function overlay(sk, x, y, rows, ...inks) {
    const fresh = stamp(sketch(), x, y, rows, inks);
    edge(sk, fresh);
    for (const [k, cell] of fresh) sk.set(k, cell);
    return sk;
  }
  const layered = (...layers) => layers.reduce((sk, layer) => overlay(sk, ...layer), sketch());

  return { SIZE, MATERIALS, sketch, part, tile, run, join, strip, stack, profile, patch, mirror, lay, assemble, stamp, mirrored, transposed, diagonal, outline, bounds, fit, icon, layered, overlay };
})();
