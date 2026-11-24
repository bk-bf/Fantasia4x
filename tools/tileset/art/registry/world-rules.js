'use strict';
const RULES = (() => {
  const TILE = 32;
  const KINDS = [[/crossbow|arbalest|bow$|recurve|sling/, 'bow'], [/spear|javelin|pilum|pike|halberd|glaive|lance|trident|impaler/, 'spear'], [/staff|rod$|wand|sceptre|torch/, 'staff'], [/hammer|maul/, 'hammer'], [/axe|hatchet|cleaver|chopper|adze/, 'axe'], [/mace|club|flail/, 'mace'], [/dagger|knife|stiletto|dirk|shank|sickle|shears|seax|kit$/, 'dagger'], [/pick|mattock/, 'pick'], [/hoe|spade|shovel|rake/, 'hoe'], [/^saw|_saw/, 'saw'], [/tongs/, 'tongs']];
  const kindOf = (id, fallback) => (KINDS.find(k => k[0].test(id)) || [0, fallback])[1];
  const CAP = { logs: 30, planks: 40, blocks: 20, rubble: 40, heap: 40, bars: 30, sacks: 20, crates: 30, fluids: 40, baskets: 30, meat: 30, hides: 20, cloth: 20, pots: 20, bundles: 30 };
  const WORK = { hammer: ['anvil', 'bloomery', 'smelter'], tongs: ['bloomery', 'smelter', 'anvil'], pick: ['stonecutter'], dagger: ['butcher'], saw: ['carpenter'] };
  const NAMES = { logs: 'log pile', planks: 'plank stack', blocks: 'cut stone', rubble: 'loose stone and ore', heap: 'loose heap', bars: 'metal bars', sacks: 'sacks', crates: 'crates', fluids: 'barrels and jugs', baskets: 'baskets', meat: 'meat', hides: 'hides', cloth: 'cloth bolts', pots: 'cooked food', bundles: 'bundles' };

  const MATERIAL = [
    [/^(Wood|Magic Wood)$/, /log/, 'logs'], [/^(Wood|Magic Wood)$/, /plank|board|beam/, 'planks'], [/^(Wood|Magic Wood|Woodwork)$/, /./, 'bundles'],
    [/^(Block|Construction)$/, /./, 'blocks'], [/^Stone$/, /./, 'rubble'], [/^Ore$/, /./, 'rubble'],
    [/^(Metal|Iron|Steel)$/, /bar$|ingot/, 'bars'], [/^Fuel$/, /log|firewood/, 'logs'], [/^(Fuel|Soil|Clay)$/, /./, 'heap'],
    [/^Carcass$/, /./, 'meat'], [/^(Hide|Cured Hide|Leather)$/, /./, 'hides'], [/^(Cloth|Wool)$/, /./, 'cloth'], [/^Fiber$/, /./, 'bundles'],
    [/Seed$/, /./, 'sacks'], [/^Primitive$/, /small_stone|flint/, 'rubble'], [/^Primitive$/, /sand|salt|dirt|ash/, 'heap'], [/^Primitive$/, /hay|fiber|branch|bark|reed|straw/, 'bundles'],
    [/^Organic$/, /flour|meal$|malt/, 'sacks'], [/^Organic$/, /cloth$/, 'cloth'], [/^Organic$/, /./, 'baskets']
  ];
  const FOOD = [[/^(Meat|Fish)$/, /./, 'meat'], [/^Meal$/, /./, 'pots'], [/^(Grain|Legume)$/, /./, 'sacks'], [/^Preserve$/, /meat|fish|jerky|sausage/, 'meat'], [/^Preserve$/, /./, 'crates'], [/./, /./, 'baskets']];
  const pileOf = (table, o) => (table.find(r => r[0].test(o.sub || '') && r[1].test(o.id)) || [0, 0, 'crates'])[2];

  function wornOf(o) {
    if (/shield|buckler/.test(o.id)) return 'shield';
    const a = (o.src && o.src.armor) || {}, slot = String(a.slot || a.equipmentSlot || '');
    if (/head/.test(slot)) return /hood|cap$|circlet|hat/.test(o.id) ? 'roll' : 'helm';
    if (/torso/.test(slot)) return o.sub === 'Metal' || a.armorType === 'heavy' ? 'cuirass' : 'roll';
    if (/feet/.test(slot)) return 'boots';
    return 'roll';
  }
  function classify(o) {
    const own = WORLD_GEAR.of(o);
    if (own) return { worn: own.kind, own: true, tuck: own.tuck || 'low' };
    if (o.group === 'Weapon') return { long: kindOf(o.id, 'sword') };
    if (o.group === 'Armor') return { worn: wornOf(o) };
    if (o.group === 'Tool' && o.sub === 'Storage') return /belt|sash|bandolier|harness/.test(o.id) ? { worn: 'roll' } : /pack|bag|pannier|quiver|satchel|sling/.test(o.id) ? { worn: 'pack' } : { pile: /skin|urn|jug|flask|bottle|bucket|barrel|cask|keg/.test(o.id) ? 'fluids' : /basket/.test(o.id) ? 'baskets' : 'crates' };
    if (o.group === 'Tool') return { long: kindOf(o.id, 'hammer'), tool: true };
    if (o.group === 'Fluid') return { pile: 'fluids' };
    if (o.group === 'Food') return { pile: pileOf(FOOD, o) };
    if (o.group === 'Material') return { pile: pileOf(MATERIAL, o) };
    return { pile: 'crates' };
  }

  const RAMP = {
    logs: c => ({ a: PROPS.mixed(P.wood, c, .3), b: PROPS.mixed(P.plank, c, .25) }),
    planks: c => ({ a: PROPS.mixed(P.plank, c, .35) }),
    blocks: c => ({ a: PROPS.mixed(P.stone, c, .5) }),
    rubble: (c, o) => ({ a: PROPS.mixed(P.rock, c, o.sub === 'Ore' ? .2 : .3), b: PROPS.rampOf(c), speck: o.sub === 'Ore' }),
    heap: (c, o) => o.sub === 'Fuel' && !/dust/.test(o.id) ? { a: PROPS.mixed(P.rock, c, .76), lumps: true } : { a: PROPS.rampOf(c) },
    meat: c => ({ a: PROPS.mixed(P.red, c, .2) }),
    hides: (c, o) => ({ a: PROPS.mixed(P.furBrown, c, .7), b: PROPS.mixed(P.furTan, c, .5), smooth: o.sub !== 'Hide' }),
    cloth: c => ({ a: PROPS.rampOf(c), b: PROPS.mixed(P.cloth, c, .6) }),
    bundles: c => ({ a: PROPS.mixed(P.hay, c, .45) })
  };
  const WORN_BASE = { helm: 'iron', cuirass: 'iron', shield: 'plank' };
  const rampsFor = (k, o) => k.pile ? (RAMP[k.pile] || (c => ({ a: PROPS.rampOf(c) })))(o.color, o) : { a: PROPS.mixed(P[WORN_BASE[k.worn] || 'leather'], o.color, k.worn === 'shield' ? .3 : .45) };
  const stageOf = (cls, quantity) => quantity <= CAP[cls] * .25 ? 0 : quantity <= CAP[cls] * .65 ? 1 : 2;

  const jit = (d, seed, salt, span) => Math.round((hash(d.x * 7 + salt, d.y * 13, seed) - .5) * span);
  const coin = (d, seed, salt) => hash(d.x * 5 + salt, d.y * 11, seed) > .5;
  const tuck = (env, d, spr, seed, lush) => { const g = env.grass(d.x, d.y); return g ? PROPS.tucked(spr, g, seed + d.x * 31 + d.y, lush) : spr; };
  const shade = (x, y) => { const s = new Spr(1, 1, 0, 0); s.sh = { rx: 2.4, ry: 1.15, dx: 0, dy: 0, k: .95 }; return { spr: s, x, y, labels: [] }; };
  const contact = (spr, x, y) => PROPS.undersides(spr).filter(([cx], i, all) => i % 2 === 0 || i === all.length - 1).map(([cx, cy]) => shade(x + cx - spr.ax, y + cy + 1 - spr.ay));
  function lying(env, d, spr, seed, x, y, rule) {
    const g = env.grass(d.x, d.y), rx = Math.round(x), ry = Math.round(y);
    return { spr: g ? PROPS.bedded(spr, g, seed + d.x * 31 + d.y) : spr, x: rx, y: ry, rule, shadows: contact(spr, rx, ry) };
  }
  const label = d => ({ x: d.x * TILE + 16, y: d.y * TILE + 29 + (d.x % 2) * 7, text: d.item.name + (d.quantity > 1 ? ' x' + d.quantity : '') });

  function pilePlace(env, run, k, seed) {
    const d = run[0], stages = run.map(e => stageOf(k.pile, e.quantity)), wall = env.wall(d.x, d.y - 1);
    const spr = PROPS.pile(k.pile, stages, rampsFor(k, d.item), seed % 97 + d.x * 3 + d.y);
    return { spr: tuck(env, d, spr, seed, false), x: d.x * TILE + 16 + jit(d, seed, 1, 4) - (env.wall(d.x - 1, d.y) ? 3 : 0), y: d.y * TILE + (wall ? 11 : env.wall(d.x, d.y + 1) ? 15 : 25) + jit(d, seed, 2, wall ? 2 : 5), rule: run.length > 1 ? 'joined' : wall ? 'against wall' : 'pile' };
  }

  function support(env, d, k, piles) {
    const near = env.stations.filter(s => Math.abs(s.tx - d.x) <= 1 && Math.abs(s.ty - d.y) <= 1 && s.ty <= d.y);
    const own = k.tool && near.find(s => (WORK[k.long] || []).includes(s.kind));
    if (own) return { on: own, rule: 'rests on its station' };
    if (k.tool && k.long === 'axe') { const p = piles.find(q => q.cls === 'logs' && q.y === d.y && Math.abs(q.x - d.x) === 1); if (p) return { on: { x: p.px, y: p.py, tx: p.x, wide: 17 }, rule: 'rests on the log pile' }; }
    const beside = near.find(s => !s.low && (s.ty === d.y || s.tx === d.x));
    return beside ? { on: beside, rule: 'leans on a station' } : null;
  }
  function against(d, s) {
    const side = s.tx < d.x ? 1 : s.tx > d.x ? -1 : (d.x + d.y) % 2 ? 1 : -1;
    return { x: s.x + side * ((s.wide || 15) + 1), y: s.y + 2, flip: side < 0 };
  }
  function longPlace(env, d, k, seed, piles) {
    const sup = support(env, d, k, piles), L = PROPS.lengthOf(k.long);
    if (sup) { const p = against(d, sup.on); return { spr: PROPS.long(k.long, 'lean', p.flip, d.item.id), x: p.x, y: p.y, rule: sup.rule }; }
    if (env.wall(d.x, d.y - 1)) return { spr: PROPS.long(k.long, 'lean', coin(d, seed, 3), d.item.id), x: d.x * TILE + 16 + jit(d, seed, 4, 12), y: d.y * TILE + 7, rule: 'leans on the wall' };
    if (env.wall(d.x - 1, d.y)) return { spr: PROPS.long(k.long, 'lean', false, d.item.id), x: d.x * TILE + 4, y: d.y * TILE + 22 + jit(d, seed, 5, 8), rule: 'leans on the wall' };
    if (env.wall(d.x + 1, d.y)) return { spr: PROPS.long(k.long, 'lean', true, d.item.id), x: d.x * TILE + 28, y: d.y * TILE + 22 + jit(d, seed, 5, 8), rule: 'leans on the wall' };
    const east = env.field(d.x + 1, d.y), west = env.field(d.x - 1, d.y);
    if (k.long === 'hoe' && (east || west)) return lying(env, d, PROPS.long('hoe', 'lie', !east), seed, d.x * TILE + (east ? 31 - L / 2 : 1 + L / 2), d.y * TILE + 24, 'laid at the field edge');
    return lying(env, d, PROPS.long(k.long, 'lie', coin(d, seed, 6), d.item.id), seed, d.x * TILE + 16 + jit(d, seed, 7, 8), d.y * TILE + 22 + jit(d, seed, 8, 8), env.grass(d.x, d.y) ? 'lies in the grass' : 'lies on the ground');
  }
  const TUCKS = { lush: (env, d, spr, seed) => tuck(env, d, spr, seed, true), low: (env, d, spr, seed) => tuck(env, d, spr, seed, false), none: (env, d, spr) => spr };
  const tuckOf = (k, up) => up ? 'none' : k.tuck || (k.worn === 'pack' ? 'low' : 'lush');
  function shieldRest(env, d, k, piles) {
    if (k.worn !== 'shield') return null;
    if (env.wall(d.x, d.y - 1)) return { rule: 'leans on the wall' };
    const sup = support(env, d, k, piles);
    return sup && Object.assign(against(d, sup.on), { rule: sup.rule });
  }
  function wornPlace(env, d, k, seed, piles) {
    const ramps = rampsFor(k, d.item), wall = env.wall(d.x, d.y - 1), up = shieldRest(env, d, k, piles);
    const spr = PROPS.worn(up ? 'shieldUp' : k.worn, ramps, !k.own && (up ? !!up.flip : coin(d, seed, 9)), d.item, d.quantity);
    if (up && up.x !== undefined) return { spr, x: up.x, y: up.y, rule: up.rule };
    return { spr: TUCKS[tuckOf(k, up)](env, d, spr, seed), x: d.x * TILE + 16 + jit(d, seed, 10, 10), y: d.y * TILE + (wall ? 8 : env.wall(d.x, d.y + 1) ? 14 : 23 + jit(d, seed, 11, 6)), rule: up ? up.rule : wall ? 'against wall' : 'sits on the ground' };
  }

  const placed = (p, dx, dy, labels) => [...(p.shadows || []).map(q => ({ ...q, x: q.x + dx, y: q.y + dy })), { spr: p.spr, x: Math.round(p.x) + dx, y: Math.round(p.y) + dy, rule: p.rule, labels }];
  function plan(env, drops, seed) {
    const at = new Map(drops.map(d => [d.x + ',' + d.y, d])), kind = new Map(drops.map(d => [d, classify(d.item)]));
    const sorted = drops.slice().sort((a, b) => a.y - b.y || a.x - b.x), done = new Set(), out = [], piles = [];
    for (const d of sorted) {
      const k = kind.get(d);
      if (done.has(d) || !k.pile) continue;
      const run = [d];
      for (let n = at.get((d.x + 1) + ',' + d.y); n && run.length < 3 && env.zone(d.x, d.y) && n.item.id === d.item.id; n = at.get((d.x + run.length) + ',' + d.y)) run.push(n);
      run.forEach(e => done.add(e));
      const p = pilePlace(env, run, k, seed);
      run.forEach((e, i) => piles.push({ x: e.x, y: e.y, cls: k.pile, px: p.x + i * TILE, py: p.y }));
      out.push({ ...p, labels: run.map(e => label(e)) });
    }
    for (const d of sorted) {
      const k = kind.get(d);
      if (done.has(d)) continue;
      const p = k.long ? longPlace(env, d, k, seed, piles) : wornPlace(env, d, k, seed, piles);
      out.push(...placed(p, 0, 0, [label(d)]));
      for (let i = 1; i < Math.min(3, d.quantity) && k.long; i++) out.push(...placed(p, i * 5, i & 1, []));
    }
    return out;
  }
  return { classify, rampsFor, stageOf, plan, CAP, NAMES };
})();
