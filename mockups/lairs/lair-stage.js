'use strict';
(() => {
  const q = new URLSearchParams(location.search), $ = id => document.getElementById(id), AM = HUD.ambient;
  const TIMES3 = ['day', 'dusk', 'night'], layer = { day: $('mapday'), dusk: $('mapdusk'), night: $('mapnight') }, ctx = {};
  const screen = $('screen'), world = $('world'), marks = $('marks'), busy = $('busy'), cards = $('cards'), daybar = $('daybar');
  const AGES = { 1: 'Fresh', 2: 'Settled', 3: 'Old' }, LEFT = { cleared: 'cleared', abandoned: 'abandoned, left within a season', overgrown: 'overgrown, left within a year', ruin: 'a ruin, left long ago' }, built = new Map(), view = { k: 1, left: 0, top: 0, W: 0, H: 0 }, pan = { x: 0, y: 0 };
  let ui = null, B = null, T = q.has('t') ? +q.get('t') : 0, last = 0, wanted = '', tags = [];

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function build(D, age, state) {
    const [W, H] = D.size, season = 'summer', w = new World(W, H, G.tall_grass), keep = new Uint8Array(W * H), decay = LAIR.DECAY[state] || 0, cleared = state === 'cleared', vacant = cleared || decay > 0;
    const put = (spr, x, y) => { const p = LAIR.at(x, y), o = { spr, x: p[0], y: p[1] }; w.objs.push(o); return o; };
    const bare = (x, y, r) => { for (let j = Math.floor(y - r); j <= y + r; j++) for (let i = Math.floor(x - r); i <= x + r; i++) if (w.in(i, j) && Math.hypot(i - x, j - y) <= r) keep[j * W + i] = 1; };
    const k = { w, put, bare, age, cleared, decay, vacant, season, turf: D.turf || P.grass, loot: [], heap: n => 'map-pile-' + Math.max(1, n - Math.max(0, decay - 1)) };
    k.loot.add = (name, n, spr, x, y, kind) => {
      const count = LAIR.left(n, kind, decay);
      if (!count) return null;
      const o = put(LAIR_PROPS.weathered(spr, decay, k.loot.length + 3, k.turf), x, y);
      k.loot.push({ name, n: count, o });
      return o;
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const n = fbm(x * .11, y * .11, D.seed, 3), n2 = fbm(x * .21 + 9, y * .21, D.seed + 1, 2);
      w.g[y * W + x] = G[D.ground(x, y, n, n2, age, decay)];
      if (D.wall && D.wall(x, y, n, n2)) w.wall[y * W + x] = WL.mountain;
    }
    D.place(k);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (keep[i] || w.wall[i] || GROUND[w.g[i]].water) continue;
      const f = D.flora(x, y, GROUND[w.g[i]].id, hash(x, y, D.seed + 77), hash(x, y, D.seed + 78));
      if (!f) continue;
      const spr = f[0] === 'tree' ? tree(f[1], x * 7 + y, season) : f[0] === 'plant' ? plant(f[1], x + y * 3, season) : rock(f[1], x + y, season);
      w.objs.push({ spr, x: x * 32 + 16 + (Math.floor(hash(x, y, 79) * 9) - 4) * 2, y: y * 32 + 23 + (Math.floor(hash(x, y, 80) * 7) - 3) * 2 });
    }
    const R = LAIR.routine(D.time), extra = D.cast(R, k) || {}, cast = R.done();
    const post = extra.post || { kind: 'pine', at: [-4, -4], seed: 1 }, spr = post.spr || tree(post.kind, post.seed, season), pp = LAIR.at(post.at[0], post.at[1]);
    const C = { cast, follows: [], smoke: extra.smoke ? LAIR.at(extra.smoke[0], extra.smoke[1]) : [-99, -99], clear: [],
      tree: { spr, cut: spr, kind: post.kind, seed: post.seed % 4, season, x: pp[0], y: pp[1] }, plan: { hits: extra.hits || [], fallAt: Infinity, clearAt: Infinity, dir: 1, period: D.time.period } };
    const r = renderWorld(w, { season, roofs: 'cut', cache: {} }), live = r.anim.map(o => ({ o, key: rnd(o.y) }));
    r.anim = [];
    SEASON = season;
    present(r, document.createElement('canvas').getContext('2d'), 'day', 0, { calm: false, clip: { x0: 0, y0: 0, x1: 16, y1: 16 }, post() {} });
    return { w, r, C, base: r.sway.slice(), live, season, at: {}, snow: new Set(P.snow.map(pack)), lastT: 0, D, age, state, cleared, vacant, loot: k.loot };
  }

  function layout() {
    const W = screen.clientWidth, H = screen.clientHeight, r = B.r, z = ui.state.zoom, at = q.has('cam') ? q.get('cam').split(',').map(Number) : W < 700 ? B.D.home : B.D.cam, cam = LAIR.at(at[0], at[1]);
    const k = z === 'fit' ? Math.max(1, Math.ceil(Math.max(W / r.W, H / r.H))) : +z;
    view.k = k; view.W = W; view.H = H;
    view.left = Math.round(clamp(W / 2 - (cam[0] + pan.x) * k, Math.min(0, W - r.W * k), Math.max(0, W - r.W * k)));
    view.top = Math.round(clamp(H / 2 - (cam[1] + pan.y) * k, Math.min(0, H - r.H * k), Math.max(0, H - r.H * k)));
    world.style.width = r.W + 'px'; world.style.height = r.H + 'px';
    world.style.transform = `translate(${view.left}px,${view.top}px) scale(${k})`;
    marks.style.setProperty('--u', 1 / k);
  }
  const clip = () => ({ x0: Math.floor(-view.left / view.k) - 2, y0: Math.floor(-view.top / view.k) - 2, x1: Math.ceil((view.W - view.left) / view.k) + 2, y1: Math.ceil((view.H - view.top) / view.k) + 2 });

  function box(o) {
    const s = o.spr.frames ? o.spr.frames[0] : o.spr, b = bounds(s);
    return [o.x - s.ax + b[0] - 2, o.y - s.ay + b[1] - 2, b[2] - b[0] + 5, b[3] - b[1] + 5];
  }
  function overlay() {
    const D = B.D, show = ui.state.show, parts = D.parts.filter(p => (p.from || 1) <= B.age);
    let html = '';
    if (show === 'rules') { const c = LAIR.at(D.home[0], D.home[1]), r = D.ring * 32; html += `<div class="ring" style="left:${c[0] - r}px;top:${c[1] - 8 - r}px;width:${r * 2}px;height:${r * 2}px"><span>Home ground</span></div>`; }
    if (show === 'parts') html += parts.map((p, i) => { const c = LAIR.at(p.at[0], p.at[1]); return `<b class="pin" style="left:${c[0]}px;top:${c[1] - 26}px">${i + 1}</b>`; }).join('');
    if (B.vacant) html += B.loot.map(l => { const b = box(l.o); return `<div class="mark" style="left:${b[0]}px;top:${b[1]}px;width:${b[2]}px;height:${b[3]}px"><i></i><i></i><i></i><i></i></div>`; }).join('');
    marks.innerHTML = html + '<div id="tags"></div>';
    tags = [];
    const head = `<h2>${esc(D.name)}</h2><p class="sub">${AGES[B.age]} · ${esc(B.vacant ? LEFT[B.state] : D.who[B.age - 1])}</p>`;
    let body = '';
    if (B.vacant) body = '<h3>Left behind</h3><ul class="loot">' + B.loot.map(l => `<li><span>${esc(l.name)}</span><em>${l.n}</em></li>`).join('') + `</ul><div class="verb"><span>${B.loot.length} marked</span><button>HAUL</button></div>`;
    else if (show === 'parts') body = '<ol>' + parts.map((p, i) => `<li><b>${i + 1}</b><div>${esc(p.name)}<span>${esc(p.note)}</span></div></li>`).join('') + '</ol>';
    else if (show === 'rules') body = '<h3>How it runs</h3><ul class="rules">' + D.rules.map(t => `<li>${esc(t)}</li>`).join('') + '</ul><h3>Needs from the sim</h3><ul class="rules need">' + D.needs.map(t => `<li>${esc(t)}</li>`).join('') + '</ul>';
    cards.innerHTML = `<section>${head}${body}</section>`;
    const span = h => D.time.sec(h) / D.time.period * 100, h0 = D.time.hour(0), ticks = [];
    for (let h = Math.ceil(h0 / 3) * 3; h < h0 + 24; h += 3) ticks.push(h);
    daybar.innerHTML = '<div class="track">' + (B.vacant ? [] : D.day).map(([a, b, label, tone]) => `<i class="${tone}" style="left:${span(a)}%;width:${span(b) - span(a)}%"><span>${esc(label)}</span></i>`).join('') +
      ticks.map(h => `<u style="left:${span(h)}%">${String(h % 24).padStart(2, '0')}</u>`).join('') + '<b id="cursor"></b></div><output id="clock"></output>';
    daybar.hidden = B.cleared;
  }
  function stateTags(items) {
    const el = $('tags');
    if (!el) return;
    if (ui.state.show !== 'rules' || B.vacant) { if (tags.length) { el.innerHTML = ''; tags = []; } return; }
    const P0 = B.D.time.period, tl = ((T % P0) + P0) % P0, live = items.filter(it => it.fr && it.S.states);
    if (tags.length !== live.length) { el.innerHTML = live.map(() => '<span></span>').join(''); tags = [...el.children]; }
    live.forEach((it, i) => {
      const list = it.S.states;
      let n = 0;
      while (n + 1 < list.length && list[n + 1][0] <= tl) n++;
      const s = it.fr.s, top = it.y - s.ay + bounds(s)[1], t = tags[i];
      if (t.textContent !== list[n][1]) t.textContent = list[n][1];
      t.style.left = it.x + 'px'; t.style.top = top - 4 + 'px';
    });
  }

  function draw() {
    const D = B.D, P0 = D.time.period, hour = D.time.hour(T) % 24, amb = AM.compute(hour, 'clear'), a = AM.layers(amb), seen = AM.seen(amb);
    layer.dusk.style.opacity = a.dusk.toFixed(3); layer.night.style.opacity = a.night.toFixed(3);
    const items = MOTION_MAP.frame(B, { lvl: 3, smooth: false, T, clip: clip(), times: TIMES3.filter(t => seen[t]).map(t => [t, ctx[t]]) });
    stateTags(items);
    const cur = $('cursor'), clock = $('clock');
    if (cur) cur.style.left = (((T % P0) + P0) % P0) / P0 * 100 + '%';
    if (clock) clock.textContent = AM.clock(hour) + ' · ' + AM.phase(hour);
  }
  function tick(now) {
    requestAnimationFrame(tick);
    const dt = last ? clamp((now - last) / 1000, 0, .1) : 0;
    last = now;
    if (!B || document.hidden) return;
    T += dt * +ui.state.speed;
    draw();
  }

  function mount() {
    const s = ui.state, D = LAIR_SCENES[s.lair], key = s.lair + '|' + s.age + '|' + s.state;
    wanted = key;
    const use = made => { B = made; for (const t of TIMES3) { layer[t].width = B.r.W; layer[t].height = B.r.H; ctx[t] = layer[t].getContext('2d'); } layout(); overlay(); draw(); };
    if (built.has(key)) { if (B !== built.get(key)) { pan.x = pan.y = 0; use(built.get(key)); } else { layout(); overlay(); draw(); } return; }
    busy.hidden = false;
    setTimeout(() => {
      if (!built.has(key)) built.set(key, build(D, +s.age, s.state));
      busy.hidden = true;
      if (wanted === key) { pan.x = pan.y = 0; use(built.get(key)); }
    }, 30);
  }

  function scrub(ev) {
    const tr = daybar.querySelector('.track');
    if (!tr || !B) return;
    const b = tr.getBoundingClientRect();
    T = clamp((ev.clientX - b.left) / b.width, 0, .9999) * B.D.time.period;
    draw();
  }
  daybar.addEventListener('pointerdown', ev => { if (!ev.target.closest('.track')) return; daybar.setPointerCapture(ev.pointerId); scrub(ev); daybar.onpointermove = scrub; });
  daybar.addEventListener('pointerup', () => { daybar.onpointermove = null; });
  let grab = null;
  world.addEventListener('pointerdown', ev => { grab = { x: ev.clientX, y: ev.clientY, px: pan.x, py: pan.y }; world.setPointerCapture(ev.pointerId); });
  world.addEventListener('pointermove', ev => { if (!grab || !B) return; pan.x = grab.px - (ev.clientX - grab.x) / view.k; pan.y = grab.py - (ev.clientY - grab.y) / view.k; layout(); });
  world.addEventListener('pointerup', () => { grab = null; });
  addEventListener('keydown', ev => { if (ev.key === ' ' && !/^(INPUT|SELECT|BUTTON)$/.test(ev.target.tagName)) { ev.preventDefault(); ui.set('speed', ui.state.speed === '0' ? '1' : '0'); } });
  let rz = 0;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (B) { layout(); draw(); } }, 120); });

  fetch('../fantasia4x-tileset/catalog-data.json').then(res => res.json()).then(data => {
    DBX.fromData(data.objects);
    ui = F4X.bar(() => mount());
    mount();
    requestAnimationFrame(tick);
  });
})();
