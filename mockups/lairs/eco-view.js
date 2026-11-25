'use strict';
(() => {
  const $ = id => document.getElementById(id), map = $('map'), land = $('land'), life = $('life'), shade = $('shade'), busy = $('busy');
  const lctx = land.getContext('2d'), ctx = life.getContext('2d'), graph = $('graph'), gctx = graph.getContext('2d'), dpr = Math.min(2, devicePixelRatio || 1);
  const DEN = { den: (d) => LAIR_PROPS.den(3, [46], d), cave: (d) => LAIR_PROPS.overhang(4, d), camp: (d) => LAIR_PROPS.hut(2, d), nest: (d) => LAIR_PROPS.eggs(1, 4, d), spire: (d) => LAIR_PROPS.spire(3, 40, false, d) };
  const DEN_TALL = { den: 15, cave: 22, camp: 19, nest: 12, spire: 30 }, DECAY = { 'lived in': 0, abandoned: 1, overgrown: 2, ruin: 3 };
  const PING = { death: '#f0564a', clash: '#f29a3c', found: '#7ad06a', gone: '#b8b2a6', in: '#6cb4f0', out: '#6cb4f0', raid: '#ecdc48', steal: '#b06a2c', split: '#c8a0f0', fire: '#ff7a1a', rise: '#ffd24a', sick: '#a8c83a' };
  const TODAY = { wolf: 55, bear: 32, mire_crocodile: 24, goblin: 65, harpy: 85 }, MIX = [['mire_crocodile', .5], ['goblin', .14], ['bear', .14], ['harpy', .12], ['wolf', .1]];
  const WX = { clear: 'Clear', rain: 'Rain', storm: 'Storm', snow: 'Snow', drought: 'Drought' }, ICON = new Map(), LAIRICON = {}, FACE = new Map(), STORE = 'f4x-region-runs', LEDGER = 'f4x-region-ledger';
  const q = new URLSearchParams(location.search);
  let ui, S = null, LINES = null, LEFT = [], seed = +q.get('seed') || 7, frac = 0, last = 0, pick = null, cellMap = null, tone = null, img = null, drawnDay = -1, D = 600, still = null, pings = [], seen = 0, shownHour = -1, replay = null, note = '', hoverId = null, view = { key: 'size', dir: -1, who: 'all', when: 'living' };
  try { Object.assign(view, JSON.parse(localStorage.getItem(LEDGER) || '{}')); } catch {}
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const blank = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  const hours = (days) => { const h = days * ECO.DAY_MIN / 60; return h < 10 ? h.toFixed(1) : Math.round(h); };

  function raster(spr) {
    let x0 = spr.w, y0 = spr.h, x1 = 0, y1 = 0;
    for (let y = 0; y < spr.h; y++) for (let x = 0; x < spr.w; x++) if (spr.c[y * spr.w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const c = blank(x1 - x0 + 1, y1 - y0 + 1), cx = c.getContext('2d'), im = cx.createImageData(c.width, c.height);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const p = spr.c[y * spr.w + x]; if (!p) continue; const i = ((y - y0) * c.width + x - x0) * 4; im.data[i] = p[0]; im.data[i + 1] = p[1]; im.data[i + 2] = p[2]; im.data[i + 3] = 255; }
    cx.putImageData(im, 0, 0);
    return c;
  }
  function scaled(src, tall, mirror) {
    const k = tall * dpr / src.height, c = blank(src.width * k, tall * dpr), cx = c.getContext('2d');
    cx.imageSmoothingQuality = 'high';
    if (mirror) { cx.translate(c.width, 0); cx.scale(-1, 1); }
    cx.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }
  function icon(id) {
    let I = ICON.get(id);
    if (I) return I;
    const e = DBX.byId.get('creature/' + id + '/0'), src = e ? raster(DBX.built(e)) : raster(mkBeast('wolf')), tall = clamp(Math.round(src.height * .5), 7, 32);
    I = { r: scaled(src, tall), l: scaled(src, tall, true), url: scaled(src, 16).toDataURL() };
    ICON.set(id, I);
    return I;
  }
  const groupIcon = g => icon(ECO.variant(g).id), youngIcon = g => icon((g.k.tiers.find(t => t.tier === 1) || g.k.tiers[0]).id);
  function lairIcon(den, state) {
    const key = den + state;
    if (!LAIRICON[key]) { const src = raster(DEN[den](DECAY[state])); LAIRICON[key] = scaled(src, DEN_TALL[den]); }
    return LAIRICON[key];
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
    const C2 = S.C * S.C, pal = new Uint8Array(C2 * 3), s = ECO.season(S), snow = S.wx.kind === 'snow', col = S.colony, N = S.N, Y = ECO.YEAR;
    for (let i = 0; i < C2; i++) {
      const t = S.land[i], k = S.K[i] ? clamp(S.grass[i] / S.K[i], 0, 1) : 0, b = S.burn[i] >= 0 ? S.day - S.burn[i] : -1;
      let c = t === ECO.WATER ? (snow && S.wx.hard ? [156, 184, 200] : [44, 96, 138]) : t === ECO.ROCK ? mix3([106, 102, 108], [100, 112, 96], k) : t === ECO.SWAMP ? mix3([88, 82, 56], [58, 86, 58], k)
        : t === ECO.FOREST ? (s === 2 ? mix3([96, 72, 40], [74, 88, 44], k) : mix3([46, 62, 46], [34, 80, 52], k)) : mix3(s === 2 ? [156, 130, 72] : [150, 136, 84], s === 0 ? [98, 154, 64] : s === 2 ? [132, 138, 62] : [90, 138, 60], k);
      if (b >= 0) c = b < 4 ? [40, 30, 28] : b < Y * .25 ? mix3([52, 42, 36], [120, 150, 60], b / (Y * .25)) : b < Y ? mix3([120, 160, 62], [96, 150, 58], b / Y) : b < 2 * Y ? [88, 122, 58] : mix3([70, 100, 56], c, (b - 2 * Y) / (2 * Y));
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
    const side = innerWidth > 860 ? 504 : 0;
    D = Math.max(240, Math.floor(Math.min(innerWidth - 24 - side, innerHeight - 24)));
    map.style.width = map.style.height = D + 'px';
    life.width = life.height = Math.round(D * dpr);
  }
  const put = (c, x, y) => ctx.drawImage(c, Math.round(x - c.width / 2), Math.round(y - c.height));
  function ring(x, y, r, color, alpha, dash) { ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = dpr; ctx.setLineDash(dash || []); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
  function label(text, x, y, color) { ctx.font = `600 ${10 * dpr}px system-ui`; ctx.lineWidth = 3 * dpr; ctx.strokeStyle = '#17131a'; ctx.strokeText(text, x, y); ctx.fillStyle = color || '#fff'; ctx.fillText(text, x, y); }
  const TIERCOL = ['#fff', '#d8d2c6', '#fff', '#ffd24a', '#ff9a3c', '#ff5a5a'];

  function draw(now) {
    const k = D * dpr / S.N, rings = ui.state.rings === 'on';
    ctx.clearRect(0, 0, life.width, life.height);
    if (still) {
      shade.style.opacity = 0;
      if (rings) for (const l of still.lairs) ring(l.x * k, l.y * k, TODAY[l.kind] * k, '#e0d6b8', .45);
      for (const l of still.lairs) put(lairIcon(LINES[l.kind].den, 'lived in'), l.x * k, l.y * k + 4 * dpr);
      for (const m of still.mobs) put(icon(m.kind).r, m.x * k, m.y * k);
      const w = still.lairs.find(l => l.kind === 'wolf' && l.x > 200 && l.y > 200 && l.x < S.N - 200 && l.y < S.N - 200);
      if (w) { ring(w.x * k, w.y * k, 150 * k, '#ffffff', .9, [6 * dpr, 4 * dpr]); label('how far one wolf looks for prey', w.x * k - 76 * dpr, (w.y - 154) * k); }
      return;
    }
    const h = S.hour + frac;
    shade.style.opacity = clamp((Math.cos(h / 24 * Math.PI * 2) + .15) * .42, 0, .42).toFixed(3);
    const col = S.colony;
    if (col) { ring(col.x * k, col.y * k, (col.r + 130) * k, '#ffffff', .35, [3 * dpr, 5 * dpr]); ctx.fillStyle = '#17131a'; ctx.fillRect(col.x * k - 8 * dpr, col.y * k - 8 * dpr, 16 * dpr, 16 * dpr); ctx.fillStyle = '#f2e2b0'; ctx.fillRect(col.x * k - 6 * dpr, col.y * k - 6 * dpr, 12 * dpr, 12 * dpr); ctx.fillStyle = '#a8322c'; ctx.fillRect(col.x * k - 6 * dpr, col.y * k - 6 * dpr, 12 * dpr, 5 * dpr); }
    else ring(S.N / 2 * k, S.N / 2 * k, 70 * k, '#ffffff', .3, [2 * dpr, 4 * dpr]);
    for (const f of S.fires) { const a = S.day - f.day; if (a < ECO.YEAR) label(a < 4 ? 'fire' : 'burn · deadwood, morels', f.x * k - 30 * dpr, f.y * k, a < 4 ? '#ff9a3c' : '#e0d6b8'); }
    for (const ev of S.plagues || []) { const a = ev.end < 0 ? 0 : S.day - ev.end; if (a < ECO.SEASON_DAYS * 2) label(ev.end < 0 ? ev.name : ev.name + ' passed · ' + ev.dead + ' dead', ev.x * k - 30 * dpr, ev.y * k - 14 * dpr, ev.end < 0 ? PING.sick : '#e0d6b8'); }
    for (const m of S.marks) { const a = m.kg > .5 && S.day <= m.until ? Math.min(.9, .3 + m.kg / 40) : 0; if (a <= 0) continue; ctx.globalAlpha = a; ctx.fillStyle = '#efe6d2'; ctx.fillRect(m.x * k - 3 * dpr, m.y * k - dpr * .5, 6 * dpr, dpr); ctx.fillRect(m.x * k - dpr * .5, m.y * k - 3 * dpr, dpr, 6 * dpr); ctx.globalAlpha = 1; }
    if (rings) for (const g of S.groups) if (g.lair) ring(g.lair.x * k, g.lair.y * k, g.k.range * k, '#e0d6b8', g.lair === pick ? .95 : .35);
    for (const l of S.lairs) put(lairIcon(LINES[l.kind].den, ECO.age(S, l)), l.x * k, l.y * k + 4 * dpr);
    const list = S.groups.map(g => ({ g, x: (g.px + (g.x - g.px) * frac) * k, y: (g.py + (g.y - g.py) * frac) * k })).sort((a, b) => a.y - b.y);
    for (const { g, x, y } of list) {
      const prey = g.k.prey, ic = groupIcon(g);
      if (g.state === 'asleep') { label('z', g.lair.x * k + 8 * dpr, g.lair.y * k - 8 * dpr); continue; }
      if (g.state === 'hunting' || g.state === 'raiding' || g.state === 'scavenging') { const t = g.state === 'raiding' ? S.colony : g.state === 'scavenging' ? g.goal : S.groups.find(o => o.id === g.target); if (t) { ctx.strokeStyle = g.state === 'raiding' ? '#ecdc48' : g.state === 'scavenging' ? '#c8a0f0' : '#f0564a'; ctx.lineWidth = 1.5 * dpr; ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(t.x * k, t.y * k); ctx.stroke(); ctx.setLineDash([]); } }
      if (g.x < g.px - .5) FACE.set(g.id, 'l'); else if (g.x > g.px + .5) FACE.set(g.id, 'r');
      const side = FACE.get(g.id) || 'r', m = prey ? clamp(Math.ceil(g.n / 4), 1, 6) : Math.min(g.n, 5), spread = (prey ? 6 + m * 2.6 : 4 + m * 2.2) * dpr, home = g.lair && Math.hypot(g.x - g.lair.x, g.y - g.lair.y) < 3 ? 7 * dpr : 0, spots = [];
      for (let i = 0; i < m; i++) spots.push([(hash(g.id, i, 1) - .5) * 2 * spread + (g.state === 'grazing' ? Math.sin(now / 1100 + i * 1.7 + g.id) * 1.5 * dpr : 0), (hash(g.id, i, 2) - .5) * spread, ic[side]]);
      if (g.young) { const yi = youngIcon(g); for (let i = 0; i < Math.min(g.young, 3); i++) spots.push([(hash(g.id, i, 3) - .5) * 2 * spread, (hash(g.id, i, 4) - .5) * spread + 2 * dpr, yi[side]]); }
      spots.sort((a, b) => a[1] - b[1]);
      for (const [ox, oy, c] of spots) put(c, x + ox, y + oy + home + c.height * .3);
      label(String(g.n + g.young), x + spread + 5 * dpr, y + home + 4 * dpr, prey ? '#fff' : TIERCOL[g.tier]);
      if (ECO.sickNow(g) >= .5) { ctx.fillStyle = PING.sick; ctx.beginPath(); ctx.arc(x - spread - 4 * dpr, y + home, 3 * dpr, 0, Math.PI * 2); ctx.fill(); }
      if (g === pick) ring(x, y + home, spread + 12 * dpr, '#ffffff', .9);
    }
    if (pick && pick.story) ring(pick.x * k, pick.y * k, 16 * dpr, '#ffffff', .9);
    if (hoverId) mark(list, hoverId, k, now);
    pings = pings.filter(p => now - p.t < 2800);
    for (const p of pings) {
      const a = (now - p.t) / 2800, x = p.x * k, y = p.y * k;
      ring(x, y, (5 + a * (p.type === 'fire' ? 60 : 28)) * dpr, PING[p.type] || '#fff', 1 - a);
      if (p.type === 'clash') { ctx.globalAlpha = 1 - a * .7; ctx.strokeStyle = PING.clash; ctx.lineWidth = 2.5 * dpr; ctx.beginPath(); ctx.moveTo(x - 7 * dpr, y - 7 * dpr); ctx.lineTo(x + 7 * dpr, y + 7 * dpr); ctx.moveTo(x + 7 * dpr, y - 7 * dpr); ctx.lineTo(x - 7 * dpr, y + 7 * dpr); ctx.stroke(); ctx.globalAlpha = 1; }
    }
    if (S.hour !== shownHour) { shownHour = S.hour; const el = $('hour'); if (el) el.textContent = String(S.hour).padStart(2, '0') + ':00'; for (const u of document.querySelectorAll('#now u')) u.style.left = (S.hour + .5) / 24 * 100 + '%'; }
  }

  function mark(list, id, k, now) {
    const live = list.find(o => o.g.id === id), g = live ? live.g : S.gone.find(o => o.id === id);
    if (!g) return;
    const x = live ? live.x : g.x * k, y = live ? live.y : g.y * k, r = (20 + Math.sin(now / 180) * 3) * dpr;
    if (live && g.lair) { ring(g.lair.x * k, g.lair.y * k, g.k.range * k, '#ffd24a', .8, [5 * dpr, 4 * dpr]); ctx.globalAlpha = .7; ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = dpr; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(g.lair.x * k, g.lair.y * k); ctx.stroke(); ctx.globalAlpha = 1; }
    ctx.globalAlpha = .18; ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    ctx.lineWidth = 3 * dpr; ctx.strokeStyle = '#17131a'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2 * dpr; ctx.strokeStyle = live ? '#ffd24a' : '#b8b2a6'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    label(`${ECO.variant(g).name} ${g.id}${live ? '' : ' · ' + g.fate}`, x + r + 4 * dpr, y - r * .4, live ? '#ffd24a' : '#d8d2c6');
  }

  function chart() {
    const W = graph.width, H = graph.height, hist = S.hist.slice(-ECO.YEAR * 10), n = hist.length, pm = Math.max(50, ...hist.map(p => p.prey)), qm = Math.max(10, ...hist.map(p => p.pred)), dm = Math.max(50, ...hist.map(p => Math.max(p.danger, p.target))), x = i => 6 + i / Math.max(1, n - 1) * (W - 200), y = (v, m) => H - 14 - v / m * (H - 30);
    gctx.clearRect(0, 0, W, H);
    if (n < 2) return;
    gctx.globalAlpha = .22; gctx.fillStyle = css('--grass'); gctx.beginPath(); gctx.moveTo(x(0), H - 14);
    hist.forEach((p, i) => gctx.lineTo(x(i), y(p.grass, 1))); gctx.lineTo(x(n - 1), H - 14); gctx.fill(); gctx.globalAlpha = 1;
    gctx.setLineDash([6, 6]); gctx.strokeStyle = css('--dim'); gctx.lineWidth = 2; gctx.beginPath(); hist.forEach((p, i) => i ? gctx.lineTo(x(i), y(p.target, dm)) : gctx.moveTo(x(i), y(p.target, dm))); gctx.stroke(); gctx.setLineDash([]);
    const ends = [];
    for (const [key, m, c, name] of [['prey', pm, css('--prey'), 'big prey'], ['pred', qm, css('--pred'), 'predators'], ['danger', dm, css('--danger'), 'danger']]) {
      gctx.strokeStyle = c; gctx.lineWidth = 2.5; gctx.beginPath(); hist.forEach((p, i) => i ? gctx.lineTo(x(i), y(p[key], m)) : gctx.moveTo(x(i), y(p[key], m))); gctx.stroke();
      let ly = clamp(y(hist[n - 1][key], m) + 6, 18, H - 16);
      while (ends.some(e => Math.abs(e - ly) < 22)) ly += 22;
      ends.push(ly); gctx.fillStyle = c; gctx.font = '600 20px system-ui'; gctx.fillText(hist[n - 1][key] + ' ' + name, x(n - 1) + 8, ly);
    }
    gctx.fillStyle = css('--dim'); gctx.font = '18px system-ui'; gctx.fillText('grass ' + Math.round(hist[n - 1].grass * 100) + '%', x(n - 1) + 8, H - 2);
  }
  const head = g => `${g.n}${g.young ? ' and ' + g.young + ' young' : ''}`, pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '–';
  const strip = kind => `<i style="background:linear-gradient(90deg,${LINES[kind].clock.map((a, h) => `color-mix(in srgb, #e0c48a ${Math.round(a * 100)}%, #1c1920) ${h / 24 * 100}% ${(h + 1) / 24 * 100}%`).join(',')})"><u></u></i>`;
  const tierText = list => { const c = {}; for (const g of list) c[g.tier] = (c[g.tier] || 0) + g.n; return Object.keys(c).sort().map(t => `<b class="t${t}">${t}</b>${c[t]}`).join(' '); };

  const COLS = [['rank', '#'], ['name', 'Group'], ['size', 'Size'], ['tier', 'T'], ['kills', 'Kills'], ['lost', 'Lost'], ['born', 'Born'], ['fed', 'Fed'], ['age', 'Age'], ['threat', 'Threat']];
  const UP = { name: 1, fed: 1 };
  const span = g => (g.end === undefined ? S.day : g.end) - g.from, ago = d => d < ECO.YEAR ? d + 'd' : Math.floor(d / ECO.YEAR) + 'y ' + d % ECO.YEAR + 'd';
  const VAL = {
    name: g => ECO.variant(g).name + ' ' + String(g.id).padStart(5, '0'), size: g => g.end === undefined ? g.n + g.young : g.peak, tier: g => g.tier, kills: g => g.kills, lost: g => g.lost, born: g => g.born,
    fed: g => g.end === undefined ? g.cond : 9, age: span, threat: g => g.end === undefined ? ECO.danger(g) : 0,
  };
  const TITLES = {
    hunter: [['biggest', 'size', -1], ['deadliest', 'kills', -1], ['most lost', 'lost', -1], ['hungriest', 'fed', 1, .7], ['eldest', 'age', -1], ['most feared', 'threat', -1], ['top tier', 'tier', -1, 3]],
    prey: [['biggest', 'size', -1], ['most lost', 'lost', -1], ['most born', 'born', -1], ['hungriest', 'fed', 1, .7], ['eldest', 'age', -1]],
  };
  function titles() {
    const out = new Map();
    for (const role of ['hunter', 'prey']) {
      const pool = S.groups.filter(g => !!g.k.prey === (role === 'prey') && g.n > 0);
      for (const [name, key, dir, bar] of TITLES[role]) {
        let best = null;
        for (const g of pool) if (!best || (VAL[key](best) - VAL[key](g)) * dir > 0) best = g;
        if (!best) continue;
        const v = VAL[key](best);
        if (key === 'fed' ? v >= bar : key === 'tier' ? v < bar : v <= 0) continue;
        if (!out.has(best.id)) out.set(best.id, []);
        out.get(best.id).push(name);
      }
    }
    return out;
  }
  const ledBy = g => { const b = ECO.lead(g); return b ? ` · led by ${b.form ? b.form + ' ' : ''}${ECO.stageOf(S, g, b)} ${ECO.SEXN[b.sex]}${g.pair.length > 1 ? ' and mate' : ''}` : ''; };
  const ill = g => { const D = g.k.dz && ECO.DZ[g.k.dz]; if (!D) return ''; const n = Math.round(ECO.sickNow(g)), e = Math.round(g.e * g.n), r = Math.round(g.imm * g.n); return n || e ? `${D.name}: ${n} sick${e ? ', ' + e + ' coming down with it' : ''}${r ? ', ' + r + ' immune' : ''}` : r ? `${r} immune to ${D.name}` : ''; };
  const breeders = g => g.pair && g.pair.length ? '<p>' + g.pair.map(b => `${ECO.SEXN[b.sex][0].toUpperCase() + ECO.SEXN[b.sex].slice(1)}, tier ${b.tier}${b.branch ? ' ' + b.branch : ''}${b.form ? ', ' + b.form : ''}, ${Math.round((S.day - b.born) / ECO.YEAR)} years, ${ECO.stageOf(S, g, b)}, ${b.wins} fights won`).join('<br>') + '</p>' : '';
  const pickedId = () => !pick ? null : pick.story ? (S.groups.find(o => o.lair === pick) || {}).id : pick.id;
  function ledger() {
    const el = $('ledger'); if (!el || !S) return;
    for (const b of document.querySelectorAll('#lfilter button')) b.classList.toggle('on', view[b.dataset.f] === b.dataset.v);
    const src = view.when === 'gone' ? S.gone : S.groups.filter(g => g.n > 0).concat(S.away || []), rows = src.filter(g => view.who === 'all' || (view.who === 'prey') === !!g.k.prey);
    const f = VAL[view.key] || VAL.size, dir = view.dir;
    rows.sort((a, b) => { const x = f(a), y = f(b); return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir || b.id - a.id; });
    const T = titles(), me = pickedId();
    const where = g => g.end !== undefined ? g.fate : (S.away || []).includes(g) ? 'wintering away' : (g.lair ? g.lair.name + ' · ' + g.mood : g.k.prey ? g.state : g.state + ', no lair') + ledBy(g) + (ECO.sickNow(g) >= .5 ? ' · ' + ECO.DZ[g.k.dz].name : '');
    el.innerHTML = '<thead><tr>' + COLS.map(([key, name]) => key === 'rank' ? `<th>${name}</th>` : `<th data-sort="${key}" class="${view.key === key ? 'on' : ''}">${name}${view.key === key ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('') + '</tr></thead><tbody>' +
      rows.map((g, i) => {
        const gone = g.end !== undefined, tags = (T.get(g.id) || []).map(t => `<span class="tag">${t}</span>`).join(''), fed = Math.round(g.cond * 100);
        const tip = `${ECO.variant(g).name} ${g.id} · ${g.came} · peak ${g.peak}${g.won || g.beat ? ` · fights won ${g.won}, lost ${g.beat}` : ''}${!g.k.prey && !gone ? ` · ${ECO.stockDays(g).toFixed(1)} days of food` : ''}${!gone ? ' · ' + g.state : ''}`;
        return `<tr data-id="${g.id}" class="${g.k.prey ? 'prey' : 'hunter'}${gone ? ' gone' : ''}${g.id === me ? ' picked' : ''}${g.id === hoverId ? ' hover' : ''}" title="${esc(tip)}"><td>${i + 1}</td>` +
          `<td class="who"><div><img src="${icon(ECO.variant(g).id).url}" alt=""><span><b>${esc(ECO.variant(g).name)}</b> <em>${g.id} · ${esc(where(g))}</em>${tags ? '<br>' + tags : ''}</span></div></td>` +
          `<td>${VAL.size(g)}${g.young && !gone ? `<em>+${g.young}</em>` : ''}</td><td><b class="t${g.tier}">${g.tier}</b></td><td>${g.k.prey ? '' : g.kills}</td><td>${g.lost}</td><td>${g.born}</td>` +
          `<td class="${!gone && fed < 40 ? 'low' : ''}">${gone ? '' : fed + '%'}</td><td>${ago(span(g))}</td><td>${gone ? '' : Math.round(ECO.danger(g))}</td></tr>`;
      }).join('') + '</tbody>';
    $('lcount').textContent = `${rows.length} ${view.when === 'gone' ? 'gone, latest ' + S.gone.length + ' kept' : 'groups'}`;
  }
  const saveView = () => { try { localStorage.setItem(LEDGER, JSON.stringify(view)); } catch {} };
  $('lfilter').addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; view[b.dataset.f] = b.dataset.v; saveView(); ledger(); });
  $('ledger').addEventListener('click', ev => {
    const th = ev.target.closest('th[data-sort]');
    if (th) { const key = th.dataset.sort; view.dir = view.key === key ? -view.dir : UP[key] ? 1 : -1; view.key = key; saveView(); ledger(); return; }
    const tr = ev.target.closest('tr[data-id]'); if (!tr || !S) return;
    const id = +tr.dataset.id, g = S.groups.find(o => o.id === id) || S.gone.find(o => o.id === id);
    if (!g) return;
    pick = g.lair && g.end === undefined ? g.lair : g;
    side();
  });
  $('ledger').addEventListener('mouseover', ev => { const tr = ev.target.closest('tr[data-id]'); const id = tr ? +tr.dataset.id : null; if (id === hoverId) return; hoverId = id; for (const r of document.querySelectorAll('#ledger tr.hover')) r.classList.remove('hover'); if (tr) tr.classList.add('hover'); });
  $('ledger').addEventListener('mouseleave', () => { hoverId = null; for (const r of document.querySelectorAll('#ledger tr.hover')) r.classList.remove('hover'); });

  const sickAll = () => Math.round(S.groups.reduce((a, g) => a + ECO.sickNow(g), 0));
  function side() {
    const when = $('when');
    if (still) {
      const n = still.lairs.length, t = still.mobs.length;
      when.innerHTML = `<b>Today’s counts on this map</b><span>${n} lairs · ${t} creatures · one per ${Math.round(S.N * S.N / t)} tiles</span><span>${still.herb} of them grazers seeded singly or in handfuls</span><span>Rings are today’s lair ranges. The lair mix is assumed.</span>`;
      return;
    }
    const col = S.colony;
    when.innerHTML = `<b>Year ${ECO.year(S)} · ${ECO.SEASONS[ECO.season(S)]} ${S.day % ECO.SEASON_DAYS + 1}</b><span><i id="hour"></i> · ${WX[S.wx.kind]}${ECO.season(S) === 3 ? ' · snow ' + Math.round((S.snow || 0) * 100) + '%' : ''}${S.wx.hard ? ' · hard winter' : ''}${(S.away || []).length ? ' · ' + S.away.length + ' herds wintering away' : ''}${sickAll() ? ' · ' + sickAll() + ' sick' : ''}</span>` +
      `<span>${col ? `Colony landed ${hours(S.day - col.since)} h of play ago at 1× (${hours((S.day - col.since) / 4)} h at 4×)` : `${ECO.year(S) - 1} years of history, no colony yet`}</span><span class="dim">A year is ${ECO.YEAR} days of ${ECO.DAY_MIN} min: ${hours(ECO.YEAR)} h at 1×, ${hours(ECO.YEAR / 4)} h at 4×</span>${note ? `<span class="note">${esc(note)}</span>` : ''}`;
    shownHour = -1;
    chart();
    const by = {};
    for (const g of S.groups) (by[g.kind] = by[g.kind] || []).push(g);
    const ids = Object.keys(LINES).filter(id => S.cast[id]).sort((a, b) => (LINES[b].prey ? 1 : 0) - (LINES[a].prey ? 1 : 0) || (by[b] || []).reduce((s, g) => s + g.n, 0) - (by[a] || []).reduce((s, g) => s + g.n, 0));
    $('now').innerHTML = '<tr><th></th><th>Line</th><th>Groups</th><th>Head by tier</th><th>Danger</th><th>By hour</th></tr>' + ids.map(id => {
      const K = LINES[id], gs = by[id] || [], top = gs.slice().sort((a, b) => b.tier - a.tier)[0], dn = gs.reduce((s, g) => s + ECO.danger(g), 0), roam = gs.filter(g => !K.prey && !g.lair).length;
      return `<tr class="${K.prey ? 'prey' : 'hunter'}${gs.length ? '' : ' gone'}"><td><img src="${icon(top ? ECO.variant(top).id : (K.tiers.find(t => t.tier === 2) || K.tiers[0]).id).url}" alt=""></td><td>${esc(K.name)}<em> ${esc(K.rarity)}</em>${!K.prey && ECO.dormant(S, K) ? ' <em>asleep</em>' : ''}</td><td>${gs.length || '–'}${roam ? ` <em>${roam} roaming</em>` : ''}</td><td>${gs.length ? tierText(gs) : '<em>not yet seen</em>'}</td><td>${Math.round(dn) || ''}</td><td>${strip(id)}</td></tr>`;
    }).join('');
    const absent = Object.keys(LINES).filter(id => !S.cast[id]).map(id => LINES[id].name);
    $('absent').innerHTML = `<b>Not in this region:</b> ${esc(absent.join(', ')) || 'none'}. <b>Not in the food web:</b> ${esc(LEFT.map(l => l.name).join(', '))}.`;
    const B = S.bal, reach = col ? S.groups.filter(g => Math.hypot(g.x - col.x, g.y - col.y) < col.r + 130).reduce((s, g) => s + ECO.danger(g), 0) : 0, Dm = S.groups.reduce((s, g) => s + ECO.danger(g), 0);
    $('bal').innerHTML = `<dt>Map danger now</dt><dd>${Math.round(Dm)}</dd><dt>From hunters, which the balance steers</dt><dd>${Math.round(S.groups.filter(g => !g.k.prey).reduce((s, g) => s + ECO.danger(g), 0))}</dd><dt>Season average</dt><dd>${Math.round(B.ema)}</dd><dt>Target</dt><dd>${Math.round(B.target)}</dd>${col ? `<dt>Inside the colony’s reach</dt><dd>${Math.round(reach)}</dd>` : ''}<dt>Arrivals from the edge</dt><dd>×${B.mult.toFixed(2)}${B.dull > ECO.SEASON_DAYS ? ' · too quiet' : ''}</dd><dt>Prey on the map</dt><dd>${Math.round(S.bounty.kg).toLocaleString()} kg</dd><dt>Prey born per day · eaten by hunters</dt><dd>${Math.round(S.bounty.yield)} · ${Math.round(S.bounty.demand)} kg</dd><dt>Room for more packs</dt><dd>${S.bounty.spare > 0 ? S.bounty.spare.toFixed(1) : 'none'}</dd>`;
    const T = S.tally, lived = S.lairs.filter(l => l.owner).length, pair = (a, b) => `<dt>${a}</dt><dd>${b}</dd>`;
    $('tally').innerHTML = pair('Lairs lived in · empty', `${lived} · ${S.lairs.length - lived}`) + pair('Hunts won', `${T.won} of ${T.tried} (${pct(T.won, T.tried)})`) + pair('Prey killed · born', `${T.kills} · ${T.preyBorn}`) + pair('Prey starved · aged', `${T.preyStarved} · ${T.preyAged}`) +
      (col ? pair('Prey taken by colonists', T.preyHunted) : '') + pair('Predators born', T.predBorn) + pair('Predators starved · aged', `${T.predStarved} · ${T.predAged}`) + pair('Lost hunting · in fights', `${T.predHunting} · ${T.predFight}`) + pair('Fights over ground', T.fights) +
      pair('Leaders risen · grew old · fell to gaunt or crippled', `${T.risen} · ${T.aged} · ${T.downgraded}`) + pair('Leaders from outside · takeovers · packs broken up', `${T.adopted} · ${T.takeovers} · ${T.breakups}`) + pair('Contests over hunting ground', T.contests) + pair('Herds left for winter · came back · came in from the snow', `${T.migOut} · ${T.migBack} · ${T.winterIn}`) + pair('Dens moved a short way', T.shifted) + pair('Killed by winter', T.winterKill) + pair('Plagues · groups they reached · died of sickness', `${T.outbreaks} · ${T.outbreaks + T.spread} · ${T.sickDied}`) + pair('Hunters killed · hurt by prey', `${T.gored} · ${T.injured}`) + pair('Wildfires', T.fires) + pair('Herds in · out', `${T.herdsIn} · ${T.herdsOut}`) + pair('Packs in · out · looked and moved on', `${T.packsIn} · ${T.packsOut} · ${T.passed}`) + pair('Lairs founded · retaken · left', `${T.founded} · ${T.reoccupied} · ${T.abandoned}`) + pair('Kills stolen by bears', T.stolen) + (col ? pair('Raids on the colony · killed there', `${T.raids} · ${T.predColony}`) : '');
    $('years').innerHTML = '<tr><th>Yr</th><th>Prey</th><th>Pred</th><th>Lairs</th><th>Empty</th><th>Kills</th><th>Hunts</th><th title="prey · predators">Starved</th><th>Fights</th><th title="groups led by tier 3 or higher">T3+</th><th>Fires</th><th title="from hunters">Danger</th><th title="killed by winter">Winter</th><th title="plagues · died of sickness">Plague</th><th title="lowest of the year">Grass</th></tr>' +
      S.years.slice().reverse().map(y => `<tr><td>${y.year}</td><td>${y.prey}</td><td>${y.pred}</td><td>${y.lairs}</td><td>${y.empty}</td><td>${y.kills}</td><td>${pct(y.won, y.tried)}</td><td>${y.preyStarved} · ${y.predStarved}</td><td>${y.fights}</td><td>${y.high}</td><td>${y.fires}</td><td>${y.danger}</td><td>${y.winterKill || 0}</td><td>${y.outbreaks || 0} · ${y.sickDied || 0}</td><td>${Math.round(y.grassLow * 100)}%</td></tr>`).join('');
    const p = $('pick');
    if (pick && pick.story) {
      const g = S.groups.find(o => o.lair === pick), state = ECO.age(S, pick);
      p.innerHTML = `<h2>${esc(pick.name)}</h2><p>${g ? `Lived in by ${head(g)} ${esc(ECO.variant(g).name.toLowerCase())}s (group ${g.id}) · ${esc(g.state)}` : esc(state[0].toUpperCase() + state.slice(1))}${pick.burnt ? ' · burnt' : ''}</p>` +
        (g ? `<div class="bar"><i style="width:${clamp(ECO.stockDays(g) / 4, 0, 1) * 100}%"></i></div><p>${ECO.stockDays(g).toFixed(1)} days of food in the larder${g.hungry ? ' · hungry for ' + g.hungry + ' days' : ''} · ${esc(g.mood)}</p>${breeders(g)}${ill(g) ? '<p>' + esc(ill(g)) + '</p>' : ''}` : '') +
        `<p>Bones of ${pick.kills} kills · most it ever held: ${pick.peak}</p><ul>${pick.story.slice(-10).map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
    } else if (pick && (S.groups.includes(pick) || (S.away || []).includes(pick))) {
      p.innerHTML = `<h2>${esc(ECO.variant(pick).name)} ${pick.id}</h2><p>${head(pick)} · ${(S.away || []).includes(pick) ? 'wintering away' : esc(pick.state)} · tier ${pick.tier} · ${esc(pick.came)}</p><p>${pick.k.prey ? 'Condition ' + (pick.cond > .7 ? 'good' : pick.cond > .4 ? 'lean' : 'starving') + ' · fat ' + Math.round(pick.fat * 100) + '%' + (pick.k.migr ? ' · ' + (pick.migrant ? 'leaves for winter' : 'stays the winter') : '') : ECO.stockDays(pick).toFixed(1) + ' days of food, looking for ground'}</p>${breeders(pick)}${ill(pick) ? '<p>' + esc(ill(pick)) + '</p>' : ''}<p>${pick.k.prey ? '' : pick.kills + ' kills · '}${pick.lost} lost · ${pick.born} born · most it ever held: ${pick.peak}</p>`;
    } else if (pick && S.gone.includes(pick)) {
      p.innerHTML = `<h2>${esc(ECO.variant(pick).name)} ${pick.id}</h2><p>Gone: ${esc(pick.fate)} · ${esc(pick.came)} · lasted ${ago(span(pick))}</p><p>${pick.k.prey ? '' : pick.kills + ' kills · '}${pick.lost} lost · ${pick.born} born · most it ever held: ${pick.peak}</p>`;
    } else { pick = null; p.innerHTML = '<h3>Pick</h3><p>Click a lair or a group on the map for its story.</p>'; }
    ledger();
    runs();
  }

  const code = () => btoa(JSON.stringify({ v: 2, seed, map: +ui.state.map, colony: ui.state.colony, hist: +ui.state.hist, at: S.t, log: S.log }));
  const saved = () => { try { return JSON.parse(localStorage.getItem(STORE) || '[]'); } catch { return []; } };
  const keep = list => { try { localStorage.setItem(STORE, JSON.stringify(list)); } catch {} };
  function runs() {
    const list = saved();
    $('runs').innerHTML = `<div class="row"><button id="copy">Copy link</button><button id="save">Save this run</button><span class="dim">seed ${seed}</span></div>` +
      (list.length ? '<ul>' + list.map((r, i) => `<li><button data-load="${i}">Load</button> <b>${esc(r.name)}</b> <em>${esc(r.line)}</em> <button data-drop="${i}" title="Remove">×</button></li>`).join('') + '</ul>' : '<p class="dim">No saved runs in this browser yet.</p>');
  }
  $('runs').addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b || !S) return;
    if (b.id === 'copy') { const url = location.origin + location.pathname + '?run=' + code(); (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => { note = 'Link copied.'; side(); }, () => prompt('Copy this link', url)); return; }
    if (b.id === 'save') { const H = S.hist[S.hist.length - 1] || {}, list = saved(); list.unshift({ name: `Seed ${seed} · year ${ECO.year(S)}`, line: `${H.prey || 0} prey · ${H.pred || 0} predators · ${H.lairs || 0} lairs · ${S.log.length} sent`, code: code() }); keep(list.slice(0, 30)); note = 'Saved in this browser.'; side(); return; }
    if (b.dataset.load) { load(saved()[+b.dataset.load].code); return; }
    if (b.dataset.drop) { const list = saved(); list.splice(+b.dataset.drop, 1); keep(list); runs(); }
  });
  function load(c) {
    let r;
    try { r = JSON.parse(atob(c)); } catch { note = 'That run could not be read.'; return; }
    seed = r.seed; replay = r; if (r.v !== 2) note = 'This run was saved under older rules, so it plays out differently now.';
    for (const [k, v] of [['map', r.map], ['colony', r.colony], ['hist', r.hist]]) ui.state[k] = String(v);
    ui.set('speed', '0');
    start();
  }

  function start() {
    const s = ui.state, r = replay;
    busy.hidden = false; S = null;
    setTimeout(() => {
      const made = ECO.make({ size: +s.map, seed, lines: LINES }), histH = ECO.YEAR * 24 * +s.hist, end = r ? r.at : histH, log = r ? r.log.slice() : [];
      while (made.t < end) {
        if (made.t === histH && !made.colony) ECO.land(made, s.colony);
        while (log.length && log[0][0] === made.t) ECO.act(made, log.shift()[1]);
        ECO.hour(made);
      }
      if (made.t >= histH && !made.colony) ECO.land(made, s.colony);
      if (r) made.log = r.log.slice();
      S = made; seen = S.said; pick = null; drawnDay = -1; frac = 0; FACE.clear(); note = r ? (r.v !== 2 ? 'Saved under older rules, so it played out differently. ' : '') + `Replayed to year ${ECO.year(S)}, ${S.log.length} things sent.` : ''; replay = null;
      F4X.write({ seed, run: null });
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
  for (const b of document.querySelectorAll('[data-wx]')) b.addEventListener('click', () => { if (S && !still) { ECO.act(S, b.dataset.wx); drawnDay = -1; } });
  $('again').addEventListener('click', () => { seed = 1 + Math.floor(Math.random() * 99999); start(); });
  addEventListener('keydown', ev => { if (ev.key === ' ' && !/^(INPUT|SELECT|BUTTON)$/.test(ev.target.tagName)) { ev.preventDefault(); ui.set('speed', ui.state.speed === '0' ? '8' : '0'); } });
  let rz = 0;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(fit, 120); });

  fetch('../fantasia4x-tileset/catalog-data.json').then(res => res.json()).then(data => {
    const D = ECO_DATA.lines(data.objects.concat(typeof SMALL_PREDATORS === 'undefined' ? [] : SMALL_PREDATORS.objects));
    LINES = D.lines; LEFT = D.left;
    for (const k of Object.values(LINES)) k.clock = ECO.CLOCKS[k.active] || ECO.CLOCKS.day;
    ui = F4X.bar((state, key) => { if (key === 'map' || key === 'colony' || key === 'counts' || key === 'hist') start(); else if (key === 'theme' && S) drawnDay = -1; });
    if (q.get('run')) load(q.get('run')); else start();
    requestAnimationFrame(tick);
  });
})();
