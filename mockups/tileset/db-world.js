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
  const DARK = 60;
  function toneOf(icon) {
    const sum = [0, 0, 0];
    let n = 0;
    for (let i = 0; i < icon.w * icon.h; i++) { const [r, g, b, alpha] = icon.rgba.subarray(i * 4, i * 4 + 4); if (alpha && r + g + b > DARK) { sum[0] += r; sum[1] += g; sum[2] += b; n++; } }
    return '#' + sum.map(v => Math.round(v / Math.max(1, n)).toString(16).padStart(2, '0')).join('');
  }
  const CARCASS_RIG = { deer: 'deer', elk: 'elk', wolf: 'wolf', great_wolf: 'wolf', dire_wolf: 'direwolf', worg: 'worg', jackal: 'jackal', bear: 'bear', great_bear: 'bear', cave_bear: 'cavebear', boar: 'boar', great_boar: 'boar', direboar: 'boar', aurochs: 'ox', mountain_goat: 'bighorn', woolly_mammoth: 'mammoth', sabretooth: 'sabre', owlbear: 'owlbear', hippogriff: 'hippogriff', mire_crocodile: 'lurker' };
  const CARCASS_FOLK = { goblin: 'goblin', orc_reaver: 'orc', gnoll_marauder: 'gnoll', kobold_skulker: 'kobold', pawn: 'human' };
  function carcassForms(o) {
    const creature = o.id.replace(/_carcass$/, ''), beast = CARCASS_RIG[creature], race = CARCASS_FOLK[creature];
    if (beast) return [['map-carry-draped', () => quadDraped(beast)], ['map-carry-toward', () => quadDraped(beast, 'front')], ['map-carry-away', () => quadDraped(beast, 'hind')]];
    if (race) return [['map-carry-slung', () => rigPawnSlung({ race }, 's')], ['map-carry-toward', () => rigPawnSlung({ race }, 'f')], ['map-carry-away', () => rigPawnSlung({ race }, 'b')]];
    const toned = () => ({ a: PROPS.rampOf(toneOf(X.bake(X.byId.get('item/' + o.id + '/0')))) });
    return [['map-carry-end', () => PROPS.carriedEnd('meat', toned(), X.bake(X.byId.get('item/' + o.id + '/0')).h)], ['map-carry-held', () => PROPS.carried('quarry', toned(), 1)]];
  }
  const HARD = ['mail', 'plate'];
  const soft = o => { const a = o.raw && o.raw.armorProperties; return !!a && !HARD.includes(a.armorLayer) && o.raw.category !== 'metal'; };
  function carryForms(o) {
    const k = RULES.classify(o), own = WORLD_GEAR.of(o), forms = [];
    if (k.pile && PROPS.CARRIED.includes(k.pile)) forms.push(['map-carry', () => PROPS.carried(k.pile, RULES.rampsFor(k, o), 1)]);
    if (o.sub === 'Carcass') forms.push(...carcassForms(o));
    else if (k.pile && (PROPS.SHOULDERED.includes(k.pile) || PROPS.TURNED.includes(k.pile))) forms.push(['map-carry-end', () => PROPS.carriedEnd(k.pile, RULES.rampsFor(k, o))]);
    if (k.worn === 'torso' && soft(o)) forms.push(['map-carry-folded', () => PROPS.carried('cloth', RULES.rampsFor(k, o), 1)]);
    if (own && own.carried) forms.push(...Object.entries(own.carried));
    return forms;
  }
  const drawn = o => X.of('item', o.id).length > 0, mapped = o => X.of('item', o.id).some(e => e.inWorld);
  const prev = X.fromData;
  X.fromData = objects => {
    prev.call(X, objects);
    for (const o of objects) {
      if (o.cat !== 'item' || !(drawn(o) || WORLD_GEAR.of(o)) || mapped(o)) continue;
      for (const [variant, make] of variants(o)) X.reg('item', o.id, variant, make, { inWorld: true });
    }
    for (const o of objects) {
      if (o.cat !== 'item' || !(drawn(o) || WORLD_GEAR.of(o))) continue;
      for (const [variant, make] of carryForms(o)) X.reg('item', o.id, variant, make);
    }
  };
})();
