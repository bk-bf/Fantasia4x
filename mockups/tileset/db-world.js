'use strict';
(() => {
  const X = DBX, STAGES = [0, 1, 2];
  function variants(o) {
    const k = RULES.classify(o), ramps = () => RULES.rampsFor(k, o);
    if (k.pile) return STAGES.map(stage => ['map-pile-' + (stage + 1), () => PROPS.pile(k.pile, [stage], ramps(), 1)]);
    if (k.long) return [['map-lean', () => PROPS.long(k.long, 'lean', false, o.id)], ['map-lie', () => PROPS.long(k.long, 'lie', false, o.id)]];
    const own = WORLD_GEAR.of(o);
    if (own && own.stages) return own.stages.map((quantity, i) => ['map-pile-' + (i + 1), () => PROPS.worn(k.worn, ramps(), false, o, quantity)]);
    const ground = [['map-ground', () => PROPS.worn(k.worn, ramps(), false, o)]];
    return k.worn === 'shield' ? [...ground, ['map-lean', () => PROPS.worn('shieldUp', ramps(), false, o)]] : ground;
  }
  const drawn = o => X.of('item', o.id).length > 0, mapped = o => X.of('item', o.id).some(e => e.inWorld);
  const prev = X.fromData;
  X.fromData = objects => {
    prev.call(X, objects);
    for (const o of objects) {
      if (o.cat !== 'item' || !(drawn(o) || WORLD_GEAR.of(o)) || mapped(o)) continue;
      for (const [variant, make] of variants(o)) X.reg('item', o.id, variant, make, { inWorld: true });
    }
  };
})();
