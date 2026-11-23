'use strict';
const q = new URLSearchParams(location.search);
if (q.get('theme')) document.documentElement.dataset.theme = q.get('theme');
const state = {
  view: q.get('view') || 'scene', time: q.get('time') || 'day', season: q.get('season') || 'summer',
  roofs: q.has('roofs') ? q.get('roofs') : 'cut', zoom: q.get('zoom') || '', grid: q.get('grid') || '0',
};
const cv = document.getElementById('cv'), gridcv = document.getElementById('gridcv'), ctx = cv.getContext('2d'), wrap = document.getElementById('wrap'), busy = document.getElementById('busy');
const groundCache = {};
let RW = null, built = '', lastT = 0;
const T0 = performance.now();

function fitZoom() {
  const avail = document.documentElement.clientWidth - 2;
  return avail >= SW * T * 2 ? '2' : avail >= 1100 ? '1' : '0.5';
}
const vigcv = document.getElementById('vigcv');
function drawVig() {
  if (vigcv.dataset.k === state.time + RW.W) return;
  vigcv.dataset.k = state.time + RW.W; vigcv.width = RW.W; vigcv.height = RW.H;
  const g = vigcv.getContext('2d'), im = g.createImageData(RW.W, RW.H), d = im.data, vk = TIMES[state.time].vig, vx = (RW.W - 1) / 2, vy = (RW.H - 1) / 2;
  for (let i = 0, y = 0; y < RW.H; y++) for (let x = 0; x < RW.W; x++, i++) { const v = clamp((Math.hypot((x - vx) / vx, (y - vy) / vy) - .62) / .8, 0, 1), q = Math.min(4, Math.floor(v * v * (3 - 2 * v) * 4 + dith(x, y))); if (q) { d[i * 4 + 2] = 14; d[i * 4 + 3] = q * vk * 255; } }
  g.putImageData(im, 0, 0);
}
function layout() {
  const z = +state.zoom;
  drawVig(); vigcv.style.width = RW.W * z + 'px'; vigcv.style.height = RW.H * z + 'px';
  cv.style.width = RW.W * z + 'px'; cv.style.height = RW.H * z + 'px';
  cv.style.imageRendering = z < 1 ? 'auto' : 'pixelated';
  gridcv.hidden = state.grid !== '1';
  if (state.grid === '1') {
    gridcv.width = RW.W * z; gridcv.height = RW.H * z;
    const g = gridcv.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,.16)';
    for (let x = 0; x < RW.W; x += T) g.fillRect(x * z, 0, 1, RW.H * z);
    for (let y = 0; y < RW.H; y += T) g.fillRect(0, y * z, RW.W * z, 1);
  }
}
function rebuild() {
  const key = state.season + state.roofs;
  if (built === key) { layout(); frame(true); return; }
  busy.hidden = false;
  setTimeout(() => {
    const t0 = performance.now(), w = buildScene(state.season), t1 = performance.now();
    RW = renderWorld(w, { season: state.season, roofs: state.roofs, cache: groundCache });
    const t2 = performance.now();
    cv.width = RW.W; cv.height = RW.H; built = key;
    layout(); frame(true);
    busy.hidden = true;
    if (q.has('bench')) { const pf = {}, N = 12, tb = performance.now(); for (let i = 0; i < N; i++) present(RW, ctx, state.time, 3 + i * .05, { dt: .05, prof: pf }); const tot = (performance.now() - tb) / N; console.log('bench build', Math.round(t1 - t0), 'render', Math.round(t2 - t1), 'frame avg ms', tot.toFixed(1), JSON.stringify(Object.fromEntries(Object.entries(pf).map(([k, v]) => [k, +(v / N).toFixed(1)]))), 'sway', RW.sway.length); }
  }, 30);
}
function sync() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === state.view));
  document.querySelectorAll('#ctl .grp').forEach(g => g.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === state[g.dataset.k])));
  document.getElementById('scene').hidden = state.view !== 'scene';
  document.getElementById('sheet').hidden = state.view !== 'sheet';
  document.querySelectorAll('#ctl .grp').forEach(g => { g.hidden = state.view === 'sheet' && g.dataset.k !== 'season'; });
  if (state.view === 'scene') rebuild(); else buildSheet(document.getElementById('sheet'), state.season);
}
document.getElementById('tabs').addEventListener('click', e => { if (e.target.dataset.v) { state.view = e.target.dataset.v; sync(); } });
document.getElementById('ctl').addEventListener('click', e => {
  const g = e.target.closest('.grp');
  if (g && e.target.dataset.v !== undefined) { state[g.dataset.k] = e.target.dataset.v; sync(); }
});
let drag = null;
wrap.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') { drag = { x: e.clientX, y: e.clientY, l: wrap.scrollLeft, t: wrap.scrollTop }; wrap.setPointerCapture(e.pointerId); wrap.classList.add('drag'); } });
wrap.addEventListener('pointermove', e => { if (drag) { wrap.scrollLeft = drag.l - (e.clientX - drag.x); wrap.scrollTop = drag.t - (e.clientY - drag.y); } });
wrap.addEventListener('pointerup', () => { drag = null; wrap.classList.remove('drag'); });
if (!state.zoom) state.zoom = fitZoom();
sync();
function clipRect() {
  const z = +state.zoom, rc = cv.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
  const l = Math.max(rc.left, wr.left, 0), t = Math.max(rc.top, wr.top, 0), rt = Math.min(rc.right, wr.right, innerWidth), b = Math.min(rc.bottom, wr.bottom, innerHeight);
  if (rt <= l || b <= t) return null;
  return { x0: Math.floor((l - rc.left) / z) - 2, y0: Math.floor((t - rc.top) / z) - 2, x1: Math.ceil((rt - rc.left) / z) + 2, y1: Math.ceil((b - rc.top) / z) + 2 };
}
function frame(full) {
  if (!RW) return;
  const ts = q.has('still') ? +(q.get('t') || 3) : (performance.now() - T0) / 1000, clip = full ? null : clipRect();
  if (!full && !clip) return;
  SEASON = state.season;
  const pf = q.has('bench') && !full ? (frame.pf || (frame.pf = { n: 0, t: performance.now() })) : null;
  present(RW, ctx, state.time, ts, { clip, dt: Math.min(.25, ts - lastT), calm: q.has('calm'), prof: pf });
  lastT = ts;
  if (pf && ++pf.n === 60) { const el = performance.now() - pf.t; console.log('live fps', (60000 / el).toFixed(1), 'clip', clip.x1 - clip.x0, clip.y1 - clip.y0, JSON.stringify(Object.fromEntries(Object.entries(pf).filter(([k]) => k !== 'n' && k !== 't').map(([k, v]) => [k, +(v / 60).toFixed(1)])))); frame.pf = null; }
}
if (!q.has('still')) {
  let last = 0;
  const loop = now => { requestAnimationFrame(loop); if (now - last < 28 || state.view !== 'scene' || document.hidden || built !== state.season + state.roofs) return; last = now; frame(false); };
  requestAnimationFrame(loop);
}
