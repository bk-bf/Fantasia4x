'use strict';
(() => {
  const TAU = Math.PI * 2;
  const TILE_ART = 32;
  const MAP_W = 40;
  const MAP_H = 26;
  const ART_PER_UNIT = 2;
  const FIELD = 2048;
  const NOISE_PERIOD = 1024;
  const GRAVITY = 9.8;
  const PACE = 0.55;
  const SHORE_RATE = 1.3;
  const RUN_LAG = 1.4;
  const LAMBDA = [30, 19, 12, 8];
  const ANGLE = [-0.45, -0.12, 0.22, 0.55];
  const ROUGH_TURN = 1.25;
  const CHOPPY_TURN = 2;
  const DRIFT = { calm: 2, gale: 12 };
  const RIPPLE_RATE = 0.26 * 8;
  const RIPPLE = { drift: 0.9, period: 553 };
  const GLINT = { drift: 0.7, period: 2253 };
  const RIPPLE_PX = (RIPPLE_RATE * RIPPLE.drift * FIELD) / RIPPLE.period;
  const GLINT_PX = (RIPPLE_RATE * GLINT.drift * FIELD) / GLINT.period;
  const SEICHE_SECS = 14;
  const VEER_SECS = 45;
  const VEER_REACH = 0.9;
  const SWELL_TURN = 1.9;

  const VARIANTS = [
    { id: 0, key: 'today', name: 'Today', line: 'The branch as it stands: the ripple and glint bands slide along one fixed axis whatever the wind does.' },
    { id: 1, key: 'downwind', name: 'Downwind', line: 'The ripple and glint bands travel with the wind heading, faster as it freshens, and turn when it veers.' },
    { id: 2, key: 'ebb', name: 'Ebb and flow', line: 'A slow downwind set, a lake-wide sway back and forth, and near each shore the water draws in and out in step with the swash.' },
    { id: 3, key: 'gusts', name: 'Gusts', line: 'Cat’s-paws: ruffled patches run downwind over calmer, glassier water; ripples and whitecaps only where a gust is passing.' },
    { id: 4, key: 'swell', name: 'Crossing swell', line: 'A long swell from another quarter crosses the wind chop, so no single direction reads; the bands follow the wind.' },
    { id: 5, key: 'all', name: 'Downwind, gusts, ebb', line: 'Downwind bands, passing gusts, and the shore draw together.' }
  ];

  const WIND_WORDS = [['still air', 0.03], ['light air', 0.15], ['slightly windy', 0.25], ['fairly windy', 0.4], ['extremely windy', 0.9], ['very windy', 0.7], ['windy', 0.5], ['gale', 1]];
  const TOWARD = { n: 's', ne: 'sw', e: 'w', se: 'nw', s: 'n', sw: 'ne', w: 'e', nw: 'se' };
  const WEATHER = HUD.ambient.WEATHER;

  function weatherSea(id) {
    const w = WEATHER[id] ?? WEATHER.clear;
    const text = w.wind.toLowerCase();
    const word = WIND_WORDS.find(([k]) => text.startsWith(k));
    const ws = w.ws ?? (word ? word[1] : 0.25);
    const from = (text.match(/\b(n|ne|e|se|s|sw|w|nw)$/) || [])[1];
    const gusty = Math.min(1, 0.25 + ws * 0.6 + (w.rain ?? 0) * 0.3);
    return { ws, toward: from ? TOWARD[from] : 'e', gusty, rain: w.rain ?? 0 };
  }

  const HEADINGS = { n: -90, ne: -45, e: 0, se: 45, s: 90, sw: 135, w: 180, nw: -135 };

  const smoothstep = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  const wrap = (v, p) => ((v % p) + p) % p;

  function seaFor(wind) {
    const u = smoothstep(0.1, 1, wind);
    const swell = lerp(1, 1.45, u);
    return {
      amp: [lerp(0.55, 0.9, u), lerp(0.28, 1.15, u), lerp(0.12, 1, u), lerp(0.05, 0.75, u)].map((v) => v * swell),
      a: [lerp(1.3, 2.6, u), lerp(1, 0.25, u), lerp(1, 1.6, u), lerp(0.12, 0.9, u)],
      b: [lerp(0.33, 0.6, u), lerp(0.45, 0.35, u)],
      speed: lerp(1, 1.6, u)
    };
  }

  function turn(dir, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [dir.x * c - dir.y * s, dir.x * s + dir.y * c];
  }

  function hash(x, y, s) {
    let n = (Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1274126177)) >>> 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  function noise(x, y, s) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    let fx = x - ix;
    let fy = y - iy;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const top = lerp(hash(ix, iy, s), hash(ix + 1, iy, s), fx);
    const bottom = lerp(hash(ix, iy + 1, s), hash(ix + 1, iy + 1, s), fx);
    return lerp(top, bottom, fy);
  }

  function lakeClasses() {
    const classes = new Uint8Array(MAP_W * MAP_H);
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        const nx = (x + 0.5) / MAP_W - 0.5;
        const ny = (y + 0.5) / MAP_H - 0.5;
        const bowl = Math.hypot(nx * 1.15, ny * 1.45);
        const island = Math.exp(-((nx + 0.12) ** 2 + (ny + 0.02) ** 2) / 0.006) * 0.42;
        const bay = Math.exp(-((nx - 0.36) ** 2 / 0.01 + (ny - 0.3) ** 2 / 0.03)) * -0.3;
        const rough = (noise(x * 0.22, y * 0.22, 5) - 0.5) * 0.22 + (noise(x * 0.55, y * 0.55, 6) - 0.5) * 0.1;
        const e = bowl + island + bay + rough;
        classes[y * MAP_W + x] = e < 0.26 ? 2 : e < 0.38 ? 1 : 0;
      }
    return classes;
  }

  function distanceTo(isSeed, w, h) {
    const d = new Float32Array(w * h).fill(Infinity);
    for (let i = 0; i < w * h; i++) if (isSeed(i)) d[i] = 0;
    const relax = (i, x, y, cost) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const via = d[y * w + x] + cost;
      if (via < d[i]) d[i] = via;
    };
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        relax(i, x - 1, y, 1);
        relax(i, x - 1, y - 1, Math.SQRT2);
        relax(i, x, y - 1, 1);
        relax(i, x + 1, y - 1, Math.SQRT2);
      }
    for (let y = h - 1; y >= 0; y--)
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        relax(i, x + 1, y, 1);
        relax(i, x + 1, y + 1, Math.SQRT2);
        relax(i, x, y + 1, 1);
        relax(i, x - 1, y + 1, Math.SQRT2);
      }
    return d;
  }

  function shoreField(classes, w, h) {
    const ramp = (t) => Math.min(1, Math.max(0, (t - 1) / 3));
    const toLand = distanceTo((i) => classes[i] === 0, w, h);
    const toShallow = distanceTo((i) => classes[i] !== 2, w, h);
    const water = new Uint8Array(w * h);
    const raw = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      if (classes[i] === 0) continue;
      water[i] = 1;
      raw[i] = classes[i] === 2 ? 0.74 + 0.26 * ramp(toShallow[i]) : 0.36 * ramp(toLand[i]);
    }
    const pass = (src, weight, horizontal) => {
      const sum = new Float32Array(w * h);
      const count = new Float32Array(w * h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          let s = 0;
          let n = 0;
          for (let k = -2; k <= 2; k++) {
            const xx = horizontal ? x + k : x;
            const yy = horizontal ? y : y + k;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            const j = yy * w + xx;
            s += src[j] * weight[j];
            n += weight[j];
          }
          sum[y * w + x] = n > 0 ? s / n : 0;
          count[y * w + x] = n;
        }
      return { sum, count };
    };
    const across = pass(raw, Float32Array.from(water), true);
    const depth = pass(across.sum, across.count, false).sum;
    const tide = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      tide[i * 4] = classes[i] === 2 ? 255 : 0;
      tide[i * 4 + 1] = classes[i] === 0 ? 255 : 0;
      tide[i * 4 + 2] = Math.min(255, Math.round(toLand[i] * 32));
      tide[i * 4 + 3] = water[i] ? Math.round(Math.min(1, depth[i]) * 255) : 0;
    }
    return tide;
  }

  function waterBlockShift(artPerPx) {
    return Math.max(0, Math.ceil(Math.log2(Math.max(1, artPerPx)) - 1e-6));
  }

  class Clock {
    constructor() {
      this.waveT = 0;
      this.t = 0;
      this.drift = { x: 0, y: 0 };
      this.ripple = { x: 0, y: 0 };
      this.glint = { x: 0, y: 0 };
      this.slow = { r: { x: 0, y: 0 }, g: { x: 0, y: 0 } };
      this.gust = 0;
    }

    tick(secs, wind, dir) {
      this.waveT += secs * seaFor(wind).speed;
      this.t += secs;
      const pace = lerp(DRIFT.calm, DRIFT.gale, Math.min(1, Math.max(0, wind)));
      this.drift.x += dir.x * pace * secs;
      this.drift.y += dir.y * pace * secs;
      const fresh = 0.4 + 1.2 * wind;
      const step = (acc, speed) => {
        acc.x = wrap(acc.x + dir.x * speed * secs, FIELD);
        acc.y = wrap(acc.y + dir.y * speed * secs, FIELD);
      };
      step(this.ripple, RIPPLE_PX * fresh);
      step(this.glint, GLINT_PX * (0.5 + wind));
      step(this.slow.r, RIPPLE_PX * fresh * 0.35);
      step(this.slow.g, GLINT_PX * (0.5 + wind) * 0.35);
      this.gust += secs * (5 + 14 * wind);
    }

    sea(wind, dir, artPerPx) {
      const sea = seaFor(wind);
      const perPx = artPerPx / ART_PER_UNIT;
      const fade = LAMBDA.map((l) => smoothstep(3, 7, l / perPx));
      const phase = LAMBDA.map((l) => wrap(this.waveT * Math.sqrt((GRAVITY * TAU) / l) * PACE, TAU));
      const rough = ANGLE.flatMap((a) => turn(dir, a * ROUGH_TURN));
      const choppy = ANGLE.flatMap((a) => turn(dir, a * CHOPPY_TURN));
      const shore = wrap(this.waveT * SHORE_RATE, TAU);
      const surge = 0.5 + 0.5 * Math.sin(shore + RUN_LAG);
      const n = (v) => wrap(v, NOISE_PERIOD);
      const { x: dx, y: dy } = this.drift;
      const ampSum = sea.amp.reduce((s, v) => s + v, 0);
      const chop = 0.6 * (sea.amp[2] + sea.amp[3]) * smoothstep(3, 7, 3.3 / perPx);
      const t = this.t;
      return Float32Array.from([
        ...phase,
        ...sea.amp.map((v, i) => v * fade[i]),
        ...rough,
        ...choppy,
        sea.a[0], Math.min(1, Math.max(0, (sea.a[1] - 0.25) / 0.75)), sea.a[2], sea.a[3],
        sea.b[0], sea.b[1], chop, ampSum,
        n(dx * 0.05), n(dy * 0.05), n(dx * 0.4), n(dy * 0.4),
        n(t * 0.6), n(-t * 0.35), n(t * 0.5), n(t * 0.35),
        shore, 1.2 + 2.6 * sea.a[2] * 0.8 * surge, n(dx * 0.7), n(dy * 0.7),
        dir.x, dir.y, n(t * 0.3), ART_PER_UNIT,
        surge, 0, 0, 1
      ]);
    }

    body(variant, dir) {
      const today = [0, wrap(-this.t * RIPPLE_PX, FIELD), 0, wrap(this.t * GLINT_PX, FIELD)];
      const down = [this.ripple.x, this.ripple.y, this.glint.x, this.glint.y];
      const sway = Math.sin((TAU * this.t) / SEICHE_SECS);
      const swayed = (a, k) => [a.x + dir.x * sway * k, a.y + dir.y * sway * k];
      const ebbGrain = [...swayed(this.slow.r, 10), ...swayed(this.slow.g, 4)];
      const lean = [dir.x * sway * 1.6, dir.y * sway * 1.6];
      switch (variant) {
        case 1: return { grain: down, body: [0, 0, 0, 0] };
        case 2: return { grain: ebbGrain, body: [...lean, 0, 0] };
        case 3: return { grain: down, body: [0, 0, this.gust, 0] };
        case 4: return { grain: down, body: [0, 0, 0, SWELL_TURN] };
        case 5: return { grain: down.map((v, i) => v + ebbGrain[i] - [this.slow.r.x, this.slow.r.y, this.slow.g.x, this.slow.g.y][i]), body: [...lean, this.gust, 0] };
        default: return { grain: today, body: [0, 0, 0, 0] };
      }
    }
  }

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function setup(field) {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 is not available in this browser');
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, window.WATER_VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, window.WATER_FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = {};
    for (const name of ['u_kinds', 'u_mapSize', 'u_tileArt', 'u_origin', 'u_viewH', 'u_tide', 'u_waterField', 'u_waterBlock', 'u_sea[0]', 'u_variant', 'u_grain', 'u_body', 'u_weather'])
      u[name] = gl.getUniformLocation(prog, name);

    const classes = lakeClasses();
    const kinds = Uint8Array.from(classes, (c) => c + 1);
    const tide = shoreField(classes, MAP_W, MAP_H);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const tex = (unit, filter) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    tex(0, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, MAP_W, MAP_H, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, kinds);
    tex(1, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, MAP_W, MAP_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, tide);
    tex(2, gl.NEAREST);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, field);
    gl.uniform1i(u.u_kinds, 0);
    gl.uniform1i(u.u_tide, 1);
    gl.uniform1i(u.u_waterField, 2);
    gl.uniform2i(u.u_mapSize, MAP_W, MAP_H);
    gl.uniform1f(u.u_tileArt, TILE_ART);
    return { gl, canvas, u };
  }

  const weathers = document.getElementById('weathers');
  for (const [id, w] of Object.entries(WEATHER)) {
    const b = document.createElement('button');
    b.dataset.v = id;
    b.textContent = id.endsWith('_windy') ? `${w.label} (${w.season})` : w.label;
    weathers.append(b);
  }
  const ui = F4X.bar((st, k) => {
    if (k === 'weather') {
      const sea = weatherSea(st.weather);
      windIn.value = String(sea.ws);
      showWind();
      F4X.write({ wind: undefined });
      ui.set('dir', sea.toward);
      return;
    }
    layout();
  });
  const state = ui.state;
  const q = new URLSearchParams(location.search);
  const windIn = document.getElementById('wind');
  const windOut = document.getElementById('windout');
  windIn.value = q.get('wind') ?? String(weatherSea(state.weather).ws);
  const showWind = () => { windOut.textContent = Math.round(windIn.value * 100) + '%'; };
  windIn.addEventListener('input', () => { showWind(); F4X.write({ wind: windIn.value }, { wind: String(weatherSea(state.weather).ws) }); });
  showWind();

  const stage = document.getElementById('stage');
  const note = document.getElementById('vnote');
  let views = [];
  let gpu = null;

  function layout() {
    stage.replaceChildren();
    const scale = Number(state.zoom) / TILE_ART;
    const one = state.view === 'one';
    stage.classList.toggle('one', one);
    const chosen = VARIANTS.find((v) => v.key === state.v) ?? VARIANTS[0];
    note.textContent = one ? chosen.line : 'Tap a view to open it alone.';
    const list = one ? [chosen] : VARIANTS;
    const width = stage.clientWidth - 32;
    const cols = one ? 1 : width >= 1100 ? 3 : width >= 640 ? 2 : 1;
    const cellCss = (width - (cols - 1) * 10) / cols;
    const mapW = MAP_W * TILE_ART;
    const mapH = MAP_H * TILE_ART;
    const artW = one ? mapW : Math.min(mapW, Math.floor(cellCss / scale));
    const artH = one ? mapH : Math.min(mapH, Math.round(artW * 0.62));
    const ox = Math.max(0, Math.min(mapW - artW, Math.round(mapW * 0.44 - artW / 2)));
    const oy = Math.max(0, Math.min(mapH - artH, Math.round(mapH * 0.4 - artH / 2)));
    views = list.map((v) => {
      const fig = document.createElement('figure');
      const c = document.createElement('canvas');
      c.width = artW;
      c.height = artH;
      c.style.width = artW * scale + 'px';
      c.style.height = artH * scale + 'px';
      const cap = document.createElement('figcaption');
      cap.textContent = v.name;
      fig.append(c, cap);
      if (!one) {
        fig.title = v.line;
        fig.addEventListener('click', () => { ui.set('v', v.key); ui.set('view', 'one'); });
      }
      stage.append(fig);
      return { v, ctx: c.getContext('2d'), w: artW, h: artH, ox, oy };
    });
  }

  const clock = new Clock();
  let last = null;

  function windHeading() {
    const base = (HEADINGS[state.dir] * Math.PI) / 180;
    const reach = VEER_REACH * (0.4 + 0.6 * weatherSea(state.weather).gusty);
    const a = state.veer === '1' ? base + reach * Math.sin((TAU * clock.t) / VEER_SECS) : base;
    return { x: Math.cos(a), y: Math.sin(a) };
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!gpu || document.hidden) { last = null; return; }
    const secs = last === null ? 0 : Math.min(0.25, (now - last) / 1000) * Number(state.speed);
    last = now;
    const wind = Number(windIn.value);
    const dir = windHeading();
    clock.tick(secs, wind, dir);
    const { gl, canvas, u } = gpu;
    const artPerPx = TILE_ART / (Number(state.zoom) * devicePixelRatio);
    gl.uniform4fv(u['u_sea[0]'], clock.sea(wind, dir, artPerPx));
    gl.uniform1i(u.u_waterBlock, waterBlockShift(artPerPx));
    const sky = weatherSea(state.weather);
    gl.uniform4f(u.u_weather, sky.gusty, sky.rain, clock.t % 1000, 0);
    for (const view of views) {
      if (canvas.width !== view.w || canvas.height !== view.h) {
        canvas.width = view.w;
        canvas.height = view.h;
      }
      gl.viewport(0, 0, view.w, view.h);
      const { grain, body } = clock.body(view.v.id, dir);
      gl.uniform1i(u.u_variant, view.v.id);
      gl.uniform4fv(u.u_grain, grain);
      gl.uniform4fv(u.u_body, body);
      gl.uniform2f(u.u_origin, view.ox, view.oy);
      gl.uniform1f(u.u_viewH, view.h);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      view.ctx.drawImage(canvas, 0, 0);
    }
  }

  const img = new Image();
  img.onload = () => {
    try {
      gpu = setup(img);
    } catch (err) {
      note.textContent = String(err.message || err);
    }
  };
  img.src = 'water-field.png';
  addEventListener('resize', layout);
  if (!q.has('dir')) ui.set('dir', weatherSea(state.weather).toward);
  layout();
  requestAnimationFrame(frame);
})();
