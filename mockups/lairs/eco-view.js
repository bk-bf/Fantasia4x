'use strict';
(() => {
  const $ = id => document.getElementById(id), map = $('map'), land = $('land'), life = $('life'), shade = $('shade'), busy = $('busy');
  const lctx = land.getContext('2d'), ctx = life.getContext('2d'), graph = $('graph'), gctx = graph.getContext('2d');
  const COL = { deer: '#dcae6c', boar: '#9a6a4a', wolf: '#eef0f4', bear: '#b06a2c', lurker: '#a6d05a', goblin: '#ecdc48', harpy: '#f29ac4' };
  const LABEL = { deer: 'Deer', boar: 'Boar', wolf: 'Wolves', bear: 'Bears', lurker: 'Lurkers', goblin: 'Goblins', harpy: 'Harpies' };
  const PING = { death: '#f0564a', clash: '#f29a3c', found: '#7ad06a', gone: '#b8b2a6', in: '#6cb4f0', out: '#6cb4f0', raid: '#ecdc48', steal: '#b06a2c', split: '#c8a0f0' };
  const TODAY = { wolf: 55, bear: 32, lurker: 24, goblin: 65, harpy: 85 }, MIX = [['lurker', .5], ['goblin', .14], ['bear', .14], ['harpy', .12], ['wolf', .1]];
  const WX = { clear: 'Clear', rain: 'Rain', storm: 'Storm', snow: 'Snow', drought: 'Drought' };
  let ui, S = null, seed = 7, frac = 0, last = 0, pick = null, cellMap = null, tone = null, img = null, drawnDay = -1, D = 600, dpr = 1, still = null, pings = [], seen = 0, shownHour = -1;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

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
      let c = t === ECO.WATER ? (snow && S.wx.hard ? [156, 184, 200] : [44, 96, 138]) : t === ECO.ROCK ? [106, 102, 108] : t === ECO.SWAMP ? mix3([88, 82, 56], [58, 86, 58], k)
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
    const side = innerWidth > 760 ? 324 : 0;
    D = Math.max(240, Math.floor(Math.min(innerWidth - 24 - side, innerHeight - 24)));
    dpr = Math.min(2, devicePixelRatio || 1);
    map.style.width = map.style.height = D + 'px';
    life.width = life.height = Math.round(D * dpr);
  }
  function dot(x, y, r, fill) { ctx.fillStyle = '#17131a'; ctx.fillRect(x - r - 1, y - r - 1, r * 2 + 2, r * 2 + 2); ctx.fillStyle = fill; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
  function glyph(kind, x, y, state) {
    const u = 3.2 * dpr, lived = state === 'lived in', fill = lived ? COL[kind] : state === 'abandoned' ? '#aaa49a' : state === 'overgrown' ? '#7c8f66' : 'transparent';
    ctx.lineWidth = dpr; ctx.strokeStyle = lived ? '#17131a' : state === 'ruin' ? '#d8d2c6' : '#3a3440'; ctx.fillStyle = fill;
    ctx.beginPath();
    if (kind === 'wolf') ctx.arc(x, y, u * 1.5, Math.PI, 0);
    else if (kind === 'bear') ctx.rect(x - u * 1.4, y - u * 1.6, u * 2.8, u * 1.6);
    else if (kind === 'lurker') ctx.ellipse(x, y - u * .5, u * 1.7, u * .9, 0, 0, Math.PI * 2);
    else if (kind === 'goblin') { ctx.moveTo(x - u * 1.6, y); ctx.lineTo(x, y - u * 2.2); ctx.lineTo(x + u * 1.6, y); }
    else { ctx.moveTo(x - u, y); ctx.lineTo(x - u * .4, y - u * 2.6); ctx.lineTo(x + u * .4, y - u * 2.6); ctx.lineTo(x + u, y); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    if (lived) { ctx.fillStyle = '#17131a'; ctx.fillRect(x - u * .4, y - u * .8, u * .8, u * .8); }
  }
  function ring(x, y, r, color, alpha, dash) { ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = dpr; ctx.setLineDash(dash || []); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }

  function draw(now) {
    const k = D * dpr / S.N, rings = ui.state.rings === 'on';
    ctx.clearRect(0, 0, life.width, life.height);
    if (still) {
      shade.style.opacity = 0;
      for (const l of still.lairs) { if (rings) ring(l.x * k, l.y * k, TODAY[l.kind] * k, COL[l.kind], .5); }
      for (const m of still.mobs) dot(Math.round(m.x * k), Math.round(m.y * k), dpr, COL[m.kind]);
      for (const l of still.lairs) glyph(l.kind, l.x * k, l.y * k, 'lived in');
      const w = still.lairs.find(l => l.kind === 'wolf' && l.x > 200 && l.y > 200 && l.x < S.N - 200 && l.y < S.N - 200);
      if (w) { ring(w.x * k, w.y * k, 150 * k, '#ffffff', .9, [6 * dpr, 4 * dpr]); ctx.fillStyle = '#fff'; ctx.font = `${11 * dpr}px system-ui`; ctx.fillText('how far one wolf looks for prey', w.x * k - 76 * dpr, (w.y - 154) * k); }
      return;
    }
    const h = S.hour + frac;
    shade.style.opacity = clamp((Math.cos(h / 24 * Math.PI * 2) + .15) * .5, 0, .5).toFixed(3);
    const col = S.colony;
    if (col) { ring(col.x * k, col.y * k, (col.r + 130) * k, '#ffffff', .35, [3 * dpr, 5 * dpr]); ctx.fillStyle = '#17131a'; ctx.fillRect(col.x * k - 7 * dpr, col.y * k - 7 * dpr, 14 * dpr, 14 * dpr); ctx.fillStyle = '#f2e2b0'; ctx.fillRect(col.x * k - 5 * dpr, col.y * k - 5 * dpr, 10 * dpr, 10 * dpr); ctx.fillStyle = '#a8322c'; ctx.fillRect(col.x * k - 5 * dpr, col.y * k - 5 * dpr, 10 * dpr, 4 * dpr); }
    for (const m of S.marks) { const a = 1 - (S.day - m.day) / 6; if (a <= 0) continue; ctx.globalAlpha = a; ctx.fillStyle = '#efe6d2'; ctx.fillRect(m.x * k - 2 * dpr, m.y * k - dpr * .5, 4 * dpr, dpr); ctx.fillRect(m.x * k - dpr * .5, m.y * k - 2 * dpr, dpr, 4 * dpr); ctx.globalAlpha = 1; }
    if (rings) for (const g of S.groups) if (g.lair) ring(g.lair.x * k, g.lair.y * k, g.k.range * k, COL[g.kind], g.lair === pick ? .95 : .45);
    for (const l of S.lairs) glyph(l.kind, l.x * k, l.y * k, ECO.age(S, l));
    for (const g of S.groups) {
      const x = (g.px + (g.x - g.px) * frac) * k, y = (g.py + (g.y - g.py) * frac) * k, prey = g.k.prey, home = g.state === 'resting' || g.state === 'asleep' || g.state === 'feeding' || g.state === 'basking' || g.state === 'lying in wait';
      if (g.state === 'asleep') continue;
      if (g.state === 'hunting' || g.state === 'raiding') { const t = g.state === 'raiding' ? S.colony : S.groups.find(o => o.id === g.target); if (t) { ctx.strokeStyle = g.state === 'raiding' ? '#ecdc48' : '#f0564a'; ctx.lineWidth = dpr; ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(t.x * k, t.y * k); ctx.stroke(); ctx.setLineDash([]); } }
      const spread = (prey ? (g.state === 'grazing' ? 20 : g.state === 'resting' ? 9 : 13) : home ? 7 : 9) * k, r = prey ? dpr : g.kind === 'bear' ? 2.5 * dpr : 2 * dpr;
      for (let i = 0; i < g.n + g.young; i++) {
        const wob = g.state === 'grazing' ? Math.sin(now / 900 + i * 1.7 + g.id) * 2 * k : 0;
        dot(Math.round(x + (hash(g.id, i, 1) - .5) * 2 * spread + wob), Math.round(y + (hash(g.id, i, 2) - .5) * 2 * spread), i >= g.n ? Math.max(1, r - dpr * .5) : r, COL[g.kind]);
      }
      if (g === pick) ring(x, y, spread + 8 * dpr, '#ffffff', .9);
    }
    if (pick && pick.story) ring(pick.x * k, pick.y * k, 9 * dpr, '#ffffff', .9);
    pings = pings.filter(p => now - p.t < 2600);
    for (const p of pings) { const a = (now - p.t) / 2600; ring(p.x * k, p.y * k, (4 + a * 26) * dpr, PING[p.type] || '#fff', 1 - a); }
    if (S.hour !== shownHour) { shownHour = S.hour; $('hour').textContent = String(S.hour).padStart(2, '0') + ':00'; for (const u of document.querySelectorAll('#clocks u')) u.style.left = (S.hour + .5) / 24 * 100 + '%'; }
  }

  function chart() {
    const W = graph.width, H = graph.height, hist = S.hist.slice(-ECO.YEAR * 6), n = hist.length, pm = Math.max(50, ...hist.map(p => p.prey)), qm = Math.max(10, ...hist.map(p => p.pred)), x = i => 6 + i / Math.max(1, n - 1) * (W - 190), y = (v, m) => H - 14 - v / m * (H - 30);
    gctx.clearRect(0, 0, W, H);
    if (n < 2) return;
    gctx.globalAlpha = .22; gctx.fillStyle = css('--grass'); gctx.beginPath(); gctx.moveTo(x(0), H - 14);
    hist.forEach((p, i) => gctx.lineTo(x(i), y(p.grass, 1))); gctx.lineTo(x(n - 1), H - 14); gctx.fill(); gctx.globalAlpha = 1;
    for (const [key, m, c, name] of [['prey', pm, css('--prey'), 'prey'], ['pred', qm, css('--pred'), 'predators']]) {
      gctx.strokeStyle = c; gctx.lineWidth = 2.5; gctx.beginPath(); hist.forEach((p, i) => i ? gctx.lineTo(x(i), y(p[key], m)) : gctx.moveTo(x(i), y(p[key], m))); gctx.stroke();
      gctx.fillStyle = c; gctx.font = '600 20px system-ui'; gctx.fillText(hist[n - 1][key] + ' ' + name, x(n - 1) + 8, clamp(y(hist[n - 1][key], m) + 6, 18, H - 16) + (key === 'pred' && Math.abs(y(hist[n - 1].pred, qm) - y(hist[n - 1].prey, pm)) < 22 ? 22 : 0));
    }
    gctx.fillStyle = css('--dim'); gctx.font = '18px system-ui'; gctx.fillText('grass ' + Math.round(hist[n - 1].grass * 100) + '%', x(n - 1) + 8, H - 2);
  }
  const head = g => `${g.n}${g.young ? ' and ' + g.young + ' young' : ''}`;
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
    const p = $('pick');
    if (pick && pick.story) {
      const g = S.groups.find(o => o.lair === pick), state = ECO.age(S, pick);
      p.innerHTML = `<h2>${esc(pick.name)}</h2><p>${g ? `Lived in by ${head(g)} · ${esc(g.state)}` : esc(state[0].toUpperCase() + state.slice(1))}</p>` +
        (g ? `<div class="bar"><i style="width:${clamp(ECO.stockDays(g) / 4, 0, 1) * 100}%"></i></div><p>${ECO.stockDays(g).toFixed(1)} days of food in the larder${g.hungry ? ' · hungry for ' + g.hungry + ' days' : ''}</p>` : '') +
        `<p>Bones of ${pick.kills} kills · most it ever held: ${pick.peak}</p><ul>${pick.story.slice(-9).map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
    } else if (pick && S.groups.includes(pick)) {
      p.innerHTML = `<h2>${esc(pick.k.name)}</h2><p>${head(pick)} · ${esc(pick.state)}</p><p>${pick.k.prey ? 'Condition ' + (pick.cond > .7 ? 'good' : pick.cond > .4 ? 'lean' : 'starving') : ECO.stockDays(pick).toFixed(1) + ' days of food, looking for ground'}</p>`;
    } else { pick = null; p.innerHTML = '<h3>Pick</h3><p>Click a lair or a herd on the map.</p>'; }
    $('log').innerHTML = S.events.slice(-10).reverse().map(e => `<li data-x="${e.x}" data-y="${e.y}"><b>${esc(e.when)}</b> ${esc(e.text)}</li>`).join('');
  }
  function clocks() {
    $('clocks').innerHTML = Object.keys(LABEL).map(kind => `<div><em>${LABEL[kind]}</em><i style="background:linear-gradient(90deg,${ECO.KINDS[kind].active.map((a, h) => `color-mix(in srgb, ${COL[kind]} ${Math.round(a * 100)}%, #1c1920) ${h / 24 * 100}% ${(h + 1) / 24 * 100}%`).join(',')})"><u></u></i></div>`).join('');
  }

  function start() {
    const s = ui.state;
    busy.hidden = false; S = null;
    setTimeout(() => {
      const made = ECO.make({ size: +s.map, seed, colony: s.colony });
      for (let h = 0; h < ECO.YEAR * 24 * 3; h++) ECO.hour(made);
      S = made; seen = S.events.length; pick = null; drawnDay = -1; frac = 0;
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
      for (; seen < S.events.length; seen++) { const e = S.events[seen]; if (e.type !== 'weather') pings.push({ x: e.x, y: e.y, type: e.type, t: now }); }
      if (S.events.length >= 400) seen = S.events.length;
    }
    if (S.day !== drawnDay) { paint(); drawnDay = S.day; side(); }
    draw(now);
  }

  map.addEventListener('click', ev => {
    if (!S || still) return;
    const b = map.getBoundingClientRect(), x = (ev.clientX - b.left) / b.width * S.N, y = (ev.clientY - b.top) / b.height * S.N, near = (list, lim) => list.map(o => [Math.hypot(o.x - x, o.y - y), o]).filter(p => p[0] < lim).sort((a, c) => a[0] - c[0])[0];
    const l = near(S.lairs, 22), g = near(S.groups, 30);
    pick = l ? l[1] : g ? g[1] : null;
    side();
  });
  $('log').addEventListener('click', ev => { const li = ev.target.closest('li'); if (!li || !S) return; const x = +li.dataset.x, y = +li.dataset.y, l = S.lairs.map(o => [Math.hypot(o.x - x, o.y - y), o]).sort((a, c) => a[0] - c[0])[0]; if (l && l[0] < 60) { pick = l[1]; side(); } pings.push({ x, y, type: 'found', t: performance.now() }); });
  for (const b of document.querySelectorAll('[data-wx]')) b.addEventListener('click', () => { if (S && !still) { ECO.force(S, b.dataset.wx); drawnDay = -1; } });
  $('again').addEventListener('click', () => { seed += 3; start(); });
  addEventListener('keydown', ev => { if (ev.key === ' ' && !/^(INPUT|SELECT|BUTTON)$/.test(ev.target.tagName)) { ev.preventDefault(); ui.set('speed', ui.state.speed === '0' ? '8' : '0'); } });
  let rz = 0;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(fit, 120); });

  ui = F4X.bar((state, key) => { if (key === 'map' || key === 'colony' || key === 'counts') start(); else if (key === 'theme' && S) drawnDay = -1; });
  clocks();
  start();
  requestAnimationFrame(tick);
})();
