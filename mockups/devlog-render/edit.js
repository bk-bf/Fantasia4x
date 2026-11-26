'use strict';
(async () => {
  const T = Thumb, W = T.W, H = T.H, $ = s => document.querySelector(s);
  const NAME = 'fantasia4x-devlog-render', API = `/_comments/api/${NAME}`;
  const store = {
    get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const snap = (v, k) => Math.round(v / k) * k;
  const inR = (r, x, y) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
  const S = JSON.stringify;
  const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
  const rotP = (p, c, d) => { const a = rad(d), co = Math.cos(a), si = Math.sin(a), x = p[0] - c[0], y = p[1] - c[1]; return [c[0] + x * co - y * si, c[1] + x * si + y * co]; };
  const normDeg = d => { const n = Math.round((((d % 360) + 360) % 360) * 10) / 10; return n === 360 ? 0 : n; };
  const round3 = v => Math.round(v * 1000) / 1000;
  const status = t => { $('#status').textContent = t; };

  const doc = new DOMParser().parseFromString(await (await fetch('thumb.html', { cache: 'no-store' })).text(), 'text/html');
  const ids = [...doc.querySelectorAll('section.th')].map(s => s.id);
  const q = new URLSearchParams(location.search);
  const v = ids.includes(q.get('v')) ? q.get('v') : ids[0];
  if (q.get('v') !== v) { q.set('v', v); history.replaceState(null, '', '?' + q + location.hash); }
  const vs = $('#variant');
  for (const id of ids) vs.append(new Option(id, id, false, id === v));
  vs.onchange = () => { const p = new URLSearchParams(location.search); p.set('v', vs.value); location.search = p; };

  let base = null;
  try { const r = await fetch(`layouts/${v}.json`, { cache: 'no-store' }); if (r.ok) base = await r.json(); } catch {}
  base = base || await T.parse(doc.getElementById(v));
  const KEY = 'f4x-devlog-edit:' + v;
  let L = T.clone(store.get(KEY) || base);
  const NAT = new Map();
  const nat = async src => { if (!NAT.has(src)) { const i = await T.image(src); NAT.set(src, { w: i.naturalWidth, h: i.naturalHeight }); } return NAT.get(src); };
  await Promise.all(L.images.map(i => nat(i.src)));
  const hist = [], fut = [];
  const mainImage = () => Math.max(0, L.images.findIndex(i => i.role === 'right' || i.role === 'full'));
  let sel = { t: 'image', i: mainImage() }, geo = { clips: [], texts: [] }, drag = null, live = null, wheelTimer = 0;

  const th = $('#th'), stage = $('#stage'), hd = $('#hd');

  function fitAxis(v, a, len, size, k) {
    if (size <= len) return snap(a + (len - size) / 2, k);
    const lo = Math.ceil((a + len - size) / k) * k, hi = Math.floor(a / k) * k;
    return lo > hi ? hi : clamp(snap(v, k), lo, hi);
  }
  function fit(N, i) {
    const im = N.images[i], n = NAT.get(im.src), r = T.clipOf(N, im), g = im.free ? 1 : im.k;
    if (im.rot) return;
    im.x = fitAxis(im.x, r.x, r.w, n.w * im.k, g);
    im.y = fitAxis(im.y, r.y, r.h, n.h * im.k, g);
  }
  function settleImage(N, i) {
    const im = N.images[i];
    if (!im.free) im.k = clamp(Math.round(im.k), 1, 16); else im.k = round3(im.k);
    const g = im.free ? 1 : im.k;
    im.x = snap(im.x, g); im.y = snap(im.y, g);
    if (im.rot) { im.px = snap(im.px, g); im.py = snap(im.py, g); }
    else { delete im.px; delete im.py; delete im.rot; fit(N, i); }
  }
  const clipCentre = (N, im) => { const r = T.clipOf(N, im); return [r.x + r.w / 2, r.y + r.h / 2]; };
  const arrowCentre = a => { const ps = a.kind === 'brush' ? [a.from, a.via, a.to] : [a.from, a.to]; return [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length]; };
  const arrowPts = a => ['from', 'via', 'to'];
  function settleArrow(a) {
    const g = a.kind === 'pixel' ? a.k : 1;
    for (const h of arrowPts(a)) a[h] = [clamp(snap(a[h][0], g), -W, 2 * W), clamp(snap(a[h][1], g), -H, 2 * H)];
  }

  function zspec(s = sel) {
    if (!s) return null;
    if (s.t === 'image' || s.t === 'text') { const o = s.t === 'image' ? L.images[s.i] : L.texts[s.i]; return { v: o.k, free: !!o.free, min: o.free ? .25 : 1, max: 16, step: o.free ? .05 : 1, fmt: '×' + +o.k.toFixed(2) }; }
    if (s.t === 'arrow' && L.arrow.kind !== 'none') { const a = L.arrow, z = a.s || 1; return { v: z, free: !!a.free, min: a.free ? .1 : .25, max: 4, step: a.free ? .01 : .25, fmt: '×' + +z.toFixed(2) }; }
    return null;
  }
  function setZoom(N, s, val, C) {
    if (s.t === 'image') {
      const im = N.images[s.i], k2 = im.free ? clamp(val, .25, 16) : clamp(Math.round(val), 1, 16);
      C = C || (im.rot ? [im.px, im.py] : clipCentre(N, im));
      const P = im.rot ? [im.px, im.py] : C, Cl = rotP(C, P, -(im.rot || 0)), u = [(Cl[0] - im.x) / im.k, (Cl[1] - im.y) / im.k];
      im.k = k2; im.x = Cl[0] - u[0] * k2; im.y = Cl[1] - u[1] * k2;
      settleImage(N, s.i);
    } else if (s.t === 'text') {
      const t = N.texts[s.i], g = geo.texts[s.i], k2 = t.free ? round3(clamp(val, .25, 16)) : clamp(Math.round(val), 1, 16);
      if (!g) return;
      const w = g.w / t.k * k2, h = g.h / t.k * k2, gr = t.free ? 1 : k2;
      delete t.right; delete t.bottom;
      t.x = snap(g.x + g.w / 2 - w / 2, gr); t.y = snap(g.y + g.h / 2 - h / 2, gr); t.k = k2;
    } else if (s.t === 'arrow') {
      const a = N.arrow, z = a.s || 1, z2 = a.free ? round3(clamp(val, .1, 4)) : clamp(Math.round(val * 4) / 4, .25, 4), c = arrowCentre(a), f = z2 / z;
      for (const h of arrowPts(a)) a[h] = [c[0] + (a[h][0] - c[0]) * f, c[1] + (a[h][1] - c[1]) * f];
      a.s = z2; settleArrow(a);
    }
  }
  function zoomStep(N, s, dir, C) {
    const z = zspec(s);
    if (!z) return;
    const next = z.free ? z.v * (dir > 0 ? 1.1 : 1 / 1.1) : z.v + dir * (s.t === 'arrow' ? .25 : 1);
    setZoom(N, s, next, C);
  }
  function rotOf(s = sel) {
    if (!s) return null;
    if (s.t === 'image') return L.images[s.i].rot || 0;
    if (s.t === 'text') return L.texts[s.i].rot || 0;
    if (s.t === 'arrow' && L.arrow.kind !== 'none') return L.arrow.rot || 0;
    return null;
  }
  function setRot(N, s, d) {
    d = normDeg(d);
    if (s.t === 'image') {
      const im = N.images[s.i];
      if (!im.rot) { const c = clipCentre(N, im); im.px = c[0]; im.py = c[1]; }
      im.rot = d; settleImage(N, s.i);
    } else if (s.t === 'text') {
      const t = N.texts[s.i];
      if (d) t.rot = d; else delete t.rot;
    } else if (s.t === 'arrow') {
      const a = N.arrow, c = arrowCentre(a), by = d - (a.rot || 0);
      for (const h of arrowPts(a)) a[h] = rotP(a[h], c, by);
      a.rot = d; settleArrow(a);
    }
  }
  function setFree(N, s, on) {
    const o = s.t === 'image' ? N.images[s.i] : s.t === 'text' ? N.texts[s.i] : N.arrow;
    if (on) { o.free = true; return; }
    delete o.free;
    if (s.t === 'arrow') setZoom(N, s, Math.round((o.s || 1) * 4) / 4);
    else setZoom(N, s, Math.max(1, Math.round(o.k)));
  }
  const exactSel = (s = sel) => {
    if (!s) return true;
    if (s.t === 'image') return T.exact(L.images[s.i]);
    if (s.t === 'text') return T.exact(L.texts[s.i]);
    return true;
  };

  let previewTimer = 0, previewUrl = null;
  function preview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(async () => {
      const cv = await T.composite(th);
      cv.toBlob(b => { if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = URL.createObjectURL(b); $('#preview').src = previewUrl; });
    }, drag || live ? 160 : 40);
  }
  async function draw() {
    const g = await T.render(L, th);
    if (!g) return;
    geo = g; hud(); preview();
  }

  function persist() { if (S(L) === S(base)) store.del(KEY); else store.set(KEY, L); }
  function commit(N, from = L) { hist.push(S(from)); fut.length = 0; L = N; persist(); draw(); panel(); }
  function undo() { if (!hist.length) return; fut.push(S(L)); L = JSON.parse(hist.pop()); after(); }
  function redo() { if (!fut.length) return; hist.push(S(L)); L = JSON.parse(fut.pop()); after(); }
  async function after() { await Promise.all(L.images.map(i => nat(i.src))); persist(); await draw(); panel(); }
  function startLive() { if (!live) live = S(L); }
  function endLive() { if (live && live !== S(L)) { hist.push(live); fut.length = 0; persist(); } live = null; panel(); }

  const imageName = im => ({ left: 'Before', right: 'After', inset: 'Before', full: L.mode === 'inset' ? 'After' : 'Image' })[im.role];
  const textName = t => 'Text · ' + t.lines.map(l => l.map(s => s[0]).join('')).join(' / ');
  function layerList() {
    const out = L.images.map((im, i) => [{ t: 'image', i }, imageName(im)]);
    if (L.seam) out.push([{ t: 'seam' }, 'Seam']);
    if (L.inset) out.push([{ t: 'seam' }, 'Inset frame']);
    out.push([{ t: 'arrow' }, 'Arrow' + (L.arrow.kind === 'none' ? ' · none' : '')]);
    L.texts.forEach((t, i) => out.push([{ t: 'text', i }, textName(t)]));
    return out.reverse();
  }
  const same = (a, b) => a && b && a.t === b.t && a.i === b.i;
  const selName = () => (layerList().find(([s]) => same(s, sel)) || [, ''])[1];

  function el(tag, props = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k in e) e[k] = v; else e.setAttribute(k, v);
    e.append(...kids.filter(k => k != null));
    return e;
  }
  const row = (label, ...kids) => el('div', { className: 'r' }, label ? el('span', { className: 'l' }, label) : null, ...kids);
  const seg = (opts, cur, pick) => opts.map(([val, lab]) => el('button', { className: val === cur ? 'on' : '', type: 'button', onclick: () => pick(val) }, lab));
  const colour = (val, set) => el('input', { type: 'color', value: val, oninput: e => { startLive(); set(e.target.value); draw(); }, onchange: endLive });
  const edit = fn => { const N = T.clone(L); if (fn(N) !== false && S(N) !== S(L)) commit(N); };
  const check = (on, set, label) => el('label', { className: 'ck' }, el('input', { type: 'checkbox', checked: on, onchange: e => set(e.target.checked) }), label);

  function zoomRow() {
    const z = zspec();
    if (!z) return null;
    const out = el('output', { id: 'zval' }, z.fmt);
    const slider = el('input', { type: 'range', id: 'zoom', min: z.min, max: z.max, step: z.step, value: z.v,
      oninput: e => { startLive(); setZoom(L, sel, +e.target.value); out.textContent = zspec().fmt; draw(); }, onchange: endLive });
    return row('Zoom',
      el('button', { type: 'button', id: 'zout', title: 'Zoom out (−)', onclick: () => edit(N => zoomStep(N, sel, -1)) }, '−'),
      slider,
      el('button', { type: 'button', id: 'zin', title: 'Zoom in (+)', onclick: () => edit(N => zoomStep(N, sel, 1)) }, '+'),
      out,
      check(z.free, on => edit(N => setFree(N, sel, on)), 'Free'));
  }
  function rotRow() {
    const r = rotOf();
    if (r == null) return null;
    return row('Rotate',
      el('button', { type: 'button', id: 'rl', title: '−90° ([)', onclick: () => edit(N => setRot(N, sel, r - 90)) }, '⟲ 90°'),
      el('input', { type: 'number', id: 'rdeg', step: 1, value: r, onchange: e => edit(N => setRot(N, sel, +e.target.value || 0)), onkeydown: e => { if (e.key === 'Enter') e.target.blur(); } }),
      el('span', { className: 'l' }, '°'),
      el('button', { type: 'button', id: 'rr', title: '+90° (])', onclick: () => edit(N => setRot(N, sel, r + 90)) }, '⟳ 90°'));
  }
  const warnTag = () => exactSel() ? null : el('span', { className: 'warn', title: 'Nearest-neighbour; check-pixels warns' }, '⚠ not pixel-exact');

  function panel() {
    const ls = $('#layers');
    ls.replaceChildren(...layerList().map(([s, name]) => el('button', { type: 'button', className: same(s, sel) ? 'on' : '', onclick: () => { sel = s; panel(); hud(); } }, name)));
    const props = $('#props'), p = { append: (...xs) => props.append(...xs.filter(x => x != null)) };
    props.replaceChildren(el('b', { className: 'name' }, sel ? selName() : '—'));
    if (!sel) return;
    if (sel.t === 'image') {
      const im = L.images[sel.i], opts = T.SRC.includes(im.src) ? T.SRC : [im.src, ...T.SRC];
      const pick = el('select', { onchange: e => swap(sel.i, e.target.value) }, ...opts.map(s => new Option(s.replace(/^src\/|\.png$/g, ''), s, false, s === im.src)));
      p.append(row('Source', pick), zoomRow(), rotRow(), warnTag());
    } else if (sel.t === 'seam' && L.seam) {
      const s = L.seam;
      p.append(row('Seam', ...seg([['vertical', 'Vertical'], ['diagonal', 'Diagonal']], s.mode, m => edit(N => {
        if (N.seam.mode === m) return false;
        const c = Math.round((N.seam.x0 + N.seam.x1) / 2);
        Object.assign(N.seam, { mode: m, x0: m === 'vertical' ? c : c + 80, x1: m === 'vertical' ? c : c - 80 });
        N.images.forEach((_, i) => fit(N, i));
      }))), row('Colour', colour(s.color, c => { L.seam.color = c; })), row('At', el('span', { className: 'xy' }, s.mode === 'vertical' ? `${s.x0}` : `${s.x0} → ${s.x1}`)));
    } else if (sel.t === 'seam' && L.inset) {
      const s = L.inset;
      p.append(row('Frame', colour(s.color, c => { L.inset.color = c; })), row('Shadow', colour(s.shadow, c => { L.inset.shadow = c; })), row('At', el('span', { className: 'xy' }, `${s.x}, ${s.y}`)));
    } else if (sel.t === 'arrow') {
      const a = L.arrow;
      p.append(row('Style', ...seg([['brush', 'Brush'], ['block', 'Block'], ['pixel', 'Pixel'], ['none', 'None']], a.kind, kind => edit(N => {
        if (N.arrow.kind === kind) return false;
        N.arrow.kind = kind; settleArrow(N.arrow);
      }))));
      if (a.kind !== 'none') {
        p.append(zoomRow(), rotRow(), row('Fill', colour(a.fill, c => { L.arrow.fill = c; })),
          row('Outline', el('input', { type: 'checkbox', checked: a.outline, onchange: e => edit(N => { N.arrow.outline = e.target.checked; }) }), colour(a.line, c => { L.arrow.line = c; })));
        if (a.kind === 'pixel') p.append(row('Grid', el('button', { type: 'button', onclick: () => grid(-1) }, '−'), el('output', {}, a.k + ' px'), el('button', { type: 'button', onclick: () => grid(1) }, '+')));
      }
    } else if (sel.t === 'text') {
      const t = L.texts[sel.i], i = sel.i;
      t.lines.forEach((l, li) => p.append(row(li ? '' : 'Text',
        el('input', { type: 'text', value: l.map(s => s[0]).join(''), oninput: e => { startLive(); L.texts[i].lines[li] = [[e.target.value, l[0][1]]]; draw(); }, onchange: () => { endLive(); }, onkeydown: e => { if (e.key === 'Enter') e.target.blur(); } }),
        colour(l[0][1], c => { L.texts[i].lines[li] = L.texts[i].lines[li].map(s => [s[0], c]); }))));
      p.append(row('Font', ...seg([['Jersey20', 'Jersey20'], ['Blackletter', 'Jacquard24']], t.font, f => edit(N => {
        const n = N.texts[i]; if (n.font === f) return false;
        n.lh = Math.round((n.lh || n.size) / n.size * T.FONT_PIXEL[f]); n.font = f; n.size = T.FONT_PIXEL[f];
      }))));
      p.append(zoomRow(), rotRow(), row('Outline', el('input', { type: 'checkbox', checked: t.outline !== false, onchange: e => edit(N => { N.texts[i].outline = e.target.checked; }) })), warnTag());
    }
  }

  async function swap(i, src) {
    const n = await nat(src);
    edit(N => {
      const im = N.images[i], r = T.clipOf(N, im);
      im.src = src;
      if (!im.free) while (im.k < 16 && (n.w * im.k < r.w || n.h * im.k < r.h)) im.k++;
      settleImage(N, i);
    });
  }
  function grid(d) {
    edit(N => {
      const a = N.arrow, k = clamp(a.k + d, 2, 16);
      if (k === a.k) return false;
      a.k = k; settleArrow(a);
    });
  }

  function step() {
    if (!sel) return 1;
    if (sel.t === 'image') return L.images[sel.i].free ? 1 : L.images[sel.i].k;
    if (sel.t === 'text') return L.texts[sel.i].free ? 1 : L.texts[sel.i].k;
    if (sel.t === 'arrow') return L.arrow.kind === 'pixel' ? L.arrow.k : 1;
    if (L.inset) return L.images.find(i => i.role === 'inset').k;
    return 1;
  }

  function move(from, g0, dx, dy, part) {
    const N = T.clone(from);
    if (sel.t === 'image') {
      const im = N.images[sel.i], f = from.images[sel.i];
      if (im.rot) { const g = im.free ? 1 : im.k, mx = snap(dx, g), my = snap(dy, g); im.x = f.x + mx; im.y = f.y + my; im.px = f.px + mx; im.py = f.py + my; }
      else { im.x = f.x + dx; im.y = f.y + dy; settleImage(N, sel.i); }
    } else if (sel.t === 'text') {
      const t = N.texts[sel.i], g = g0[sel.i], k = t.free ? 1 : t.k;
      delete t.right; delete t.bottom;
      t.x = clamp(snap(g.x + dx, k), Math.ceil((k - g.w) / k) * k, Math.floor((W - k) / k) * k);
      t.y = clamp(snap(g.y + dy, k), Math.ceil((k - g.h) / k) * k, Math.floor((H - k) / k) * k);
    } else if (sel.t === 'arrow') {
      const a = N.arrow, k = a.kind === 'pixel' ? a.k : 1;
      for (const h of part ? [part] : arrowPts(a)) a[h] = [clamp(snap(from.arrow[h][0] + dx, k), 0, W), clamp(snap(from.arrow[h][1] + dy, k), 0, H)];
    } else if (sel.t === 'seam' && N.seam) {
      const s = N.seam, r = v => clamp(Math.round(v), 24, W - 24);
      if (part !== 'x1') s.x0 = r(from.seam.x0 + dx);
      if (part !== 'x0') s.x1 = r(from.seam.x1 + dx);
      if (s.mode === 'vertical') s.x1 = s.x0;
      N.images.forEach((_, i) => fit(N, i));
    } else if (sel.t === 'seam' && N.inset) {
      const ii = N.images.findIndex(i => i.role === 'inset'), im = N.images[ii], k = im.free ? 1 : im.k, s = from.inset, d = 2 * s.b;
      const mx = clamp(snap(dx, k), Math.ceil((d - s.x) / k) * k, Math.floor((W - d - s.w - s.x) / k) * k);
      const my = clamp(snap(dy, k), Math.ceil((d - s.y) / k) * k, Math.floor((H - d - s.h - s.y) / k) * k);
      N.inset.x = s.x + mx; N.inset.y = s.y + my;
      const f = from.images[ii];
      im.x = f.x + mx; im.y = f.y + my;
      if (im.rot) { im.px = f.px + mx; im.py = f.py + my; }
    }
    return N;
  }

  const handles = a => a.kind === 'brush' ? ['from', 'via', 'to'] : ['from', 'to'];
  function onArrow(a, x, y) {
    if (a.kind === 'pixel') return T.inside(T.pixelPoly(a.from.map(v => v / a.k), a.to.map(v => v / a.k), a.s || 1), x / a.k, y / a.k) || nearSeg(a.from, a.to, x, y, 12);
    return T.inside(T.arrowShape(a.kind, a.from, a.to, a.via, a.s || 1), x, y);
  }
  function nearSeg(a, b, x, y, r) {
    const dx = b[0] - a[0], dy = b[1] - a[1], t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(a[0] + t * dx - x, a[1] + t * dy - y) <= r;
  }
  const alpha = new WeakMap();
  function onText(i, x, y) {
    const g = geo.texts[i], c = th.querySelectorAll('canvas.txt')[i];
    if (!g || !c) return false;
    [x, y] = rotP([x, y], [g.px, g.py], -(g.rot || 0));
    if (!inR(g, x, y)) return false;
    if (!alpha.has(c)) alpha.set(c, c.getContext('2d').getImageData(0, 0, c.width, c.height).data);
    const a = alpha.get(c), k = L.texts[i].k, sx = Math.floor((x - g.x) / k), sy = Math.floor((y - g.y) / k), r = Math.max(1, Math.ceil(6 / k));
    for (let yy = sy - r; yy <= sy + r; yy++) for (let xx = sx - r; xx <= sx + r; xx++) if (xx >= 0 && yy >= 0 && xx < c.width && yy < c.height && a[(yy * c.width + xx) * 4 + 3]) return true;
    return false;
  }
  function inClip(i, x, y) {
    const r = T.clipOf(L, L.images[i]);
    return inR(r, x, y) && (!r.poly || T.inside(r.poly, x - r.x, y - r.y));
  }
  function rotHandle() {
    const r = rotOf();
    if (r == null) return null;
    let P, len;
    if (sel.t === 'image') { const im = L.images[sel.i]; P = im.rot ? [im.px, im.py] : clipCentre(L, im); len = Math.min(140, T.clipOf(L, im).h / 2 - 24); }
    else if (sel.t === 'text') { const g = geo.texts[sel.i]; if (!g) return null; P = [g.px, g.py]; len = Math.max(g.w, g.h) / 2 + 26; }
    else { const a = L.arrow; P = arrowCentre(a); len = Math.max(...handles(a).map(h => Math.hypot(a[h][0] - P[0], a[h][1] - P[1]))) * .6 + 40; }
    let Hd = rotP([P[0], P[1] - len], P, r);
    if (Hd[0] < 12 || Hd[1] < 12 || Hd[0] > W - 12 || Hd[1] > H - 12) Hd = rotP(Hd, P, 180);
    if (Hd[0] < 12 || Hd[1] < 12 || Hd[0] > W - 12 || Hd[1] > H - 12) Hd = [clamp(Hd[0], 12, W - 12), clamp(Hd[1], 12, H - 12)];
    return { P, Hd, rot: r };
  }
  function pick(x, y) {
    const a = L.arrow, rh = rotHandle();
    if (rh && Math.hypot(x - rh.Hd[0], y - rh.Hd[1]) <= 13) return { s: sel, part: 'rot', rh };
    if (sel?.t === 'arrow' && a.kind !== 'none') for (const h of handles(a)) if (Math.hypot(x - a[h][0], y - a[h][1]) <= 12) return { s: { t: 'arrow' }, part: h };
    if (sel?.t === 'seam' && L.seam?.mode === 'diagonal') {
      if (Math.hypot(x - L.seam.x0, y - 14) <= 12) return { s: { t: 'seam' }, part: 'x0' };
      if (Math.hypot(x - L.seam.x1, y - (H - 14)) <= 12) return { s: { t: 'seam' }, part: 'x1' };
    }
    for (let i = geo.texts.length - 1; i >= 0; i--) if (onText(i, x, y)) return { s: { t: 'text', i } };
    if (a.kind !== 'none' && onArrow(a, x, y)) return { s: { t: 'arrow' } };
    if (L.seam && Math.abs(x - T.seamAt(L.seam, y)) <= L.seam.w / 2 + 4) return { s: { t: 'seam' } };
    if (L.inset) { const s = L.inset, d = 2 * s.b; if (inR({ x: s.x - d, y: s.y - d, w: s.w + 2 * d, h: s.h + 2 * d }, x, y) && !inR(s, x, y)) return { s: { t: 'seam' } }; }
    for (let i = L.images.length - 1; i >= 0; i--) if (inClip(i, x, y)) return { s: { t: 'image', i } };
    return null;
  }

  function hud() {
    const out = [];
    const poly = pts => { const s = pts.map(p => p.join(',')).join(' '); return `<polygon points="${s}" fill="none" stroke="#000" stroke-width="3"/><polygon points="${s}" fill="none" stroke="var(--m-hot)" stroke-width="1.5" stroke-dasharray="6 4"/>`; };
    const box = r => poly([[r.x + .5, r.y + .5], [r.x + r.w - .5, r.y + .5], [r.x + r.w - .5, r.y + r.h - .5], [r.x + .5, r.y + r.h - .5]]);
    const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="7" fill="var(--m-hot)" stroke="#000" stroke-width="2"/>`;
    const line = (a, b) => `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#000" stroke-width="3"/><line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="var(--m-hot)" stroke-width="1.5" stroke-dasharray="6 4"/>`;
    if (sel?.t === 'image') {
      const r = T.clipOf(L, L.images[sel.i]);
      out.push(r.poly ? poly(r.poly.map(([px, py]) => [px + r.x, py + r.y])) : box(r));
    } else if (sel?.t === 'text' && geo.texts[sel.i]) {
      const g = geo.texts[sel.i];
      out.push(poly([[g.x, g.y], [g.x + g.w, g.y], [g.x + g.w, g.y + g.h], [g.x, g.y + g.h]].map(p => rotP(p, [g.px, g.py], g.rot || 0))));
    } else if (sel?.t === 'seam' && L.seam) {
      const s = L.seam;
      if (s.mode === 'vertical') out.push(box({ x: s.x0 - s.w / 2 - 3, y: 0, w: s.w + 6, h: H }));
      else out.push(line([s.x0, 0], [s.x1, H]), dot(s.x0, 14), dot(s.x1, H - 14));
    } else if (sel?.t === 'seam' && L.inset) { const s = L.inset, d = 2 * s.b; out.push(box({ x: s.x - d, y: s.y - d, w: s.w + 2 * d, h: s.h + 2 * d })); }
    else if (sel?.t === 'arrow' && L.arrow.kind !== 'none') {
      const a = L.arrow;
      if (a.kind === 'brush') out.push(line(a.from, a.via), line(a.via, a.to));
      out.push(...handles(a).map(h => dot(...a[h])));
    }
    const rh = rotHandle();
    if (rh) {
      const [hx, hy] = rh.Hd, [px, py] = rh.P;
      out.push(line(rh.P, rh.Hd), `<path d="M${px - 6} ${py}H${px + 6}M${px} ${py - 6}V${py + 6}" stroke="#000" stroke-width="4"/><path d="M${px - 6} ${py}H${px + 6}M${px} ${py - 6}V${py + 6}" stroke="var(--m-hot)" stroke-width="2"/>`,
        `<g class="rot"><circle cx="${hx}" cy="${hy}" r="11" fill="var(--m-bg)" stroke="var(--m-hot)" stroke-width="2.5"/><path d="M${hx + 5} ${hy - 2}A5.5 5.5 0 1 1 ${hx + 1} ${hy - 5.5}" fill="none" stroke="var(--m-ink)" stroke-width="1.8"/><path d="M${hx + 1} ${hy - 9}L${hx + 4.5} ${hy - 5.5}L${hx} ${hy - 3}" fill="none" stroke="var(--m-ink)" stroke-width="1.8"/></g>`);
    }
    hd.innerHTML = out.join('');
  }

  const pos = e => { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  stage.addEventListener('pointerdown', e => {
    if (e.button !== 0 || $('#ink')) return;
    const [x, y] = pos(e), hit = pick(x, y);
    if (!hit) { sel = null; panel(); hud(); return; }
    sel = hit.s; panel(); hud();
    e.preventDefault();
    stage.setPointerCapture(e.pointerId);
    drag = { x, y, part: hit.part, rh: hit.rh, rot0: rotOf(), from: T.clone(L), g0: T.clone(geo.texts), moved: false };
  });
  stage.addEventListener('pointermove', e => {
    const [x, y] = pos(e);
    if (!drag) { const rh = rotHandle(); stage.classList.toggle('turn', !!rh && Math.hypot(x - rh.Hd[0], y - rh.Hd[1]) <= 13); return; }
    const dx = Math.round(x - drag.x), dy = Math.round(y - drag.y);
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 2) return;
    drag.moved = true; stage.classList.add('grab');
    if (drag.part === 'rot') {
      const P = drag.rh.P, a0 = Math.atan2(drag.y - P[1], drag.x - P[0]), a1 = Math.atan2(y - P[1], x - P[0]);
      let d = drag.rot0 + deg(a1 - a0);
      const near = Math.round(d / 90) * 90;
      if (!e.shiftKey && Math.abs(d - near) < 5) d = near;
      else if (!e.shiftKey) d = Math.round(d);
      const N = T.clone(drag.from); setRot(N, sel, d); L = N;
      const f = $('#rdeg'); if (f) f.value = rotOf();
    } else L = move(drag.from, drag.g0, dx, dy, drag.part);
    draw();
  });
  const drop = () => {
    if (!drag) return;
    stage.classList.remove('grab');
    const d = drag; drag = null;
    if (d.moved && S(L) !== S(d.from)) { hist.push(S(d.from)); fut.length = 0; persist(); }
    panel(); preview();
  };
  stage.addEventListener('pointerup', drop);
  stage.addEventListener('pointercancel', drop);
  stage.addEventListener('dblclick', e => {
    const [x, y] = pos(e), hit = pick(x, y);
    if (hit?.s.t === 'text' && hit.part !== 'rot') inline(hit.s.i);
  });
  stage.addEventListener('wheel', e => {
    if ($('#ink')) return;
    const [x, y] = pos(e);
    let s = sel;
    const hit = pick(x, y);
    if (hit && ['image', 'text', 'arrow'].includes(hit.s.t) && !(hit.s.t === 'arrow' && L.arrow.kind === 'none')) s = hit.s;
    if (!zspec(s)) return;
    e.preventDefault();
    if (!same(s, sel)) { endLive(); sel = s; }
    startLive();
    zoomStep(L, s, e.deltaY < 0 ? 1 : -1, s.t === 'image' ? [x, y] : null);
    draw(); panel();
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(endLive, 400);
  }, { passive: false });

  function inline(i) {
    const t = L.texts[i], g = geo.texts[i], k = t.k, before = S(L);
    sel = { t: 'text', i }; panel(); hud();
    const ta = el('textarea', { id: 'ink', spellcheck: false, value: t.lines.map(l => l.map(s => s[0]).join('')).join('\n') });
    Object.assign(ta.style, { left: g.x + 'px', top: clamp(g.y, 0, H - 40) + 'px', width: Math.max(g.w, 240) + 'px', height: Math.max(g.h, (t.lh || t.size) * k * (t.lines.length + 1)) + 'px', font: `${t.size * k}px ${t.font}`, lineHeight: (t.lh || t.size) * k + 'px', padding: 2 * k + 'px', color: t.lines[0][0][1] });
    let done = false;
    const finish = keep => {
      if (done) return; done = true; ta.remove();
      if (!keep) return;
      const N = JSON.parse(before), n = N.texts[i], old = n.lines;
      const rows = ta.value.replace(/\n+$/, '').split('\n');
      n.lines = rows.map((s, li) => old[li] && old[li].map(p => p[0]).join('') === s ? old[li] : [[s, (old[li] || old[old.length - 1])[0][1]]]);
      if (S(N) !== before) commit(N, JSON.parse(before));
    };
    ta.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape') finish(false);
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) finish(true);
    });
    ta.addEventListener('blur', () => finish(true));
    stage.append(ta); ta.focus(); ta.select();
  }

  addEventListener('keydown', e => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
    const mod = e.ctrlKey || e.metaKey, k = e.key;
    if (mod && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && k.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    else if (mod) return;
    else if (k === '+' || k === '=') edit(N => zoomStep(N, sel, 1));
    else if (k === '-' || k === '_') edit(N => zoomStep(N, sel, -1));
    else if ((k === '[' || k === ']') && rotOf() != null) edit(N => setRot(N, sel, rotOf() + (k === ']' ? 90 : -90)));
    else if (k === 'Escape') { sel = null; panel(); hud(); }
    else if (k === 'Enter' && sel?.t === 'text') { e.preventDefault(); inline(sel.i); }
    else if (sel && k.startsWith('Arrow') && e.target.type !== 'range') {
      e.preventDefault();
      const s = step() * (e.shiftKey ? 8 : 1), d = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[k];
      const N = move(L, geo.texts, d[0], d[1]);
      if (S(N) !== S(L)) commit(N);
    }
  });

  $('#undo').onclick = undo;
  $('#redo').onclick = redo;
  $('#reset').onclick = () => { if (S(L) !== S(base)) commit(T.clone(base)); };
  $('#png').onclick = async () => {
    const cv = await T.composite(th);
    cv.toBlob(b => { const a = el('a', { href: URL.createObjectURL(b), download: `thumb-${v}.png` }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); });
  };
  $('#save').onclick = async () => {
    status('Saving…');
    const body = `layout ${v}\n\`\`\`json\n${JSON.stringify(L, null, 1)}\n\`\`\``;
    try {
      const threads = (await (await fetch(API, { cache: 'no-store' })).json()).threads || [];
      const open = threads.find(t => t.status === 'open' && t.messages[0]?.body.startsWith(`layout ${v}\n`));
      const r = stage.getBoundingClientRect();
      const anchor = { selector: '#stage', tag: 'div', text: `thumbnail ${v}`, fx: .5, fy: .5, point: { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }, scroll: { x: Math.round(scrollX), y: Math.round(scrollY) }, viewport: { w: innerWidth, h: innerHeight } };
      const res = open
        ? await fetch(`${API}/${open.id}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: S({ body }) })
        : await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: S({ body, url: location.pathname + '?v=' + v, anchor }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.status);
      const id = open ? open.id : (await res.json()).id;
      status(`Saved · ${id}`);
    } catch (err) { status('Save failed: ' + err.message); }
  };

  await draw();
  panel();
})();
