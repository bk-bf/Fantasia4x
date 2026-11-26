'use strict';
(() => {
  const W = 1280, H = 720;
  const FONT_PIXEL = { Jersey20: 34, Blackletter: 43 };
  const SRC = ['src/old-glyph.png', 'src/new-day.png', 'src/new-dusk.png', 'src/new-night.png', 'src/new-summer.png', 'src/magic-night.png', 'src/magic.png', 'src/forest.png', 'src/trees.png', 'src/ground-autumn.png'];
  const NS = 'http://www.w3.org/2000/svg';
  const P = s => s.split(',').map(Number);
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const num = v => parseFloat(v) || 0;
  const loaded = new Map();
  const image = src => {
    if (!loaded.has(src)) loaded.set(src, new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('cannot load ' + src)); i.src = src; }));
    return loaded.get(src);
  };
  const clone = o => JSON.parse(JSON.stringify(o));

  async function parse(sec) {
    const clips = [...sec.querySelectorAll('.clip')], seams = sec.querySelectorAll('.seam');
    const mode = clips.length === 2 && seams.length === 2 ? 'inset' : clips.length === 2 ? 'split' : 'full';
    const roles = { inset: ['full', 'inset'], split: ['left', 'right'], full: ['full'] }[mode];
    const L = { v: sec.id, mode, images: [], texts: [] };
    for (const [i, c] of clips.entries()) {
      const im = c.querySelector('img'), src = im.getAttribute('src'), nat = await image(src);
      L.images.push({ role: roles[i], src, k: num(im.style.width) / nat.naturalWidth, x: num(c.style.left) + num(im.style.left), y: num(c.style.top) + num(im.style.top) });
      if (roles[i] === 'inset') L.inset = { x: num(c.style.left), y: num(c.style.top), w: num(c.style.width), h: num(c.style.height), b: 8, color: '#ffc468', shadow: seams[0].style.background ? rgbHex(seams[0].style.background) : '#140c06' };
    }
    if (mode === 'split') L.seam = { mode: 'vertical', x0: 640, x1: 640, w: 8, color: '#ffc468' };
    const arrow = { kind: 'none', from: [400, 560], via: [620, 330], to: [960, 330], k: 8, fill: '#ffc468', line: '#140c06', outline: true };
    const sv = sec.querySelector('svg.arrow'), pa = sec.querySelector('canvas.parrow');
    if (sv) Object.assign(arrow, { kind: sv.dataset.kind, from: P(sv.dataset.from), to: P(sv.dataset.to), fill: sv.dataset.kind === 'block' ? '#ffffff' : '#ffc468' }, sv.dataset.via ? { via: P(sv.dataset.via) } : { via: mid(P(sv.dataset.from), P(sv.dataset.to)) });
    if (pa) { const k = +pa.dataset.k, f = P(pa.dataset.from).map(v => v * k), t = P(pa.dataset.to).map(v => v * k); Object.assign(arrow, { kind: 'pixel', k, from: f, to: t, via: mid(f, t) }); }
    L.arrow = arrow;
    for (const c of sec.querySelectorAll('canvas.txt')) {
      const d = c.dataset, t = { font: d.font, size: +d.size, k: +d.k, lh: +(d.lh || d.size), lines: JSON.parse(d.lines), outline: true };
      for (const a of ['x', 'y', 'right', 'bottom']) if (d[a] !== undefined) t[a] = +d[a];
      L.texts.push(t);
    }
    return L;
  }
  const mid = (a, b) => [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2 - 120)];
  const rgbHex = s => { const m = s.match(/\d+/g); return m ? '#' + m.slice(0, 3).map(v => (+v).toString(16).padStart(2, '0')).join('') : s; };

  function seamAt(s, y) { return s.x0 + (s.x1 - s.x0) * y / H; }
  function clipOf(L, im) {
    if (im.role === 'full') return { x: 0, y: 0, w: W, h: H };
    if (im.role === 'inset') return { x: L.inset.x, y: L.inset.y, w: L.inset.w, h: L.inset.h };
    const s = L.seam;
    if (s.mode === 'vertical') return im.role === 'left' ? { x: 0, y: 0, w: s.x0, h: H } : { x: s.x0, y: 0, w: W - s.x0, h: H };
    const lo = Math.max(0, Math.floor(Math.min(s.x0, s.x1) - s.w)), hi = Math.min(W, Math.ceil(Math.max(s.x0, s.x1) + s.w));
    if (im.role === 'left') return { x: 0, y: 0, w: hi, h: H, poly: [[0, 0], [s.x0, 0], [s.x1, H], [0, H]] };
    return { x: lo, y: 0, w: W - lo, h: H, poly: [[s.x0 - lo, 0], [W - lo, 0], [W - lo, H], [s.x1 - lo, H]] };
  }

  function arrowShape(kind, a, b, via) {
    if (kind === 'block') {
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux, hl = 110, sw = 24, hw = 70, bx = b[0] - ux * hl, by = b[1] - uy * hl;
      return [[a[0] + nx * sw * .3, a[1] + ny * sw * .3], [bx + nx * sw, by + ny * sw], [bx + nx * hw, by + ny * hw], b, [bx - nx * hw, by - ny * hw], [bx - nx * sw, by - ny * sw], [a[0] - nx * sw * .3, a[1] - ny * sw * .3]];
    }
    const q = t => [(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * via[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * via[1] + t * t * b[1]];
    const te = .76, N = 40, Lt = [], R = [];
    for (let i = 0; i <= N; i++) {
      const t = te * i / N, p = q(t), p2 = q(t + .001), dx = p2[0] - p[0], dy = p2[1] - p[1], d = Math.hypot(dx, dy) || 1, w = 3 + 21 * Math.pow(i / N, .7);
      Lt.push([p[0] - dy / d * w, p[1] + dx / d * w]); R.push([p[0] + dy / d * w, p[1] - dx / d * w]);
    }
    const B = q(te), dx = b[0] - B[0], dy = b[1] - B[1], d = Math.hypot(dx, dy) || 1, hw = 58;
    return [...Lt, [B[0] - dy / d * hw, B[1] + dx / d * hw], b, [B[0] + dy / d * hw, B[1] - dx / d * hw], ...R.reverse()];
  }
  function pixelPoly(a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux, hl = 12, sw = 2.6, hw = 8, bx = b[0] - ux * hl, by = b[1] - uy * hl;
    return [[a[0] + nx * .6, a[1] + ny * .6], [bx + nx * sw, by + ny * sw], [bx + nx * hw, by + ny * hw], b, [bx - nx * hw, by - ny * hw], [bx - nx * sw, by - ny * sw], [a[0] - nx * .6, a[1] - ny * .6]];
  }
  const inside = (poly, x, y) => { let r = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) r = !r; } return r; };
  const hi = fill => fill.toLowerCase() === '#ffc468' ? [255, 232, 176] : hex(fill).map(v => Math.round(v + (255 - v) * .5));

  function pixelArrow(ar) {
    const k = ar.k, w = W / k, h = H / k, a = ar.from.map(v => v / k), b = ar.to.map(v => v / k), poly = pixelPoly(a, b);
    const ink = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inside(poly, x + .5, y + .5)) ink[y * w + x] = 1;
    const at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && ink[y * w + x];
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), img = g.createImageData(w, h), F = hex(ar.fill), HI = hi(ar.fill), O = hex(ar.line);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let rgb = null;
      if (at(x, y)) rgb = at(x - 1, y - 1) ? F : HI;
      else if (ar.outline && [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [1, -1], [-1, 1]].some(([ox, oy]) => at(x + ox, y + oy))) rgb = O;
      else if (ar.outline && (at(x - 2, y - 2) || at(x - 1, y - 2) || at(x - 2, y - 1))) rgb = O;
      if (rgb) img.data.set([...rgb, 255], (y * w + x) * 4);
    }
    g.putImageData(img, 0, 0);
    c.className = 'ov parrow';
    Object.assign(c.style, { left: '0px', top: '0px', width: W + 'px', height: H + 'px' });
    return c;
  }

  function vectorArrow(ar) {
    const pts = arrowShape(ar.kind, ar.from, ar.to, ar.via), path = 'M' + pts.map(p => p.map(v => v.toFixed(1)).join(' ')).join('L') + 'Z';
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('class', 'arrow'); s.dataset.kind = ar.kind;
    s.setAttribute('width', W); s.setAttribute('height', H); s.setAttribute('viewBox', `0 0 ${W} ${H}`);
    Object.assign(s.style, { position: 'absolute', left: 0, top: 0 });
    s.innerHTML = ar.outline
      ? `<path d="${path}" transform="translate(10 12)" fill="${ar.line}" stroke="${ar.line}" stroke-width="16" stroke-linejoin="round" opacity=".6"/><path d="${path}" fill="${ar.fill}" stroke="${ar.line}" stroke-width="14" stroke-linejoin="round" paint-order="stroke"/>`
      : `<path d="${path}" fill="${ar.fill}"/>`;
    return s;
  }

  function diagonalSeam(s) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), img = g.createImageData(W, H), rgb = [...hex(s.color), 255], half = s.w / 2 * Math.hypot(1, (s.x1 - s.x0) / H);
    for (let y = 0; y < H; y++) {
      const cx = seamAt(s, y + .5), x0 = Math.max(0, Math.round(cx - half)), x1 = Math.min(W, Math.round(cx + half));
      for (let x = x0; x < x1; x++) img.data.set(rgb, (y * W + x) * 4);
    }
    g.putImageData(img, 0, 0);
    c.className = 'ov dseam';
    Object.assign(c.style, { left: '0px', top: '0px', width: W + 'px', height: H + 'px' });
    return c;
  }

  async function textCanvas(t) {
    const size = t.size, lh = t.lh || size, lines = t.lines;
    await document.fonts.load(`${size}px ${t.font}`);
    const m = document.createElement('canvas').getContext('2d');
    m.font = `${size}px ${t.font}`;
    const widths = lines.map(l => l.reduce((w, [s]) => w + Math.ceil(m.measureText(s).width), 0));
    const pad = 2, cw = Math.max(0, ...widths) + pad * 2 + 1, ch = lines.length * lh + Math.ceil(size * .4) + pad * 2 + 1;
    const ink = new Int32Array(cw * ch).fill(-1), cols = [];
    lines.forEach((l, li) => {
      let x = pad;
      for (const [s, col] of l) {
        const sc = document.createElement('canvas'); sc.width = cw; sc.height = ch;
        const g = sc.getContext('2d'); g.font = `${size}px ${t.font}`; g.textBaseline = 'top'; g.fillStyle = '#fff';
        g.fillText(s, x, pad + li * lh);
        const a = g.getImageData(0, 0, cw, ch).data, ci = cols.push(hex(col)) - 1;
        for (let i = 0; i < cw * ch; i++) if (a[i * 4 + 3] >= 128) ink[i] = ci;
        x += Math.ceil(m.measureText(s).width);
      }
    });
    const edge = new Uint8Array(cw * ch), shade = new Uint8Array(cw * ch);
    if (t.outline !== false) {
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        if (ink[y * cw + x] >= 0) continue;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const nx = x - dx, ny = y - dy;
          if (nx >= 0 && ny >= 0 && nx < cw && ny < ch && ink[ny * cw + nx] >= 0) { edge[y * cw + x] = 1; break; }
        }
      }
      for (let y = 1; y < ch; y++) for (let x = 1; x < cw; x++) if (ink[y * cw + x] < 0 && !edge[y * cw + x] && (edge[(y - 1) * cw + x - 1] || ink[(y - 1) * cw + x - 1] >= 0)) shade[y * cw + x] = 1;
    }
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const g = c.getContext('2d'), img = g.createImageData(cw, ch);
    for (let i = 0; i < cw * ch; i++) {
      const rgb = ink[i] >= 0 ? cols[ink[i]] : edge[i] || shade[i] ? [0, 0, 0] : null;
      if (rgb) img.data.set([...rgb, 255], i * 4);
    }
    g.putImageData(img, 0, 0);
    c.className = 'ov txt';
    Object.assign(c.dataset, { font: t.font, size: String(t.size), k: String(t.k), lines: JSON.stringify(t.lines) });
    return c;
  }
  function textPlace(t, c) {
    const k = t.k, w = c.width * k, h = c.height * k;
    let left = t.right != null ? W - t.right - w : t.x, top = t.bottom != null ? H - t.bottom - h : t.y;
    left -= left % k; top -= top % k;
    return { x: left, y: top, w, h };
  }

  async function render(L, th) {
    const cache = th._cache || (th._cache = new Map()), tok = th._tok = (th._tok || 0) + 1;
    const keep = (key, sig, make) => { const hit = cache.get(key); if (hit && hit.sig === sig) return hit.el; const v = make(); cache.set(key, { sig, el: v }); return v; };
    const keepAsync = async (key, sig, make) => { const hit = cache.get(key); if (hit && hit.sig === sig) return hit.el; const v = await make(); cache.set(key, { sig, el: v }); return v; };
    const nodes = [], geo = { clips: [], texts: [] };
    const nats = await Promise.all(L.images.map(im => image(im.src)));
    for (const [i, im] of L.images.entries()) {
      const r = clipOf(L, im), nat = nats[i];
      if (im.role === 'inset') {
        const s = L.inset, b = s.b;
        for (const [d, col] of [[2 * b, s.shadow], [b, s.color]]) {
          const f = document.createElement('div'); f.className = 'seam';
          Object.assign(f.style, { left: s.x - d + 'px', top: s.y - d + 'px', width: s.w + 2 * d + 'px', height: s.h + 2 * d + 'px', background: col });
          nodes.push(f);
        }
      }
      const clip = document.createElement('div'); clip.className = 'clip';
      Object.assign(clip.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
      if (r.poly) { clip.dataset.poly = JSON.stringify(r.poly); clip.style.clipPath = `polygon(${r.poly.map(p => p.map(v => v + 'px').join(' ')).join(',')})`; }
      const el = keep('img' + i, im.src, () => { const e = document.createElement('img'); e.className = 'art'; e.alt = ''; e.setAttribute('src', im.src); return e; });
      Object.assign(el.style, { left: im.x - r.x + 'px', top: im.y - r.y + 'px', width: nat.naturalWidth * im.k + 'px', height: nat.naturalHeight * im.k + 'px' });
      clip.append(el); nodes.push(clip);
      geo.clips.push(r);
    }
    if (L.seam) {
      const s = L.seam;
      if (s.mode === 'vertical') {
        const d = document.createElement('div'); d.className = 'seam';
        Object.assign(d.style, { left: s.x0 - s.w / 2 + 'px', width: s.w + 'px', background: s.color });
        nodes.push(d);
      } else nodes.push(keep('seam', JSON.stringify(s), () => diagonalSeam(s)));
    }
    for (const [i, t] of L.texts.entries()) {
      const c = await keepAsync('txt' + i, JSON.stringify([t.font, t.size, t.lh, t.lines, t.outline, t.k]), () => textCanvas(t));
      const p = textPlace(t, c);
      Object.assign(c.style, { left: p.x + 'px', top: p.y + 'px', width: p.w + 'px', height: p.h + 'px' });
      nodes.push(c); geo.texts.push(p);
    }
    const ar = L.arrow;
    if (ar && ar.kind === 'pixel') nodes.push(keep('arrow', JSON.stringify(ar), () => pixelArrow(ar)));
    else if (ar && ar.kind !== 'none') nodes.push(vectorArrow(ar));
    if (tok !== th._tok) return null;
    th.replaceChildren(...nodes);
    return geo;
  }

  async function composite(th) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false; g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    for (const el of th.children) {
      const s = el.style;
      if (el.classList.contains('clip')) {
        const x = num(s.left), y = num(s.top), im = el.querySelector('img'), is = im.style;
        g.save(); g.beginPath(); g.rect(x, y, num(s.width), num(s.height)); g.clip();
        if (el.dataset.poly) { g.beginPath(); JSON.parse(el.dataset.poly).forEach(([px, py], j) => j ? g.lineTo(x + px, y + py) : g.moveTo(x + px, y + py)); g.closePath(); g.clip(); }
        await im.decode().catch(() => {});
        g.drawImage(im, x + num(is.left), y + num(is.top), num(is.width), num(is.height));
        g.restore();
      } else if (el.classList.contains('seam')) {
        const cs = getComputedStyle(el);
        g.fillStyle = cs.backgroundColor; g.fillRect(num(cs.left), num(cs.top), num(cs.width), num(cs.height));
      } else if (el.tagName === 'CANVAS') {
        g.drawImage(el, num(s.left), num(s.top), num(s.width), num(s.height));
      } else if (el.tagName.toLowerCase() === 'svg') {
        const im = new Image(); im.src = 'data:image/svg+xml;base64,' + btoa(new XMLSerializer().serializeToString(el)); await im.decode();
        g.drawImage(im, 0, 0);
      }
    }
    return cv;
  }

  window.Thumb = { W, H, FONT_PIXEL, SRC, parse, render, composite, clipOf, seamAt, arrowShape, pixelPoly, inside, image, clone, textPlace };
})();
