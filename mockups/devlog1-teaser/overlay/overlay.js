import { config, stateAt, typedEnd } from './timing.mjs';

const q = new URLSearchParams(location.search);
const size = q.get('size') || '1920x1080';
const [W, H] = size.split('x').map(Number);
const $ = id => document.getElementById(id);
const stage = $('stage'), rig = $('rig'), pawn = $('pawn'), anchor = $('bubble-anchor');
const said = anchor.querySelector('.said'), rest = anchor.querySelector('.rest');

const loadImage = src => new Promise((ok, fail) => { const im = new Image(); im.onload = () => ok(im); im.onerror = fail; im.src = src; });
const fetchJson = async url => (await fetch(url)).json();

const [raw, meta] = await Promise.all([fetchJson(q.get('lines') || 'lines.json'), fetchJson('pawn/pawn.json')]);
const cfg = config(raw);
const layout = cfg.layouts[size] || cfg.layouts['1920x1080'];
const anims = Object.fromEntries(await Promise.all(Object.entries(meta.anims).map(async ([name, a]) => [name, { dur: a.dur, frames: await Promise.all(a.frames.map(loadImage)) }])));
await document.fonts.load("italic 10px 'Fantasia Mono'");
await document.fonts.ready;

stage.style.width = W + 'px';
stage.style.height = H + 'px';
stage.dataset.width = W;
stage.dataset.height = H;
stage.dataset.duration = cfg.duration;
pawn.width = meta.w;
pawn.height = meta.h;
pawn.style.width = meta.w * layout.pawnScale + 'px';
pawn.style.height = meta.h * layout.pawnScale + 'px';
rig.style.width = meta.w * layout.pawnScale + 'px';
rig.style.height = meta.h * layout.pawnScale + 'px';
anchor.style.bottom = meta.h * layout.pawnScale + layout.gap + 'px';
anchor.style.transform = `scale(${layout.bubbleScale})`;
const ctx = pawn.getContext('2d');

function frameAt(name, since) {
  const a = anims[name], n = a.frames.length;
  return a.frames[Math.floor((since / a.dur) * n) % n];
}

function placeBubble() {
  const rigW = meta.w * layout.pawnScale, bw = anchor.getBoundingClientRect().width;
  anchor.style.right = Math.round(Math.max(rigW / 2 - bw / 2, layout.edge - layout.right)) + 'px';
}

let now = 0, key = '';
function seek(t) {
  now = Math.max(0, Math.min(t, cfg.duration));
  const s = stateAt(cfg, now);
  const frame = s.typing ? frameAt('talk', now - s.line.start) : frameAt('idle', now);
  const text = s.line ? [...s.line.text] : [];
  const nextKey = [frame.src, s.line ? s.line.start : -1, s.shown, s.dx, s.dy].join('|');
  if (nextKey === key) return key;
  key = nextKey;
  ctx.clearRect(0, 0, meta.w, meta.h);
  ctx.drawImage(frame, 0, 0);
  rig.style.right = layout.right - s.dx + 'px';
  rig.style.bottom = layout.bottom - s.dy + 'px';
  anchor.hidden = !s.line;
  said.textContent = text.slice(0, s.shown).join('');
  rest.textContent = text.slice(s.shown).join('');
  if (s.line) placeBubble();
  return key;
}

const timeline = {
  duration: () => cfg.duration,
  time: () => now,
  totalTime: t => (t === undefined ? now : (seek(t), timeline)),
  seek: t => (seek(t), timeline),
  progress: p => (p === undefined ? now / cfg.duration : (seek(p * cfg.duration), timeline)),
  pause: () => timeline,
  play: () => timeline,
  paused: () => true,
  isActive: () => false
};
window.__timelines = window.__timelines || {};
window.__timelines.narrator = timeline;
window.__seek = t => seek(t);
window.__narrator = { cfg, size: [W, H], typedEnd };
seek(Number(q.get('t') || 0));
window.__ready = true;
