'use strict';
const q = new URLSearchParams(location.search);
if (q.get('theme')) document.documentElement.dataset.theme = q.get('theme');
const state = {
  view: q.get('view') || 'scene', time: q.get('time') || 'day', season: q.get('season') || 'summer',
  roofs: q.get('roofs') || '0', zoom: q.get('zoom') || '', grid: q.get('grid') || '0',
};
const cv = document.getElementById('cv'), gridcv = document.getElementById('gridcv'), ctx = cv.getContext('2d');
let RW = null, tick = 0, built = '';

function fitZoom() {
  const avail = document.documentElement.clientWidth - 26;
  return String(clamp(Math.floor(avail / (60 * T)), 1, 4));
}
function rebuild() {
  const key = state.season + state.roofs;
  if (built !== key) {
    const w = buildScene(state.season);
    RW = renderWorld(w, { season: state.season, roofs: state.roofs === '1' });
    cv.width = RW.W; cv.height = RW.H; built = key;
  }
  const z = +state.zoom;
  cv.style.width = RW.W * z + 'px'; cv.style.height = RW.H * z + 'px';
  gridcv.width = RW.W * z; gridcv.height = RW.H * z;
  gridcv.hidden = state.grid !== '1';
  if (state.grid === '1') {
    const g = gridcv.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,.16)';
    for (let x = 0; x < RW.W; x += T) g.fillRect(x * z, 0, 1, RW.H * z);
    for (let y = 0; y < RW.H; y += T) g.fillRect(0, y * z, RW.W * z, 1);
  }
  SEASON = state.season;
  present(RW, ctx, state.time, tick);
}
function sync() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === state.view));
  document.querySelectorAll('#ctl .grp').forEach(g => g.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === state[g.dataset.k])));
  document.getElementById('scene').hidden = state.view !== 'scene';
  document.getElementById('sheet').hidden = state.view !== 'sheet';
  document.querySelectorAll('#ctl .grp').forEach(g => { g.hidden = state.view === 'sheet' && g.dataset.k !== 'season'; });
  if (state.view === 'scene') rebuild(); else if (typeof buildSheet === 'function') buildSheet(document.getElementById('sheet'), state.season);
}
document.getElementById('tabs').addEventListener('click', e => { if (e.target.dataset.v) { state.view = e.target.dataset.v; sync(); } });
document.getElementById('ctl').addEventListener('click', e => {
  const g = e.target.closest('.grp');
  if (g && e.target.dataset.v !== undefined) { state[g.dataset.k] = e.target.dataset.v; sync(); }
});
if (!state.zoom) state.zoom = fitZoom();
sync();
if (!q.has('still')) setInterval(() => { if (state.view === 'scene' && !document.hidden) { tick++; SEASON = state.season; present(RW, ctx, state.time, tick); } }, 220);
