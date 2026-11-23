'use strict';
(() => {
  const $ = id => document.getElementById(id), q = new URLSearchParams(location.search), SG = HUD.sandglass, A = HUD.art, RAMP = A.RAMP;
  const TIPS = [
    'A colonist who collapses is down, not dead — send a caretaker before the bleeding wins.',
    'Wounds bleed by the second. Tend them and a small ✚ marks the mend.',
    'Stone tools come first. Flint is the scarce gate to everything sharper.',
    'Light shapes labour — raise a campfire before dusk or work crawls in the dark.',
    'Every pawn drops a task to eat or sleep once a need turns dire.',
    'Rain soaks the unsheltered; a roof and a fire dry them faster than the wind.',
    'Winter drains the colour from the world — and warmth becomes a daily worry.',
    'Mountains hoard ore, rivers carry fish, and a swamp rots what you store in it.',
    'A felled beast is meat, hide, and bone, if a butcher reaches it before the rot.',
    'Hunger, cold, and exhaustion stack. A tired, freezing pawn is a slow one.'
  ];
  const STATUS = ['Loading world…', 'Starting renderer…', 'Warming up simulation…', 'Ready'];
  const SPEED = { slow: 16000, normal: 9000, fast: 4000 };
  const SCALE = 4, FLIP = 900;
  const ui = F4X.bar((s, k) => { state[k] = s[k]; if (k === 'speed') state.t0 = performance.now(); if (k !== 'strip') mount(); });
  const state = { skin: ui.state.skin, speed: ui.state.speed, hold: q.has('f') ? clamp(+q.get('f'), 0, 1) : null, t0: performance.now(), flipping: 0, status: 0, tip: 0 };

  const cv = $('glass'), g = cv.getContext('2d'), wrap = $('glasswrap');
  cv.width = SG.W; cv.height = SG.H; cv.style.width = SG.W * SCALE + 'px'; cv.style.height = SG.H * SCALE + 'px';
  let frameArt = null;

  const NAIL = ['..###..', '.#####.', '#######', '#######', '#######', '.#####.', '..###..'];
  function nail(g, x0, y0, s) {
    const on = (i, j) => j >= 0 && j < 7 && i >= 0 && i < 7 && NAIL[j][i] === '#';
    const px = (i, j, c, a) => { g.fillStyle = `rgb(${c[0]} ${c[1]} ${c[2]} / ${a || 1})`; g.fillRect(x0 + i * s, y0 + j * s, s, s); };
    for (let j = -1; j < 10; j++) for (let i = -1; i < 10; i++) {
      if (on(i, j)) {
        const edge = !on(i - 1, j) || !on(i, j - 1), under = !on(i + 1, j) || !on(i, j + 1), d = i + j;
        px(i, j, P.iron[edge && !under ? 5 : under && !edge ? 1 : d < 5 ? 4 : d > 7 ? 2 : 3]);
      } else if (on(i - 1, j) || on(i + 1, j) || on(i, j - 1) || on(i, j + 1)) px(i, j, P.ink);
      else if (on(i - 2, j - 2) || on(i - 1, j - 2) || on(i - 2, j - 1)) px(i, j, P.ink, .45);
    }
    px(2, 2, P.iron[6]);
  }
  function plainFrame(c) {
    const g = c.getContext('2d'), w = c.width, h = c.height, im = g.getImageData(0, 0, w, h), d = im.data, stud = P.iron[6];
    const at = (x, y) => (y * w + x) * 4, is = (i, col) => d[i] === col[0] && d[i + 1] === col[1] && d[i + 2] === col[2];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const e = Math.min(x, y, w - 1 - x, h - 1 - y), i = at(x, y), horiz = e === y || e === h - 1 - y;
      if (e > 4 || !(is(i, stud) || (e === 4 && is(i, P.ink)))) continue;
      const j = horiz ? at(x + (x < w / 2 ? 3 : -3), y) : at(x, y + (y < h / 2 ? 3 : -3));
      d[i] = d[j]; d[i + 1] = d[j + 1]; d[i + 2] = d[j + 2];
    }
    g.putImageData(im, 0, 0);
  }
  function paintSkins() {
    const skin = HUD.skins[state.skin], timber = state.skin === 'timber';
    document.querySelectorAll('[data-skin]').forEach(el => {
      el.querySelectorAll(':scope > canvas.skin').forEach(c => c.remove());
      const fn = skin.paint[el.dataset.skin], w = el.offsetWidth, h = el.offsetHeight, board = timber && el.id === 'leaf';
      if (!fn) return;
      const out = board ? A.timber(w, h, { dir: 'v', beam: 4, strap: 0, seed: 8, base: .38, lo: 24, hi: 34 }) : fn(w, h, el), c = out instanceof HTMLCanvasElement ? out : out.base;
      if (board) { plainFrame(c); for (const [x, y] of [[13, 13], [w - 27, 13], [13, h - 27], [w - 27, h - 27]]) nail(c.getContext('2d'), x, y, 2); }
      c.className = 'skin'; el.prepend(c);
    });
  }
  function wall(w, h) {
    const ramp = RAMP.beam, wood = A.planks(w, h, { dir: 'h', ramp, base: .3, seed: 4, lo: 26, hi: 38 }), row = new Int16Array(h);
    for (let y = 0, k = 0; y < h; y++) { row[y] = k; if (wood(3, y) === ramp[0] && wood(41, y) === ramp[0] && wood(97, y) === ramp[0]) { row[y] = -1; k++; } }
    return (x, y) => {
      const k = row[y];
      if (k < 0) return ramp[0];
      const period = 190 + Math.floor(hash(k, 3, 17) * 120), at = (x + Math.floor(hash(k, 5, 23) * period)) % period;
      return at === 0 ? ramp[0] : at === 1 ? A.tone(wood(x, y), 1.18) : wood(x, y);
    };
  }
  function paintBg() {
    const bg = $('bg'), w = Math.ceil(bg.offsetWidth / 2), h = Math.ceil(bg.offsetHeight / 2), v = state.skin === 'vellum';
    const wood = wall(w, h);
    const leaf = $('leaf').getBoundingClientRect(), scr = $('screen').getBoundingClientRect();
    const L = (leaf.left - scr.left) / 2 + 5, T = (leaf.top - scr.top) / 2 + 7, R = L + leaf.width / 2 + 1, B = T + leaf.height / 2 + 1;
    const shade = (x, y) => { if (v) return 1; const d = Math.hypot(Math.max(L - x, 0, x - R), Math.max(T - y, 0, y - B)); return d === 0 ? .34 : d < 5 && dith(x, y) > d / 5 ? .5 : 1; };
    const c = A.paint(w, h, (x, y) => {
      const r = Math.hypot((x - w / 2) / (w * .62), (y - h * .46) / (h * .62));
      return A.tone(wood(x, y), clamp(1.2 - r * .7, .3, 1) * shade(x, y));
    });
    bg.width = w; bg.height = h; bg.getContext('2d').drawImage(c, 0, 0);
  }
  function mount() {
    const skin = HUD.skins[state.skin];
    document.body.dataset.skin = state.skin;
    for (const [k, v] of Object.entries({ ...skin.tokens, ...skin.emit })) document.documentElement.style.setProperty(k, v);
    frameArt = SG.frame(state.skin);
    paintSkins(); paintBg();
    $('pov').innerHTML = `<b>${skin.name}</b> — the sandglass stands on the ${state.skin === 'vellum' ? 'open leaf' : 'oak board'}; when the top runs dry it turns over`;
  }

  function flip(now) {
    state.flipping = now;
    wrap.style.transition = `transform ${FLIP}ms cubic-bezier(.5,0,.3,1)`;
    wrap.style.transform = 'rotate(180deg)';
    setTimeout(() => { wrap.style.transition = 'none'; wrap.style.transform = ''; state.t0 = performance.now(); state.flipping = 0; }, FLIP + 40);
  }
  function draw(now) {
    const f = state.hold !== null ? state.hold : state.flipping ? 1 : Math.min(1, (now - state.t0) / SPEED[state.speed]), tick = Math.floor(now / 70);
    g.clearRect(0, 0, SG.W, SG.H);
    g.drawImage(SG.glass(state.skin, f, tick), 0, 0);
    g.drawImage(frameArt, 0, 0);
    if (f >= 1 && !state.flipping) flip(now);
    requestAnimationFrame(draw);
  }

  function setStatus(i) { state.status = i; const el = $('status'); el.textContent = STATUS[i]; el.classList.toggle('ready', i === STATUS.length - 1); }
  function nextTip() {
    const el = $('tiptext');
    el.classList.add('fading');
    setTimeout(() => { state.tip = (state.tip + 1) % TIPS.length; el.textContent = TIPS[state.tip]; el.classList.remove('fading'); }, 260);
  }

  $('act').addEventListener('click', ev => {
    const a = ev.target.closest('button')?.dataset.a;
    if (a === 'flip' && !state.flipping) flip(performance.now());
    else if (a === 'ready') setStatus(STATUS.length - 1);
  });
  addEventListener('keydown', ev => {
    if (ev.key === '1' || ev.key === '2') ui.set('skin', Object.keys(HUD.skins)[+ev.key - 1]);
  });
  let rz = 0;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(mount, 120); });

  Promise.all(['48px Jersey20', '52px Jacquard24', '18px VT'].map(f => document.fonts.load(f))).catch(() => {}).then(() => {
    $('tiptext').textContent = TIPS[0];
    setStatus(0);
    mount();
    requestAnimationFrame(draw);
    setInterval(() => setStatus((state.status + 1) % STATUS.length), 3200);
    setInterval(nextTip, 4200);
  });
})();
