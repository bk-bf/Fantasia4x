'use strict';
const ECO = (() => {
  const CELL = 10, SEASON_DAYS = 12, YEAR = 48, SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
  const GROW = [1.5, 1, .5, .05], MAST = [.5, 1, 1.6, .1], HEAD_DAYS = 8, MEADOW = 0, FOREST = 1, SWAMP = 2, ROCK = 3, WATER = 4;
  const diel = pts => { const a = []; for (let h = 0; h < 24; h++) { let i = 0; while (i + 2 < pts.length && pts[i + 1][0] <= h) i++; const p = pts[i], q = pts[i + 1]; a.push(p[1] + (q[1] - p[1]) * clamp((h - p[0]) / (q[0] - p[0]), 0, 1)); } return a; };
  const CREP = diel([[0, .25], [4, .5], [6, 1], [9, .5], [12, .15], [16, .4], [19, 1], [22, .5], [24, .25]]);
  const NIGHT = diel([[0, 1], [4, .9], [7, .2], [16, .1], [19, .6], [21, 1], [24, 1]]);
  const DAY = diel([[0, .05], [5, .2], [7, .9], [12, 1], [17, .9], [20, .2], [24, .05]]);
  const DUSK = diel([[0, .7], [3, .5], [6, .6], [9, .15], [15, .15], [18, .9], [21, 1], [24, .7]]);
  const SUN = diel([[0, .05], [5, .7], [7, .9], [10, .3], [16, .3], [18, 1], [21, .6], [24, .05]]);
  const KINDS = {
    deer: { name: 'Red deer', plural: 'deer', prey: 1, mass: 25, size: [7, 18], cap: 24, fec: .55, speed: 60, roam: 9, active: CREP, land: MEADOW, danger: .02 },
    boar: { name: 'Wild boar', plural: 'boar', prey: 1, mass: 30, size: [4, 9], cap: 13, fec: .45, speed: 45, roam: 7, active: NIGHT, land: FOREST, danger: .1, eats: 1.3 },
    wolf: { name: 'Wolf pack', lair: 'Wolf den', style: 'pursuit', need: 2.2, size: [2, 4], cap: 8, range: 140, speed: 70, active: DUSK, skill: .44, litter: [2, 4], site: FOREST, breed: .9, floor: 2 },
    bear: { name: 'Bear', lair: 'Bear den', style: 'forage', need: 3.5, size: [1, 1], cap: 1, range: 80, speed: 40, active: DAY, skill: .3, litter: [1, 1], site: FOREST, sleeps: 1, breed: .4, floor: 1.3 },
    lurker: { name: 'Bog lurkers', lair: 'Fen nest', style: 'ambush', need: .8, size: [1, 2], cap: 3, range: 30, speed: 20, active: SUN, skill: .5, litter: [1, 1], site: SWAMP, sleeps: 1, breed: .5, floor: 2 },
    goblin: { name: 'Goblin band', lair: 'Goblin warren', style: 'raid', need: 1.2, size: [4, 6], cap: 11, range: 120, speed: 45, active: NIGHT, skill: .3, litter: [1, 2], site: FOREST, breed: .7, floor: 1.8 },
    harpy: { name: 'Harpies', lair: 'Harpy roost', style: 'stoop', need: 1, size: [1, 2], cap: 4, range: 170, speed: 110, active: DAY, skill: .5, litter: [1, 1], site: ROCK, breed: .5, floor: .7 },
  };
  const PREDATORS = ['wolf', 'bear', 'lurker', 'goblin', 'harpy'], ENTRY = [['wolf', .38], ['bear', .2], ['lurker', .16], ['goblin', .14], ['harpy', .12]];
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const dice = seed => { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

  function make(o) {
    const N = o.size, C = N / CELL, seed = o.seed || 7, land = new Uint8Array(C * C), K = new Float32Array(C * C), grass = new Float32Array(C * C), mast = new Float32Array(C * C), small = new Float32Array(C * C), shore = [];
    for (let cy = 0; cy < C; cy++) for (let cx = 0; cx < C; cx++) {
      const i = cy * C + cx, n = fbm(cx * .045, cy * .045, seed, 4), m = fbm(cx * .08 + 40, cy * .08, seed + 5, 3), river = Math.abs(cx - (C * .64 + Math.sin(cy * .07 + seed) * C * .1 + Math.sin(cy * .21) * 2.4));
      const t = n > .64 ? ROCK : river < 1.2 || m < .27 ? WATER : m < .335 ? SWAMP : n > .5 ? FOREST : MEADOW;
      land[i] = t;
      K[i] = t === MEADOW ? clamp(.45 + m * .8, .5, 1) : t === FOREST ? .28 : t === SWAMP ? .22 : t === ROCK ? .05 : 0;
      grass[i] = K[i] * .8; mast[i] = t === FOREST ? 1 : t === SWAMP ? .35 : t === MEADOW ? .15 : .05; small[i] = t === WATER ? 0 : t === MEADOW ? .6 : t === ROCK ? .5 : .35;
    }
    for (let cy = 1; cy < C - 1; cy++) for (let cx = 1; cx < C - 1; cx++) if (land[cy * C + cx] !== WATER && [1, -1, C, -C].some(d => land[cy * C + cx + d] === WATER)) shore.push({ x: cx * CELL + 5, y: cy * CELL + 5 });
    const S = { N, C, seed, land, K, grass, mast, small, shore, day: 0, hour: 0, groups: [], lairs: [], events: [], hist: [], marks: [], ids: 0, r: dice(seed * 13 + 1), o,
      wx: { kind: 'clear', left: 0, hard: false }, colony: !o.colony || o.colony === 'none' ? null : { x: N / 2, y: N / 2, r: 40, stores: 300, hunters: 2, grow: o.colony === 'growing' } };
    for (let i = 0; i < Math.round(C * C / 330); i++) arrive(S, i % 4 ? 'deer' : 'boar', true);
    return S;
  }
  const cellOf = (S, x, y) => clamp(Math.floor(y / CELL), 0, S.C - 1) * S.C + clamp(Math.floor(x / CELL), 0, S.C - 1);
  const season = S => Math.floor((S.day % YEAR) / SEASON_DAYS), year = S => Math.floor(S.day / YEAR) + 1;
  const stamp = S => `Y${year(S)} ${SEASONS[season(S)]} ${S.day % SEASON_DAYS + 1}`;
  const say = (S, type, text, at) => { S.events.push({ day: S.day, when: stamp(S), type, text, x: at.x, y: at.y }); if (S.events.length > 400) S.events.shift(); };
  const tell = (S, lair, text) => { if (lair) lair.story.push(stamp(S) + ' · ' + text); };
  const edgePoint = S => { const t = S.r() * S.N, side = Math.floor(S.r() * 4); return side === 0 ? { x: t, y: 2 } : side === 1 ? { x: S.N - 2, y: t } : side === 2 ? { x: t, y: S.N - 2 } : { x: 2, y: t }; };
  const nearestEdge = (S, g) => { const d = [g.x, S.N - g.x, g.y, S.N - g.y], m = Math.min(...d); return m === d[0] ? { x: -20, y: g.y } : m === d[1] ? { x: S.N + 20, y: g.y } : m === d[2] ? { x: g.x, y: -20 } : { x: g.x, y: S.N + 20 }; };
  const group = (S, kind, at, n) => { const g = { id: ++S.ids, kind, k: KINDS[kind], x: at.x, y: at.y, px: at.x, py: at.y, n, young: 0, cond: .8, state: 'arriving', goal: null, home: null, lair: null, larder: 0, hungry: 0, lean: 0, wait: 0, tries: 0, eaten: 0, avoid: [], target: null, seen: null }; S.groups.push(g); return g; };

  function pasture(S, g, from, radius, wide) {
    let best = null, top = -1e9;
    for (let n = 0; n < (wide ? 70 : 22); n++) {
      const a = S.r() * 6.283, d = Math.sqrt(S.r()) * radius, x = clamp(from.x + Math.cos(a) * d * CELL, 8, S.N - 8), y = clamp(from.y + Math.sin(a) * d * CELL, 8, S.N - 8), i = cellOf(S, x, y);
      if (S.land[i] === WATER || S.land[i] === ROCK) continue;
      let v = S.grass[i] * HEAD_DAYS + (S.land[i] === g.k.land ? 1.2 : 0) - d * (wide ? .05 : .22);
      for (const m of g.avoid) if (Math.hypot(x - m.x, y - m.y) < m.r) v -= 6;
      if (S.colony && Math.hypot(x - S.colony.x, y - S.colony.y) < S.colony.r * 1.1) v -= 8;
      if (v > top) { top = v; best = { x, y }; }
    }
    return best || { x: from.x, y: from.y };
  }
  function arrive(S, kind, seeded) {
    const k = KINDS[kind], at = seeded ? { x: 30 + S.r() * (S.N - 60), y: 30 + S.r() * (S.N - 60) } : edgePoint(S), g = group(S, kind, at, Math.round(k.size[0] + S.r() * (k.size[1] - k.size[0])));
    if (k.prey) { g.home = pasture(S, g, at, seeded ? 6 : 22, true); g.goal = g.home; if (seeded) { g.x = g.px = g.home.x; g.y = g.py = g.home.y; g.state = 'grazing'; } else say(S, 'in', `A herd of ${g.n} ${k.plural} came in from the map edge`, at); }
    else { g.larder = k.need * g.n * 2; g.goal = site(S, g); if (!g.goal) { g.n = 0; return g; } g.state = 'wandering'; say(S, 'in', `${k.name} of ${g.n} came in from the map edge`, at); }
    return g;
  }

  function site(S, g) {
    const k = g.k;
    let best = null, top = -1e9;
    for (let n = 0; n < 110; n++) {
      const x = 30 + S.r() * (S.N - 60), y = 30 + S.r() * (S.N - 60), i = cellOf(S, x, y), d = Math.hypot(x - g.x, y - g.y);
      if (S.land[i] !== k.site || d > S.N * .6) continue;
      let v = -d * .004;
      if (k.style === 'stoop') v += S.small[i] * 2;
      else if (k.style === 'forage') { for (let j = 0; j < 12; j++) v += S.mast[cellOf(S, x + (S.r() - .5) * k.range * 2, y + (S.r() - .5) * k.range * 2)] * .25; }
      else for (const h of S.groups) if (h.k.prey) { const hd = Math.hypot(h.x - x, h.y - y); if (hd < k.range * 1.2) v += h.n / (6 + hd / k.range * 10); }
      if (k.style === 'ambush') v += 3 - Math.min(3, Math.min(...S.shore.filter((_, q) => q % 9 === 0).map(p => Math.hypot(p.x - x, p.y - y))) / 20);
      for (const l of S.lairs) {
        const ld = Math.hypot(l.x - x, l.y - y);
        if (l.owner && ld < (KINDS[l.kind].range + k.range) * .55) v -= l.kind === g.kind ? 9 : 3;
        if (!l.owner && l.kind === g.kind && ld < 40) v += 2.5;
      }
      if (S.colony && Math.hypot(x - S.colony.x, y - S.colony.y) < S.colony.r + k.range * .8) v -= 7;
      if (v > top) { top = v; best = { x, y }; }
    }
    return top >= k.floor ? best : null;
  }
  function settle(S, g) {
    const old = S.lairs.filter(l => !l.owner && l.kind === g.kind && dist(l, g) < 45).sort((a, b) => dist(a, g) - dist(b, g))[0];
    const rival = S.groups.find(p => p !== g && p.kind === g.kind && p.lair && dist(p.lair, g) < g.k.range * .6);
    if (rival) {
      const mine = g.n * g.cond * (.8 + S.r() * .4), theirs = rival.n * rival.cond * (.9 + S.r() * .4), loser = mine > theirs ? rival : g;
      loser.n = Math.max(0, loser.n - 1);
      say(S, 'clash', `${g.k.name}s fought over the ${rival.lair.name}. The ${mine > theirs ? 'newcomers took it' : 'residents held it'}`, rival.lair);
      if (mine > theirs) { tell(S, rival.lair, 'taken by a rival ' + g.k.name.toLowerCase()); const l = rival.lair; evict(S, rival, 'driven out'); own(S, g, l); } else { g.tries++; g.goal = g.tries > 1 ? nearestEdge(S, g) : site(S, g); g.state = g.tries > 1 ? 'leaving' : 'wandering'; }
      return;
    }
    if (old) { own(S, g, old); tell(S, old, `reoccupied by ${g.n}`); say(S, 'found', `${g.k.name} moved into the abandoned ${old.name}`, old); return; }
    const l = { id: S.lairs.length + 1, kind: g.kind, x: g.x, y: g.y, founded: S.day, left: -1, owner: null, kills: 0, peak: 0, story: [], name: g.k.lair + ' ' + (S.lairs.filter(q => q.kind === g.kind).length + 1) };
    S.lairs.push(l); own(S, g, l); tell(S, l, `founded by ${g.n} that walked in`); say(S, 'found', `${g.k.name} founded the ${l.name}`, l);
  }
  const own = (S, g, l) => { g.lair = l; l.owner = g.id; l.left = -1; g.x = l.x; g.y = l.y; g.state = 'resting'; g.goal = null; g.tries = 0; };
  function evict(S, g, why) {
    const l = g.lair;
    if (l) { l.owner = null; l.left = S.day; tell(S, l, 'abandoned: ' + why); say(S, 'gone', `The ${l.name} was abandoned: ${why}`, l); }
    g.lair = null; g.target = null;
    if (g.n <= 0) return;
    g.goal = g.tries > 0 || g.cond < .35 ? nearestEdge(S, g) : site(S, g); g.state = g.goal && g.goal.x > 0 && g.goal.x < S.N && g.goal.y > 0 && g.goal.y < S.N ? 'wandering' : 'leaving'; g.tries++;
  }

  function move(S, g, to, speed) {
    const d = Math.hypot(to.x - g.x, to.y - g.y);
    if (d <= speed) { g.x = to.x; g.y = to.y; return true; }
    g.x += (to.x - g.x) / d * speed; g.y += (to.y - g.y) / d * speed;
    return false;
  }
  function scare(S, h, from, far) {
    const a = Math.atan2(h.y - from.y, h.x - from.x) + (S.r() - .5) * .9, d = far || 45 + S.r() * 35;
    h.goal = { x: clamp(h.x + Math.cos(a) * d, 10, S.N - 10), y: clamp(h.y + Math.sin(a) * d, 10, S.N - 10) }; h.state = 'fleeing'; h.wait = 3; h.cond = Math.max(.05, h.cond - .03);
    h.avoid.push({ x: from.x, y: from.y, r: 60, until: S.day + 5 });
    if (h.avoid.length > 6) h.avoid.shift();
  }
  function kill(S, p, h, by) {
    h.n--;
    S.marks.push({ x: h.x, y: h.y, day: S.day, kind: p.kind }); if (S.marks.length > 160) S.marks.shift();
    let meat = h.k.mass * (p.lair && dist(p.lair, h) > p.k.range ? .6 : 1);
    const thief = S.groups.find(b => b.kind === 'bear' && b !== p && b.lair && b.state !== 'asleep' && dist(b.lair, h) < b.k.range && b.k.active[S.hour] > .5);
    if (thief && p.kind !== 'bear' && S.r() < .5) { thief.larder += meat * .5; meat *= .5; say(S, 'steal', `The bear from the ${thief.lair.name} took half of a kill from the ${p.lair ? p.lair.name : p.k.name.toLowerCase()}`, h); }
    p.larder += meat; p.seen = { x: h.x, y: h.y };
    if (p.lair) p.lair.kills++;
    if (S.r() < h.k.danger * (by || 1)) { p.n--; say(S, 'death', `The ${p.lair ? p.lair.name : p.k.name} lost a hunter to a ${h.k.name.toLowerCase()}`, h); tell(S, p.lair, 'lost a hunter to a ' + h.k.name.toLowerCase()); }
    scare(S, h, p);
  }

  function herd(S, g, h) {
    const k = g.k, act = k.active[h], sp = k.speed * (g.state === 'fleeing' ? 1.5 : .5 + act * .5), i = cellOf(S, g.x, g.y);
    if (g.state === 'fleeing' || g.state === 'arriving' || g.state === 'migrating') {
      const there = move(S, g, g.goal, sp), was = g.state;
      if (was === 'migrating') { if (there) g.n = 0; return; }
      if (there || (was === 'fleeing' && --g.wait <= 0)) { if (was === 'arriving') g.home = { x: g.x, y: g.y }; g.state = 'grazing'; g.goal = null; }
      return;
    }
    if (g.state === 'drinking') { if (--g.wait <= 0) { g.state = 'grazing'; g.goal = pasture(S, g, g.home, k.roam); } return; }
    if (g.state === 'thirsty') { if (move(S, g, g.goal, sp)) { g.state = 'drinking'; g.wait = 2; } return; }
    const hours = S.wx.kind === 'drought' ? [g.id % 3 + 5, g.id % 3 + 17] : [g.id % 2 ? g.id % 3 + 5 : g.id % 3 + 17];
    if (hours.includes(h)) { let best = null, bd = 260; for (const p of S.shore) { const d = Math.hypot(p.x - g.x, p.y - g.y); if (d < bd) { bd = d; best = p; } } if (best && bd < 130) { g.goal = best; g.state = 'thirsty'; return; } }
    if (act < .3 && g.lean < 2) { g.state = 'resting'; return; }
    g.state = 'grazing';
    const there = g.goal && Math.hypot(g.goal.x - g.x, g.goal.y - g.y) <= 6;
    if (!g.goal || (there && (S.grass[i] < S.K[i] * .35 || S.land[i] === WATER))) g.goal = pasture(S, g, g.home, k.roam);
    else if (!there) move(S, g, g.goal, sp);
    const j = cellOf(S, g.x, g.y), want = g.n * act / 12 / HEAD_DAYS * (1.15 + g.lean * .2 + (g.cond < .6 ? .3 : 0)), got = Math.min(want, Math.max(0, S.grass[j] - S.K[j] * .08));
    S.grass[j] -= got; g.eaten += got * HEAD_DAYS;
    if (k.land === FOREST) { const m = Math.min(S.mast[j] * MAST[season(S)] * .2, g.n * act / 12 / 6); S.mast[j] = Math.max(0, S.mast[j] - m * .5); g.eaten += m * 6; }
  }

  function prowl(S, g, h) {
    const k = g.k, act = k.active[h], asleep = k.sleeps && season(S) === 3, need = k.need * (g.n + g.young * .5), stock = need ? g.larder / need : 9;
    if (g.state === 'wandering' || g.state === 'leaving') {
      if (!g.goal) { g.goal = nearestEdge(S, g); g.state = 'leaving'; }
      if (move(S, g, g.goal, k.speed * .7)) { if (g.state === 'leaving') { say(S, 'out', `${k.name} of ${g.n} left the map`, g); g.n = 0; } else settle(S, g); }
      return;
    }
    if (asleep) { g.state = 'asleep'; move(S, g, g.lair, k.speed); return; }
    if (g.state === 'asleep') g.state = 'resting';
    if (g.state === 'returning') { if (move(S, g, g.lair, k.speed * .8)) { g.state = g.larder > need * .5 ? 'feeding' : 'resting'; g.wait = 3; } return; }
    if (g.state === 'feeding') { if (--g.wait <= 0) g.state = 'resting'; return; }
    if (g.state === 'raiding') {
      if (!S.colony) { g.state = 'returning'; return; }
      if (move(S, g, S.colony, k.speed)) { const take = Math.min(S.colony.stores, need * 5); S.colony.stores -= take; g.larder += take; g.state = 'returning'; say(S, 'raid', `${g.lair.name}: raiders took ${Math.round(take)} kg from the colony stores`, S.colony); tell(S, g.lair, 'raided the colony'); if (S.r() < .3) { g.n--; tell(S, g.lair, 'lost a raider at the colony'); } }
      return;
    }
    if (g.state === 'hunting') {
      const t = S.groups.find(q => q.id === g.target);
      if (!t || t.n <= 0 || --g.wait <= 0) { g.state = 'returning'; g.target = null; return; }
      if (!move(S, g, t, k.speed)) return;
      const snow = S.wx.kind === 'snow' ? .2 : S.wx.kind === 'storm' ? -.15 : 0, p = clamp(k.skill * (.5 + .12 * Math.min(g.n, 6)) * (1.35 - .7 * t.cond) + snow - (t.state === 'fleeing' ? .15 : 0), .06, .85);
      if (S.r() < p) { kill(S, g, t); g.state = 'returning'; g.target = null; }
      else { scare(S, t, g); g.tries++; g.wait = 3; if (g.tries > 1) { g.state = 'returning'; g.target = null; } }
      return;
    }
    if (k.style === 'ambush') {
      g.state = act > .6 ? 'lying in wait' : 'basking';
      if (act > .6) for (const t of S.groups) if (t.k.prey && t.state === 'drinking' && t.wait === 2 && dist(t, g.lair) < k.range && S.r() < k.skill * (stock < 1 ? 1 : .4)) { kill(S, g, t); break; }
      return;
    }
    if (k.style === 'forage') {
      g.state = act > .4 ? 'foraging' : 'resting';
      if (act <= .4) { move(S, g, g.lair, k.speed); return; }
      if (!g.goal || Math.hypot(g.goal.x - g.x, g.goal.y - g.y) < 8) { const a = S.r() * 6.283, d = S.r() * k.range; g.goal = { x: clamp(g.lair.x + Math.cos(a) * d, 5, S.N - 5), y: clamp(g.lair.y + Math.sin(a) * d, 5, S.N - 5) }; }
      move(S, g, g.goal, k.speed * .4);
      const j = cellOf(S, g.x, g.y), m = Math.min(S.mast[j] * MAST[season(S)], need * 1.6 / 8);
      S.mast[j] = Math.max(0, S.mast[j] - m * .12); g.larder += m;
      const boar = stock < 1.5 && S.groups.find(t => t.kind === 'boar' && dist(t, g) < 25);
      if (boar && S.r() < .12) kill(S, g, boar, .5);
      return;
    }
    if (k.style === 'stoop') {
      const grounded = S.wx.kind === 'storm';
      g.state = grounded ? 'grounded' : act > .5 && stock < 1.5 ? 'hunting' : 'resting';
      if (g.state !== 'hunting') { move(S, g, g.lair, k.speed); return; }
      if (!g.goal || Math.hypot(g.goal.x - g.x, g.goal.y - g.y) < 10) { const a = S.r() * 6.283, d = S.r() * k.range; g.goal = { x: clamp(g.lair.x + Math.cos(a) * d, 5, S.N - 5), y: clamp(g.lair.y + Math.sin(a) * d, 5, S.N - 5) }; }
      if (move(S, g, g.goal, k.speed * .6)) { const j = cellOf(S, g.x, g.y), take = Math.min(S.small[j], .22); S.small[j] -= take; g.larder += take * 9; if (take > .1) g.lair.kills++; }
      return;
    }
    g.state = 'resting';
    if (g.wait > 0) { g.wait--; return; }
    const drive = clamp(1.6 - stock, 0, 1.6);
    if (drive * (.25 + act) < .6) return;
    if (k.style === 'raid' && S.colony && g.hungry >= 2 && dist(g.lair, S.colony) < k.range * 2.2 && S.colony.stores > 20) { g.state = 'raiding'; return; }
    if (k.style === 'pursuit' && S.colony && g.hungry >= 4 && dist(g.lair, S.colony) < k.range * 1.6) { g.larder += 28; g.wait = 10; say(S, 'raid', `The ${g.lair.name} took an animal from the colony pens`, S.colony); tell(S, g.lair, 'took livestock from the colony'); if (S.r() < .25) { g.n--; tell(S, g.lair, 'lost a wolf at the pens'); } return; }
    const reach = k.range * (1 + Math.min(g.hungry, 6) * .12);
    let best = null, bd = 1e9;
    for (const t of S.groups) if (t.k.prey && t.n > 0) { const d = dist(t, g.lair); if (d < reach && d + S.r() * 20 < bd) { bd = d + S.r() * 20; best = t; } }
    if (!best) { g.wait = 6; return; }
    g.state = 'hunting'; g.target = best.id; g.tries = 0; g.wait = 9;
  }

  function weather(S) {
    const w = S.wx, s = season(S), d = S.day % YEAR;
    if (d === 36) { w.hard = S.r() < .22; if (w.hard) say(S, 'weather', 'A hard winter set in', { x: S.N / 2, y: S.N / 2 }); }
    if (d === 0) w.hard = false;
    if (--w.left > 0) return;
    const r = S.r();
    w.kind = s === 3 ? (w.hard || r < .4 ? 'snow' : 'clear') : s === 1 ? (r < .035 ? 'drought' : r < .1 ? 'storm' : 'clear') : r < .28 ? 'rain' : r < .34 ? 'storm' : 'clear';
    w.left = w.kind === 'drought' ? 7 + Math.floor(S.r() * 5) : w.kind === 'snow' && w.hard ? 4 : 1 + Math.floor(S.r() * 2);
    if (w.kind === 'drought') say(S, 'weather', 'A drought began', { x: S.N / 2, y: S.N / 2 });
  }
  function force(S, kind) { if (kind === 'winter') { S.wx.hard = true; S.wx.kind = 'snow'; S.wx.left = 6; } else { S.wx.kind = kind; S.wx.left = kind === 'drought' ? 9 : 3; } say(S, 'weather', kind === 'winter' ? 'A hard spell of snow set in' : 'A ' + kind + ' began', { x: S.N / 2, y: S.N / 2 }); }

  function daily(S) {
    const s = season(S), d = S.day % YEAR, w = S.wx, grow = GROW[s] * (w.kind === 'rain' ? 1.35 : w.kind === 'drought' ? .12 : 1), C2 = S.C * S.C;
    let total = 0, cap = 0;
    for (let i = 0; i < C2; i++) {
      const K = S.K[i]; if (!K) continue;
      const g = Math.max(S.grass[i], K * .06);
      S.grass[i] = Math.min(K, S.grass[i] + .13 * g * (1 - g / K) * grow);
      if (s === 3 && w.hard) S.grass[i] *= .97;
      total += S.grass[i]; cap += K;
      S.mast[i] = Math.min(S.land[i] === FOREST ? 1 : .35, S.mast[i] + .05); S.small[i] = Math.min(.6, S.small[i] + .02 * (s === 3 ? .3 : 1));
    }
    const col = S.colony;
    if (col) {
      if (col.grow) { col.r = 40 + (S.day / YEAR) * 16; col.hunters = Math.min(9, 2 + Math.floor(S.day / YEAR * 1.5)); }
      col.stores = Math.min(900, col.stores + 6 + col.r * .12);
      for (let q = 0; q < col.hunters; q++) { const t = S.groups.filter(g => g.k.prey && g.n > 0 && dist(g, col) < col.r + 130).sort((a, b) => dist(a, col) - dist(b, col))[0]; if (t && S.r() < .32) { t.n--; col.stores += t.k.mass; scare(S, t, col, 70); t.avoid.push({ x: col.x, y: col.y, r: col.r + 90, until: S.day + 12 }); } }
      for (const g of S.groups) if (!g.k.prey && g.lair && dist(g.lair, col) < col.r + 25 && S.r() < .2) { g.n = Math.max(0, g.n - 2); say(S, 'clash', `Colonists attacked the ${g.lair.name}`, g.lair); tell(S, g.lair, 'attacked by colonists'); if (g.n <= 0) evict(S, g, 'cleared by colonists'); }
      for (let i = 0; i < C2; i++) { const x = (i % S.C) * CELL + 5, y = Math.floor(i / S.C) * CELL + 5; if (Math.hypot(x - col.x, y - col.y) < col.r * .8) { S.grass[i] = Math.min(S.grass[i], S.K[i] * .1); } }
    }
    for (const g of S.groups) {
      const k = g.k;
      g.avoid = g.avoid.filter(m => m.until > S.day);
      if (k.prey) {
        const fed = g.n ? g.eaten / g.n / (k.eats || 1) : 1; g.eaten = 0;
        g.cond = clamp(g.cond + (fed - .72) * .22 - (w.kind === 'snow' ? (w.hard ? .05 : .015) : 0), .02, 1);
        g.lean = fed < .6 ? g.lean + 1 : 0;
        if (g.cond < .2) g.n -= Math.max(1, Math.round(g.n * .05 * (1 + S.r())));
        if (S.r() < g.n * .002) g.n--;
        if (s === 0 && d % 3 === 0) g.n += Math.round(g.n * k.fec * g.cond / 4 + S.r() * .6 - .1);
        const mate = g.n < k.cap * .4 && S.groups.find(q => q !== g && q.kind === g.kind && q.n > 0 && q.n + g.n <= k.cap * .8 && dist(q, g) < 30);
        if (mate) { mate.n += g.n; mate.cond = (mate.cond + g.cond) / 2; g.n = 0; continue; }
        if (g.n > k.cap) { const half = Math.floor(g.n / 2), o = group(S, g.kind, g, half); g.n -= half; o.cond = g.cond; o.home = pasture(S, o, g, 26, true); o.goal = o.home; o.state = 'arriving'; }
        if (g.lean > 5 && g.state !== 'migrating') { const far = pasture(S, g, g, 30, true); if (S.grass[cellOf(S, far.x, far.y)] * HEAD_DAYS > 2.5) { g.home = far; g.goal = far; g.state = 'arriving'; g.lean = 0; } else if (g.lean > 9) { g.goal = nearestEdge(S, g); g.state = 'migrating'; say(S, 'out', `A starving herd of ${g.n} ${k.plural} left the map`, g); } }
        continue;
      }
      const asleep = k.sleeps && s === 3, need = asleep ? 0 : k.need * (g.n + g.young * .5) * (k.sleeps && s === 2 ? 1.3 : 1);
      if (k.style === 'raid' && s !== 3) g.larder += need * .3;
      g.larder -= need;
      if (g.larder < 0) { g.larder = 0; g.hungry++; g.cond = Math.max(.05, g.cond - .1); } else { g.hungry = 0; g.cond = Math.min(1, g.cond + .06); }
      g.larder = Math.min(g.larder, k.need * (g.n + g.young) * (k.sleeps ? 14 : 4));
      if (g.hungry >= 3 && g.young > 0 && S.r() < .5) { g.young--; tell(S, g.lair, 'a pup starved'); }
      if (g.hungry >= 5 && S.r() < .35) { g.n--; tell(S, g.lair, 'one starved'); if (g.lair) say(S, 'death', `One starved at the ${g.lair.name}`, g.lair); }
      if (S.r() < g.n * .0015) { g.n--; tell(S, g.lair, 'one died of age'); }
      if (g.lair) { g.lair.peak = Math.max(g.lair.peak, g.n + g.young); if (g.n <= 0) evict(S, g, g.hungry ? 'starved out' : 'the last one died'); else if (g.hungry >= 7) evict(S, g, 'left for lack of prey'); }
      if (!g.lair || g.n <= 0) continue;
      if (d === 1 && g.young) { for (let q = g.young; q > 0; q--) if (S.r() < .7) g.n++; g.young = 0; if (g.n > k.cap) { const out = Math.max(1, Math.floor(g.n / 2.5)), o = group(S, g.kind, g, out); g.n -= out; o.larder = k.need * out * 2; o.cond = g.cond; o.goal = site(S, o); o.state = o.goal ? 'wandering' : 'leaving'; if (!o.goal) o.goal = nearestEdge(S, o); say(S, 'split', `${out} left the ${g.lair.name} to find ground of their own`, g.lair); tell(S, g.lair, out + ' left to found their own'); } }
      if (d === 3 && g.cond > .6 && stockDays(g) > .6 && (g.n >= 2 || k.cap === 1) && S.r() < k.breed) { g.young = Math.round(k.litter[0] + S.r() * (k.litter[1] - k.litter[0])); tell(S, g.lair, g.young + ' young born'); }
    }
    S.groups = S.groups.filter(g => g.n > 0);
    const prey = S.groups.filter(g => g.k.prey), out = S.o.outside === undefined ? 1 : S.o.outside, pn = prey.reduce((a, g) => a + g.n, 0), packs = S.groups.filter(g => !g.k.prey);
    for (const kind of ['deer', 'boar']) { const want = S.C * S.C / (kind === 'deer' ? 420 : 1300) * out; if (prey.filter(g => g.kind === kind).length < want * .7 && S.r() < .3 * out) arrive(S, kind); }
    if (S.r() < .07 * out * clamp(pn / (22 * (1 + packs.length)), .1, 2.5)) { let v = S.r(), kind = 'wolf'; for (const [q, wt] of ENTRY) { v -= wt; if (v <= 0) { kind = q; break; } } if (!(KINDS[kind].sleeps && s === 3)) arrive(S, kind); }
    S.hist.push({ prey: pn, pred: packs.reduce((a, g) => a + g.n + g.young, 0), grass: cap ? total / cap : 0, lairs: S.lairs.filter(l => l.owner).length, empty: S.lairs.filter(l => !l.owner).length });
    if (S.hist.length > 600) S.hist.shift();
  }
  const stockDays = g => { const need = g.k.need * (g.n + g.young * .5); return need ? g.larder / need : 9; };

  function hour(S) {
    for (const g of S.groups) { g.px = g.x; g.py = g.y; }
    for (const g of S.groups.slice()) if (g.n > 0) (g.k.prey ? herd : prowl)(S, g, S.hour);
    if (++S.hour === 24) { S.hour = 0; S.day++; weather(S); daily(S); }
  }
  const age = (S, l) => l.owner ? 'lived in' : S.day - l.left < SEASON_DAYS ? 'abandoned' : S.day - l.left < YEAR ? 'overgrown' : 'ruin';
  return { make, hour, force, KINDS, PREDATORS, SEASONS, YEAR, SEASON_DAYS, CELL, season, year, stamp, age, stockDays, MEADOW, FOREST, SWAMP, ROCK, WATER };
})();
if (typeof module !== 'undefined') module.exports = ECO;
