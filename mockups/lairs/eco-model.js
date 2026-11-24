'use strict';
const ECO = (() => {
  const CELL = 10, SEASON_DAYS = 15, YEAR = 60, SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'], DAY_MIN = 5, LANDING = 70;
  const GROW = [1.5, 1, .5, .05], MAST = [.5, 1, 1.6, .1], HEAD_DAYS = 8, MEADOW = 0, FOREST = 1, SWAMP = 2, ROCK = 3, WATER = 4;
  const diel = pts => { const a = []; for (let h = 0; h < 24; h++) { let i = 0; while (i + 2 < pts.length && pts[i + 1][0] <= h) i++; const p = pts[i], q = pts[i + 1]; a.push(p[1] + (q[1] - p[1]) * clamp((h - p[0]) / (q[0] - p[0]), 0, 1)); } return a; };
  const CLOCKS = {
    crep: diel([[0, .25], [4, .5], [6, 1], [9, .5], [12, .15], [16, .4], [19, 1], [22, .5], [24, .25]]),
    night: diel([[0, 1], [4, .9], [7, .2], [16, .1], [19, .6], [21, 1], [24, 1]]),
    day: diel([[0, .05], [5, .2], [7, .9], [12, 1], [17, .9], [20, .2], [24, .05]]),
    dusk: diel([[0, .7], [3, .5], [6, .6], [9, .15], [15, .15], [18, .9], [21, 1], [24, .7]]),
    sun: diel([[0, .05], [5, .7], [7, .9], [10, .3], [16, .3], [18, 1], [21, .6], [24, .05]]),
  };
  const PRESENT = { common: .95, uncommon: .65, rare: .35 };
  let KINDS = {};
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const dice = seed => { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  const fresh = () => ({ kills: 0, tried: 0, won: 0, preyBorn: 0, preyStarved: 0, preyAged: 0, preyHunted: 0, predBorn: 0, predStarved: 0, predHunting: 0, predFight: 0, predAged: 0, predColony: 0, herdsIn: 0, herdsOut: 0, packsIn: 0, packsOut: 0, founded: 0, reoccupied: 0, abandoned: 0, fights: 0, stolen: 0, raids: 0, fires: 0, risen: 0, passed: 0, grassLow: 1 });
  const variant = g => { const all = g.k.tiers.filter(t => t.tier === g.tier), l = all.filter(t => !t.young).length ? all.filter(t => !t.young) : all; return l.length ? l[g.id % l.length] : g.k.tiers[g.k.tiers.length - 1]; };
  const threatOf = g => variant(g).threat;
  const danger = g => g.k.prey && g.k.temper < .6 ? 0 : g.n * threatOf(g) * g.k.temper + g.young * g.k.temper;
  const many = (name, n) => { const s = name.toLowerCase(); return n === 1 ? s : /wolf$/.test(s) ? s.slice(0, -1) + 'ves' : /(s|x|ch)$/.test(s) ? s + 'es' : s + 's'; };
  const PACK_KG = 5, MAST_KG = 1.5, BLOOD = .04, CATCH = .4;

  function make(o) {
    KINDS = o.lines;
    for (const k of Object.values(KINDS)) k.clock = CLOCKS[k.active] || CLOCKS.day;
    const N = o.size, C = N / CELL, seed = o.seed || 7, land = new Uint8Array(C * C), K = new Float32Array(C * C), grass = new Float32Array(C * C), mast = new Float32Array(C * C), small = new Float32Array(C * C), burn = new Int32Array(C * C).fill(-1), shore = [], share = [0, 0, 0, 0, 0];
    for (let cy = 0; cy < C; cy++) for (let cx = 0; cx < C; cx++) {
      const i = cy * C + cx, n = fbm(cx * .045, cy * .045, seed, 4), m = fbm(cx * .08 + 40, cy * .08, seed + 5, 3), river = Math.abs(cx - (C * .64 + Math.sin(cy * .07 + seed) * C * .1 + Math.sin(cy * .21) * 2.4));
      const t = n > .64 ? ROCK : river < 1.2 || m < .27 ? WATER : m < .345 ? SWAMP : n > .5 ? FOREST : MEADOW;
      land[i] = t; share[t]++;
      K[i] = t === MEADOW ? clamp(.45 + m * .8, .5, 1) : t === FOREST ? .28 : t === SWAMP ? .22 : t === ROCK ? .14 : 0;
      grass[i] = K[i] * .8; mast[i] = t === FOREST ? 1 : t === SWAMP ? .35 : t === MEADOW ? .15 : .05; small[i] = t === WATER ? 0 : t === MEADOW ? .6 : t === ROCK ? .5 : .35;
    }
    for (let cy = 1; cy < C - 1; cy++) for (let cx = 1; cx < C - 1; cx++) if (land[cy * C + cx] !== WATER && [1, -1, C, -C].some(d => land[cy * C + cx + d] === WATER)) shore.push({ x: cx * CELL + 5, y: cy * CELL + 5 });
    const dry = C * C - share[WATER], frac = { plains: share[MEADOW] / dry, forest: share[FOREST] / dry, swamp: share[SWAMP] / dry, mountain: share[ROCK] / dry };
    const S = { N, C, seed, land, K, K0: K.slice(), grass, mast, small, burn, shore, day: 0, hour: 0, t: 0, groups: [], gone: [], lairs: [], names: {}, bounty: { kg: 0, yield: 0, demand: 0, spare: 0 }, prod: 0, bornKg: 0, fires: [], events: [], hist: [], marks: [], years: [], log: [], tally: fresh(), ids: 0, said: 0, r: dice(seed * 13 + 1), o,
      wx: { kind: 'clear', left: 0, hard: false }, colony: null, cast: {}, fit: {}, bal: { ema: 0, target: 0, mult: 1, dull: 0 } };
    for (const [id, k] of Object.entries(KINDS)) {
      const fit = clamp(Object.entries(k.biomes).reduce((a, [b, w]) => a + w * (frac[b] || 0), 0) * 1.9, 0, 1);
      S.fit[id] = fit;
      S.cast[id] = fit > .08 && S.r() < PRESENT[k.rarity] * clamp(fit * 1.6, 0, 1);
    }
    for (const id of Object.keys(KINDS).filter(id => KINDS[id].prey && KINDS[id].rarity === 'common').sort((a, b) => S.fit[b] - S.fit[a]).slice(0, 2)) S.cast[id] = true;
    for (const [id, k] of Object.entries(KINDS)) if (k.prey && S.cast[id]) for (let i = 0; i < Math.round(k.want * S.fit[id] * C * C / 10000 * .6); i++) arrive(S, id, true);
    S.prod = S.groups.reduce((a, g) => a + g.n * g.k.mass, 0) * .015; S.rate = .015; S.trace = o.trace ? [] : null; S.stats = {};
    return S;
  }
  const count = (S, kind, key, n) => { if (S.trace && n) { const b = S.stats[kind] = S.stats[kind] || {}; b[key] = (b[key] || 0) + n; } };
  const trace = (S, ev, rec) => { if (S.trace) S.trace.push({ ev, day: S.day, ...rec }); };
  const cellOf = (S, x, y) => clamp(Math.floor(y / CELL), 0, S.C - 1) * S.C + clamp(Math.floor(x / CELL), 0, S.C - 1);
  const season = S => Math.floor((S.day % YEAR) / SEASON_DAYS), year = S => Math.floor(S.day / YEAR) + 1;
  const stamp = S => `Y${year(S)} ${SEASONS[season(S)]} ${S.day % SEASON_DAYS + 1}`;
  const say = (S, type, at) => { S.said++; S.events.push({ type, x: at.x, y: at.y }); if (S.events.length > 60) S.events.shift(); };
  const tell = (S, lair, text) => { if (lair) { lair.story.push(stamp(S) + ' · ' + text); if (lair.story.length > 40) lair.story.shift(); } };
  const edgePoint = S => { const t = S.r() * S.N, side = Math.floor(S.r() * 4); return side === 0 ? { x: t, y: 2 } : side === 1 ? { x: S.N - 2, y: t } : side === 2 ? { x: t, y: S.N - 2 } : { x: 2, y: t }; };
  const nearestEdge = (S, g) => { const d = [g.x, S.N - g.x, g.y, S.N - g.y], m = Math.min(...d); return m === d[0] ? { x: -20, y: g.y } : m === d[1] ? { x: S.N + 20, y: g.y } : m === d[2] ? { x: g.x, y: -20 } : { x: g.x, y: S.N + 20 }; };
  const group = (S, kind, at, n, tier) => { const g = { id: ++S.ids, kind, k: KINDS[kind], tier: tier || 2, held: 0, x: at.x, y: at.y, px: at.x, py: at.y, n, young: 0, cond: .8, state: 'arriving', goal: null, home: null, lair: null, larder: 0, hungry: 0, lean: 0, wait: 0, tries: 0, eaten: 0, avoid: [], target: null, kills: 0, lost: 0, born: 0, won: 0, beat: 0, plenty: 1, mood: 'hunting', hunts: 0, caught: 0, looked: 0, none: 0, intake: 0, needed: 0, prevL: 0, recent: 1, peak: n, from: S.day, came: 'walked in', fate: null }; S.groups.push(g); return g; };
  const dormant = (S, k) => k.sleeps && season(S) === 3;
  const hunts = (p, h) => {
    const tiny = h.k.mass < 5;
    if (p.k.small === 1) return tiny;
    if (!p.k.small && tiny) return h.n >= p.n * 2 || p.hungry >= 2;
    const power = p.n * threatOf(p), guard = threatOf(h) * h.k.temper * Math.min(h.n, 4);
    return guard <= power * .6 || (p.hungry >= 3 && guard <= power * 1.2);
  };
  const big = k => k.need * k.cap > 5 && k.style !== 'forage' && k.style !== 'ambush' && !k.small;
  const rivals = (a, b) => a.kind === b.kind || (big(a.k) && big(b.k));
  const nearLanding = (S, x, y) => Math.hypot(x - S.N / 2, y - S.N / 2) < LANDING;

  function pasture(S, g, from, radius, wide) {
    let best = null, top = -1e9;
    for (let n = 0; n < (wide ? 70 : 22); n++) {
      const a = S.r() * 6.283, d = Math.sqrt(S.r()) * radius, x = clamp(from.x + Math.cos(a) * d * CELL, 8, S.N - 8), y = clamp(from.y + Math.sin(a) * d * CELL, 8, S.N - 8), i = cellOf(S, x, y);
      if (S.land[i] === WATER || (S.land[i] === ROCK && g.k.land !== ROCK)) continue;
      let v = S.grass[i] * HEAD_DAYS + (S.land[i] === g.k.land ? 1.2 : 0) - d * (wide ? .05 : .22);
      for (const m of g.avoid) if (Math.hypot(x - m.x, y - m.y) < m.r) v -= 6;
      if (S.colony && Math.hypot(x - S.colony.x, y - S.colony.y) < S.colony.r * 1.1) v -= 8;
      if (v > top) { top = v; best = { x, y }; }
    }
    return best || { x: from.x, y: from.y };
  }
  function arriveTier(S, k) {
    const rich = S.groups.reduce((a, g) => a + (g.k.prey && g.k.mass >= 5 ? g.n : 0), 0) / (S.C * S.C / 10000) / 300;
    if (k.top >= 3 && S.r() < clamp((rich - .5) * .25, 0, .2) * (S.bal.mult > 1 ? 1 : .4)) return 3;
    return S.r() < .35 && k.tiers.some(t => t.tier === 1 && !t.young) ? 1 : 2;
  }
  function arrive(S, kind, seeded) {
    const k = KINDS[kind], at = seeded ? { x: 30 + S.r() * (S.N - 60), y: 30 + S.r() * (S.N - 60) } : edgePoint(S), g = group(S, kind, at, Math.round(k.size[0] + S.r() * (k.size[1] - k.size[0])), k.prey ? 2 : arriveTier(S, k));
    if (k.prey) { g.home = pasture(S, g, at, seeded ? 6 : 22, true); g.goal = g.home; if (seeded) { g.x = g.px = g.home.x; g.y = g.py = g.home.y; g.state = 'grazing'; g.came = 'was here'; } else { S.tally.herdsIn++; say(S, 'in', at); } return g; }
    g.larder = k.need * g.n * 2; g.goal = seek(S, g);
    trace(S, 'arrive', { kind, tier: g.tier, young: !!variant(g).young, ok: !!g.goal, n: g.n });
    if (!g.goal) { g.n = 0; g.fate = 'turned back'; S.tally.passed++; return g; }
    g.state = 'wandering'; S.tally.packsIn++; say(S, 'in', at);
    return g;
  }

  const BIOMES = ['plains', 'forest', 'swamp', 'mountain'];
  function foodAt(S, g, x, y) {
    const k = g.k, eat = Math.max(.1, k.need * (g.n + g.young * .5));
    if (k.style === 'forage') {
      let m = 0;
      const r = Math.ceil(k.range / CELL), cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
      for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) { const X = cx + dx, Y = cy + dy; if (X >= 0 && Y >= 0 && X < S.C && Y < S.C && dx * dx + dy * dy <= r * r) m += 4 * MAST_KG * (S.land[Y * S.C + X] === FOREST ? .05 : .015); }
      return clamp((m - rivalsAt(S, g, x, y, k.range, true)) / eat, 0, 3);
    }
    const reach = k.range * 1.2;
    let meat = 0;
    for (const h of S.groups) if (h.k.prey && h.n > 0 && (k.style === 'scavenge' || k.style === 'ambush' ? h.k.mass >= 5 : hunts(g, h)) && Math.hypot(h.x - x, h.y - y) < reach) meat += k.style === 'scavenge' ? h.n * BLOOD : h.n * h.k.mass * (S.rate || .015) * CATCH;
    return clamp((meat - rivalsAt(S, g, x, y, reach, false)) / eat + (k.small ? S.small[cellOf(S, x, y)] * .3 : 0), 0, 3);
  }
  function rivalsAt(S, g, x, y, reach, forage) {
    let eat = 0;
    for (const o of S.groups) {
      if (o === g || o.k.prey || !o.lair || (o.k.style === 'forage') !== forage || (!forage && o.k.style === 'scavenge') !== (g.k.style === 'scavenge')) continue;
      const d = Math.hypot(o.lair.x - x, o.lair.y - y), span = reach + o.k.range;
      if (d < span) eat += o.k.need * (o.n + o.young * .5) * (1 - d / span);
    }
    return eat;
  }
  function site(S, g) {
    const k = g.k, far = S.shore.filter((_, q) => q % 9 === 0);
    let best = null, top = -1e9, food = 0;
    for (let n = 0; n < 90; n++) {
      const x = 30 + S.r() * (S.N - 60), y = 30 + S.r() * (S.N - 60), i = cellOf(S, x, y), d = Math.hypot(x - g.x, y - g.y), t = S.land[i];
      if (t === WATER || d > S.N * .6 || S.burn[i] >= 0 && S.day - S.burn[i] < YEAR) continue;
      const f = foodAt(S, g, x, y);
      let v = f * 3 + (t === k.site ? 1 : (k.biomes[BIOMES[t]] || 0) > 0 ? .3 : -1) - d * .002;
      if (nearLanding(S, x, y)) v -= 6;
      if (k.waits === 'water') v += 2 - Math.min(2, Math.min(...far.map(p => Math.hypot(p.x - x, p.y - y))) / 20);
      for (const l of S.lairs) {
        const ld = Math.hypot(l.x - x, l.y - y), o = KINDS[l.kind];
        if (l.owner) { if (l.kind === g.kind) v -= ld < k.range * .6 ? 8 : ld < k.range * 1.2 ? 1.5 : 0; else if (big(o) && big(k) && ld < (o.range + k.range) * .3) v -= 2; }
        else if (l.kind === g.kind && ld < 40) v += l.starved >= 0 && S.day - l.starved < SEASON_DAYS * 3 ? -3 : 1.5;
      }
      if (S.colony && Math.hypot(x - S.colony.x, y - S.colony.y) < S.colony.r + k.range * .8) v -= 7;
      if (v > top) { top = v; best = { x, y }; food = f; }
    }
    return best && food >= .3 ? best : null;
  }
  function seek(S, g) {
    const free = site(S, g);
    if (free) return free;
    const held = S.groups.filter(p => p !== g && p.lair && p.kind === g.kind && dist(p, g) < S.N * .5 && g.n * g.cond * threatOf(g) >= p.n * p.cond * threatOf(p) * .7).sort((a, b) => dist(a, g) - dist(b, g))[0];
    return held ? { x: held.lair.x, y: held.lair.y } : null;
  }
  function fight(S, a, b, at, over) {
    const sa = a.n * a.cond * threatOf(a) * (.7 + S.r() * .6), sb = b.n * b.cond * threatOf(b) * (.7 + S.r() * .6), win = sa > sb ? a : b, lose = sa > sb ? b : a;
    lose.n = Math.max(0, lose.n - 1); lose.lost++; lose.beat++; win.won++; S.tally.predFight++;
    if (S.r() < .25 && win.n > 1) { win.n--; win.lost++; S.tally.predFight++; }
    S.tally.fights++; say(S, 'clash', at);
    trace(S, 'fight', { a: a.kind, b: b.kind, same: a.kind === b.kind, over, spare: S.bounty.spare, lairs: S.lairs.filter(l => l.owner).length });
    tell(S, win.lair, `beat ${many(variant(lose).name, 2)} ${over}`); tell(S, lose.lair, `lost to ${many(variant(win).name, 2)} ${over}`);
    return win;
  }
  function settle(S, g) {
    const holder = S.groups.find(p => p !== g && p.kind === g.kind && p.lair && dist(p.lair, g) < g.k.range * .6);
    if (holder) {
      const l = holder.lair, alt = g.tries < 2 && g.hungry < 4 ? site(S, g) : null;
      if (alt && dist(alt, l) > g.k.range * .6) { g.tries++; g.goal = alt; g.state = 'wandering'; return; }
      if (fight(S, g, holder, l, 'over the ' + l.name) === g) { evict(S, holder, 'driven out by rivals'); own(S, g, l); tell(S, l, `taken over by ${g.n}`); }
      else { g.tries++; g.goal = g.tries > 1 ? null : site(S, g); if (!g.goal) { g.goal = nearestEdge(S, g); g.state = 'leaving'; } else g.state = 'wandering'; }
      return;
    }
    const old = S.lairs.filter(l => !l.owner && l.kind === g.kind && dist(l, g) < 45).sort((a, b) => dist(a, g) - dist(b, g))[0];
    if (old) { own(S, g, old); S.tally.reoccupied++; tell(S, old, `reoccupied by ${g.n}`); say(S, 'found', old); return; }
    const l = { id: S.lairs.length + 1, kind: g.kind, x: g.x, y: g.y, founded: S.day, left: -1, owner: null, kills: 0, peak: 0, top: g.tier, story: [], name: g.k.lair + ' ' + (S.names[g.k.lair] = (S.names[g.k.lair] || 0) + 1) };
    S.lairs.push(l); own(S, g, l); trace(S, 'found', { kind: g.kind, food: plentyOf(S, g), near: Math.min(1e4, ...S.groups.filter(h => h.k.prey && h.n > 0 && hunts(g, h)).map(h => dist(h, l))) }); S.tally.founded++; tell(S, l, `founded by ${g.n} ${many(variant(g).name, g.n)}`); say(S, 'found', l);
  }
  const own = (S, g, l) => { g.lair = l; l.owner = g.id; l.left = -1; g.x = l.x; g.y = l.y; g.state = 'resting'; g.goal = null; g.tries = 0; g.hungry = 0; g.held = 0; };
  function evict(S, g, why) {
    const l = g.lair;
    trace(S, 'evict', { kind: g.kind, why, kg: S.bounty.kg, bigPrey: S.hist.length ? S.hist[S.hist.length - 1].prey : 0, hunts: g.hunts, caught: g.caught, looked: g.looked, none: g.none, intake: g.intake, needed: g.needed, recent: g.recent, wasted: g.wasted || 0, age: S.day - (g.lair ? g.lair.founded : S.day), plenty: g.plenty, food: g.lair ? plentyOf(S, g) : 0, spare: S.bounty.spare, n: g.n });
    if (l) { l.owner = null; l.left = S.day; l.starved = /prey|starved|hunting ground/.test(why) ? S.day : -1; S.tally.abandoned++; tell(S, l, 'abandoned: ' + why); say(S, 'gone', l); }
    g.lair = null; g.target = null;
    if (g.n <= 0) return;
    g.goal = g.tries > 1 ? null : seek(S, g); g.tries++; g.larder += g.k.need * g.n * 2; g.hungry = 0;
    if (g.goal) g.state = 'wandering'; else { g.goal = nearestEdge(S, g); g.state = 'leaving'; }
  }

  function move(S, g, to, speed) {
    const d = Math.hypot(to.x - g.x, to.y - g.y);
    if (d <= speed) { g.x = to.x; g.y = to.y; return true; }
    g.x += (to.x - g.x) / d * speed; g.y += (to.y - g.y) / d * speed;
    return false;
  }
  function scare(S, h, from, far) {
    const a = Math.atan2(h.y - from.y, h.x - from.x) + (S.r() - .5) * .9, d = h.k.burrow ? 12 : far || 45 + S.r() * 35;
    h.goal = { x: clamp(h.x + Math.cos(a) * d, 10, S.N - 10), y: clamp(h.y + Math.sin(a) * d, 10, S.N - 10) }; h.state = 'fleeing'; h.wait = 3; h.cond = Math.max(.05, h.cond - .03);
    if (!h.k.burrow) h.avoid.push({ x: from.x, y: from.y, r: 60, until: S.day + 5 });
    if (h.avoid.length > 6) h.avoid.shift();
  }
  const catchOf = (p, h) => h.k.mass < 5 ? Math.min(h.n, Math.max(1, p.n)) : 1;
  function kill(S, p, h, risk) {
    const take = h.k.mass < 5 ? Math.min(h.n, Math.max(1, Math.round(p.n * (.5 + S.r() * .7)))) : 1;
    h.n -= take; h.lost += take; p.kills += take; S.tally.kills += take; count(S, h.kind, 'hunted', take); count(S, h.kind, 'by ' + p.kind, take);
    if (h.k.mass >= 5) { S.marks.push({ x: h.x, y: h.y, day: S.day, fed: 0 }); if (S.marks.length > 160) S.marks.shift(); }
    let meat = h.k.mass * take * (p.lair && dist(p.lair, h) > p.k.range ? .6 : 1);
    const thief = h.k.mass >= 5 && S.groups.find(b => b.k.style === 'forage' && b !== p && b.lair && b.state !== 'asleep' && dist(b.lair, h) < b.k.range && b.k.clock[S.hour] > .5);
    if (thief && p.k.style !== 'forage' && S.r() < .5) { thief.larder += meat * .5; meat *= .5; S.tally.stolen++; say(S, 'steal', h); tell(S, thief.lair, 'took half a kill from ' + p.k.name.toLowerCase() + 's'); tell(S, p.lair, 'a bear took half a kill'); }
    p.larder += meat;
    if (p.lair) p.lair.kills++;
    if (h.k.temper >= .6 && h.k.mass >= 5 && S.r() < h.k.danger * (risk || 1) * (threatOf(h) / h.k.threat)) { p.n--; p.lost++; S.tally.predHunting++; trace(S, 'gored', { kind: p.kind, by: h.kind }); say(S, 'death', h); tell(S, p.lair, 'lost a hunter to a ' + h.k.name.toLowerCase()); }
    scare(S, h, p);
  }

  function graze(S, g, h) {
    const k = g.k, act = k.clock[h], sp = k.speed * (g.state === 'fleeing' ? 1.5 : .5 + act * .5), i = cellOf(S, g.x, g.y);
    if (g.state === 'fleeing' || g.state === 'arriving' || g.state === 'migrating') {
      const there = move(S, g, g.goal, sp), was = g.state;
      if (was === 'migrating') { if (there) { g.n = 0; g.fate = 'moved off the map'; } return; }
      if (there || (was === 'fleeing' && --g.wait <= 0)) { if (was === 'arriving') g.home = { x: g.x, y: g.y }; g.state = 'grazing'; g.goal = null; }
      return;
    }
    if (g.state === 'drinking') { if (--g.wait <= 0) { g.state = 'grazing'; g.goal = pasture(S, g, g.home, k.roam); } return; }
    if (g.state === 'thirsty') { if (move(S, g, g.goal, sp)) { g.state = 'drinking'; g.wait = 2; } return; }
    const first = g.id % 3 + (g.id % 2 ? 5 : 17);
    if (!k.burrow && (h === first || (S.wx.kind === 'drought' && h === (first + 12) % 24))) { let best = null, bd = 130; for (const p of S.shore) { const d = Math.hypot(p.x - g.x, p.y - g.y); if (d < bd) { bd = d; best = p; } } if (best) { g.goal = best; g.state = 'thirsty'; return; } }
    if (act < .3 && g.lean < 2) { g.state = 'resting'; return; }
    g.state = 'grazing';
    const there = g.goal && Math.hypot(g.goal.x - g.x, g.goal.y - g.y) <= 6;
    if (!g.goal || (there && (S.grass[i] < S.K[i] * .35 || S.land[i] === WATER))) g.goal = pasture(S, g, g.home, k.roam);
    else if (!there) move(S, g, g.goal, sp);
    const j = cellOf(S, g.x, g.y), want = g.n * k.eats * act / 12 / HEAD_DAYS * (1.15 + g.lean * .2 + (g.cond < .6 ? .3 : 0)), got = Math.min(want, Math.max(0, S.grass[j] - S.K[j] * .08));
    S.grass[j] -= got; g.eaten += got * HEAD_DAYS;
    if (k.land === FOREST) { const m = Math.min(S.mast[j] * MAST[season(S)] * .2, g.n * act / 12 / 6); S.mast[j] = Math.max(0, S.mast[j] - m * .5); g.eaten += m * 6; }
  }
  const around = (S, g) => { const a = S.r() * 6.283, d = S.r() * g.k.range; return { x: clamp(g.lair.x + Math.cos(a) * d, 5, S.N - 5), y: clamp(g.lair.y + Math.sin(a) * d, 5, S.N - 5) }; };
  const nibble = (S, g, gain) => { const j = cellOf(S, g.x, g.y), take = Math.min(S.small[j], .22); S.small[j] -= take; g.larder += take * gain; };

  function prowl(S, g, h) {
    const k = g.k, act = k.clock[h], need = k.need * (g.n + g.young * .5), stock = need ? g.larder / need : 9;
    if (g.state === 'wandering' || g.state === 'leaving') {
      if (!g.goal) { g.goal = nearestEdge(S, g); g.state = 'leaving'; }
      if (move(S, g, g.goal, k.speed * .7)) { if (g.state === 'leaving') { S.tally.packsOut++; say(S, 'out', g); g.n = 0; g.fate = 'walked off the map'; } else settle(S, g); }
      return;
    }
    if (dormant(S, k)) { g.state = 'asleep'; move(S, g, g.lair, k.speed); return; }
    if (g.state === 'asleep') g.state = 'resting';
    if (g.state === 'returning') { if (move(S, g, g.lair, k.speed * .8)) { g.state = g.larder > need * .5 ? 'feeding' : 'resting'; g.wait = 3; } return; }
    if (g.state === 'feeding') { if (--g.wait <= 0) g.state = 'resting'; return; }
    if (g.state === 'raiding') {
      if (!S.colony) { g.state = 'returning'; return; }
      if (move(S, g, S.colony, k.speed)) { const take = Math.min(S.colony.stores, need * 5); S.colony.stores -= take; g.larder += take; g.state = 'returning'; S.tally.raids++; say(S, 'raid', S.colony); tell(S, g.lair, `took ${Math.round(take)} kg from the colony stores`); if (S.r() < .3) { g.n--; g.lost++; S.tally.predColony++; tell(S, g.lair, 'lost one at the colony'); } }
      return;
    }
    if (g.state === 'scavenging') { if (move(S, g, g.goal, k.speed)) { g.larder += k.style === 'scavenge' ? 1 : 3; g.state = 'returning'; } return; }
    if (g.state === 'hunting') {
      const t = S.groups.find(q => q.id === g.target);
      if (!t || t.n <= 0 || --g.wait <= 0) { g.state = 'returning'; g.target = null; return; }
      if (!move(S, g, t, k.speed)) return;
      const host = S.groups.find(o => o !== g && o.lair && !o.k.prey && o.state !== 'asleep' && rivals(g, o) && dist(o.lair, t) < o.k.range * .6 && dist(g.lair, t) > g.k.range * .5);
      if (host && S.r() < .3 * clamp(1 - S.bounty.spare / 6, .15, 1) && fight(S, g, host, t, 'at the edge of their ground') !== g) { g.state = 'returning'; g.target = null; g.wait = 12; return; }
      const snow = S.wx.kind === 'snow' ? .2 : S.wx.kind === 'storm' ? -.15 : 0, p = clamp(k.skill * (.5 + .12 * Math.min(g.n, 6)) * (1.35 - .7 * t.cond) * (t.k.mass > 100 ? .6 : 1) * (1 + (g.tier - 2) * .15) + snow - (t.state === 'fleeing' ? .15 : 0), .06, .88);
      S.tally.tried++; g.hunts++;
      if (S.r() < p) { S.tally.won++; g.caught++; kill(S, g, t); g.state = 'returning'; g.target = null; }
      else { scare(S, t, g); g.tries++; g.wait = 3; if (g.tries > 1) { g.state = 'returning'; g.target = null; } }
      return;
    }
    if (k.style === 'ambush') {
      g.state = act > .6 ? 'lying in wait' : 'basking';
      if (act > .6) for (const t of S.groups) if (t.k.prey && t.k.mass >= 5 && hunts(g, t) && dist(t, g.lair) < k.range && (k.waits === 'water' ? t.state === 'drinking' && t.wait === 2 : t.state !== 'fleeing') && S.r() < k.skill * (stock < 1 ? 1 : .4) * (k.waits === 'water' ? 1 : .25)) { S.tally.tried++; S.tally.won++; kill(S, g, t); break; }
      return;
    }
    if (k.style === 'forage') {
      g.state = act > .4 ? 'foraging' : 'resting';
      if (act <= .4) { move(S, g, g.lair, k.speed); return; }
      if (!g.goal || Math.hypot(g.goal.x - g.x, g.goal.y - g.y) < 8) g.goal = around(S, g);
      move(S, g, g.goal, k.speed * .4);
      const j = cellOf(S, g.x, g.y), m = Math.min(S.mast[j] * MAST_KG * MAST[season(S)], need * 1.6 / 8);
      S.mast[j] = Math.max(0, S.mast[j] - m / MAST_KG / Math.max(.1, MAST[season(S)])); g.larder += m; g.fhours = (g.fhours || 0) + 1;
      const prey = stock < 1.5 && S.groups.find(t => t.k.prey && t.k.mass >= 5 && t.k.mass < 60 && dist(t, g) < 25);
      if (prey && S.r() < .12) kill(S, g, prey, .5);
      return;
    }
    g.state = 'resting';
    if (k.grounded === S.wx.kind) { g.state = 'grounded'; return; }
    if (g.wait > 0) { g.wait--; return; }
    const drive = clamp(1.6 - stock, 0, 1.6), urge = drive * (.25 + act) + clamp(g.plenty - 1, 0, 2) * .4 * act;
    if (urge < .6) return;
    if (k.style === 'scavenge' || k.scav) {
      const m = S.marks.find(q => S.day - q.day <= 1 && q.fed < 3 && Math.hypot(q.x - g.lair.x, q.y - g.lair.y) < k.range);
      if (m) { m.fed++; g.goal = { x: m.x, y: m.y }; g.state = 'scavenging'; return; }
      if (k.style === 'scavenge') { const v = S.groups.find(t => t.k.prey && t.k.mass >= 5 && t.n > 0 && dist(t, g.lair) < k.range); if (v) { g.larder += Math.min(k.need * g.n * .5, v.n * BLOOD / 2); v.cond = Math.max(.05, v.cond - .03); if (S.r() < .1) { v.n--; v.lost++; g.kills++; S.tally.kills++; } g.goal = { x: v.x, y: v.y }; g.state = 'scavenging'; g.wait = 12; return; } nibble(S, g, 5); g.wait = 4; return; }
    }
    if (k.style === 'raid' && S.colony && g.hungry >= (k.thief ? 1 : 2) && dist(g.lair, S.colony) < k.range * 2.2 && S.colony.stores > 20) { g.state = 'raiding'; return; }
    if (k.style === 'pursuit' && !k.small && S.colony && g.hungry >= 4 && dist(g.lair, S.colony) < k.range * 1.6) { g.larder += 28; g.wait = 10; S.tally.raids++; say(S, 'raid', S.colony); tell(S, g.lair, 'took an animal from the colony pens'); if (S.r() < .25) { g.n--; g.lost++; S.tally.predColony++; tell(S, g.lair, 'lost one at the pens'); } return; }
    const reach = k.range * (1 + Math.min(g.hungry, 6) * .12);
    let best = null, bv = 0;
    for (const t of S.groups) if (t.k.prey && t.n > 0 && hunts(g, t)) { const d = dist(t, g.lair) + S.r() * 20; if (d >= reach) continue; const v = catchOf(g, t) * t.k.mass * (t.k.mass > 100 ? .6 : 1) / (d + 40); if (v > bv) { bv = v; best = t; } }
    g.looked++;
    if (!best) { g.none++; if (k.small) nibble(S, g, 7); g.wait = 6 + Math.round(clamp(1 - g.plenty * 2, 0, 1) * 10); return; }
    g.state = 'hunting'; g.target = best.id; g.tries = 0; g.wait = 9;
  }

  function fire(S, near) {
    const C = S.C, L = S.land;
    let start = -1;
    for (let n = 0; n < 400 && start < 0; n++) { const x = near ? near.x + (S.r() - .5) * 120 : 20 + S.r() * (S.N - 40), y = near ? near.y + (S.r() - .5) * 120 : 20 + S.r() * (S.N - 40), i = cellOf(S, x, y); if (L[i] === FOREST && S.burn[i] < 0 && !nearLanding(S, x, y)) start = i; }
    if (start < 0) return null;
    const dry = S.wx.kind === 'drought', limit = Math.round((250 + S.r() * 650) * (dry ? 1.5 : 1) * (S.C * S.C / 10000)), q = [start], burnt = [start];
    S.burn[start] = S.day;
    while (q.length && burnt.length < limit) {
      const i = q.splice(Math.floor(S.r() * Math.min(q.length, 6)), 1)[0], x = i % C, y = (i / C) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= C || Y >= C) continue;
        const j = Y * C + X, t = L[j];
        if (S.burn[j] >= 0 && S.day - S.burn[j] < YEAR * 3) continue;
        const p = t === FOREST ? .82 : t === MEADOW ? (dry ? .55 : .25) : t === SWAMP ? .06 : 0;
        if (S.r() < p) { S.burn[j] = S.day; burnt.push(j); q.push(j); }
      }
    }
    let cx = 0, cy = 0;
    for (const i of burnt) { cx += (i % C) * CELL + 5; cy += ((i / C) | 0) * CELL + 5; S.grass[i] = 0; S.mast[i] = 0; S.small[i] *= .2; S.K[i] = 0; }
    const at = { x: cx / burnt.length, y: cy / burnt.length }, set = new Set(burnt), inside = g => set.has(cellOf(S, g.x, g.y));
    for (const g of S.groups) {
      if (g.k.prey) { if (inside(g)) { scare(S, g, at, 90); g.home = pasture(S, g, g, 20, true); if (S.r() < .35) { const lost = Math.min(g.n, Math.ceil(g.n * .15)); g.n -= lost; g.lost += lost; count(S, g.kind, 'fire', lost); } } continue; }
      if (g.lair && set.has(cellOf(S, g.lair.x, g.lair.y))) { g.lair.burnt = S.day; evict(S, g, 'burnt out'); }
    }
    if (burnt.length < 12) return at;
    S.fires.push({ ...at, day: S.day, cells: burnt.length, when: stamp(S) });
    if (S.fires.length > 30) S.fires.shift();
    S.tally.fires++; say(S, 'fire', at);
    return at;
  }

  function weather(S) {
    const w = S.wx, s = season(S), d = S.day % YEAR;
    if (d === SEASON_DAYS * 3) { w.hard = S.r() < .22; if (w.hard) trace(S, 'hard', {}); }
    if (d === 0) w.hard = false;
    if (w.kind === 'drought' && S.r() < .035) fire(S, null);
    if (--w.left > 0) return;
    const r = S.r();
    w.kind = s === 3 ? (w.hard || r < .4 ? 'snow' : 'clear') : s === 1 ? (r < .03 ? 'drought' : r < .09 ? 'storm' : 'clear') : r < .28 ? 'rain' : r < .34 ? 'storm' : 'clear';
    if (w.kind === 'drought') trace(S, 'drought', {});
    w.left = w.kind === 'drought' ? 8 + Math.floor(S.r() * 6) : w.kind === 'snow' && w.hard ? 4 : 1 + Math.floor(S.r() * 2);
    if (w.kind === 'storm' && s === 1 && S.r() < .3) fire(S, null);
  }
  function act(S, kind) {
    S.log.push([S.t, kind]);
    if (kind === 'fire') { const at = fire(S, null); return; }
    if (kind === 'winter') { S.wx.hard = true; S.wx.kind = 'snow'; S.wx.left = 6; } else { S.wx.kind = kind; S.wx.left = kind === 'drought' ? 10 : 3; }
  }
  function land(S, kind) { S.colony = kind === 'none' ? null : { x: S.N / 2, y: S.N / 2, r: 40, stores: 300, hunters: 2, grow: kind === 'growing', since: S.day }; }

  function succession(S) {
    const Y = YEAR;
    for (let i = 0; i < S.C * S.C; i++) {
      const b = S.burn[i]; if (b < 0) continue;
      const a = S.day - b, base = S.K0[i];
      if (a < 3) S.K[i] = 0;
      else if (a < Y) S.K[i] = Math.max(base, .95);
      else if (a < 2 * Y) S.K[i] = Math.max(base, .65);
      else if (a < 4 * Y) S.K[i] = base + (.65 - base) * (1 - (a - 2 * Y) / (2 * Y));
      else { S.K[i] = base; S.burn[i] = -1; }
      if (a >= 2 * Y) S.mast[i] = Math.min(S.mast[i], (a - 2 * Y) / (2 * Y));
      else S.mast[i] = 0;
    }
  }
  function balance(S, D) {
    const B = S.bal, col = S.colony, years = col ? (S.day - col.since) / YEAR : 0;
    B.target = S.C * S.C / 10000 * 110 * (1 + years * .15 + (col ? col.stores / 2000 : 0));
    B.ema = B.ema ? B.ema + (D - B.ema) / SEASON_DAYS : D;
    B.dull = B.ema < B.target * .45 ? B.dull + 1 : 0;
    B.mult = clamp(B.target / Math.max(1, B.ema), .25, 3) * (B.dull > SEASON_DAYS ? 2 : 1);
  }
  function promote(S, g) {
    if (g.hungry === 0 && g.cond > .7) g.held++; else g.held = Math.max(0, g.held - 1);
    const next = g.tier + 1, has = g.k.tiers.some(t => t.tier === next), need = next <= 3 ? 4 : next === 4 ? 12 : 24;
    if (!has || g.held < need || (next === 5 && S.groups.some(o => o.kind === g.kind && o.tier === 5))) return;
    g.tier = next; g.held = 0; g.lair.top = Math.max(g.lair.top || 0, next); S.tally.risen++;
    tell(S, g.lair, `a ${variant(g).name.toLowerCase()} rose to lead it`); say(S, 'rise', g.lair);
  }

  function daily(S) {
    const s = season(S), d = S.day % YEAR, w = S.wx, T = S.tally, grow = GROW[s] * (w.kind === 'rain' ? 1.35 : w.kind === 'drought' ? .12 : 1), C2 = S.C * S.C, G = S.grass, KK = S.K, M = S.mast, SM = S.small, L = S.land, frozen = s === 3 && w.hard;
    succession(S);
    let total = 0, cap = 0;
    for (let i = 0; i < C2; i++) {
      const K = KK[i]; if (!K) continue;
      const g = G[i] > K * .06 ? G[i] : K * .06;
      let v = G[i] + .07 * g * (1 - g / K) * grow;
      if (v > K) v = K;
      if (frozen) v *= .97;
      G[i] = v; total += v; cap += K;
      const mm = M[i] + (L[i] === FOREST ? .05 : .015), top = L[i] === FOREST ? 1 : .35; M[i] = mm > top ? top : mm;
      const sm = SM[i] + (s === 3 ? .006 : .02); SM[i] = sm > .6 ? .6 : sm;
    }
    T.grassLow = Math.min(T.grassLow, cap ? total / cap : 0);
    const col = S.colony;
    if (col) {
      const yrs = (S.day - col.since) / YEAR;
      if (col.grow) { col.r = 40 + yrs * 16; col.hunters = Math.min(9, 2 + Math.floor(yrs * 1.5)); }
      col.stores = Math.min(900, col.stores + 6 + col.r * .12);
      for (let q = 0; q < col.hunters; q++) { const t = S.groups.filter(g => g.k.prey && g.k.danger <= .3 && g.n > 0 && dist(g, col) < col.r + 130).sort((a, b) => dist(a, col) - dist(b, col))[0]; if (t && S.r() < .32) { t.n--; t.lost++; T.preyHunted++; count(S, t.kind, 'colonists', 1); col.stores += t.k.mass; scare(S, t, col, 70); t.avoid.push({ x: col.x, y: col.y, r: col.r + 90, until: S.day + 12 }); } }
      for (const g of S.groups) if (!g.k.prey && g.lair && dist(g.lair, col) < col.r + 25 && S.r() < .2) { const lost = Math.min(g.n, 2); g.n -= lost; g.lost += lost; T.predColony += lost; say(S, 'clash', g.lair); tell(S, g.lair, 'attacked by colonists'); if (g.n <= 0) evict(S, g, 'cleared by colonists'); }
      for (let i = 0; i < C2; i++) if (Math.hypot((i % S.C) * CELL + 5 - col.x, Math.floor(i / S.C) * CELL + 5 - col.y) < col.r * .8 && G[i] > KK[i] * .1) G[i] = KK[i] * .1;
    }
    const counts = {};
    for (const g of S.groups) counts[g.kind] = (counts[g.kind] || 0) + 1;
    for (const g of S.groups) {
      const k = g.k;
      if (k.prey) {
        g.avoid = g.avoid.filter(m => m.until > S.day);
        const fed = g.n ? g.eaten / g.n / k.eats : 1; g.eaten = 0;
        g.cond = clamp(g.cond + (fed - .72) * .22 - (w.kind === 'snow' ? (w.hard ? .05 : .015) : 0), .02, 1);
        g.lean = fed < .6 ? g.lean + 1 : 0;
        if (g.cond < .2) { const lost = Math.min(g.n, Math.max(1, Math.round(g.n * .05 * (1 + S.r())))); g.n -= lost; g.lost += lost; T.preyStarved += lost; count(S, g.kind, 'starved', lost); }
        if (S.r() < g.n * (k.burrow ? .01 : .0017)) { g.n--; g.lost++; T.preyAged++; count(S, g.kind, 'aged', 1); }
        if ((s === 0 || (k.burrow && s === 1)) && d % 3 === 0) { const born = Math.max(0, Math.round(g.n * k.fec * g.cond / 5 + S.r() * .6 - .1)); g.n += born; g.born += born; T.preyBorn += born; count(S, g.kind, 'born', born); S.bornKg += born * k.mass; }
        const mate = g.n > 0 && g.n < k.cap * .4 && S.groups.find(q => q !== g && q.kind === g.kind && q.n > 0 && q.n + g.n <= k.cap * .8 && dist(q, g) < 30);
        if (mate) { mate.n += g.n; mate.cond = (mate.cond + g.cond) / 2; g.n = 0; g.fate = 'joined herd ' + mate.id; continue; }
        if (g.n > k.cap) { const half = Math.floor(g.n / 2); g.n -= half; if (counts[g.kind] < k.want * S.fit[g.kind] * C2 / 10000 * 8) { const o = group(S, g.kind, g, half); o.came = 'split from herd ' + g.id; o.cond = g.cond; o.home = pasture(S, o, g, k.burrow ? 9 : 26, true); o.goal = o.home; o.state = 'arriving'; counts[g.kind]++; } else { T.herdsOut++; count(S, g.kind, 'capped', half); } }
        if (g.lean > 5 && g.state !== 'migrating' && !k.burrow) { const far = pasture(S, g, g, 30, true); if (S.grass[cellOf(S, far.x, far.y)] * HEAD_DAYS > 2.5) { g.home = far; g.goal = far; g.state = 'arriving'; g.lean = 0; } else if (g.lean > 9) { g.goal = nearestEdge(S, g); g.state = 'migrating'; g.fate = 'moved off the map'; count(S, g.kind, 'emigrated', g.n); T.herdsOut++; say(S, 'out', g); } }
        continue;
      }
      g.plenty = Math.min(plentyOf(S, g), Math.max(.2, g.recent * 1.5));
      const mood = g.plenty > 1.5 ? 'feasting' : g.plenty < .5 ? 'saving strength' : 'hunting';
      if (mood !== g.mood) g.flips = (g.flips || 0) + 1;
      g.mood = mood;
      const asleep = dormant(S, k), need = asleep ? 0 : k.need * (g.n + g.young * .5) * (k.sleeps && s === 2 ? 1.3 : 1) * (g.plenty < .5 ? .75 : 1);
      if (k.style === 'raid' && s !== 3) g.larder += need * .3;
      if (g.lair) { const got = Math.max(0, g.larder - g.prevL); if (k.style === 'forage') trace(S, 'forage', { id: g.id, season: s, got, need, larder: g.larder, hungry: g.hungry, n: g.n, young: g.young, asleep, mast: mastNear(S, g.lair, k.range), hours: g.fhours || 0 }); g.fhours = 0; g.intake += got; g.needed += need; if (need) g.recent += (got / need - g.recent) / 15; }
      g.larder -= need;
      if (g.larder < 0) { g.larder = 0; g.hungry++; g.cond = Math.max(.05, g.cond - .1); } else { g.hungry = 0; g.cond = Math.min(1, g.cond + .06); }
      const room = k.need * (g.n + g.young) * (k.sleeps ? 14 : k.style === 'ambush' ? 20 : 8); if (g.larder > room) g.wasted = (g.wasted || 0) + g.larder - room;
      g.larder = Math.min(g.larder, room); g.prevL = g.larder;
      if (g.hungry >= 3 && g.young > 0 && S.r() < .5) { g.young--; g.lost++; T.predStarved++; tell(S, g.lair, 'a young one starved'); }
      if (g.hungry >= 5 && S.r() < .35) { g.n--; g.lost++; T.predStarved++; tell(S, g.lair, 'one starved'); if (g.lair) say(S, 'death', g.lair); if (g.tier > 2 && S.r() < .5) g.tier--; }
      if (S.r() < g.n * .0013) { g.n--; g.lost++; T.predAged++; tell(S, g.lair, 'one died of age'); }
      if (g.lair) { g.lair.peak = Math.max(g.lair.peak, g.n + g.young); if (g.n <= 0) evict(S, g, g.hungry ? 'starved out' : 'the last one died'); else if (g.hungry >= 3 && g.plenty < .6 && g.k.style !== 'raid') evict(S, g, 'moved to better hunting ground'); else if (g.hungry >= (g.plenty < .5 ? 10 : 7)) evict(S, g, 'left for lack of prey'); }
      if (!g.lair || g.n <= 0) continue;
      if (d % SEASON_DAYS === 0) promote(S, g);
      if (d === 1 && g.young) {
        for (let q = g.young; q > 0; q--) if (S.r() < .7) g.n++;
        g.young = 0;
        if (g.n > k.cap) { const out = Math.max(1, Math.floor(g.n / 2.5)), o = group(S, g.kind, g, out, Math.min(g.tier, 2)); o.came = 'left ' + (g.lair ? g.lair.name : 'pack ' + g.id); g.n -= out; o.larder = k.need * out * 2; o.cond = g.cond; o.goal = seek(S, o); o.state = o.goal ? 'wandering' : 'leaving'; if (!o.goal) o.goal = nearestEdge(S, o); say(S, 'split', g.lair); tell(S, g.lair, out + ' left to find ground of their own'); }
      }
      if (d === 3 && g.cond > .6 && stockDays(g) > .6 && (g.n >= 2 || k.cap <= 2) && S.r() < k.breed) { g.young = Math.round(k.litter[0] + S.r() * (k.litter[1] - k.litter[0])); T.predBorn += g.young; g.born += g.young; tell(S, g.lair, g.young + ' young born'); }
    }
    for (const g of S.groups) { if (g.n > 0) { g.peak = Math.max(g.peak, g.n + g.young); continue; } if (g.fate === 'turned back' || /^joined/.test(g.fate || '')) continue; g.fate = g.fate || (g.k.prey ? (g.cond < .2 ? 'starved' : 'all killed') : g.hungry >= 3 ? 'starved out' : 'all killed'); g.end = S.day; S.gone.push(g); }
    if (S.gone.length > 80) S.gone.splice(0, S.gone.length - 80);
    S.groups = S.groups.filter(g => g.n > 0);
    S.lairs = S.lairs.filter(l => l.owner || S.day - l.left < YEAR * 8);
    const prey = S.groups.filter(g => g.k.prey), out = S.o.outside === undefined ? 1 : S.o.outside, pn = prey.reduce((a, g) => a + (g.k.mass < 5 ? 0 : g.n), 0), packs = S.groups.filter(g => !g.k.prey), D = packs.reduce((a, g) => a + danger(g), 0), herd = prey.reduce((a, g) => a + danger(g), 0);
    balance(S, D);
    for (const [kind, k] of Object.entries(KINDS)) if (k.prey && S.cast[kind]) { const want = k.want * S.fit[kind] * C2 / 10000 * out; if ((counts[kind] || 0) < want * .7 && S.r() < .3 * out) arrive(S, kind); }
    S.prod += (S.bornKg - S.prod) / YEAR; S.bornKg = 0;
    const kg = prey.reduce((a, g) => a + g.n * g.k.mass, 0), demand = packs.reduce((a, g) => a + g.k.need * (g.n + g.young * .5), 0), spare = (S.prod - demand) / PACK_KG;
    S.bounty = { kg, yield: S.prod, demand, spare };
    S.rate = kg ? S.prod / kg : 0;
    if (S.r() < .09 * out * clamp(spare / 3, .1, 3) * S.bal.mult) {
      const pool = Object.entries(KINDS).filter(([id, k]) => !k.prey && S.cast[id] && !dormant(S, k)).map(([id, k]) => [id, k.share * S.fit[id] * (.1 + eatable(S, k) / Math.max(1, kg))]), sum = pool.reduce((a, p) => a + p[1], 0);
      let v = S.r() * sum;
      for (const [id, w] of pool) { v -= w; if (v <= 0) { arrive(S, id); break; } }
    }
    const row = { prey: pn, pred: packs.reduce((a, g) => a + g.n + g.young, 0), grass: cap ? total / cap : 0, lairs: S.lairs.filter(l => l.owner).length, empty: S.lairs.filter(l => !l.owner).length, danger: Math.round(D), herd: Math.round(herd), target: Math.round(S.bal.target), high: packs.filter(g => g.tier >= 3).length };
    S.hist.push(row);
    if (S.hist.length > 900) S.hist.shift();
    if (d === YEAR - 1) { S.years.push({ year: year(S), ...T, ...row }); S.tally = fresh(); if (S.years.length > 60) S.years.shift(); }
  }
  function mastNear(S, at, range) { let m = 0, c = 0; const r = Math.ceil(range / CELL), cx = Math.floor(at.x / CELL), cy = Math.floor(at.y / CELL); for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const X = cx + dx, Y = cy + dy; if (X >= 0 && Y >= 0 && X < S.C && Y < S.C && dx * dx + dy * dy <= r * r) { m += S.mast[Y * S.C + X]; c++; } } return c ? m / c : 0; }
  const plentyOf = (S, g) => g.lair ? foodAt(S, g, g.lair.x, g.lair.y) : 1;
  function eatable(S, k) {
    const probe = { k, n: Math.round((k.size[0] + k.size[1]) / 2), tier: 2, id: 0, hungry: 0 };
    return S.groups.reduce((a, t) => a + (t.k.prey && t.n > 0 && hunts(probe, t) ? t.n * t.k.mass : 0), 0);
  }
  const stockDays = g => { const need = g.k.need * (g.n + g.young * .5); return need ? g.larder / need : 9; };

  function hour(S) {
    for (const g of S.groups) { g.px = g.x; g.py = g.y; }
    for (const g of S.groups.slice()) if (g.n > 0) (g.k.prey ? graze : prowl)(S, g, S.hour);
    S.t++;
    if (++S.hour === 24) { S.hour = 0; S.day++; weather(S); daily(S); }
  }
  const age = (S, l) => l.owner ? 'lived in' : S.day - l.left < SEASON_DAYS ? 'abandoned' : S.day - l.left < YEAR ? 'overgrown' : 'ruin';
  return { make, hour, act, land, KINDS: () => KINDS, CLOCKS, SEASONS, YEAR, SEASON_DAYS, DAY_MIN, CELL, season, year, stamp, age, stockDays, dormant, variant, threatOf, danger, MEADOW, FOREST, SWAMP, ROCK, WATER };
})();
if (typeof module !== 'undefined') module.exports = ECO;
