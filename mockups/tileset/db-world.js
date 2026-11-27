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
  const POOLED = c => c[0] >= 60 && c[0] <= 120 && c[1] < c[0] / 3 && c[2] < c[0] / 3, HEAD_ROUND = 3;
  function bloodless(icon) {
    const s = new Spr(icon.w, icon.h, icon.ax, icon.ay), pool = [];
    for (let i = 0; i < icon.c.length; i++) { const c = icon.c[i]; if (c && c !== P.ink && POOLED(c)) pool.push(i % icon.w); else if (c) { s.c[i] = c; s.e[i] = icon.e[i]; } }
    for (let i = 0; i < s.c.length; i++) if (s.c[i] === P.ink && ![i - 1, i + 1, i - s.w, i + s.w].some(q => s.c[q] && s.c[q] !== P.ink)) s.c[i] = null;
    const cols = [], rows = [];
    for (let x = 0; x < s.w; x++) for (let y = 0; y < s.h; y++) if (s.c[y * s.w + x]) { cols.push(x); break; }
    const pooled = pool.length ? pool.reduce((a, b) => a + b, 0) / pool.length : 0, x = pooled > (cols[0] + cols[cols.length - 1]) / 2 ? cols[cols.length - 1] - HEAD_ROUND : cols[0] + HEAD_ROUND;
    for (let y = 0; y < s.h; y++) if (s.c[y * s.w + x]) rows.push(y);
    s.head = [x, rows.length ? rows[rows.length >> 1] : s.h >> 1, HEAD_ROUND];
    return s;
  }
  function carcassForms(o) {
    const creature = o.id.replace(/_carcass$/, ''), beast = CARCASS_RIG[creature], race = CARCASS_FOLK[creature];
    if (beast) return [['map-carry-draped', () => quadDraped(beast)]];
    const whole = () => bloodless(X.built(X.byId.get('item/' + o.id + '/0')));
    if (race) return [['map-carry-flat', whole], ['map-carry-cradled', () => rigPawnCradled({ race })]];
    const toned = () => ({ a: PROPS.rampOf(toneOf(X.bake(X.byId.get('item/' + o.id + '/0')))) });
    return [['map-carry-draped', whole], ['map-carry-held', () => PROPS.carried('quarry', toned(), 1)]];
  }
  const CARRIED_AS = { branch: 'boughs' };
  function carryForms(o) {
    const k = RULES.classify(o), own = WORLD_GEAR.of(o), forms = [];
    if (k.pile && PROPS.CARRIED.includes(k.pile)) forms.push(['map-carry', () => PROPS.carried(CARRIED_AS[o.id] || k.pile, RULES.rampsFor(k, o), 1)]);
    if (k.worn === 'torso') forms.push(['map-carry-folded', () => PROPS.carried('cloth', { a: PROPS.rampOf(toneOf(X.bake(X.byId.get('item/' + o.id + '/0')))) }, 1)]);
    if (o.sub === 'Carcass') forms.push(...carcassForms(o));
    else if (k.pile && PROPS.SHOULDERED.includes(k.pile)) forms.push(['map-carry-end', () => PROPS.carriedEnd(k.pile, RULES.rampsFor(k, o))]);
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
