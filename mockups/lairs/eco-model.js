'use strict';
const ECO = (() => {
  const CELL = 10, SEASON_DAYS = 15, YEAR = 60, SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'], DAY_MIN = 5, LANDING = 70;
  const GROW = [1.5, 1, .8, .05], MAST = [.5, 1, 1.6, .1], HEAD_DAYS = 8, MEADOW = 0, FOREST = 1, SWAMP = 2, ROCK = 3, WATER = 4;
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
  const DZ = typeof ECO_DATA !== 'undefined' ? ECO_DATA.DISEASES || {} : {};
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const dice = seed => { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  const fresh = () => ({ kills: 0, tried: 0, won: 0, preyBorn: 0, preyStarved: 0, preyAged: 0, preyHunted: 0, predBorn: 0, predStarved: 0, predHunting: 0, predFight: 0, predAged: 0, predColony: 0, herdsIn: 0, herdsOut: 0, packsIn: 0, packsOut: 0, founded: 0, reoccupied: 0, abandoned: 0, fights: 0, stolen: 0, raids: 0, fires: 0, risen: 0, passed: 0, breakups: 0, adopted: 0, aged: 0, downgraded: 0, takeovers: 0, contests: 0, migOut: 0, migBack: 0, winterIn: 0, shifted: 0, herdMoves: 0, winterKill: 0, outbreaks: 0, spread: 0, sickDied: 0, youngNest: 0, youngDied: 0, youngGrown: 0, youngHunted: 0, youngCarrion: 0, youngEaten: 0, dispersed: 0, gored: 0, injured: 0, grassLow: 1 });
  const CUNNING = /alpha|matriarch|matron|elder|mother|queen|shaman|chief|stalker|vixen|harrier|ermine/i, FORM = { gaunt: 'Gaunt', crippled: 'Crippled', grizzled: 'Grizzled' };
  const OUTSIDE = { pack: [.7, .3], pair: [.7, .3], tribe: [.4, .2], flock: [.5, .15] }, BREAKUP = { pack: [.2, .55], pair: [.2, .55], tribe: [.08, .3], flock: [.1, .3] };
  function pickTier(g, tier, branch) {
    const all = g.k.tiers.filter(t => t.tier === tier), grown = all.filter(t => !t.young), l = grown.length ? grown : all;
    if (!l.length) return g.k.tiers[g.k.tiers.length - 1];
    const side = branch ? l.filter(t => CUNNING.test(t.name) === (branch === 'cunning')) : [];
    const pool = side.length ? side : l;
    return pool[g.id % pool.length];
  }
  function variant(g) {
    const b = lead(g);
    if (!b) return pickTier(g, g.tier);
    const key = b.tier + '|' + b.branch + '|' + b.form;
    if (g.vkey === key) return g.v;
    let v = pickTier(g, b.tier, b.branch);
    if (FORM[b.form]) {
      const low = g.k.tiers.find(t => t.tier === 1 && !t.young) || g.k.tiers.find(t => t.tier === 1) || v, down = downgrade(g.k, b.form, v);
      v = { id: down || v.id, name: FORM[b.form] + ' ' + v.name, threat: Math.max(1, Math.round(Math.min(v.threat, low.threat * 1.25))), tier: b.tier, form: b.form };
    } else if (b.form === 'elder') {
      const e = g.k.tiers.find(t => t.tier >= b.tier && /elder/i.test(t.name));
      v = e || { id: v.id, name: 'Elder ' + v.name, threat: Math.max(1, Math.round(v.threat * .9)), tier: b.tier, form: 'elder' };
    }
    g.vkey = key; g.v = v;
    return v;
  }
  const downgrade = (k, form, v) => { const D = typeof DOWNGRADES !== 'undefined' ? DOWNGRADES.objects || [] : []; const o = D.find(o => o.raw && o.raw.species === k.id && o.raw.downgrade === form); return o ? o.id : null; };
  const lead = g => g.pair && g.pair.length ? g.pair.reduce((a, b) => b.tier > a.tier || (b.tier === a.tier && (g.k.social === 'flock' ? b.sex === 'f' : b.sex === 'm')) ? b : a) : null;
  const ageOf = (S, g, b) => (S.day - b.born) / (g.k.life * YEAR * (b.tier >= 4 ? 2 : b.tier >= 3 ? 1.5 : 1));
  const stageOf = (S, g, b) => { const a = ageOf(S, g, b); return a < .3 ? 'young adult' : a < .65 ? 'prime' : 'old'; };
  const breeder = (S, k, sex, years, tier) => ({ sex, born: S.day - Math.round(years * YEAR), tier, branch: null, form: null, wins: 0, fed: 0, since: S.day, ok: 0 });
  const refresh = g => { const b = lead(g); if (b) g.tier = b.tier; g.vkey = null; };
  const threatOf = g => variant(g).threat;
  const danger = g => g.k.prey ? (g.k.temper < .6 ? 0 : g.n * threatOf(g) * g.k.temper) : g.n * threatOf(g) * g.k.temper + g.young * g.k.temper;
  const many = (name, n) => { const s = name.toLowerCase(); return n === 1 ? s : /wolf$/.test(s) ? s.slice(0, -1) + 'ves' : /(s|x|ch)$/.test(s) ? s + 'es' : s + 's'; };
  const PACK_KG = 5, MAST_KG = 1.5, BLOOD = .04, CATCH = .4;

  function make(o) {
    KINDS = o.lines;
    for (const k of Object.values(KINDS)) { k.clock = CLOCKS[k.active] || CLOCKS.day; k.dz = Object.keys(DZ).find(id => DZ[id].hosts.includes(k.id)) || null; }
    for (const D of Object.values(DZ)) ENDS[D.name] = 'the last one died of ' + D.name;
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
    S.prod = S.groups.reduce((a, g) => a + g.n * g.k.mass, 0) * .015; S.rate = .015; S.prodBy = {}; S.bornBy = {}; S.rateBy = {}; for (const g of S.groups) S.prodBy[g.kind] = (S.prodBy[g.kind] || 0) + g.n * g.k.mass * .015; S.trace = o.trace ? [] : null; S.stats = {}; S.away = []; S.plagues = []; S.snow = 0; S.snowNext = 0; S.forest = frac.forest;
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
  const group = (S, kind, at, n, tier) => { const g = { id: ++S.ids, kind, k: KINDS[kind], tier: tier || 2, held: 0, x: at.x, y: at.y, px: at.x, py: at.y, n, young: 0, cond: .8, state: 'arriving', goal: null, home: null, lair: null, larder: 0, hungry: 0, lean: 0, wait: 0, tries: 0, eaten: 0, avoid: [], target: null, kills: 0, lost: 0, born: 0, won: 0, beat: 0, plenty: 1, mood: 'hunting', hunts: 0, caught: 0, looked: 0, none: 0, intake: 0, needed: 0, prevL: 0, recent: 1, peak: n, from: S.day, came: 'walked in', fate: null, fat: .5, calves: 0, trend: 1, pair: null, e: 0, i: 0, imm: 0, brood: [], hid: 0 }; if (!g.k.prey && g.k.social !== 'swarm') founders(S, g); S.groups.push(g); return g; };
  function founders(S, g) {
    const k = g.k, L = k.life, two = k.social !== 'solo' && g.n >= 2, t = g.tier || 2, first = k.social === 'flock' ? 'f' : S.r() < .5 ? 'm' : 'f';
    g.pair = [breeder(S, k, first, L * (.2 + S.r() * .3), t)];
    if (two) g.pair.push(breeder(S, k, first === 'm' ? 'f' : 'm', L * (.15 + S.r() * .3), Math.min(t, 2)));
    refresh(g);
  }
  const dormant = (S, k) => k.sleeps && season(S) === 3;
  const hunts = (p, h) => {
    const tiny = h.k.mass < 5;
    if (p.k.small === 1) return tiny;
    if (!p.k.small && tiny) return h.n >= p.n * 2 || p.hungry >= 2;
    const power = p.n * threatOf(p), guard = threatOf(h) * h.k.temper * Math.min(h.n, 4);
    return guard <= power * .6 || (p.hungry >= 3 && guard <= power * 1.2);
  };
  const big = k => k.need * k.cap > 5 && k.style !== 'forage' && k.style !== 'ambush' && k.style !== 'trap' && !k.small;
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
      for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) { const X = cx + dx, Y = cy + dy; if (X >= 0 && Y >= 0 && X < S.C && Y < S.C && dx * dx + dy * dy <= r * r) m += 4 * MAST_KG * .05 * S.mast[Y * S.C + X]; }
      const fish = k.fish && S.shore.some((p, q) => q % 5 === 0 && Math.hypot(p.x - x, p.y - y) < k.range * .8) ? 1.5 : 0;
      return clamp((m + fish - rivalsAt(S, g, x, y, k.range, true)) / eat, 0, 3);
    }
    const reach = k.range * 1.2;
    let meat = 0;
    for (const h of S.groups) if (h.k.prey && h.n > 0 && (k.style === 'scavenge' || k.style === 'ambush' ? h.k.mass >= 5 : k.style === 'trap' ? h.k.mass <= 40 : hunts(g, h)) && Math.hypot(h.x - x, h.y - y) < reach) meat += k.style === 'scavenge' ? h.n * BLOOD : h.n * h.k.mass * (S.rateBy[h.kind] || S.rate || .015) * CATCH * (k.style === 'trap' ? .5 : 1);
    return clamp((meat - rivalsAt(S, g, x, y, reach, false)) / eat + (k.small ? S.small[cellOf(S, x, y)] * .3 : 0), 0, 3);
  }
  function rivalsAt(S, g, x, y, reach, forage) {
    let eat = 0;
    for (const o of S.groups) {
      if (o === g || o.k.prey || !o.lair || (o.k.style === 'forage') !== forage || (!forage && o.k.style === 'scavenge') !== (g.k.style === 'scavenge')) continue;
      const d = Math.hypot(o.lair.x - x, o.lair.y - y), span = reach + o.k.range, same = (g.k.small === 1) === (o.k.small === 1) ? 1 : .2;
      if (d < span) eat += o.k.need * (o.n + o.young * .5) * (1 - d / span) * same;
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
    lose.beat++; win.won++; S.tally.predFight++;
    const wl = lead(win), ll = lead(lose);
    if (wl) wl.wins++;
    if (ll && !ll.form && S.r() < .2 / Math.max(1, lose.n)) { ll.form = 'crippled'; refresh(lose); S.tally.downgraded++; tell(S, lose.lair, 'the leader was crippled in the fight'); }
    else if (S.r() < .55) loseOne(S, lose, 'wounds from a fight');
    if (S.r() < .12 && win.n > 1) { loseOne(S, win, 'wounds from a fight'); S.tally.predFight++; }
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
      const mine = lead(g), slot = mine && holder.pair && holder.pair.find(b => b.sex === mine.sex);
      if (slot && g.k.social !== 'solo' && g.n <= 3) {
        S.tally.fights++; S.tally.takeovers++; say(S, 'clash', l);
        if (duel(S, g, holder)) { holder.pair.splice(holder.pair.indexOf(slot), 1); holder.lost++; holder.pair.push(mine); mine.wins++; holder.n += g.n - 1; g.n = 0; g.fate = 'took over ' + l.name; refresh(holder); tell(S, l, `a ${SEXN[mine.sex]} from outside killed the leader and took its place`); trace(S, 'takeover', { kind: g.kind, won: true }); return; }
        loseOne(S, g, 'a lost challenge'); trace(S, 'takeover', { kind: g.kind, won: false }); tell(S, l, 'drove off a challenger');
        g.tries++; g.goal = g.tries > 1 ? null : site(S, g); if (!g.goal) { g.goal = nearestEdge(S, g); g.state = 'leaving'; } else g.state = 'wandering';
        return;
      }
      if (fight(S, g, holder, l, 'over the ' + l.name) === g) { evict(S, holder, 'driven out by rivals'); own(S, g, l); tell(S, l, `taken over by ${g.n}`); }
      else { g.tries++; g.goal = g.tries > 1 ? null : site(S, g); if (!g.goal) { g.goal = nearestEdge(S, g); g.state = 'leaving'; } else g.state = 'wandering'; }
      return;
    }
    const old = S.lairs.filter(l => !l.owner && l.kind === g.kind && dist(l, g) < 45).sort((a, b) => dist(a, g) - dist(b, g))[0];
    if (old) { own(S, g, old); S.tally.reoccupied++; tell(S, old, `reoccupied by ${g.n}`); say(S, 'found', old); return; }
    const l = { id: S.lairs.length + 1, kind: g.kind, x: g.x, y: g.y, founded: S.day, left: -1, owner: null, kills: 0, peak: 0, top: g.tier, story: [], name: g.k.lair + ' ' + (S.names[g.k.lair] = (S.names[g.k.lair] || 0) + 1) };
    S.lairs.push(l); own(S, g, l); trace(S, 'found', { kind: g.kind, food: plentyOf(S, g), near: Math.min(1e4, ...S.groups.filter(h => h.k.prey && h.n > 0 && hunts(g, h)).map(h => dist(h, l))) }); S.tally.founded++; tell(S, l, `founded by ${g.n} ${many(variant(g).name, g.n)}`); say(S, 'found', l);
  }
  const own = (S, g, l) => { if (l.fish === undefined) l.fish = S.shore.some(p => Math.hypot(p.x - l.x, p.y - l.y) < g.k.range * .8); g.lair = l; l.owner = g.id; l.left = -1; g.x = l.x; g.y = l.y; g.state = 'resting'; g.goal = null; g.tries = 0; g.hungry = 0; g.held = 0; };
  function evict(S, g, why) {
    const l = g.lair;
    trace(S, 'evict', { kind: g.kind, why, kg: S.bounty.kg, bigPrey: S.hist.length ? S.hist[S.hist.length - 1].prey : 0, hunts: g.hunts, caught: g.caught, looked: g.looked, none: g.none, intake: g.intake, needed: g.needed, recent: g.recent, wasted: g.wasted || 0, age: S.day - (g.lair ? g.lair.founded : S.day), plenty: g.plenty, food: g.lair ? plentyOf(S, g) : 0, spare: S.bounty.spare, n: g.n });
    if (l) { l.owner = null; l.left = S.day; l.starved = /prey|starved|hunting ground/.test(why) ? S.day : -1; S.tally.abandoned++; tell(S, l, 'abandoned: ' + why); say(S, 'gone', l); }
    g.lair = null; g.target = null;
    if (g.n <= 0) return;
    g.goal = g.tries > 1 ? null : seek(S, g); g.tries++; g.larder += g.k.need * g.n * 2; g.hungry = 0;
    if (g.goal) g.state = 'wandering'; else { g.goal = nearestEdge(S, g); g.state = 'leaving'; }
  }

  const SEXN = { m: 'male', f: 'female' };
  const ENDS = { hunger: 'starved out', 'old age': 'the last one died of old age', sickness: 'the last one died of sickness', 'wounds from a fight': 'the last one fell fighting', 'a kick or a horn': 'the last one was killed by prey', 'a lost challenge': 'the last one fell fighting', colonists: 'cleared by colonists', raid: 'the last one fell raiding' };
  function shiftDen(S, g) {
    const k = g.k, l = g.lair, here = foodAt(S, g, l.x, l.y);
    g.moved = S.day;
    let best = null, top = here * 1.3;
    for (let n = 0; n < 24; n++) {
      const a = S.r() * 6.283, d = k.range * (.3 + S.r() * .4), x = clamp(l.x + Math.cos(a) * d, 30, S.N - 30), y = clamp(l.y + Math.sin(a) * d, 30, S.N - 30), t = S.land[cellOf(S, x, y)];
      if (t === WATER || nearLanding(S, x, y) || S.lairs.some(o => o !== l && o.owner && o.kind === g.kind && Math.hypot(o.x - x, o.y - y) < k.range * .6)) continue;
      const f = foodAt(S, g, x, y);
      if (f > top) { top = f; best = { x, y }; }
    }
    if (!best) return;
    l.x = g.x = best.x; l.y = g.y = best.y; l.fish = undefined; own(S, g, l); S.tally.shifted++; trace(S, 'shift', { kind: g.kind });
    tell(S, l, 'moved the den a short way to better hunting'); say(S, 'found', l);
  }
  function contest(S, g) {
    const k = g.k, P = g.n * threatOf(g) * g.cond, rich = clamp(S.bounty.kg / (S.C * S.C / 10000 * 6000) - .5, 0, 1.5);
    for (const o of S.groups) {
      if (o === g || !o.lair || o.k.prey || !rivals(g, o) || dist(o.lair, g.lair) > (k.range + o.k.range) * .45) continue;
      const Q = o.n * threatOf(o) * o.cond, ratio = P / Math.max(.1, Q);
      if (ratio < 1.3 || S.r() >= .03 * Math.min(2, ratio - 1) * (1 + rich)) continue;
      g.contest = S.day; S.tally.contests++; trace(S, 'contest', { a: g.kind, b: o.kind, ratio });
      const win = fight(S, g, o, o.lair, 'over hunting ground');
      if (win === g && o.lair && o.n > 0 && o.n * threatOf(o) < P * .5) evict(S, o, 'driven off its ground by ' + many(variant(g).name, 2));
      return;
    }
  }
  function loseOne(S, g, cause) {
    g.cause = cause;
    if (g.pair && g.pair.length && (g.n <= g.pair.length || S.r() < g.pair.length / g.n)) return breederDies(S, g, g.pair[Math.floor(S.r() * g.pair.length)], cause);
    g.n = Math.max(0, g.n - 1); g.lost++;
  }
  function breederDies(S, g, b, cause) {
    const k = g.k, i = g.pair.indexOf(b), was = variant(g).name;
    if (i < 0) return;
    g.pair.splice(i, 1); g.n = Math.max(0, g.n - 1); g.lost++; g.cause = cause;
    tell(S, g.lair, `the ${SEXN[b.sex]} ${was.toLowerCase()} died of ${cause}`); trace(S, 'breeder', { kind: g.kind, cause, tier: b.tier, form: b.form });
    refresh(g);
    if (g.n <= 0 || k.social === 'solo' || !g.lair) return;
    const [bo, bt] = BREAKUP[k.social] || [.15, .4];
    if (S.r() < (g.pair.length ? bo : bt)) { S.tally.breakups++; trace(S, 'breakup', { kind: g.kind }); evict(S, g, 'broke up after losing its ' + SEXN[b.sex] + ' leader'); return; }
    const [om, of] = OUTSIDE[k.social] || [.5, .2];
    if (S.r() < (b.sex === 'm' ? om : of)) {
      const d = S.groups.find(o => o !== g && o.kind === g.kind && !o.lair && o.n > 0 && o.n <= 3 && o.pair && o.pair.length && dist(o, g) < 400);
      const nb = d ? Object.assign(d.pair[0], { sex: b.sex }) : breeder(S, k, b.sex, k.life * (.2 + S.r() * .2), 2);
      if (d) { blend(g, d); g.n += d.n; d.n = 0; d.fate = 'joined ' + g.lair.name; } else g.n++;
      g.pair.push(nb); S.tally.adopted++; trace(S, 'succession', { kind: g.kind, outside: true, sex: b.sex });
      tell(S, g.lair, `a ${SEXN[b.sex]} from outside took the empty place`);
    } else if (g.n > g.pair.length) {
      g.pair.push(breeder(S, k, b.sex, k.life * (.15 + S.r() * .15), 2)); trace(S, 'succession', { kind: g.kind, outside: false, sex: b.sex });
      tell(S, g.lair, `a ${b.sex === 'm' ? 'son' : 'daughter'} took the empty place`);
    }
    refresh(g);
  }
  function lifeOf(S, g) {
    if (!g.pair) return;
    const d = S.day % YEAR;
    for (const b of g.pair.slice()) {
      const a = ageOf(S, g, b);
      if (!b.form && a > .65) { b.form = b.tier >= 3 ? 'elder' : 'grizzled'; refresh(g); S.tally.aged++; tell(S, g.lair, `the ${SEXN[b.sex]} leader grew ${b.form === 'elder' ? 'into an elder' : 'grizzled'}`); }
      if (!b.form && g.hungry >= 6) { b.form = 'gaunt'; b.ok = 0; refresh(g); S.tally.downgraded++; tell(S, g.lair, `the ${SEXN[b.sex]} leader went gaunt with hunger`); }
      if (b.form === 'gaunt') { b.ok = g.hungry ? 0 : b.ok + 1; if (b.ok > SEASON_DAYS) { b.form = null; refresh(g); tell(S, g.lair, `the ${SEXN[b.sex]} leader filled out again`); } }
      if (d % SEASON_DAYS === 0 && g.hungry === 0 && g.cond > .7) b.fed++;
      if (d === 0) rise(S, g, b, a);
      const hz = .0003 + (a > .8 ? Math.pow((a - .8) / .2, 3) * .03 : 0) + (b.form === 'gaunt' && g.hungry >= 8 ? .06 : 0);
      if (S.r() < hz) { breederDies(S, g, b, a > .8 ? 'old age' : b.form === 'gaunt' ? 'hunger' : 'sickness'); if (a > .8) S.tally.predAged++; }
    }
  }
  function rise(S, g, b, a) {
    const next = b.tier + 1, held = (S.day - b.since) / YEAR, fed = b.fed / 4;
    b.fed = 0;
    if (b.form || a < .25 || a > .65 || !g.k.tiers.some(t => t.tier === next)) return;
    if (next === 4 && held < 1 || next === 5 && (held < 2 || S.groups.some(o => o.kind === g.kind && o.pair && o.pair.some(x => x.tier === 5)))) return;
    const p = (.03 + .09 * fed + .04 * Math.min(b.wins, 3)) * (next === 3 ? 1 : next === 4 ? .35 : .15);
    if (S.r() >= p) return;
    if (next === 3) b.branch = (b.wins >= 1 ? S.r() < .75 : S.r() < .3) ? 'brute' : 'cunning';
    b.tier = next; b.since = S.day; refresh(g); S.tally.risen++;
    if (g.lair) g.lair.top = Math.max(g.lair.top || 0, next);
    tell(S, g.lair, `the ${SEXN[b.sex]} leader rose to ${variant(g).name.toLowerCase()}`); say(S, 'rise', g.lair || g);
  }
  function duel(S, a, b) {
    const pa = threatOf(a) * a.cond * (.6 + S.r() * .8) * (1 + .15 * Math.min(a.n, 4)), pb = threatOf(b) * b.cond * (.6 + S.r() * .8) * (1 + .15 * Math.min(b.n, 4));
    return pa >= pb;
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
  const formSkill = g => { const b = lead(g); return !b ? 0 : b.form === 'gaunt' ? -.1 : b.form === 'crippled' ? -.15 : b.form === 'grizzled' ? -.05 : b.form === 'elder' ? .1 : b.branch === 'cunning' ? .08 : 0; };
  const catchOf = (p, h) => h.k.mass < 5 ? Math.min(h.n, Math.max(1, p.n)) : 1;
  function takeYoung(h, n) {
    let left = n;
    for (let q = h.brood.length - 1; q >= 0 && left > 0; q--) { const c = h.brood[q]; if (c.hid) continue; const t = Math.min(c.n, left); c.n -= t; left -= t; }
    h.brood = h.brood.filter(c => c.n > 0); h.young -= n - left;
    return n - left;
  }
  function kill(S, p, h, risk) {
    const want = h.k.mass < 5 ? Math.max(1, Math.round(p.n * (.5 + S.r() * .7))) : 1, odds = Math.min(.85, 1.6 * h.young / Math.max(1, h.n + h.young));
    const yng = takeYoung(h, Math.min(h.young, Math.floor(want * odds + S.r()))), take = yng + Math.min(h.n, want - yng), grown = take - yng;
    h.n -= grown; h.lost += take; p.kills += take; S.tally.kills += take; S.tally.youngHunted += yng; count(S, h.kind, 'hunted', take); count(S, h.kind, 'by ' + p.kind, take); if (yng) count(S, h.kind, 'hunted young', yng);
    const kg = h.k.mass * (grown + yng * .35);
    if (h.k.mass >= 5) carcass(S, h, kg * .3, 2);
    let meat = kg * (p.lair && dist(p.lair, h) > p.k.range ? .6 : 1);
    const thief = h.k.mass >= 5 && S.groups.find(b => b.k.style === 'forage' && b !== p && b.lair && b.state !== 'asleep' && dist(b.lair, h) < b.k.range && b.k.clock[S.hour] > .5);
    if (thief && p.k.style !== 'forage' && S.r() < .5) { thief.larder += meat * .5; meat *= .5; S.tally.stolen++; say(S, 'steal', h); tell(S, thief.lair, 'took half a kill from ' + p.k.name.toLowerCase() + 's'); tell(S, p.lair, 'a bear took half a kill'); }
    p.larder += meat;
    if (p.lair) p.lair.kills++;
    const harm = h.k.mass < 5 ? 0 : h.k.danger * (risk || 1) * (threatOf(h) / h.k.threat) * (h.k.temper >= .6 ? 1 : h.k.mass >= 20 ? .4 : 0);
    if (harm && S.r() < harm) { S.tally.predHunting++; S.tally.gored++; trace(S, 'gored', { kind: p.kind, by: h.kind }); say(S, 'death', h); tell(S, p.lair, 'lost a hunter to a ' + h.k.name.toLowerCase()); loseOne(S, p, 'a kick or a horn'); }
    else if (h.k.mass >= 5 && S.r() < harm * 3 + (h.k.mass >= 20 ? .015 : 0)) { const b = lead(p); S.tally.injured++; if (b && !b.form && S.r() < 1 / Math.max(1, p.n)) { b.form = 'crippled'; refresh(p); S.tally.downgraded++; tell(S, p.lair, `the leader was crippled by a ${h.k.name.toLowerCase()}`); } }
    scare(S, h, p);
  }

  function picked(S, m, take) { if (!m.young) return; const y = Math.min(m.young, take); m.young -= y; S.tally.youngEaten += y; }
  function carcass(S, at, kg, days, young) {
    if (kg <= 0) return;
    S.marks.push({ x: at.x, y: at.y, day: S.day, until: S.day + days, kg, young: young ? kg : 0 });
    if (young) S.tally.youngCarrion += kg;
    if (S.marks.length > 300) S.marks.shift();
  }
  const sickNow = g => g.i * g.n;
  function disperse(S, g, n, counts) {
    const k = g.k, o = group(S, g.kind, g, n); o.cond = g.cond; inherit(o, g); S.tally.dispersed += n;
    if (counts[g.kind] < k.want * S.fit[g.kind] * S.C * S.C / 10000 * 8) { o.came = 'young of herd ' + g.id + ' set out on their own'; o.home = pasture(S, o, g, k.burrow ? 12 : 30, true); o.goal = o.home; o.state = 'arriving'; counts[g.kind]++; }
    else { o.came = 'young of herd ' + g.id; o.home = { x: g.x, y: g.y }; o.goal = nearestEdge(S, o); o.state = 'migrating'; o.fate = 'moved off the map'; S.tally.herdsOut++; count(S, g.kind, 'emigrated', n); }
  }
  function nursery(S, g, counts) {
    const k = g.k, T = S.tally;
    if (!g.brood.length) return;
    if (g.n <= 0) { for (const c of g.brood) count(S, g.kind, 'died in the nest', c.n); g.brood = []; g.young = g.hid = 0; return; }
    const fill = (g.n + .3 * (g.young + g.hid)) / k.cap, food = grassNear(S, g, k.roam * CELL), h = -Math.log(k.live) / k.grow * (.5 + .8 * fill * fill) * (1.8 - g.cond) * (1 + 3 * Math.max(0, .5 - food)) * (1 + 2 * g.i);
    let hid = 0, out = 0, grown = 0, young = 0, nest = 0;
    for (const c of g.brood) {
      if (c.hid && S.day - c.at >= k.nest) c.hid = 0;
      const dead = Math.min(c.n, Math.floor(c.n * (1 - Math.exp(-h * (c.hid ? 4 : 1))) + S.r()));
      c.n -= dead; if (c.hid) hid += dead; else out += dead;
      if (c.n > 0 && S.day - c.at >= k.grow) { grown += c.n; if (c.n >= 2 && g.n + c.n > k.cap * .8) disperse(S, g, c.n, counts); else { const was = g.n; g.n += c.n; dilute(g, was); g.calves += c.n; } c.n = 0; }
      if (c.hid) nest += c.n; else young += c.n;
    }
    g.brood = g.brood.filter(c => c.n > 0); g.young = young; g.hid = nest;
    if (hid) { count(S, g.kind, 'died in the nest', hid); T.youngNest += hid; }
    if (out) { count(S, g.kind, 'died young', out); T.youngDied += out; carcass(S, g, k.mass * .35 * out, k.mass < 5 ? 1 : 3, 1); }
    if (grown) T.youngGrown += grown;
  }
  function blend(a, b) { const n = a.n + b.n; if (n <= 0) return; for (const f of ['e', 'i', 'imm']) a[f] = (a[f] * a.n + b[f] * b.n) / n; }
  function dilute(g, was) { if (g.n <= 0 || was >= g.n) return; const f = was / g.n; g.e *= f; g.i *= f; g.imm *= f; }
  const inherit = (o, g) => { o.e = g.e; o.i = g.i; o.imm = g.imm; };
  const catches = o => { if (o.e + o.i <= 0) o.e = Math.min(1, 1 / Math.max(1, o.n)); };
  function sickness(S, g) {
    const D = DZ[g.k.dz], s = season(S), T = S.tally;
    if (!D || g.n <= 0) return;
    const wx = (D.dry && S.wx.kind === 'drought' ? D.dry : 1) * (D.wet && S.wx.kind === 'rain' ? D.wet : 1);
    if (g.e + g.i > 0) {
      const n = g.n, sus = Math.max(0, 1 - g.e - g.i - g.imm), inf = Math.min(sus, D.beta * g.i * sus * D.season[s] * wx), on = g.e / D.incubate, off = g.i / D.sick, die = off * D.lethal;
      g.e += inf - on; g.i += on - off; g.imm += off - die;
      const dead = Math.min(n, Math.floor(n * die + S.r()));
      if (dead) {
        T.sickDied += dead; count(S, g.kind, 'disease', dead); if (g.pl) g.pl.dead += dead;
        if (g.k.prey) { g.n -= dead; g.lost += dead; g.calves = Math.max(0, g.calves - dead); g.cause = D.name; if (g.k.mass >= 5) carcass(S, g, g.k.mass * dead * .6, 4); }
        else for (let q = 0; q < dead && g.n > 0; q++) { loseOne(S, g, D.name); if (q === 0) tell(S, g.lair, 'one died of ' + D.name); }
      }
      if (g.n > 0 && g.n !== n) { const f = n / g.n; g.e *= f; g.i *= f; g.imm *= f; }
      const sum = g.e + g.i + g.imm;
      if (sum > 1) { g.e /= sum; g.i /= sum; g.imm /= sum; }
      if ((g.e + g.i) * g.n < .3) { g.e = 0; g.i = 0; g.pl = null; if (!g.k.prey) tell(S, g.lair, 'the ' + D.name + ' passed'); }
      if (g.i > 0) {
        for (const o of S.groups) {
          if (o === g || o.n <= 0 || o.k.dz !== g.k.dz || o.e + o.i > 0) continue;
          const reach = g.k.prey ? D.reach : (g.k.range + o.k.range) * .6, a = g.lair || g, b = o.lair || o;
          if (Math.hypot(a.x - b.x, a.y - b.y) > reach) continue;
          if (S.r() < D.contact * g.i * (1 - o.imm) * D.season[s] * wx) { catches(o); o.pl = g.pl; if (g.pl) g.pl.groups++; T.spread++; trace(S, 'spread', { kind: o.kind, dz: g.k.dz }); if (!o.k.prey) tell(S, o.lair, 'caught ' + D.name + ' from ' + many(variant(g).name, 2) + ' nearby'); }
        }
      }
    }
    g.imm = Math.max(0, g.imm - g.imm / (D.immune * YEAR));
  }
  function plague(S, dz, near) {
    const D = DZ[dz], hosts = S.groups.filter(g => g.k.dz === dz && g.n > 0 && g.e + g.i <= 0 && (!near || Math.hypot(g.x - near.x, g.y - near.y) < 200));
    if (!hosts.length) return null;
    let v = S.r() * hosts.reduce((a, g) => a + crowdOf(g) * (1 - g.imm), 0), g = hosts[0];
    for (const h of hosts) { v -= crowdOf(h) * (1 - h.imm); if (v <= 0) { g = h; break; } }
    catches(g); g.e = Math.max(g.e, .15);
    const ev = { dz, name: D.name, x: g.x, y: g.y, day: S.day, when: stamp(S), dead: 0, groups: 1, end: -1, kinds: [g.kind] };
    g.pl = ev; S.plagues.push(ev); if (S.plagues.length > 30) S.plagues.shift();
    S.tally.outbreaks++; trace(S, 'outbreak', { kind: g.kind, dz, n: g.n, crowd: crowdOf(g) }); say(S, 'sick', g.lair || g); tell(S, g.lair, D.name + ' broke out');
    return ev;
  }
  const crowdOf = g => Math.pow((g.n + g.young + (g.hid || 0)) / g.k.cap, 2);
  function plagues(S) {
    const s = season(S);
    for (const ev of S.plagues) if (ev.end < 0) {
      const live = S.groups.filter(g => g.pl === ev && g.e + g.i > 0);
      if (!live.length) { ev.end = S.day; continue; }
      const n = live.reduce((a, g) => a + g.n, 0);
      ev.x = live.reduce((a, g) => a + g.x * g.n, 0) / Math.max(1, n); ev.y = live.reduce((a, g) => a + g.y * g.n, 0) / Math.max(1, n);
      for (const g of live) if (!ev.kinds.includes(g.kind)) ev.kinds.push(g.kind);
    }
    for (const [dz, D] of Object.entries(DZ)) {
      if (S.plagues.some(ev => ev.dz === dz && ev.end < 0)) continue;
      const wx = (D.dry && S.wx.kind === 'drought' ? D.dry : 1) * (D.wet && S.wx.kind === 'rain' ? D.wet : 1), crowd = S.groups.reduce((a, g) => a + (g.k.dz === dz ? crowdOf(g) * (1 - g.imm) : 0), 0);
      if (crowd > 0 && S.r() < D.spark * D.season[s] * wx * Math.min(crowd, 40) / 40) plague(S, dz, null);
    }
  }
  function graze(S, g, h) {
    const k = g.k, act = k.clock[h], sp = k.speed * (g.state === 'fleeing' ? 1.5 : .5 + act * .5), i = cellOf(S, g.x, g.y);
    if (g.state === 'wintering' || g.state === 'fleeing' || g.state === 'arriving' || g.state === 'migrating') { const c = cellOf(S, g.x, g.y), bite = Math.min(g.n * k.eats * act / 12 / HEAD_DAYS * .6, Math.max(0, S.grass[c] - S.K[c] * .08)); S.grass[c] -= bite; g.eaten += bite * HEAD_DAYS; }
    if (g.state === 'wintering') { if (move(S, g, g.goal, sp)) g.away = true; return; }
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
    const j = cellOf(S, g.x, g.y), want = g.n * k.eats * act / 12 / HEAD_DAYS * (1.15 + g.lean * .2 + (g.cond < .6 ? .3 : 0)), got = Math.min(want, Math.max(0, S.grass[j] - S.K[j] * .08) * (season(S) === 3 ? 1 - .75 * (S.snow || 0) * (k.cold ? .25 : 1) : 1) + (season(S) === 3 && S.land[j] === FOREST ? want * .35 : 0));
    S.grass[j] -= got; g.eaten += got * HEAD_DAYS;
    if (k.land === FOREST) { const m = Math.min(S.mast[j] * MAST[season(S)] * .2, g.n * act / 12 / 6); S.mast[j] = Math.max(0, S.mast[j] - m * .5); g.eaten += m * 6; }
  }
  const around = (S, g) => { const a = S.r() * 6.283, d = S.r() * g.k.range; return { x: clamp(g.lair.x + Math.cos(a) * d, 5, S.N - 5), y: clamp(g.lair.y + Math.sin(a) * d, 5, S.N - 5) }; };
  const nibble = (S, g, gain) => { const j = cellOf(S, g.x, g.y), take = Math.min(S.small[j], .22); S.small[j] -= take; g.larder += take * gain; };

  function prowl(S, g, h) {
    const k = g.k, act = k.clock[h], need = k.need * (g.n + g.young * .5), stock = need ? g.larder / need : 9;
    if (!g.lair && g.state !== 'wandering' && g.state !== 'leaving') { const on = g.goal && g.goal.x >= 0 && g.goal.y >= 0 && g.goal.x <= S.N && g.goal.y <= S.N; g.state = on ? 'wandering' : 'leaving'; if (!on) g.goal = nearestEdge(S, g); }
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
    if (g.state === 'scavenging') { if (move(S, g, g.goal, k.speed)) { const m = g.goal.m; if (m) { const take = Math.min(m.kg, need * 3); m.kg -= take; g.larder += take; picked(S, m, take); } else g.larder += k.style === 'scavenge' ? 1 : 3; g.state = 'returning'; } return; }
    if (g.state === 'hunting') {
      const t = S.groups.find(q => q.id === g.target);
      if (!t || t.n <= 0 || --g.wait <= 0) { g.state = 'returning'; g.target = null; return; }
      if (!move(S, g, t, k.speed)) return;
      const host = S.groups.find(o => o !== g && o.lair && !o.k.prey && o.state !== 'asleep' && rivals(g, o) && dist(o.lair, t) < o.k.range * .6 && dist(g.lair, t) > g.k.range * .5);
      if (host && S.r() < .3 && fight(S, g, host, t, 'at the edge of their ground') !== g) { g.state = 'returning'; g.target = null; g.wait = 12; return; }
      const snow = season(S) === 3 ? .3 * (S.snow || 0) * (1.2 - t.cond) : S.wx.kind === 'storm' ? -.15 : 0, p = clamp((k.skill + formSkill(g)) * (.5 + .12 * Math.min(g.n, 6)) * (1.35 - .7 * t.cond) * (t.k.mass > 100 ? .6 : 1) * (1 + (g.tier - 2) * .15) * (1 - .4 * g.i) * (1 + .5 * t.young / Math.max(1, t.n + t.young)) + snow + .25 * t.i - (t.state === 'fleeing' ? .15 : 0), .06, .88);
      S.tally.tried++; g.hunts++;
      if (S.r() < p) { S.tally.won++; g.caught++; kill(S, g, t); g.state = 'returning'; g.target = null; }
      else { scare(S, t, g); g.tries++; g.wait = 3; if (g.tries > 1) { g.state = 'returning'; g.target = null; } }
      return;
    }
    if (k.style === 'trap') {
      g.state = act > .5 ? 'lying in wait' : 'resting';
      if (act > .5) for (const t of S.groups) if (t.k.prey && t.n > 0 && t.k.mass <= 40 && t.state !== 'fleeing' && dist(t, g.lair) < k.range && S.r() < .03 * act * (t.k.mass < 5 ? .7 : 1) * (stock < 2 ? 1 : .3)) { S.tally.tried++; S.tally.won++; g.hunts++; g.caught++; kill(S, g, t, .3); break; }
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
      if (k.scav && season(S) <= 1 && stock < 2) { const c = S.marks.find(q => q.kg > .5 && S.day <= q.until && dist(q, g.lair) < k.range); if (c) { const take = Math.min(c.kg, need); c.kg -= take; picked(S, c, take); g.larder += take; } }
      if (k.fish && g.lair.fish && season(S) < 3 && S.r() < .06 * act) g.larder += 1.2;
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
      const m = S.marks.find(q => q.kg > .5 && S.day <= q.until && Math.hypot(q.x - g.lair.x, q.y - g.lair.y) < k.range);
      if (m) { g.goal = { x: m.x, y: m.y, m }; g.state = 'scavenging'; return; }
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
    if (d === SEASON_DAYS * 2) S.snowNext = Math.pow(S.r(), 1.4);
    if (d === SEASON_DAYS * 3) { S.snow = S.snowNext || 0; w.hard = S.snow > .65; if (w.hard) trace(S, 'hard', {}); }
    if (d === 0) { w.hard = false; S.snow = 0; }
    if (w.kind === 'drought' && S.r() < .035) fire(S, null);
    if (--w.left > 0) return;
    const r = S.r();
    w.kind = s === 3 ? (r < .2 + (S.snow || 0) * .7 ? 'snow' : 'clear') : s === 1 ? (r < .03 ? 'drought' : r < .09 ? 'storm' : 'clear') : r < .28 ? 'rain' : r < .34 ? 'storm' : 'clear';
    if (w.kind === 'drought') trace(S, 'drought', {});
    w.left = w.kind === 'drought' ? 8 + Math.floor(S.r() * 6) : w.kind === 'snow' && w.hard ? 4 : 1 + Math.floor(S.r() * 2);
    if (w.kind === 'storm' && s === 1 && S.r() < .3) fire(S, null);
  }
  function act(S, kind) {
    S.log.push([S.t, kind]);
    if (kind === 'fire') { const at = fire(S, null); return; }
    if (kind === 'plague') { const ids = Object.keys(DZ).filter(dz => !S.plagues.some(ev => ev.dz === dz && ev.end < 0) && S.groups.some(g => g.k.dz === dz && g.n > 0)); if (ids.length) plague(S, ids[Math.floor(S.r() * ids.length)], null); return; }
    if (kind === 'winter') { S.wx.hard = true; S.wx.kind = 'snow'; S.wx.left = 6; if (season(S) === 3) S.snow = .9; else S.snowNext = .9; } else { S.wx.kind = kind; S.wx.left = kind === 'drought' ? 10 : 3; }
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
  function daily(S) {
    const s = season(S), d = S.day % YEAR, w = S.wx, T = S.tally, grow = GROW[s] * (w.kind === 'rain' ? 1.35 : w.kind === 'drought' ? .12 : 1), C2 = S.C * S.C, G = S.grass, KK = S.K, M = S.mast, SM = S.small, L = S.land, frozen = s === 3 && w.hard;
    succession(S);
    let total = 0, cap = 0;
    for (let i = 0; i < C2; i++) {
      const K = KK[i]; if (!K) continue;
      const g = G[i] > K * .06 ? G[i] : K * .06;
      let v = G[i] + .11 * g * (1 - g / K) * grow;
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
      for (const g of S.groups) if (!g.k.prey && g.lair && dist(g.lair, col) < col.r + 25 && S.r() < .2) { const lost = Math.min(g.n, 2), at = g.lair; say(S, 'clash', at); tell(S, at, 'attacked by colonists'); for (let q = 0; q < lost && g.n > 0; q++) loseOne(S, g, 'colonists'); T.predColony += lost; if (g.n <= 0 && g.lair) evict(S, g, 'cleared by colonists'); }
      for (let i = 0; i < C2; i++) if (Math.hypot((i % S.C) * CELL + 5 - col.x, Math.floor(i / S.C) * CELL + 5 - col.y) < col.r * .8 && G[i] > KK[i] * .1) G[i] = KK[i] * .1;
    }
    const counts = {};
    for (const g of S.groups.concat(S.away)) counts[g.kind] = (counts[g.kind] || 0) + 1;
    for (const g of S.groups) {
      const k = g.k;
      sickness(S, g);
      if (k.prey) {
        g.avoid = g.avoid.filter(m => m.until > S.day);
        let fed = g.n ? g.eaten / g.n / k.eats : 1; g.eaten = 0;
        if ((s === 1 || s === 2) && fed >= .85) g.fat = Math.min(1, g.fat + .03);
        if (s === 3 && fed < .72 && g.fat > 0) { const use = Math.min(g.fat, (.72 - fed) * .25); g.fat -= use; fed += use * 4; }
        g.cond = clamp(g.cond + (fed - .72) * .22 - (s === 3 && !k.cold ? .03 * (S.snow || 0) : 0), .02, 1);
        if (d === 0) g.calves = 0;
        if (s === 3 && g.calves > 0) { const lost = Math.min(g.calves, g.n, Math.floor(g.calves * (.02 + .035 * (S.snow || 0)) * (1.2 - g.fat) * (g.cond < .5 ? 1.6 : 1) * (k.cold ? .4 : 1) + S.r())); g.n -= lost; g.calves -= lost; g.lost += lost; T.preyStarved += lost; T.winterKill += lost; count(S, g.kind, 'starved young', lost); if (k.mass >= 5) carcass(S, g, k.mass * lost * .6, YEAR - d + 10); }
        g.lean = fed < .6 ? g.lean + 1 : 0;
        if (g.cond < .2 && S.trace) trace(S, 'starving', { kind: g.kind, season: s, here: grassNear(S, g, 0), roam: grassNear(S, g, k.roam * CELL), wide: grassNear(S, g, 100), map: S.hist.length ? S.hist[S.hist.length - 1].grass : 1, state: g.state, n: g.n });
        if (g.cond < .2) { const lost = Math.min(g.n, Math.max(1, Math.round(g.n * .05 * (1 + S.r())))); g.n -= lost; g.calves = Math.max(0, g.calves - lost); g.lost += lost; T.preyStarved += lost; count(S, g.kind, 'starved', lost); count(S, g.kind, 'starved in ' + SEASONS[s], lost); if (s === 3) T.winterKill += lost; if (k.mass >= 5) carcass(S, g, k.mass * lost * .6, s === 3 ? YEAR - d + 10 : 4); }
        if (S.r() < g.n * (k.burrow ? .01 : .0017)) { g.n--; g.lost++; T.preyAged++; count(S, g.kind, 'aged', 1); }
        nursery(S, g, counts);
        if (s < k.breeds && d % 3 === 0) { const born = Math.max(0, Math.round(g.n * k.fec * g.cond / 5 + S.r() * .6 - .1)); if (born) { g.brood.push({ n: born, at: S.day, hid: 1 }); g.hid += born; } g.born += born; T.preyBorn += born; count(S, g.kind, 'born', born); S.bornKg += born * k.mass; S.bornBy[g.kind] = (S.bornBy[g.kind] || 0) + born * k.mass; }
        if (k.migr && !k.burrow && d === SEASON_DAYS * 2 + 10 && g.state !== 'migrating') {
          const want = k.want * S.fit[g.kind] * C2 / 10000, pm = k.migr + .4 * ((S.snowNext || 0) - .4) + .2 * clamp((counts[g.kind] || 0) / Math.max(1, want) - 1, -1, 1) - .3 * (S.forest - .25) + (g.migrant === true ? .25 : g.migrant === false ? -.15 : 0) - .2 * (g.cond - .7);
          g.migrant = S.r() < pm;
          if (g.migrant) { g.state = 'wintering'; g.goal = nearestEdge(S, g); g.left = { x: g.x, y: g.y }; T.migOut++; trace(S, 'migrate', { kind: g.kind, n: g.n }); }
        }
        const mate = g.n > 0 && g.state !== 'wintering' && g.n < k.cap * .4 && S.groups.find(q => q !== g && q.kind === g.kind && q.n > 0 && q.state !== 'wintering' && q.n + g.n <= k.cap * .8 && dist(q, g) < 30);
        if (mate) { blend(mate, g); mate.n += g.n; mate.brood.push(...g.brood); mate.young += g.young; mate.hid += g.hid; g.brood = []; g.young = g.hid = 0; mate.cond = (mate.cond + g.cond) / 2; g.n = 0; g.fate = 'joined herd ' + mate.id; continue; }
        if (g.n > k.cap) { const half = Math.floor(g.n / 2); g.n -= half; if (counts[g.kind] < k.want * S.fit[g.kind] * C2 / 10000 * 8) { const o = group(S, g.kind, g, half); o.came = 'split from herd ' + g.id; o.cond = g.cond; inherit(o, g); o.home = pasture(S, o, g, k.burrow ? 9 : 26, true); o.goal = o.home; o.state = 'arriving'; counts[g.kind]++; } else { const o = group(S, g.kind, g, half); o.came = 'split from herd ' + g.id; o.cond = g.cond; inherit(o, g); o.home = { x: g.x, y: g.y }; o.goal = nearestEdge(S, o); o.state = 'migrating'; o.fate = 'moved off the map'; T.herdsOut++; count(S, g.kind, 'emigrated', half); say(S, 'out', o); } }
        if (g.lean >= 2 && g.state !== 'migrating' && g.state !== 'wintering' && g.state !== 'arriving' && grassNear(S, g.home || g, k.roam * CELL) < .3) { const far = pasture(S, g, g, k.burrow ? 14 : 30, true); if (grassNear(S, far, k.roam * CELL) > .4) { g.home = far; g.goal = far; g.state = 'arriving'; g.lean = 0; g.moved = (g.moved || 0) + 1; T.herdMoves++; } else if (g.lean > 9 && !k.burrow) { g.goal = nearestEdge(S, g); g.state = 'migrating'; g.fate = 'moved off the map'; count(S, g.kind, 'emigrated', g.n); T.herdsOut++; say(S, 'out', g); } }
        continue;
      }
      const inst = Math.min(plentyOf(S, g), Math.max(.2, g.recent * 1.5));
      g.trend += (inst - g.trend) / 14; g.plenty = g.trend;
      const mood = g.mood === 'feasting' ? (g.trend < 1.3 ? 'hunting' : 'feasting') : g.mood === 'saving strength' ? (g.trend > .6 ? 'hunting' : 'saving strength') : g.trend > 1.6 ? 'feasting' : g.trend < .45 ? 'saving strength' : 'hunting';
      if (mood !== g.mood) g.flips = (g.flips || 0) + 1;
      g.mood = mood;
      const asleep = dormant(S, k), need = asleep ? 0 : k.need * (g.n + g.young * .5) * (k.sleeps && s === 2 ? 1.3 : 1) * (g.mood === 'saving strength' ? .75 : 1);
      if (k.style === 'raid' && s !== 3) g.larder += need * .3;
      if (g.lair) { const got = Math.max(0, g.larder - g.prevL); if (k.style === 'forage') trace(S, 'forage', { id: g.id, season: s, got, need, larder: g.larder, hungry: g.hungry, n: g.n, young: g.young, asleep, mast: mastNear(S, g.lair, k.range), hours: g.fhours || 0 }); g.fhours = 0; g.intake += got; g.needed += need; if (need) g.recent += (got / need - g.recent) / 15; }
      g.larder -= need;
      if (g.larder < 0) { g.larder = 0; g.hungry++; g.cond = Math.max(.05, g.cond - .1); } else { g.hungry = 0; g.cond = Math.min(1, g.cond + .06); }
      const room = k.need * (g.n + g.young) * (k.sleeps ? 14 : k.style === 'trap' ? 30 : k.style === 'ambush' ? 20 : 8); if (g.larder > room) g.wasted = (g.wasted || 0) + g.larder - room;
      g.larder = Math.min(g.larder, room); g.prevL = g.larder;
      if (g.hungry >= 3 && g.young > 0 && S.r() < .5) { g.young--; g.lost++; T.predStarved++; tell(S, g.lair, 'a young one starved'); }
      if (g.hungry >= 5 && S.r() < .3) { T.predStarved++; tell(S, g.lair, 'one starved'); if (g.lair) say(S, 'death', g.lair); loseOne(S, g, 'hunger'); }
      const crowd = g.pair ? g.n - g.pair.length : g.n;
      if (crowd > 0 && S.r() < crowd * .0013 * (10 / k.life)) { g.n--; g.lost++; g.cause = 'old age'; T.predAged++; }
      if (g.n > 0) lifeOf(S, g);
      if (g.lair) { g.lair.peak = Math.max(g.lair.peak, g.n + g.young); if (g.n <= 0) evict(S, g, ENDS[g.cause] || 'the last one died'); }
      if (!g.lair || g.n <= 0) continue;
      if (d === 1 && g.young) {
        const was = g.n;
        for (let q = g.young; q > 0; q--) if (S.r() < .7) g.n++;
        dilute(g, was);
        g.young = 0;
        const spare = g.n - (g.pair ? g.pair.length : 0), leave = g.n > k.cap ? Math.max(1, Math.floor(g.n / 2.5)) : spare >= 2 && g.cond > .7 && k.social !== 'solo' && S.r() < .5 ? Math.min(spare, 1 + Math.floor(S.r() * 2)) : k.social === 'solo' && g.n > 1 ? g.n - 1 : 0;
        if (leave > 0) { const o = group(S, g.kind, g, leave, Math.min(g.tier, 2)); o.came = 'left ' + g.lair.name; inherit(o, g); g.n -= leave; o.larder = k.need * leave * 2; o.cond = g.cond; o.goal = seek(S, o); o.state = o.goal ? 'wandering' : 'leaving'; if (!o.goal) o.goal = nearestEdge(S, o); say(S, 'split', g.lair); tell(S, g.lair, leave + ' young left to find ground of their own'); }
      }
      if (d === 3 && g.cond > .6 && stockDays(g) > .6 && (g.pair ? g.pair.length >= 2 || k.social === 'solo' && S.r() < .5 : g.n >= 2 || k.cap <= 2) && S.r() < k.breed) { g.young = Math.round(k.litter[0] + S.r() * (k.litter[1] - k.litter[0])); T.predBorn += g.young; g.born += g.young; tell(S, g.lair, g.young + ' young born'); }
      if (S.day - (g.contest || -99) > 5) contest(S, g);
      if (g.lair && g.hungry >= 4 && g.trend < .6 && S.day - (g.moved || -999) > YEAR) shiftDen(S, g);
    }
    for (const g of S.groups) { if (g.n > 0) { g.peak = Math.max(g.peak, g.n + g.young); continue; } if (g.fate === 'turned back' || /^joined/.test(g.fate || '')) continue; g.fate = g.fate || (g.k.prey ? (g.cond < .2 ? 'starved' : 'all killed') : g.hungry >= 3 ? 'starved out' : 'all killed'); g.end = S.day; S.gone.push(g); }
    if (S.gone.length > 80) S.gone.splice(0, S.gone.length - 80);
    for (const g of S.groups) if (g.away && g.n > 0) { g.away = false; S.away.push(g); }
    S.groups = S.groups.filter(g => g.n > 0 && !S.away.includes(g));
    if (d === 2 && S.away.length) {
      for (const g of S.away) {
        const lost = Math.min(g.n, Math.round(g.n * (.04 + .14 * (S.snow || .3) * (1 - g.fat)) + S.r() * .5)), young = Math.min(g.calves, lost);
        g.n -= lost; g.calves -= young; g.lost += lost; count(S, g.kind, 'lost away', lost);
        if (g.n <= 0) { g.fate = 'did not come back'; g.end = S.day; S.gone.push(g); continue; }
        const home = g.left || g.home || { x: S.N / 2, y: S.N / 2 }, e = nearestEdge(S, home);
        g.x = g.px = clamp(e.x, 4, S.N - 4); g.y = g.py = clamp(e.y, 4, S.N - 4); g.state = 'arriving'; g.goal = home; g.cond = Math.max(g.cond, .55); g.fat = 0;
        S.groups.push(g); T.migBack++; say(S, 'in', g);
      }
      S.away = [];
    }
    plagues(S);
    S.lairs = S.lairs.filter(l => l.owner || S.day - l.left < YEAR * 8);
    const prey = S.groups.filter(g => g.k.prey), out = S.o.outside === undefined ? 1 : S.o.outside, pn = prey.reduce((a, g) => a + (g.k.mass < 5 ? 0 : g.n), 0), packs = S.groups.filter(g => !g.k.prey), D = packs.reduce((a, g) => a + danger(g), 0), herd = prey.reduce((a, g) => a + danger(g), 0);
    balance(S, D);
    if (s === 3 && d % 4 === 0) for (const [kind, k] of Object.entries(KINDS)) if (k.prey && S.cast[kind] && k.migr && S.r() < .15 * k.migr) { const g = arrive(S, kind); g.came = 'came in from the snow looking for food'; g.fat = 0; g.cond = .45; g.migrant = true; T.winterIn++; }
    for (const [kind, k] of Object.entries(KINDS)) if (k.prey && S.cast[kind]) { const want = k.want * S.fit[kind] * C2 / 10000 * out; if ((counts[kind] || 0) < want * .7 && S.r() < .3 * out) arrive(S, kind); }
    S.prod += (S.bornKg - S.prod) / YEAR; S.bornKg = 0;
    const kgBy = {};
    for (const g of prey) kgBy[g.kind] = (kgBy[g.kind] || 0) + g.n * g.k.mass;
    for (const id of Object.keys(KINDS)) if (KINDS[id].prey) { S.prodBy[id] = (S.prodBy[id] || 0) + ((S.bornBy[id] || 0) - (S.prodBy[id] || 0)) / YEAR; S.rateBy[id] = kgBy[id] ? S.prodBy[id] / kgBy[id] : 0; }
    S.bornBy = {};
    const kg = prey.reduce((a, g) => a + g.n * g.k.mass, 0), demand = packs.reduce((a, g) => a + g.k.need * (g.n + g.young * .5), 0), spare = (S.prod - demand) / PACK_KG;
    S.bounty = { kg, yield: S.prod, demand, spare };
    S.rate = kg ? S.prod / kg : 0;
    if (S.r() < .09 * out * clamp(spare / 3, .1, 3) * S.bal.mult) {
      const pool = Object.entries(KINDS).filter(([id, k]) => !k.prey && S.cast[id] && !dormant(S, k)).map(([id, k]) => [id, k.share * S.fit[id] * (.1 + eatable(S, k) / Math.max(1, S.prod))]), sum = pool.reduce((a, p) => a + p[1], 0);
      let v = S.r() * sum;
      for (const [id, w] of pool) { v -= w; if (v <= 0) { arrive(S, id); break; } }
    }
    const row = { prey: pn, pred: packs.reduce((a, g) => a + g.n + g.young, 0), grass: cap ? total / cap : 0, lairs: S.lairs.filter(l => l.owner).length, empty: S.lairs.filter(l => !l.owner).length, danger: Math.round(D), herd: Math.round(herd), target: Math.round(S.bal.target), high: packs.filter(g => g.tier >= 3).length, sick: Math.round(S.groups.reduce((a, g) => a + sickNow(g), 0)), hosts: S.groups.reduce((a, g) => a + (g.k.dz ? g.n : 0), 0) };
    S.hist.push(row);
    if (S.hist.length > 900) S.hist.shift();
    if (d === YEAR - 1) { S.years.push({ year: year(S), ...T, ...row }); S.tally = fresh(); if (S.years.length > 60) S.years.shift(); }
  }
  function mastNear(S, at, range) { let m = 0, c = 0; const r = Math.ceil(range / CELL), cx = Math.floor(at.x / CELL), cy = Math.floor(at.y / CELL); for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const X = cx + dx, Y = cy + dy; if (X >= 0 && Y >= 0 && X < S.C && Y < S.C && dx * dx + dy * dy <= r * r) { m += S.mast[Y * S.C + X]; c++; } } return c ? m / c : 0; }
  function grassNear(S, at, r) { let G = 0, K = 0; const c = Math.ceil(r / CELL), cx = Math.floor(at.x / CELL), cy = Math.floor(at.y / CELL); for (let dy = -c; dy <= c; dy++) for (let dx = -c; dx <= c; dx++) { const X = cx + dx, Y = cy + dy; if (X < 0 || Y < 0 || X >= S.C || Y >= S.C || dx * dx + dy * dy > c * c) continue; const i = Y * S.C + X; G += S.grass[i]; K += S.K[i]; } return K ? G / K : 0; }
  const plentyOf = (S, g) => g.lair ? foodAt(S, g, g.lair.x, g.lair.y) : 1;
  function eatable(S, k) {
    const probe = { k, n: Math.round((k.size[0] + k.size[1]) / 2), tier: 2, id: 0, hungry: 0 };
    return S.groups.reduce((a, t) => a + (t.k.prey && t.n > 0 && hunts(probe, t) ? t.n * t.k.mass * (S.rateBy[t.kind] || S.rate || .015) : 0), 0);
  }
  const stockDays = g => { const need = g.k.need * (g.n + g.young * .5); return need ? g.larder / need : 9; };

  function hour(S) {
    for (const g of S.groups) { g.px = g.x; g.py = g.y; }
    for (const g of S.groups.slice()) if (g.n > 0) (g.k.prey ? graze : prowl)(S, g, S.hour);
    S.t++;
    if (++S.hour === 24) { S.hour = 0; S.day++; weather(S); daily(S); }
  }
  const age = (S, l) => l.owner ? 'lived in' : S.day - l.left < SEASON_DAYS ? 'abandoned' : S.day - l.left < YEAR ? 'overgrown' : 'ruin';
  return { make, hour, act, land, lead, DZ, sickNow, stageOf, ageOf, SEXN, KINDS: () => KINDS, CLOCKS, SEASONS, YEAR, SEASON_DAYS, DAY_MIN, CELL, season, year, stamp, age, stockDays, dormant, variant, threatOf, danger, MEADOW, FOREST, SWAMP, ROCK, WATER };
})();
if (typeof module !== 'undefined') module.exports = ECO;
