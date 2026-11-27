'use strict';
const WORLD_WORN = (() => {
  const { inked, pair, marked, flipped } = WORLD_GEAR;
  const SLOTS = { head: 'HEAD', bodyBase: 'TORSO', bodyMid: 'TORSO', bodyOuter: 'TORSO', back: 'TORSO', bracers: 'ARMS', gloves: 'HANDS', greaves: 'LEGS', boots: 'FEET', socks: 'FEET' };
  const KIND = { HEAD: 'helm', TORSO: 'torso', ARMS: 'bracers', HANDS: 'gloves', LEGS: 'greaves', FEET: 'boots', MEDICAL: 'bracers' };
  const USUAL = { HEAD: 'dome', TORSO: 'jerkin', ARMS: 'wrap', HANDS: 'glove', LEGS: 'wrap', FEET: 'ankleBoot', MEDICAL: 'armSplint' };
  const BESPOKE = { goblin_scrap_cap: 'cookpot' };
  const SHAPES = { HEAD: {}, TORSO: {}, ARMS: {}, HANDS: {}, LEGS: {}, FEET: {}, MEDICAL: {} };

  const shifted = (patterns, tones) => patterns.map(pattern => [...pattern].map(glyph => tones[glyph] || glyph).join(''));
  const planes = patterns => ({ '+': shifted(patterns, { m: 'l', d: 'm' }), '#': patterns, '-': shifted(patterns, { l: 'm', m: 'd', d: 'o' }) });
  const TEXTURE = {
    mail: planes(['dm', 'mm']),
    scale: planes(['lmd', 'dlm']),
    quilt: planes(['mmd']),
    weave: planes(['lm', 'ml']),
    lamellar: planes(['lmd', 'lmd', 'ddd'])
  };
  const threadAt = (patterns, x, y) => { const row = patterns[y % patterns.length]; return row[x % row.length]; };
  const woven = (rows, texture) => rows.map((row, y) => [...row].map((glyph, x) => texture[glyph] ? threadAt(texture[glyph], x, y) : glyph).join(''));

  const laid = rows => card => marked(inked(rows, card.wear), card);
  const plain = rows => card => inked(rows, card.wear);
  const paired = (rows, shift) => card => pair(rows, card.wear, shift);
  const mated = (rows, shift) => card => pair(rows, card.wear, shift, flipped(rows));

  const slotOf = item => String(((item.src && item.src.armor) || {}).slot || '');
  function drawingOf(item) {
    const group = SLOTS[slotOf(item)];
    if (item.group !== 'Armor' || !group) return null;
    const read = WORLD_CARD.read(item.id, slotOf(item)), card = read || WORLD_CARD.loose(item.id);
    if (!card) return null;
    const shapes = SHAPES[read ? read.group : group], shape = shapes[read ? read.name : BESPOKE[item.id]] || SHAPES[group][USUAL[group]];
    return { kind: KIND[group], ground: () => shape(card) };
  }
  WORLD_GEAR.derive(drawingOf);

  return { SHAPES, TEXTURE, woven, laid, plain, paired, mated };
})();
