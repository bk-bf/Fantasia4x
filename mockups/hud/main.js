'use strict';
(() => {
  const q = new URLSearchParams(location.search), $ = id => document.getElementById(id), A = HUD.art, AM = HUD.ambient;
  if (q.get('theme')) document.documentElement.dataset.theme = q.get('theme');
  const list = v => (v || '').split(',').filter((w, i, all) => HUD.WINS.includes(w) && all.indexOf(w) === i);
  const state = HUD.state = {
    skin: HUD.skins[q.get('skin')] ? q.get('skin') : 'timber', hour: q.has('hour') ? +q.get('hour') : 13, weather: AM.WEATHER[q.get('weather')] ? q.get('weather') : 'clear',
    wins: list(q.get('win')), tab: ['attributes', 'gear', 'relations'].includes(q.get('tab')) ? q.get('tab') : 'status', bcat: q.get('bcat') === '0' ? 0 : 1, hideL: q.get('l') === '0', hideR: q.get('r') === '0', pos: {}, strip: q.get('strip') !== '0', speed: 1, paused: false, motion: q.get('motion') === '1'
  };
  const PAWN_WINS = ['pawns', 'body'], COL = { L: 186, R: 252 }, FLAG = 84, HALF = 59;
  const screen = $('screen'), hud = $('hud'), world = $('world'), marks = $('marks'), wx = $('wx'), busy = $('busy');
  const layers = { day: $('mapday'), dusk: $('mapdusk'), night: $('mapnight') }, maps = {};
  const CAM = { x: 800, y: 520 }, FONTS = ['20px Jersey20', '20px Jersey10', '24px Jacquard24', '16px VT'];
  const COLUMN = { '--c-ink': '#f2e8cc', '--c-dim': '#cdbd96', '--c-mute': '#a39474', '--c-hot': '#ffc468', '--c-neg': '#ff8a70', '--c-pos': '#b0dc80', '--c-cold': '#a4d4f2' };
  const view = HUD.view = { k: 1, left: 0, top: 0, W: 0, H: 0, sx: x => view.left + x * view.k, sy: y => view.top + y * view.k,
    clip: () => ({ x0: Math.floor(-view.left / view.k) - 2, y0: Math.floor(-view.top / view.k) - 2, x1: Math.ceil((view.W - view.left) / view.k) + 2, y1: Math.ceil((view.H - view.top) / view.k) + 2 }) };
  let scene = null, drawn = '';

  function sprBox(spr) {
    let x0 = spr.w, y0 = spr.h, x1 = 0, y1 = 0;
    for (let y = 0; y < spr.h; y++) for (let x = 0; x < spr.w; x++) if (spr.c[y * spr.w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
  }
  const worldBox = o => { const s = o.spr.frames ? o.spr.frames[0] : o.spr, b = sprBox(s); return [o.x - s.ax + b[0] - 2, o.y - s.ay + b[1] - 2, b[2] + 4, b[3] + 4]; };
  function pickMarks(w) {
    const trees = new Set(), cutters = new Set(), hearths = new Set();
    for (const [k, s] of sprCache) { if (k[0] === 't') trees.add(s); if (k.startsWith('wwoodcutter')) cutters.add(s); if (k === 'bhearth') hearths.add(s); }
    const cutter = w.objs.find(o => cutters.has(o.spr)), pawn = cutter ? [cutter.x, cutter.y] : [495, 470], from = [pawn[0] - 90, pawn[1] - 40], hearth = w.objs.find(o => hearths.has(o.spr));
    const all = w.objs.filter(o => trees.has(o.spr)).map(worldBox)
      .sort((a, b) => Math.hypot(a[0] + a[2] / 2 - from[0], a[1] + a[3] / 2 - from[1]) - Math.hypot(b[0] + b[2] / 2 - from[0], b[1] + b[3] / 2 - from[1]));
    const free = all.filter(b => b[0] >= 300 && b[1] >= 300 && b[0] + b[2] <= pawn[0] - 14 && b[1] + b[3] <= 600), boxes = (free.length >= 3 ? free : all).slice(0, 5);
    const x0 = Math.min(...boxes.map(b => b[0])) - 8, y0 = Math.min(...boxes.map(b => b[1])) - 8, x1 = Math.max(...boxes.map(b => b[0] + b[2])) + 8, y1 = Math.max(...boxes.map(b => b[1] + b[3])) + 8;
    return { boxes, drag: [x0, y0, x1 - x0, y1 - y0], pawn, hearth: hearth ? worldBox(hearth) : [620, 300, 40, 44] };
  }
  function buildMaps(season) {
    if (maps[season]) return maps[season];
    const w = buildScene(season), r = renderWorld(w, { season, roofs: 'cut', cache: {} }), out = { W: r.W, H: r.H, marks: pickMarks(w), r: { ...r }, season };
    SEASON = season;
    for (const t of ['day', 'dusk', 'night']) { const c = A.mk(r.W, r.H); present(r, c.getContext('2d'), t, 3, { calm: true }); out[t] = c; }
    return maps[season] = out;
  }
  function showMaps(season) {
    if (drawn === season) return;
    const m = buildMaps(season);
    for (const t of ['day', 'dusk', 'night']) { layers[t].width = m.W; layers[t].height = m.H; layers[t].getContext('2d').drawImage(m[t], 0, 0); }
    scene = HUD.map = m; drawn = season;
  }
  function layoutWorld() {
    const W = screen.clientWidth, H = screen.clientHeight, k = Math.max(1, Math.ceil(Math.max(W / scene.W, H / scene.H)));
    view.k = k; view.W = W; view.H = H;
    view.left = Math.round(clamp(W / 2 - CAM.x * k, W - scene.W * k, 0)); view.top = Math.round(clamp(H / 2 - CAM.y * k, H - scene.H * k, 0));
    world.style.width = scene.W + 'px'; world.style.height = scene.H + 'px';
    world.style.transform = `translate(${view.left}px,${view.top}px) scale(${k})`;
  }
  const bracket = ([x, y, w, h]) => `<div class="mark" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"><i></i><i></i><i></i><i></i></div>`;
  function drawMarks() {
    const m = scene.marks;
    if (state.wins.includes('fuel')) { marks.innerHTML = bracket(m.hearth); return; }
    marks.innerHTML = `<div class="dragbox" style="left:${m.drag[0]}px;top:${m.drag[1]}px;width:${m.drag[2]}px;height:${m.drag[3]}px"></div>` + m.boxes.map(bracket).join('') +
      `<div class="pawnring" style="left:${m.pawn[0] - 15}px;top:${m.pawn[1] - 7}px"></div>`;
  }
  function placeTag() {
    const tag = hud.querySelector('.verbtag'), m = scene.marks;
    if (!tag) return;
    const x = Math.round(view.sx(m.drag[0])), below = Math.round(view.sy(m.drag[1] + m.drag[3]) + 6), px = view.sx(m.pawn[0]), py = view.sy(m.pawn[1]);
    const hits = px > x - 20 && px < x + tag.offsetWidth + 20 && py > below - 6 && py - 46 * view.k < below + tag.offsetHeight;
    tag.style.left = x + 'px'; tag.style.top = (hits ? Math.round(view.sy(m.drag[1])) - tag.offsetHeight - 6 : below) + 'px';
  }

  function applyWeather(amb) {
    const w = amb.weather, sat = Math.pow(w.sat, 2.2).toFixed(3), br = (1 - w.rain * .14 - w.fog * .06).toFixed(3);
    world.style.filter = (w.sat < 1 ? `saturate(${sat}) brightness(${br})` : '') + (w.grade ? ' ' + w.grade : '');
    HUD.weather(wx, amb, view.k);
    HUD.wind();
  }
  function applyAmbient() {
    const amb = HUD.amb = AM.compute(state.hour, state.weather), skin = HUD.skins[state.skin], st = screen.style;
    $('fm-panel').setAttribute('values', AM.matrix(amb.panelTint, amb.sat));
    $('fm-legible').setAttribute('values', AM.matrix(amb.legibleTint, 1));
    $('fm-data').setAttribute('values', AM.matrix(amb.legibleTint.map(c => AM.lerp(c, 1, .62)), 1));
    $('fm-lit').setAttribute('values', AM.matrix(amb.litTint, AM.lerp(amb.sat, 1, amb.night)));
    for (const k of ['night', 'lamp', 'warm', 'light']) st.setProperty('--' + k, amb[k].toFixed(3));
    st.setProperty('--rain', amb.weather.rain); st.setProperty('--snow', amb.weather.snow);
    const plain = h => AM.tintRGB(h, [1, 1, 1], 1), inkRGB = skin.inkOnLit ? plain(skin.tokens['--ink']) : null;
    for (const [k, v] of Object.entries(skin.tokens)) {
      let c = AM.tintRGB(v, amb.legibleTint, 1);
      if (inkRGB) { c = plain(v).map((n, i) => AM.lerp(n, c[i], .25)); if (k === '--dim' || k === '--mute') c = c.map((n, i) => AM.lerp(n, inkRGB[i], Math.min(.9, (1 - amb.light) * .9 + (1 - amb.weather.sat) * .9 + amb.warm * .5))); }
      st.setProperty(k, AM.toHex(c));
    }
    for (const [k, v] of Object.entries(COLUMN)) st.setProperty(k, AM.toHex(AM.tintRGB(v, amb.legibleTint, 1)));
    for (const [k, v] of Object.entries(skin.emit)) st.setProperty(k, v);
    const alpha = AM.layers(amb);
    layers.dusk.style.opacity = alpha.dusk.toFixed(3); layers.night.style.opacity = alpha.night.toFixed(3);
    applyWeather(amb);
    const day = state.hour % 24 >= 6 && state.hour % 24 < 18, wg = { clear: day ? 'sun' : 'moon', rain: 'rain', storm: 'storm', fog: 'fog', snow: 'snow' }[state.weather] || amb.weather.glyph || (day ? 'sun' : 'moon');
    const text = { clock: AM.clock(state.hour), phase: AM.phase(state.hour), weather: amb.weather.label, temp: amb.weather.temp + '°', wind: amb.weather.wind, season: amb.weather.season || (state.weather === 'snow' ? 'Winter' : HUD.data.season) };
    hud.querySelectorAll('[data-t]').forEach(el => { el.textContent = text[el.dataset.t]; });
    hud.querySelectorAll('i.gly[data-wx]').forEach(el => { el.dataset.g = wg; el.dataset.ramp = wg === 'sun' ? 'honey' : 'water'; el.textContent = ''; el.append(A.glyph(wg, A.RAMP[el.dataset.ramp], { line: skin.glyphLine })); });
    const cv = hud.querySelector('.dialcv');
    if (cv) { const d = A.dial(102, 54, amb, true); cv.width = d.width; cv.height = d.height; cv.getContext('2d').drawImage(d, 0, 0); }
    $('hour').value = state.hour; $('hourout').textContent = AM.clock(state.hour);
  }

  function fitTop() {
    const W = view.W, mid = Math.round(W / 2), L = state.hideL ? 0 : COL.L, R = state.hideR ? 0 : COL.R;
    const fit = Math.min(Math.floor((mid - HALF - L - 8 - 12) / 5), Math.floor((W - mid - HALF - R - 8 - 9) / 4)), under = fit < 74;
    const fw = Math.max(56, Math.min(FLAG, under ? Math.floor((mid - HALF - 16) / 5) : fit));
    hud.style.setProperty('--fw', fw + 'px');
    hud.style.setProperty('--bigw', Math.min(W - 12, 1180, Math.max(900, W - L - R - 16)) + 'px');
    hud.classList.toggle('under', under);
    hud.classList.toggle('tight', fw < 74);
    hud.querySelector('.tc').style.left = mid - HALF - hud.querySelector('.rib-l').offsetWidth + 'px';
    hud.querySelector('.dialcv').style.left = mid - 51 + 'px';
  }
  const hit = (a, b) => a.x < b.x + b.w + 8 && b.x < a.x + a.w + 8 && a.y < b.y + b.h + 8 && b.y < a.y + a.h + 8;
  function placeWins() {
    const W = view.W, H = view.H, x0 = (state.hideL ? 0 : COL.L) + 8, x1 = W - (state.hideR ? 0 : COL.R) - 8, y0 = 84, placed = [];
    state.wins.forEach((name, i) => {
      const el = hud.querySelector(`.win[data-win="${name}"]`);
      if (!el) return;
      const w = el.offsetWidth, h = el.offsetHeight;
      let p = state.pos[name];
      if (!p && HUD.MODAL.includes(name)) p = state.pos[name] = { x: Math.round((W - w) / 2), y: Math.max(84, Math.round((H - h) / 2.4)) };
      if (!p) {
        const fits = edge => c => c.x + w <= edge && c.y + h <= H - 6 && !placed.some(r => hit({ x: c.x, y: c.y, w, h }, r));
        const spots = [{ x: w > x1 - x0 ? Math.max(4, Math.round((W - w) / 2)) : x0, y: y0 }, ...placed.map(r => ({ x: r.x + r.w + 8, y: r.y })), ...placed.map(r => ({ x: r.x, y: r.y + r.h + 8 }))];
        p = spots.find(fits(x1)) || spots.find(fits(W - 6)) || { x: x0 + 26 * placed.length, y: y0 + 26 * placed.length };
        p = { x: p.x, y: p.y };
        p.y = Math.max(46, Math.min(p.y, H - h - 6));
        state.pos[name] = p;
      }
      if (!HUD.MODAL.includes(name)) placed.push({ x: p.x, y: p.y, w, h });
      el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; el.style.zIndex = 10 + i;
    });
  }
  function mount() {
    const skin = HUD.skins[state.skin];
    document.body.dataset.skin = state.skin;
    document.body.classList.toggle('nostrip', !state.strip);
    $('mockhide').textContent = state.strip ? 'Hide · `' : 'Show · `';
    hud.classList.toggle('no-l', state.hideL); hud.classList.toggle('no-r', state.hideR);
    hud.innerHTML = HUD.html(state);
    layoutWorld(); fitTop(); drawMarks(); placeTag(); placeWins();
    HUD.motion.sync();
    applyAmbient();
    HUD.fill(hud, skin);
    $('pov').innerHTML = `<b>${skin.name}</b> — ${skin.pov}`;
    const winOn = v => { const [w, t] = v.split(':'); return state.wins.includes(w) && (!t || (w === 'build' ? (t === 'zones') === (state.bcat === 0) : state.tab === t)); };
    document.querySelectorAll('#mock .grp').forEach(g => g.querySelectorAll('button').forEach(b => {
      const k = g.dataset.k, v = b.dataset.v;
      b.classList.toggle('on', k === 'skin' ? v === state.skin : k === 'weather' ? v === state.weather : k === 'motion' ? state.motion : k === 'win' ? winOn(v) : false);
    }));
    const p = new URLSearchParams({ skin: state.skin, hour: state.hour, weather: state.weather });
    if (state.wins.length) p.set('win', state.wins.join(','));
    if (state.tab !== 'status') p.set('tab', state.tab);
    if (state.bcat === 0) p.set('bcat', '0');
    if (state.hideL) p.set('l', '0');
    if (state.hideR) p.set('r', '0');
    if (!state.strip) p.set('strip', '0');
    if (state.motion) p.set('motion', '1');
    history.replaceState(null, '', '?' + p.toString().replace(/%2C/g, ','));
    const pane = $('pane'), panes = [...pane.options].map(o => o.value).filter(Boolean);
    pane.value = [...state.wins].reverse().find(w => panes.includes(w)) ?? '';
  }
  const mapOf = v => AM.WEATHER[v].map || (v === 'snow' ? 'winter' : 'autumn');
  function setWeather(v) {
    state.weather = v;
    const season = mapOf(v);
    if (drawn === season) { mount(); return; }
    busy.hidden = false;
    setTimeout(() => { showMaps(season); busy.hidden = true; mount(); }, 30);
  }
  function close(w) { state.wins = state.wins.filter(x => x !== w); delete state.pos[w]; }
  function open(w) {
    if (w === 'fuel') PAWN_WINS.forEach(close); else if (PAWN_WINS.includes(w)) close('fuel');
    close(w); state.wins.push(w);
  }
  function act(a) {
    const [verb, v, t] = a.split(':');
    if (verb === 'win' && v === 'build' && t) {
      const c = t === 'zones' ? 0 : 1, same = state.wins.includes(v) && state.bcat === c;
      state.bcat = c; delete state.pos.build;
      if (same) close(v); else open(v);
    }
    else if (verb === 'win') {
      const same = state.wins.includes(v) && (!t || state.tab === t);
      if (t) state.tab = t;
      if (same) close(v); else if (!state.wins.includes(v)) open(v);
    }
    else if (verb === 'tab') state.tab = v;
    else if (verb === 'bcat') { state.bcat = +v; delete state.pos.build; }
    else if (verb === 'side') { state['hide' + v] = !state['hide' + v]; state.pos = {}; }
    else if (a === 'pause') state.paused = !state.paused;
    else if (a.startsWith('speed')) { state.speed = +a.slice(5); state.paused = false; }
    mount();
  }

  $('mock').addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.id === 'mockhide') { state.strip = !state.strip; mount(); return; }
    const g = b.closest('.grp'); if (!g) return;
    const k = g.dataset.k, v = b.dataset.v;
    if (k === 'skin') { state.skin = v; mount(); }
    else if (k === 'hourset') { state.hour = +v; mount(); }
    else if (k === 'weather') setWeather(v);
    else if (k === 'motion') { state.motion = !state.motion; mount(); }
    else if (k === 'win') act('win:' + v);
  });
  $('pane').addEventListener('change', ev => {
    const panes = [...ev.target.options].map(o => o.value).filter(Boolean);
    panes.forEach(close);
    if (ev.target.value) open(ev.target.value);
    mount();
  });
  $('hour').addEventListener('input', ev => { state.hour = +ev.target.value; applyAmbient(); });
  hud.addEventListener('click', ev => { const b = ev.target.closest('[data-act]'); if (b) act(b.dataset.act); });
  let drag = null;
  hud.addEventListener('pointerdown', ev => {
    const w = ev.target.closest('.win');
    if (!w) return;
    const name = w.dataset.win;
    state.wins = state.wins.filter(x => x !== name).concat(name);
    state.wins.forEach((n, i) => { const el = hud.querySelector(`.win[data-win="${n}"]`); if (el) el.style.zIndex = 10 + i; });
    if (!ev.target.closest('.wh') || ev.target.closest('button')) return;
    drag = { el: w, name, dx: ev.clientX - w.offsetLeft, dy: ev.clientY - w.offsetTop };
    ev.preventDefault();
  });
  addEventListener('pointermove', ev => {
    if (!drag) return;
    const x = clamp(ev.clientX - drag.dx, 40 - drag.el.offsetWidth, view.W - 40), y = clamp(ev.clientY - drag.dy, 0, view.H - 28);
    drag.el.style.left = x + 'px'; drag.el.style.top = y + 'px';
    state.pos[drag.name] = { x, y };
  });
  addEventListener('pointerup', () => { drag = null; });
  addEventListener('keydown', ev => {
    if (ev.target.tagName === 'INPUT') return;
    const k = ev.key.toLowerCase(), f = { f2: 'pawns', f3: 'work', f4: 'build', f5: 'craft', f6: 'explore', f7: 'culture', f8: 'kingdoms', f9: 'research', f10: 'entities' }[k];
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (k === '`') { state.strip = !state.strip; mount(); }
    else if (k === '1' || k === '2') { state.skin = Object.keys(HUD.skins)[+k - 1]; mount(); }
    else if (k === 'escape') { if (state.wins.length) close(state.wins[state.wins.length - 1]); else open('pause'); mount(); }
    else if (f) { ev.preventDefault(); act('win:' + f); }
    else if (k === ' ') { ev.preventDefault(); act('pause'); }
  });
  let rz = 0;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { state.pos = {}; mount(); }, 120); });

  const catalog = fetch('../fantasia4x-tileset/catalog-data.json').then(r => r.json()).then(d => DBX.fromData(d.objects));
  Promise.all([catalog, ...FONTS.map(f => document.fonts.load(f))]).catch(err => console.error(err)).then(() => setTimeout(() => {
    showMaps(mapOf(state.weather));
    busy.hidden = true;
    mount();
  }, 30));
})();
