'use strict';
const WORLD_GEAR = (() => {
  const W = 48, H = 64, CX = 24, B = 54;
  const REGIONS = ['body', 'trim', 'strap', 'lining'], NEAR = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const RELIT = { l: 'd', d: 'l', L: 'D', D: 'L', z: 'x', x: 'z', Z: 'X', X: 'Z' };
  const MARK_SHARE = .3;
  const DRAWN = {}, FINDERS = [], FOUND = new Map();
  const key = (x, y) => x + ',' + y;

  const widest = rows => Math.max(...rows.map(row => row.length));
  const boxed = rows => rows.map(row => row.padEnd(widest(rows)));
  const flipped = rows => boxed(rows).map(row => [...row].reverse().map(glyph => RELIT[glyph] || glyph).join(''));
  const squashed = (rows, share) => Array.from({ length: Math.round(rows.length * share) }, (_, j) => rows[Math.min(rows.length - 1, Math.floor((j + .5) / share))]);
  const inks = wear => REGIONS.map(region => wear[region] || wear.body);
  const inked = (rows, wear, sk, x, y) => PX.stamp(sk || PX.sketch(), x || 0, y || 0, boxed(rows), inks(wear));

  function overlaid(sk, x, y, rows, wear) {
    const front = inked(rows, wear, null, x, y);
    for (const cell of front.values()) for (const [dx, dy] of NEAR) {
      const k = key(cell.x + dx, cell.y + dy);
      if (!front.has(k) && sk.has(k)) sk.set(k, { x: cell.x + dx, y: cell.y + dy, mat: cell.mat, rgb: cell.mat.tones[0] });
    }
    for (const [k, cell] of front) sk.set(k, cell);
    return sk;
  }
  const pair = (rows, wear, [dx, dy], behind) => overlaid(inked(behind || rows, wear, null, dx, 0), 0, dy, rows, wear);

  function tallied(marks, box, area) {
    const tally = new Map();
    for (const m of marks) {
      const x = box.x + Math.floor(m.u * box.w), y = box.y + Math.floor(m.v * box.h), k = key(x, y) + ',' + m.mat + ',' + m.tone;
      const entry = tally.get(k) || { x, y, mat: m.mat, tone: m.tone, share: 0 };
      entry.share += 1 / area;
      tally.set(k, entry);
    }
    return [...tally.values()].sort((a, b) => a.share - b.share);
  }
  function marked(sk, card) {
    if (!card.marks.length) return sk;
    const box = PX.bounds(sk), area = Math.max(1, (card.front.w / box.w) * (card.front.h / box.h));
    const cover = new Map();
    for (const m of tallied(card.marks, box, area)) cover.set(key(m.x, m.y), (cover.get(key(m.x, m.y)) || 0) + m.share);
    for (const m of tallied(card.marks, box, area)) {
      if (cover.get(key(m.x, m.y)) < MARK_SHARE || (card.inside && !sk.has(key(m.x, m.y)))) continue;
      const mat = PX.MATERIALS[m.mat];
      sk.set(key(m.x, m.y), { x: m.x, y: m.y, mat, rgb: mat.tones[m.tone] });
    }
    return sk;
  }

  const add = drawings => Object.assign(DRAWN, drawings);
  const derive = finder => FINDERS.push(finder);
  function of(item) {
    if (!item) return null;
    if (DRAWN[item.id]) return DRAWN[item.id];
    if (!FOUND.has(item.id)) FOUND.set(item.id, FINDERS.reduce((def, find) => def || find(item), null));
    return FOUND.get(item.id);
  }

  function sprite(def, pose, quantity) {
    const sk = PX.outline((def[pose] || def.ground)(quantity)), b = PX.bounds(sk), s = new Spr(W, H, CX, B);
    const dx = CX - b.x - (b.w >> 1), dy = B - b.y - b.h + 1;
    for (const cell of sk.values()) s.set(cell.x + dx, cell.y + dy, cell.rgb);
    s.sh = { rx: b.w / 2 + 1, ry: pose === 'lean' ? 2 : Math.min(3, 1.2 + b.w / 10), dx: 2, dy: 0, k: .8 };
    return s;
  }

  return { add, derive, of, sprite, flipped, squashed, inked, pair, marked };
})();
