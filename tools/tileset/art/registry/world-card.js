'use strict';
const WORLD_CARD = (() => {
  const REGIONS = ['body', 'trim', 'strap', 'lining'], GLYPHS = ['odml', 'ODML', 'wxyz', 'WXYZ'];
  const GROUPS = { head: 'HEAD', bodyBase: 'TORSO', bodyMid: 'TORSO', bodyOuter: 'TORSO', back: 'TORSO', bracers: 'ARMS', gloves: 'HANDS', greaves: 'LEGS', boots: 'FEET', socks: 'FEET' };
  const OFFSETS = [[0, 0], [0, 3]], SURE = .5;
  const key = (x, y) => x + ',' + y;

  const ICONS = new Map();
  function iconOf(id) {
    if (!ICONS.size) for (const icon of PIXEL_ICONS) ICONS.set(icon.id, icon);
    return ICONS.get(id);
  }
  const SKETCHES = new Map();
  function sketchOf(id) {
    if (!SKETCHES.has(id)) SKETCHES.set(id, iconOf(id) ? iconOf(id).draw() : null);
    return SKETCHES.get(id);
  }

  function glyphOf(glyph) {
    for (let region = 0; region < GLYPHS.length; region++) {
      const tone = GLYPHS[region].indexOf(glyph);
      if (tone >= 0) return { region, tone };
    }
    return null;
  }
  function laid(rows, [ox, oy]) {
    const out = [];
    rows.forEach((row, j) => [...row].forEach((glyph, i) => {
      const g = glyphOf(glyph);
      if (g) out.push({ x: ox + i, y: oy + j, region: g.region, tone: g.tone });
    }));
    return out;
  }
  const sameTone = (cell, tone) => cell && cell.rgb === cell.mat.tones[tone];
  function fitOf(sk, rows, offset) {
    const cells = laid(rows, offset), hits = cells.filter(c => sameTone(sk.get(key(c.x, c.y)), c.tone));
    return { cells, hits, score: hits.length / (cells.length + sk.size - hits.length) };
  }
  function candidates(slot) {
    const groups = GROUPS[slot] ? [GROUPS[slot], 'MEDICAL'] : Object.values(GROUPS);
    return [...new Set(groups)].flatMap(group => Object.entries(ARMOUR[group]).map(([name, rows]) => ({ group, name, rows })));
  }
  function bestFit(sk, slot) {
    let best = null;
    for (const cand of candidates(slot)) for (const offset of OFFSETS) {
      const fit = fitOf(sk, cand.rows, offset);
      if (!best || fit.score > best.score) best = Object.assign(fit, cand, { offset });
    }
    return best;
  }

  function majority(names) {
    const tally = new Map();
    for (const name of names) tally.set(name, (tally.get(name) || 0) + 1);
    return [...tally].sort((a, b) => b[1] - a[1]).map(entry => entry[0])[0];
  }
  function wearOf(sk, fit) {
    const wear = {};
    REGIONS.forEach((region, r) => {
      const mat = majority(fit.hits.filter(c => c.region === r).map(c => sk.get(key(c.x, c.y)).mat.name));
      if (mat) wear[region] = mat;
    });
    return wear;
  }
  function boundsOf(cells) {
    const xs = cells.map(c => c.x), ys = cells.map(c => c.y), x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x + 1, h: Math.max(...ys) - y + 1 };
  }
  const markAt = (cell, front) => ({ u: (cell.x - front.x + .5) / front.w, v: (cell.y - front.y + .5) / front.h, mat: cell.mat.name, tone: cell.mat.tones.indexOf(cell.rgb) });
  function marksOf(sk, fit, wear) {
    const planned = new Map(fit.cells.map(c => [key(c.x, c.y), wear[REGIONS[c.region]] || wear.body]));
    const front = boundsOf(fit.cells), paired = fit.offset[1] > 0;
    return [...sk.values()].filter(cell => planned.get(key(cell.x, cell.y)) !== cell.mat.name && (planned.has(key(cell.x, cell.y)) || !paired)).map(cell => markAt(cell, front));
  }

  const READ = new Map();
  function read(id, slot) {
    if (READ.has(id)) return READ.get(id);
    const sk = sketchOf(id), fit = sk && bestFit(sk, slot);
    const wear = fit && wearOf(sk, fit);
    const out = fit && fit.score >= SURE ? { group: fit.group, name: fit.name, wear, marks: marksOf(sk, fit, wear), front: boundsOf(fit.cells) } : null;
    READ.set(id, out);
    return out;
  }

  function extras(id, wear) {
    const sk = sketchOf(id), known = new Set(Object.values(wear));
    if (!sk) return { marks: [], inside: true };
    const front = boundsOf([...sk.values()]);
    return { front, inside: true, marks: [...sk.values()].filter(cell => !known.has(cell.mat.name)).map(cell => markAt(cell, front)) };
  }
  function loose(id) {
    const body = materials(id)[0];
    return body ? Object.assign(extras(id, { body }), { wear: { body } }) : null;
  }

  function materials(id) {
    const sk = sketchOf(id), tally = new Map();
    if (!sk) return [];
    for (const cell of sk.values()) tally.set(cell.mat.name, (tally.get(cell.mat.name) || 0) + 1);
    return [...tally].sort((a, b) => b[1] - a[1]).map(entry => entry[0]);
  }

  return { read, loose, extras };
})();
