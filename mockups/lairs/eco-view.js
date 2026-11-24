'use strict';
(() => {
  const $ = id => document.getElementById(id), map = $('map'), land = $('land'), life = $('life'), shade = $('shade'), busy = $('busy');
  const lctx = land.getContext('2d'), ctx = life.getContext('2d'), graph = $('graph'), gctx = graph.getContext('2d'), dpr = Math.min(2, devicePixelRatio || 1);
  const ART = { deer: 'deer', elk: 'elk', aurochs: 'ox', boar: 'boar', goat: 'bighorn', mammoth: 'mammoth', rabbit: 'rabbit', wolf: 'wolf', worg: 'worg', jackal: 'jackal', frostfang: 'frostfang', gnoll: 'pawn:gnoll', hippogriff: 'hippogriff', bear: 'bear', owlbear: 'owlbear', sabre: 'sabre', lurker: 'lurker', spider: 'spider', adder: 'adder', harpy: 'db:creature/harpy/0', stirge: 'stirge', goblin: 'pawn:goblin', orc: 'pawn:orc', kobold: 'pawn:kobold', croaker: 'croaker' };
  const TALL = { deer: 20, elk: 23, aurochs: 20, boar: 14, goat: 17, mammoth: 28, rabbit: 9, wolf: 15, worg: 17, jackal: 12, frostfang: 17, gnoll: 20, hippogriff: 23, bear: 18, owlbear: 21, sabre: 16, lurker: 9, spider: 12, adder: 9, harpy: 21, stirge: 15, goblin: 17, orc: 21, kobold: 16, croaker: 12 };
  const DEN = { den: [() => LAIR_PROPS.den(3, [46]), 15], cave: [() => LAIR_PROPS.overhang(4), 22], camp: [() => LAIR_PROPS.hut(2), 19], nest: [() => LAIR_PROPS.eggs(1, 4), 12], spire: [() => LAIR_PROPS.spire(3, 40, false), 30] };
  const WORN = { 'lived in': 'none', abandoned: 'grayscale(.75) brightness(.95)', overgrown: 'grayscale(1) sepia(.7) hue-rotate(55deg) brightness(.72)', ruin: 'grayscale(1) brightness(.5) opacity(.8)' };
  const TINT = { deer: '#dcae6c', elk: '#b48a5a', aurochs: '#8a6a4a', boar: '#9a6a4a', goat: '#dcd6c6', mammoth: '#b0683c', rabbit: '#d8b48c', wolf: '#eef0f4', worg: '#9aa0aa', jackal: '#d2a872', frostfang: '#a8e6fa', gnoll: '#c8a060', hippogriff: '#c0c2c0', bear: '#b06a2c', owlbear: '#d2a872', sabre: '#c9b256', lurker: '#a6d05a', spider: '#9c6cc0', adder: '#879340', harpy: '#f29ac4', stirge: '#c47c38', goblin: '#ecdc48', orc: '#84a046', kobold: '#a45a26', croaker: '#6a7832' };
  const PING = { death: '#f0564a', clash: '#f29a3c', found: '#7ad06a', gone: '#b8b2a6', in: '#6cb4f0', out: '#6cb4f0', raid: '#ecdc48', steal: '#b06a2c', split: '#c8a0f0' };
  const TODAY = { wolf: 55, bear: 32, lurker: 24, goblin: 65, harpy: 85 }, MIX = [['lurker', .5], ['goblin', .14], ['bear', .14], ['harpy', .12], ['wolf', .1]];
  const WX = { clear: 'Clear', rain: 'Rain', storm: 'Storm', snow: 'Snow', drought: 'Drought' }, ICON = {}, LAIRICON = {}, FACE = new Map();
  let ui, S = null, seed = 7, frac = 0, last = 0, pick = null, cellMap = null, tone = null, img = null, drawnDay = -1, D = 600, still = null, pings = [], seen = 0, shownHour = -1;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const blank = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

  function raster(spr) {
    let x0 = spr.w, y0 = spr.h, x1 = 0, y1 = 0;
    for (let y = 0; y < spr.h; y++) for (let x = 0; x < spr.w; x++) if (spr.c[y * spr.w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const c = blank(x1 - x0 + 1, y1 - y0 + 1), cx = c.getContext('2d'), im = cx.createImageData(c.width, c.height);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const p = spr.c[y * spr.w + x]; if (!p) continue; const i = ((y - y0) * c.width + x - x0) * 4; im.data[i] = p[0]; im.data[i + 1] = p[1]; im.data[i + 2] = p[2]; im.data[i + 3] = 255; }
    cx.putImageData(im, 0, 0);
    return c;
  }
  function scaled(src, tall, filter, mirror) {
    const k = tall * dpr / src.height, c = blank(src.width * k, tall * dpr), cx = c.getContext('2d');
    cx.imageSmoothingQuality = 'high';
    if (filter && filter !== 'none') cx.filter = filter;
    if (mirror) { cx.translate(c.width, 0); cx.scale(-1, 1); }
    cx.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }
  function icons() {
    for (const kind in ART) {
      const a = ART[kind], spr = a.startsWith('pawn:') ? mkPawn(PAWNS[a.slice(5)].o) : a.startsWith('db:') ? DBX.built(DBX.byId.get(a.slice(3))) : mkBeast(a), src = raster(spr);
      ICON[kind] = { r: scaled(src, TALL[kind]), l: scaled(src, TALL[kind], null, true), y: scaled(src, TALL[kind] * .62), url: scaled(src, 16).toDataURL() };
    }
    for (const den in DEN) { const src = raster(DEN[den][0]()); LAIRICON[den] = {}; for (const state in WORN) LAIRICON[den][state] = scaled(src, DEN[den][1], WORN[state]); }
  }

  function tiles(N) {
    cellMap = new Uint16Array(N * N); tone = new Int8Array(N * N); land.width = land.height = N; img = lctx.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const jx = (noise(x * .11, y * .11, 5) - .5) * 9, jy = (noise(x * .11 + 30, y * .11, 6) - .5) * 9;
      cellMap[y * N + x] = clamp(Math.floor((y + jy) / 10), 0, S.C - 1) * S.C + clamp(Math.floor((x + jx) / 10), 0, S.C - 1);
      tone[y * N + x] = (hash(x, y, 9) - .5) * 20;
    }
  }
  function paint() {
    const C2 = S.C * S.C, pal = new Uint8Array(C2 * 3), s = ECO.season(S), snow = S.wx.kind === 'snow', col = S.colony, N = S.N;
    for (let i = 0; i < C2; i++) {
      const t = S.land[i], k = S.K[i] ? clamp(S.grass[i] / S.K[i], 0, 1) : 0;
      let c = t === ECO.WATER ? (snow && S.wx.hard ? [156, 184, 200] : [44, 96, 138]) : t === ECO.ROCK ? mix3([106, 102, 108], [100, 112, 96], k) : t === ECO.SWAMP ? mix3([88, 82, 56], [58, 86, 58], k)
        : t === ECO.FOREST ? (s === 2 ? mix3([96, 72, 40], [74, 88, 44], k) : mix3([46, 62, 46], [34, 80, 52], k)) : mix3(s === 2 ? [156, 130, 72] : [150, 136, 84], s === 0 ? [98, 154, 64] : s === 2 ? [132, 138, 62] : [90, 138, 60], k);
      if (snow && t !== ECO.WATER) c = mix3(c, [228, 234, 238], t === ECO.FOREST ? .35 : .72);
      if (col && t !== ECO.WATER && Math.hypot((i % S.C) * 10 + 5 - col.x, Math.floor(i / S.C) * 10 + 5 - col.y) < col.r * .8) c = (i + Math.floor(i / S.C)) & 1 ? [170, 142, 82] : [150, 126, 70];
      pal[i * 3] = c[0]; pal[i * 3 + 1] = c[1]; pal[i * 3 + 2] = c[2];
    }
    const d = new Uint32Array(img.data.buffer);
    for (let p = 0; p < N * N; p++) { const i = cellMap[p] * 3, t = tone[p]; d[p] = (0xff000000 | (clamp(pal[i + 2] + t, 0, 255) << 16) | (clamp(pal[i + 1] + t, 0, 255) << 8) | clamp(pal[i] + t, 0, 255)) >>> 0; }
    lctx.putImageData(img, 0, 0);
  }
  function crowd(N) {
    const r = rng(5), lairs = [], mobs = [], n = Math.round(124 * N * N / 562500), herb = Math.round(731 * N * N / 562500);
    for (let i = 0; i < n; i++) {
      let v = r(), kind = 'wolf';
      for (const [k, w] of MIX) { v -= w; if (v <= 0) { kind = k; break; } }
      const x = r() * N, y = r() * N, m = 2 + Math.floor(r() * 4);
      lairs.push({ kind, x, y });
      for (let j = 0; j < m; j++) mobs.push({ kind, x: x + (r() - .5) * 30, y: y + (r() - .5) * 30 });
    }
    for (let i = 0; i < herb;) { const x = r() * N, y = r() * N, m = 1 + Math.floor(r() * 6), kind = r() < .7 ? 'deer' : 'boar'; for (let j = 0; j < m; j++, i++) mobs.push({ kind, x: x + (r() - .5) * 16, y: y + (r() - .5) * 16 }); }
    return { lairs, mobs, herb };
  }

  function fit() {
    const side = innerWidth > 860 ? 424 : 0;
    D = Math.max(240, Math.floor(Math.min(innerWidth - 24 - side, innerHeight - 24)));
    map.style.width = map.style.height = D + 'px';
    life.width = life.height = Math.round(D * dpr);
  }
  const put = (c, x, y) => ctx.drawImage(c, Math.round(x - c.width / 2), Math.round(y - c.height));
  function ring(x, y, r, color, alpha, dash) { ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = dpr; ctx.setLineDash(dash || []); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
  function label(text, x, y) { ctx.font = `600 ${10 * dpr}px system-ui`; ctx.lineWidth = 3 * dpr; ctx.strokeStyle = '#17131a'; ctx.strokeText(text, x, y); ctx.fillStyle = '#fff'; ctx.fillText(text, x, y); }

  function draw(now) {
    const k = D * dpr / S.N, rings = ui.state.rings === 'on';
    ctx.clearRect(0, 0, life.width, life.height);
    if (still) {
      shade.style.opacity = 0;
      if (rings) for (const l of still.lairs) ring(l.x * k, l.y * k, TODAY[l.kind] * k, TINT[l.kind], .5);
      for (const l of still.lairs) put(LAIRICON[ECO.KINDS[l.kind].den]['lived in'], l.x * k, l.y * k + 4 * dpr);
      for (const m of still.mobs) put(ICON[m.kind].y, m.x * k, m.y * k);
      const w = still.lairs.find(l => l.kind === 'wolf' && l.x > 200 && l.y > 200 && l.x < S.N - 200 && l.y < S.N - 200);
      if (w) { ring(w.x * k, w.y * k, 150 * k, '#ffffff', .9, [6 * dpr, 4 * dpr]); label('how far one wolf looks for prey', w.x * k - 76 * dpr, (w.y - 154) * k); }
      return;
    }
    const h = S.hour + frac;
    shade.style.opacity = clamp((Math.cos(h / 24 * Math.PI * 2) + .15) * .42, 0, .42).toFixed(3);
    const col = S.colony;
    if (col) { ring(col.x * k, col.y * k, (col.r + 130) * k, '#ffffff', .35, [3 * dpr, 5 * dpr]); ctx.fillStyle = '#17131a'; ctx.fillRect(col.x * k - 8 * dpr, col.y * k - 8 * dpr, 16 * dpr, 16 * dpr); ctx.fillStyle = '#f2e2b0'; ctx.fillRect(col.x * k - 6 * dpr, col.y * k - 6 * dpr, 12 * dpr, 12 * dpr); ctx.fillStyle = '#a8322c'; ctx.fillRect(col.x * k - 6 * dpr, col.y * k - 6 * dpr, 12 * dpr, 5 * dpr); }
    for (const m of S.marks) { const a = 1 - (S.day - m.day) / 6; if (a <= 0) continue; ctx.globalAlpha = a; ctx.fillStyle = '#efe6d2'; ctx.fillRect(m.x * k - 3 * dpr, m.y * k - dpr * .5, 6 * dpr, dpr); ctx.fillRect(m.x * k - dpr * .5, m.y * k - 3 * dpr, dpr, 6 * dpr); ctx.globalAlpha = 1; }
    if (rings) for (const g of S.groups) if (g.lair) ring(g.lair.x * k, g.lair.y * k, g.k.range * k, TINT[g.kind], g.lair === pick ? .95 : .4);
    for (const l of S.lairs) put(LAIRICON[ECO.KINDS[l.kind].den][ECO.age(S, l)], l.x * k, l.y * k + 4 * dpr);
    const list = S.groups.map(g => ({ g, x: (g.px + (g.x - g.px) * frac) * k, y: (g.py + (g.y - g.py) * frac) * k })).sort((a, b) => a.y - b.y);
    for (const { g, x, y } of list) {
      const prey = g.k.prey, ic = ICON[g.kind];
      if (g.state === 'asleep') { label('z', g.lair.x * k + 8 * dpr, g.lair.y * k - 8 * dpr); continue; }
      if (g.state === 'hunting' || g.state === 'raiding' || g.state === 'scavenging') { const t = g.state === 'raiding' ? S.colony : g.state === 'scavenging' ? g.goal : S.groups.find(o => o.id === g.target); if (t) { ctx.strokeStyle = g.state === 'raiding' ? '#ecdc48' : g.state === 'scavenging' ? '#c8a0f0' : '#f0564a'; ctx.lineWidth = 1.5 * dpr; ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(t.x * k, t.y * k); ctx.stroke(); ctx.setLineDash([]); } }
      if (g.x < g.px - .5) FACE.set(g.id, 'l'); else if (g.x > g.px + .5) FACE.set(g.id, 'r');
      const side = FACE.get(g.id) || 'r', m = prey ? clamp(Math.ceil(g.n / 4), 1, 6) : Math.min(g.n, 5), spread = (prey ? 6 + m * 2.6 : 4 + m * 2.2) * dpr, home = g.lair && Math.hypot(g.x - g.lair.x, g.y - g.lair.y) < 3 ? 7 * dpr : 0, spots = [];
      for (let i = 0; i < m; i++) spots.push([(hash(g.id, i, 1) - .5) * 2 * spread + (g.state === 'grazing' ? Math.sin(now / 1100 + i * 1.7 + g.id) * 1.5 * dpr : 0), (hash(g.id, i, 2) - .5) * spread, ic[side]]);
      for (let i = 0; i < Math.min(g.young, 3); i++) spots.push([(hash(g.id, i, 3) - .5) * 2 * spread, (hash(g.id, i, 4) - .5) * spread + 2 * dpr, ic.y]);
      spots.sort((a, b) => a[1] - b[1]);
      for (const [ox, oy, c] of spots) put(c, x + ox, y + oy + home + c.height * .3);
      label(String(g.n + g.young), x + spread + 5 * dpr, y + home + 4 * dpr);
      if (g === pick) ring(x, y + home, spread + 12 * dpr, '#ffffff', .9);
    }
    if (pick && pick.story) ring(pick.x * k, pick.y * k, 16 * dpr, '#ffffff', .9);
    pings = pings.filter(p => now - p.t < 2800);
    for (const p of pings) {
      const a = (now - p.t) / 2800, x = p.x * k, y = p.y * k;
      ring(x, y, (5 + a * 28) * dpr, PING[p.type] || '#fff', 1 - a);
      if (p.type === 'clash') { ctx.globalAlpha = 1 - a * .7; ctx.strokeStyle = PING.clash; ctx.lineWidth = 2.5 * dpr; ctx.beginPath(); ctx.moveTo(x - 7 * dpr, y - 7 * dpr); ctx.lineTo(x + 7 * dpr, y + 7 * dpr); ctx.moveTo(x + 7 * dpr, y - 7 * dpr); ctx.lineTo(x - 7 * dpr, y + 7 * dpr); ctx.stroke(); ctx.globalAlpha = 1; }
    }
    if (S.hour !== shownHour) { shownHour = S.hour; $('hour').textContent = String(S.hour).padStart(2, '0') + ':00'; for (const u of document.querySelectorAll('#now u')) u.style.left = (S.hour + .5) / 24 * 100 + '%'; }
  }

  function chart() {
    const W = graph.width, H = graph.height, hist = S.hist.slice(-ECO.YEAR * 8), n = hist.length, pm = Math.max(50, ...hist.map(p => p.prey)), qm = Math.max(10, ...hist.map(p => p.pred)), x = i => 6 + i / Math.max(1, n - 1) * (W - 200), y = (v, m) => H - 14 - v / m * (H - 30);
    gctx.clearRect(0, 0, W, H);
    if (n < 2) return;
    gctx.globalAlpha = .22; gctx.fillStyle = css('--grass'); gctx.beginPath(); gctx.moveTo(x(0), H - 14);
    hist.forEach((p, i) => gctx.lineTo(x(i), y(p.grass, 1))); gctx.lineTo(x(n - 1), H - 14); gctx.fill(); gctx.globalAlpha = 1;
    for (const [key, m, c, name] of [['prey', pm, css('--prey'), 'big prey'], ['pred', qm, css('--pred'), 'predators']]) {
      gctx.strokeStyle = c; gctx.lineWidth = 2.5; gctx.beginPath(); hist.forEach((p, i) => i ? gctx.lineTo(x(i), y(p[key], m)) : gctx.moveTo(x(i), y(p[key], m))); gctx.stroke();
      gctx.fillStyle = c; gctx.font = '600 20px system-ui'; gctx.fillText(hist[n - 1][key] + ' ' + name, x(n - 1) + 8, clamp(y(hist[n - 1][key], m) + 6, 18, H - 16) + (key === 'pred' && Math.abs(y(hist[n - 1].pred, qm) - y(hist[n - 1].prey, pm)) < 22 ? 22 : 0));
    }
    gctx.fillStyle = css('--dim'); gctx.font = '18px system-ui'; gctx.fillText('grass ' + Math.round(hist[n - 1].grass * 100) + '%', x(n - 1) + 8, H - 2);
  }
  const head = g => `${g.n}${g.young ? ' and ' + g.young + ' young' : ''}`, pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '–';
  const strip = kind => `<i style="background:linear-gradient(90deg,${ECO.KINDS[kind].active.map((a, h) => `color-mix(in srgb, ${TINT[kind]} ${Math.round(a * 100)}%, #1c1920) ${h / 24 * 100}% ${(h + 1) / 24 * 100}%`).join(',')})"><u></u></i>`;
  function side() {
    const when = $('when');
    if (still) {
      const n = still.lairs.length, t = still.mobs.length;
      when.innerHTML = `<b>Today’s counts on this map</b><span>${n} lairs · ${t} creatures · one per ${Math.round(S.N * S.N / t)} tiles</span><span>${still.herb} of them grazers seeded singly or in handfuls</span><span>Rings are today’s lair ranges. The lair mix is assumed.</span><span id="hour" hidden></span>`;
      return;
    }
    when.innerHTML = `<b>Year ${ECO.year(S)} · ${ECO.SEASONS[ECO.season(S)]} ${S.day % ECO.SEASON_DAYS + 1}</b><span><span id="hour" style="display:inline"></span> · ${WX[S.wx.kind]}${S.wx.hard ? ' · hard winter' : ''}${S.colony ? ` · colony reach ${Math.round(S.colony.r + 130)} tiles` : ''}</span>`;
    shownHour = -1;
    chart();
    const rows = {};
    for (const g of S.groups) { const r = rows[g.kind] || (rows[g.kind] = { groups: 0, head: 0, young: 0, away: 0 }); r.groups++; r.head += g.n; r.young += g.young; if (!g.k.prey && !g.lair) r.away++; }
    $('now').innerHTML = '<tr><th></th><th>Kind</th><th>Groups</th><th>Head</th><th>Active by hour</th></tr>' + [...ECO.PREY, ...ECO.PREDATORS].filter(kind => rows[kind]).map(kind => { const r = rows[kind], K = ECO.KINDS[kind]; return `<tr${K.prey ? '' : ' class="hunter"'}><td><img src="${ICON[kind].url}" alt=""></td><td>${esc(K.name)}${!K.prey && ECO.dormant(S, K) ? ' <em>asleep</em>' : ''}</td><td>${r.groups}${r.away ? ` <em>${r.away} roaming</em>` : ''}</td><td>${r.head}${r.young ? ` <em>+${r.young}</em>` : ''}</td><td>${strip(kind)}</td></tr>`; }).join('');
    const T = S.tally, lived = S.lairs.filter(l => l.owner).length, pair = (a, b) => `<dt>${a}</dt><dd>${b}</dd>`;
    $('tally').innerHTML = pair('Lairs lived in · empty', `${lived} · ${S.lairs.length - lived}`) + pair('Hunts won', `${T.won} of ${T.tried} (${pct(T.won, T.tried)})`) + pair('Prey killed', T.kills) + pair('Prey born', T.preyBorn) + pair('Prey starved · aged', `${T.preyStarved} · ${T.preyAged}`) +
      (S.colony ? pair('Prey taken by colonists', T.preyHunted) : '') + pair('Predators born', T.predBorn) + pair('Predators starved · aged', `${T.predStarved} · ${T.predAged}`) + pair('Lost hunting · in fights', `${T.predHunting} · ${T.predFight}`) + pair('Fights over ground', T.fights) +
      pair('Herds in · out', `${T.herdsIn} · ${T.herdsOut}`) + pair('Packs in · out', `${T.packsIn} · ${T.packsOut}`) + pair('Lairs founded · retaken · left', `${T.founded} · ${T.reoccupied} · ${T.abandoned}`) + pair('Kills stolen by bears', T.stolen) + (S.colony ? pair('Raids on the colony · killed there', `${T.raids} · ${T.predColony}`) : '');
    $('years').innerHTML = '<tr><th>Yr</th><th>Prey</th><th>Pred</th><th>Lairs</th><th>Empty</th><th>Kills</th><th>Hunts</th><th title="prey · predators">Starved</th><th>Fights</th><th title="packs in · out">Packs</th><th title="lowest of the year">Grass</th></tr>' +
      S.years.slice().reverse().map(y => `<tr><td>${y.year}</td><td>${y.prey}</td><td>${y.pred}</td><td>${y.lairs}</td><td>${y.empty}</td><td>${y.kills}</td><td>${pct(y.won, y.tried)}</td><td>${y.preyStarved} · ${y.predStarved}</td><td>${y.fights}</td><td>${y.packsIn} · ${y.packsOut}</td><td>${Math.round(y.grassLow * 100)}%</td></tr>`).join('');
    const p = $('pick');
    if (pick && pick.story) {
      const g = S.groups.find(o => o.lair === pick), state = ECO.age(S, pick);
      p.innerHTML = `<h2>${esc(pick.name)}</h2><p>${g ? `Lived in by ${head(g)} · ${esc(g.state)}` : esc(state[0].toUpperCase() + state.slice(1))}</p>` +
        (g ? `<div class="bar"><i style="width:${clamp(ECO.stockDays(g) / 4, 0, 1) * 100}%"></i></div><p>${ECO.stockDays(g).toFixed(1)} days of food in the larder${g.hungry ? ' · hungry for ' + g.hungry + ' days' : ''}</p>` : '') +
        `<p>Bones of ${pick.kills} kills · most it ever held: ${pick.peak}</p><ul>${pick.story.slice(-10).map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
    } else if (pick && S.groups.includes(pick)) {
      p.innerHTML = `<h2>${esc(pick.k.name)}</h2><p>${head(pick)} · ${esc(pick.state)}</p><p>${pick.k.prey ? 'Condition ' + (pick.cond > .7 ? 'good' : pick.cond > .4 ? 'lean' : 'starving') : ECO.stockDays(pick).toFixed(1) + ' days of food, looking for ground'}</p>`;
    } else { pick = null; p.innerHTML = '<h3>Pick</h3><p>Click a lair or a group on the map for its story.</p>'; }
  }

  function start() {
    const s = ui.state;
    busy.hidden = false; S = null;
    setTimeout(() => {
      if (!ICON.deer) icons();
      const made = ECO.make({ size: +s.map, seed, colony: s.colony });
      for (let h = 0; h < ECO.YEAR * 24 * +s.start; h++) ECO.hour(made);
      S = made; seen = S.said; pick = null; drawnDay = -1; frac = 0; FACE.clear();
      tiles(S.N); still = s.counts === 'today' ? crowd(S.N) : null;
      document.body.classList.toggle('still', !!still);
      fit(); busy.hidden = true;
    }, 30);
  }
  function tick(now) {
    requestAnimationFrame(tick);
    if (!S) return;
    const dt = last ? Math.min(.1, (now - last) / 1000) : 0;
    last = now;
    if (!still) {
      frac += dt * +ui.state.speed * 2;
      for (let n = 0; frac >= 1 && n < 300; n++) { frac -= 1; ECO.hour(S); }
      if (frac >= 1) frac = 0;
      for (const e of S.events.slice(S.events.length - Math.min(S.said - seen, S.events.length, 12))) pings.push({ ...e, t: now });
      seen = S.said;
    }
    if (S.day !== drawnDay) { paint(); drawnDay = S.day; side(); }
    draw(now);
  }

  map.addEventListener('click', ev => {
    if (!S || still) return;
    const b = map.getBoundingClientRect(), x = (ev.clientX - b.left) / b.width * S.N, y = (ev.clientY - b.top) / b.height * S.N, near = (list, lim) => list.map(o => [Math.hypot(o.x - x, o.y - y), o]).filter(p => p[0] < lim).sort((a, c) => a[0] - c[0])[0];
    const l = near(S.lairs, 24), g = near(S.groups, 32);
    pick = l ? l[1] : g ? g[1] : null;
    side();
  });
  for (const b of document.querySelectorAll('[data-wx]')) b.addEventListener('click', () => { if (S && !still) { ECO.force(S, b.dataset.wx); drawnDay = -1; } });
  $('again').addEventListener('click', () => { seed += 3; start(); });
  addEventListener('keydown', ev => { if (ev.key === ' ' && !/^(INPUT|SELECT|BUTTON)$/.test(ev.target.tagName)) { ev.preventDefault(); ui.set('speed', ui.state.speed === '0' ? '8' : '0'); } });
  let rz = 0;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(fit, 120); });

  ui = F4X.bar((state, key) => { if (key === 'map' || key === 'colony' || key === 'counts' || key === 'start') start(); else if (key === 'theme' && S) drawnDay = -1; });
  start();
  requestAnimationFrame(tick);
})();
