'use strict';
(() => {
  const zq = new URLSearchParams(location.search);
  const REP = 8, MW = SW * REP, MH = SH * REP, SNAPS = [16, 32, 64], MAXT = 64, STEP = 2;
  const FOLK = [[27, 15], [30, 11], [25, 16], [18, 16], [31, 25], [24, 27], [22, 21], [21, 15], [33, 16]];
  const FOES = [[47, 12], [48, 13], [46, 13], [49, 10], [38, 3], [38, 6], [39, 8]];
  const zs = F4X.bar((s, k) => setOption(k, s[k])).state;
  const stage = document.getElementById('stage'), view = document.getElementById('view'), vx = view.getContext('2d'), read = document.getElementById('read');
  let base = null, halfCv = null, dots = null, walls = null;
  let tile = +(zq.get('tile') || 32), far = zq.has('far'), cx = +(zq.get('cx') || 26), cy = +(zq.get('cy') || 17), anim = null, acc = 0, cool = 0;

  const fit = () => Math.min(view.width / MW, view.height / MH);
  const stops = () => {
    if (zs.mode !== 'steps') return SNAPS;
    const f = fit(), out = [f];
    for (let t = Math.ceil(f / STEP) * STEP; t <= MAXT; t += STEP) if (t > f + .01) out.push(t);
    return out;
  };

  function build() {
    const w = buildScene('summer'), r = renderWorld(w, { season: 'summer', roofs: 'cut', cache: {} });
    base = document.createElement('canvas'); base.width = r.W; base.height = r.H;
    SEASON = 'summer';
    present(r, base.getContext('2d'), 'day', 3, { noVig: true, calm: true });
    halfCv = document.createElement('canvas'); halfCv.width = r.W / 2; halfCv.height = r.H / 2;
    const hx = halfCv.getContext('2d'); hx.imageSmoothingEnabled = true; hx.imageSmoothingQuality = 'high'; hx.drawImage(base, 0, 0, r.W / 2, r.H / 2);
    const one = document.createElement('canvas'); one.width = SW; one.height = SH;
    const ox = one.getContext('2d'); ox.imageSmoothingEnabled = true; ox.imageSmoothingQuality = 'high'; ox.drawImage(base, 0, 0, SW, SH);
    dots = document.createElement('canvas'); dots.width = MW; dots.height = MH;
    const dx = dots.getContext('2d');
    for (let j = 0; j < REP; j++) for (let i = 0; i < REP; i++) dx.drawImage(one, i * SW, j * SH);
    walls = [];
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) if (w.wall[y * SW + x] && w.wall[y * SW + x] !== WL.mountain) walls.push([x, y]);
    dx.fillStyle = '#e8dcc0';
    for (let j = 0; j < REP; j++) for (let i = 0; i < REP; i++) for (const [x, y] of walls) dx.fillRect(i * SW + x, j * SH + y, 1, 1);
  }

  function size() {
    view.width = stage.clientWidth; view.height = stage.clientHeight;
    if (zs.mode === 'steps' && tile < fit()) tile = fit();
    draw();
  }
  function clampCam() {
    const hw = view.width / tile / 2, hh = view.height / tile / 2;
    cx = hw * 2 >= MW ? MW / 2 : clamp(cx, hw, MW - hw);
    cy = hh * 2 >= MH ? MH / 2 : clamp(cy, hh, MH - hh);
  }
  function overview() {
    const k = Math.max(1, Math.floor(fit())), w = MW * k, h = MH * k, x0 = Math.round((view.width - w) / 2), y0 = Math.round((view.height - h) / 2);
    vx.drawImage(dots, x0, y0, w, h);
    const m = Math.max(3, k + 2);
    for (let j = 0; j < REP; j++) for (let i = 0; i < REP; i++) {
      vx.fillStyle = '#ffe680'; for (const [x, y] of FOLK) vx.fillRect(x0 + (i * SW + x) * k - 1, y0 + (j * SH + y) * k - 1, m, m);
      vx.fillStyle = '#ff5a48'; for (const [x, y] of FOES) vx.fillRect(x0 + (i * SW + x) * k - 1, y0 + (j * SH + y) * k - 1, m, m);
    }
    return { k, x0, y0 };
  }
  function draw() {
    if (!base) return;
    vx.imageSmoothingEnabled = false;
    vx.fillStyle = '#000'; vx.fillRect(0, 0, view.width, view.height);
    if (far && !anim) { overview(); readout(); return; }
    clampCam();
    const useHalf = zs.half === 'avg' && Math.abs(tile - 16) < .001, src = useHalf ? halfCv : base;
    const pw = SW * tile, ph = SH * tile, left = view.width / 2 - cx * tile, top = view.height / 2 - cy * tile;
    for (let j = 0; j < REP; j++) {
      const y = Math.round(top + j * ph); if (y > view.height || y + ph < 0) continue;
      for (let i = 0; i < REP; i++) {
        const x = Math.round(left + i * pw); if (x > view.width || x + pw < 0) continue;
        vx.drawImage(src, x, y, Math.round(left + (i + 1) * pw) - x, Math.round(top + (j + 1) * ph) - y);
      }
    }
    readout();
  }
  function readout() {
    if (far && !anim) { read.innerHTML = `<b>overview</b> · one dot per tile · <b>${MW} × ${MH}</b> tiles`; return; }
    const r = tile / 32, crisp = Number.isInteger(r) ? 'crisp' : tile === 16 ? (zs.half === 'avg' ? 'half scale, averaged' : 'half scale, every second art pixel dropped') : 'uneven';
    read.innerHTML = `<b>${+tile.toFixed(2)} px</b> per tile · 1 art px = ${+r.toFixed(2)} screen px · <b>${crisp}</b> · ${Math.ceil(view.width / tile)} × ${Math.ceil(view.height / tile)} tiles`;
  }

  function goTo(t, toFar, at) {
    if (zs.mode === 'glide') {
      const from = far ? fit() : tile, to = toFar ? fit() : t, t0 = performance.now();
      if (far && at) { cx = at[0]; cy = at[1]; }
      far = toFar; tile = from;
      anim = { run: true };
      const me = anim, step = now => {
        if (anim !== me) return;
        const u = Math.min(1, (now - t0) / 220), e = 1 - (1 - u) * (1 - u);
        tile = from * Math.pow(to / from, e);
        if (u >= 1) { anim = null; tile = toFar ? SNAPS[0] : t; draw(); return; }
        draw(); requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      return;
    }
    if (far && !toFar && at) { cx = at[0]; cy = at[1]; }
    far = toFar; if (!toFar) tile = t; draw();
  }
  function tileUnder(e) {
    const rc = view.getBoundingClientRect(), px = e.clientX - rc.left, py = e.clientY - rc.top;
    if (far) { const k = Math.max(1, Math.floor(fit())); return [(px - Math.round((view.width - MW * k) / 2)) / k, (py - Math.round((view.height - MH * k) / 2)) / k]; }
    return [cx + (px - view.width / 2) / tile, cy + (py - view.height / 2) / tile];
  }
  function wheelStep(dir, e) {
    const st = stops();
    if (zs.mode === 'steps') {
      far = false;
      let i = st.findIndex(s => Math.abs(s - tile) < .01);
      if (i < 0) i = st.reduce((b, s, k) => Math.abs(s - tile) < Math.abs(st[b] - tile) ? k : b, 0);
      tile = st[clamp(i + dir, 0, st.length - 1)]; draw(); return;
    }
    if (far) { if (dir > 0) goTo(SNAPS[0], false, tileUnder(e)); return; }
    const i = SNAPS.indexOf(tile);
    if (dir < 0 && i <= 0) { goTo(0, true); return; }
    goTo(SNAPS[clamp((i < 0 ? 1 : i) + dir, 0, SNAPS.length - 1)], false);
  }
  stage.addEventListener('wheel', e => {
    e.preventDefault();
    if (anim) return;
    acc += e.deltaY;
    const now = performance.now(), need = zs.mode === 'steps' ? 40 : 60;
    if (Math.abs(acc) < need || now < cool) return;
    const dir = acc > 0 ? -1 : 1; acc = 0; cool = now + (zs.mode === 'steps' ? 0 : 160);
    wheelStep(dir, e);
  }, { passive: false });

  let drag = null;
  stage.addEventListener('pointerdown', e => { if (far) { goTo(SNAPS[0], false, tileUnder(e)); return; } drag = { x: e.clientX, y: e.clientY, cx, cy }; stage.setPointerCapture(e.pointerId); stage.classList.add('drag'); });
  stage.addEventListener('pointermove', e => { if (drag) { cx = drag.cx - (e.clientX - drag.x) / tile; cy = drag.cy - (e.clientY - drag.y) / tile; draw(); } });
  stage.addEventListener('pointerup', () => { drag = null; stage.classList.remove('drag'); });
  addEventListener('keydown', e => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1] }[e.key];
    if (!d || far) return;
    cx += d[0] * 96 / tile; cy += d[1] * 96 / tile; draw(); e.preventDefault();
  });

  function syncCtl() {
    document.querySelector('#mock [data-k="half"]').closest('.mrow').hidden = zs.mode === 'steps';
    document.querySelector('#jump [data-j="far"]').textContent = zs.mode === 'steps' ? 'Fit' : 'Overview';
  }
  document.getElementById('jump').addEventListener('click', e => {
    const v = e.target.dataset.j; if (v === undefined) return;
    if (v === 'far') { if (zs.mode === 'steps') { far = false; tile = fit(); draw(); } else goTo(0, true); }
    else goTo(+v, false);
  });
  function setOption(k, v) {
    if (k === 'mode') { anim = null; if (v === 'steps') far = false; else if (!far) tile = SNAPS.reduce((b, s) => Math.abs(s - tile) < Math.abs(b - tile) ? s : b, SNAPS[1]); }
    syncCtl(); draw();
  }

  syncCtl();
  setTimeout(() => { build(); document.getElementById('zbusy').hidden = true; size(); }, 30);
  addEventListener('resize', size);
})();
