'use strict';
const WORN_WEAVE = (name, x, y) => {
  switch (name) {
    case 'mail': return (x + y) & 1 ? 0 : -1;
    case 'scale': return y % 2 === 1 && ((x + (y >> 1)) & 1) === 0 ? -1 : y % 2 === 0 && ((x + (y >> 1)) & 1) ? 1 : 0;
    case 'quilt': return (x + y) % 4 === 0 || (x - y + 64) % 4 === 0 ? -1 : 0;
    case 'lamellar': return y % 3 === 2 || (y % 3 === 0 && x % 2 === 0) ? -1 : 0;
    case 'splint': return x % 2 === 0 ? -1 : 0;
    case 'weave': return ((x >> 1) + (y >> 1)) & 1 ? -1 : 0;
    case 'fur': { const h = hash(x, y, 3); return h > .7 ? 1 : h < .25 ? -1 : 0; }
    case 'feather': return (y + (x >> 1)) % 3 === 2 ? -1 : 0;
    case 'bone': return y % 3 === 2 ? -1 : y % 3 === 0 ? 1 : 0;
    default: return 0;
  }
};

const WORN = (() => {
  const X = DBX, TORSO = ['bodyBase', 'bodyMid', 'bodyOuter'], FEET = ['socks', 'boots'];
  const DRAWN = new Set([...TORSO, 'greaves', ...FEET, 'head', 'back']);
  const WEAVES = { mail: 'mail', scale: 'scale', quilt: 'quilt', lamellar: 'lamellar', splint: 'splint', sticks: 'splint', weave: 'weave', wicker: 'weave', fur: 'fur', feather: 'feather', bone: 'bone' };
  const slotOf = o => o.src && o.src.armor ? o.src.armor.slot || o.src.armor.equipmentSlot : null;
  const tones = (r, n) => Array.from({ length: n }, (_, i) => r[Math.round(i * (r.length - 1) / (n - 1))]);
  const hatOf = (id, st) => /circlet|diadem|crown/.test(id) ? 'crown' : st.t !== 'mail' && (st.m || st.t === 'plate' || st.t === 'bone') ? 'helm' : 'hood';
  const layerOf = o => {
    const slot = slotOf(o);
    if (!DRAWN.has(slot) || o.sub === 'Medicine') return null;
    const st = X.hdArmor.styleOf(o);
    const r = st.m ? st.m.r : st.r;
    return { id: o.id, slot, ramp: tones(r, 6), hard: tones(r, 7), hat: slot === 'head' ? hatOf(o.id, st) : null, weave: WEAVES[st.t] || null, plate: st.t === 'plate', cut: TORSO.includes(slot) ? X.hdArmor.cutOf(o.id) : null };
  };
  const top = (layers, order, test) => { for (const k of order.slice().reverse()) { const l = layers.find(x => x.slot === k && (!test || test(x))); if (l) return l; } return null; };
  const gearOf = layers => {
    const g = {}, weave = {}, body = top(layers, TORSO);
    if (body) {
      g.tunic = body.ramp; weave.torso = body.weave;
      if (body.plate) { g.armor = body.ramp; g.plate = 1; }
      const sleeved = top(layers, TORSO, l => !!l.cut.sleeve);
      if (sleeved) { g.sleeve = sleeved.ramp; weave.sleeve = sleeved.weave; if (sleeved.cut.sleeve !== 'short') g.sleeves = 'long'; }
      else g.sleeves = 0;
      g.belt = layers.some(l => l.cut && l.cut.belt) ? 1 : 0;
    }
    const robe = layers.find(l => l.cut && l.cut.long), legs = robe || top(layers, ['greaves']);
    if (legs) { g.pants = legs.ramp; weave.legs = legs.weave; }
    const feet = top(layers, FEET);
    if (feet) { g.boots = feet.ramp; weave.boots = feet.weave; }
    const head = top(layers, ['head']);
    if (head) { g.hat = head.hat; if (head.hat === 'hood') g.hood = head.ramp; else if (head.hat === 'helm') g.helm = head.hard; else g.band = head.ramp; }
    const back = top(layers, ['back']);
    if (back) g.cape = back.ramp;
    if (Object.values(weave).some(Boolean)) g.weave = weave;
    return g;
  };
  const dress = objs => gearOf(objs.map(layerOf).filter(Boolean));
  const mannequin = () => ({ ...pawnLookOf({ id: 'worn', sex: 'male', age: 30, height: 175, weight: Math.round(TYPICAL_WEIGHT.scale * Math.pow(175, TYPICAL_WEIGHT.power)), traits: [] }, { skin: { tan: 1 }, hair: { brown: 1 }, eyes: { dark: 1 } }, {}), style: 'short', beard: 'none', hair: 'brown', skin: 'tan', eyes: 'dark', oddEye: null });
  const FACES = { f: 'front', s: 'side', b: 'back' };
  const prev = X.fromData;
  X.fromData = objects => {
    prev.call(X, objects);
    const look = mannequin();
    for (const o of objects) {
      if (o.cat !== 'item' || !layerOf(o) || !X.of('item', o.id).length) continue;
      for (const face in FACES) X.reg('item', o.id, 'worn-' + face, () => drawLook(look, face, 0, { face }, dress([o])), { worn: FACES[face], at: [16, 27] });
    }
  };
  return { layerOf, gearOf, dress, mannequin };
})();
