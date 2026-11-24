'use strict';
(() => {
  const MAP = FLOWMAP;
  const { distanceTo, smoothstep, lerp, clamp } = MAP.util;
  const TAU = Math.PI * 2;
  const TILE_ART = 32;
  const MAP_W = MAP.W;
  const MAP_H = MAP.H;
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
  const RIVER_CLOCK_WRAP = 3600;
  const FIT_TILES = [128, 64, 32, 16, 8, 4];
  const FLOW_PACE = 46;
  const PUSH = 0.8;
  const CYCLE_WRAP = 2.4 * 400;

  const WIND_WORDS = [['still air', 0.03], ['light air', 0.15], ['slightly windy', 0.25], ['fairly windy', 0.4], ['extremely windy', 0.9], ['very windy', 0.7], ['windy', 0.5], ['gale', 1]];
  const TOWARD = { n: 's', ne: 'sw', e: 'w', se: 'nw', s: 'n', sw: 'ne', w: 'e', nw: 'se' };
  const WEATHER = HUD.ambient.WEATHER;
  const ICE_FREEZE_PER_HOUR = 3;
  const ICE_MELT_PER_HOUR = 4;
  const ICE_FULL_FREEZE_AT = 8;
  const HOURS_PER_SEC = 1;

  function weatherSea(id) {
    const w = WEATHER[id] ?? WEATHER.clear;
    const text = w.wind.toLowerCase();
    const word = WIND_WORDS.find(([k]) => text.startsWith(k));
    const ws = w.ws ?? (word ? word[1] : 0.25);
    const from = (text.match(/\b(n|ne|e|se|s|sw|w|nw)$/) || [])[1];
    const gusty = Math.min(1, 0.25 + ws * 0.6 + (w.rain ?? 0) * 0.3);
    return { ws, toward: from ? TOWARD[from] : 'e', gusty, rain: w.rain ?? 0, temp: w.temp ?? 8 };
  }

  const HEADINGS = { n: -90, ne: -45, e: 0, se: 45, s: 90, sw: 135, w: 180, nw: -135 };
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
      this.flow = 0;
      this.drift = { x: 0, y: 0 };
      this.ripple = { x: 0, y: 0 };
      this.glint = { x: 0, y: 0 };
      this.gust = 0;
    }

    tick(secs, wind, dir, current, push) {
      this.waveT += secs * seaFor(wind).speed;
      this.t += secs;
      this.flow = wrap(this.flow + secs * current * push, RIVER_CLOCK_WRAP);
      const pace = lerp(DRIFT.calm, DRIFT.gale, Math.min(1, Math.max(0, wind)));
      this.drift.x += dir.x * pace * secs;
      this.drift.y += dir.y * pace * secs;
      const fresh = 0.4 + 1.2 * wind;
      const step = (acc, speed) => {
        acc.x = wrap(acc.x - dir.x * speed * secs, FIELD);
        acc.y = wrap(acc.y - dir.y * speed * secs, FIELD);
      };
      step(this.ripple, RIPPLE_PX * fresh);
      step(this.glint, GLINT_PX * (0.5 + wind));
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

    zoom(artPerPx) {
      const perPx = artPerPx / ART_PER_UNIT;
      return { fade: LAMBDA.map((l) => smoothstep(3, 7, l / perPx)), chop: smoothstep(3, 7, 3.3 / perPx) };
    }

    body(dir) {
      const sway = Math.sin((TAU * this.t) / SEICHE_SECS);
      return {
        grain: [this.ripple.x + dir.x * sway * 10, this.ripple.y + dir.y * sway * 10, this.glint.x + dir.x * sway * 4, this.glint.y + dir.y * sway * 4],
        body: [dir.x * sway * 1.6, dir.y * sway * 1.6, this.gust, 0]
      };
    }
  }

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function setup(canvas, field) {
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
    for (const name of ['u_kinds', 'u_mapSize', 'u_tileArt', 'u_origin', 'u_viewH', 'u_tide', 'u_waterField', 'u_waterBlock', 'u_sea[0]', 'u_grain', 'u_body', 'u_weather', 'u_ice', 'u_flow', 'u_river', 'u_step', 'u_stream', 'u_air', 'u_fade'])
      u[name] = gl.getUniformLocation(prog, name);

    const kinds = Uint8Array.from(MAP.classes, (c) => c + 1);
    const tide = shoreField(MAP.classes, MAP_W, MAP_H);
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
    tex(3, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, MAP.flow.w, MAP.flow.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, MAP.flow.texture);
    tex(4, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, MAP.flow.w, MAP.flow.h, 0, gl.RGBA, gl.FLOAT, MAP.flow.stream.texture);
    tex(2, gl.NEAREST);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, field);
    gl.uniform1i(u.u_kinds, 0);
    gl.uniform1i(u.u_tide, 1);
    gl.uniform1i(u.u_waterField, 2);
    gl.uniform1i(u.u_flow, 3);
    gl.uniform1i(u.u_stream, 4);
    gl.uniform2i(u.u_mapSize, MAP_W, MAP_H);
    gl.uniform1f(u.u_tileArt, TILE_ART);
    return { gl, u };
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
      showIce();
      F4X.write({ wind: undefined });
      ui.set('dir', sea.toward);
      return;
    }
    if (k === 'at' && st.at !== 'free') {
      F4X.write({ cx: undefined, cy: undefined });
      if (st.zoom === 'fit') { ui.set('zoom', '32'); return; }
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

  const pushIn = document.getElementById('push');
  const pushOut = document.getElementById('pushout');
  pushIn.value = q.get('push') ?? String(PUSH);
  const showPush = () => { pushOut.textContent = Math.round(pushIn.value * 100) + '%'; };
  pushIn.addEventListener('input', () => { showPush(); F4X.write({ push: pushIn.value }, { push: String(PUSH) }); });
  showPush();

  const iceIn = document.getElementById('ice');
  const iceOut = document.getElementById('iceout');
  const showIce = () => { iceOut.textContent = `${Math.round(iceIn.value)} · ${weatherSea(state.weather).temp}°`; };
  iceIn.value = q.get('ice') ?? '0';
  iceIn.addEventListener('input', showIce);
  showIce();

  function freeze(secs) {
    const temp = weatherSea(state.weather).temp;
    const hours = secs * HOURS_PER_SEC;
    let ice = Number(iceIn.value);
    if (temp < 0) ice = Math.min(100, ice + ICE_FREEZE_PER_HOUR * Math.min(1, Math.max(0.15, -temp / ICE_FULL_FREEZE_AT)) * hours);
    else ice = Math.max(0, ice - ICE_MELT_PER_HOUR * hours);
    if (ice !== Number(iceIn.value)) {
      iceIn.value = String(ice);
      showIce();
    }
    return ice / 100;
  }

  const stage = document.getElementById('stage');
  const frameBox = document.getElementById('frame');
  const waterCanvas = document.getElementById('water');
  const arrowCanvas = document.getElementById('arrows');
  const fail = document.getElementById('fail');
  const camera = { x: Number(q.get('cx')) || MAP_W / 2, y: Number(q.get('cy')) || MAP_H / 2 };
  let view = null;
  let gpu = null;

  function tileCss() {
    if (state.zoom !== 'fit') return Number(state.zoom);
    const fits = FIT_TILES.find((t) => MAP_W * t <= innerWidth * devicePixelRatio && MAP_H * t <= innerHeight * devicePixelRatio);
    return (fits ?? FIT_TILES[FIT_TILES.length - 1]) / devicePixelRatio;
  }

  function layout() {
    const tile = tileCss();
    const cssPerArt = tile / TILE_ART;
    const shift = waterBlockShift(1 / (cssPerArt * devicePixelRatio));
    const step = 1 << shift;
    const whole = state.zoom === 'fit';
    const snap = (v) => Math.floor(v / step) * step;
    const artW = Math.min(MAP_W * TILE_ART, snap(Math.ceil(innerWidth / cssPerArt)));
    const artH = Math.min(MAP_H * TILE_ART, snap(Math.ceil(innerHeight / cssPerArt)));
    if (!whole && state.at !== 'free') [camera.x, camera.y] = MAP.look[state.at];
    const centre = whole ? { x: MAP_W / 2, y: MAP_H / 2 } : camera;
    const ox = snap(clamp(centre.x * TILE_ART - artW / 2, 0, MAP_W * TILE_ART - artW));
    const oy = snap(clamp(centre.y * TILE_ART - artH / 2, 0, MAP_H * TILE_ART - artH));
    view = { ox, oy, artW, artH, step, shift, cssPerArt, artPerPx: 1 / (cssPerArt * devicePixelRatio) };
    waterCanvas.width = artW / step;
    waterCanvas.height = artH / step;
    frameBox.style.width = artW * cssPerArt + 'px';
    frameBox.style.height = artH * cssPerArt + 'px';
    stage.classList.toggle('whole', whole);
    drawArrows();
  }

  function arrow(ctx, x, y, dx, dy, len, width, colour) {
    const ex = x + dx * len;
    const ey = y + dy * len;
    const head = Math.min(len * 0.5, width * 3.2);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(ex, ey);
    ctx.moveTo(ex - (dx * 0.8 - dy * 0.6) * head, ey - (dy * 0.8 + dx * 0.6) * head);
    ctx.lineTo(ex, ey);
    ctx.lineTo(ex - (dx * 0.8 + dy * 0.6) * head, ey - (dy * 0.8 - dx * 0.6) * head);
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgb(12 10 8 / .75)';
    ctx.lineWidth = width + 2;
    ctx.stroke();
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function drawArrows() {
    const dpr = devicePixelRatio;
    const cssW = view.artW * view.cssPerArt;
    const cssH = view.artH * view.cssPerArt;
    arrowCanvas.width = Math.round(cssW * dpr);
    arrowCanvas.height = Math.round(cssH * dpr);
    const ctx = arrowCanvas.getContext('2d');
    ctx.clearRect(0, 0, arrowCanvas.width, arrowCanvas.height);
    if (state.arrows === 'off') return;
    const tilePx = TILE_ART * view.cssPerArt * dpr;
    const toPx = (tx, ty) => [(tx * TILE_ART - view.ox) * view.cssPerArt * dpr, (ty * TILE_ART - view.oy) * view.cssPerArt * dpr];
    const width = Math.max(1, Math.round(dpr));
    if (state.arrows === 'tiles') {
      for (let i = 0; i < MAP_W * MAP_H; i++) {
        if (MAP.dir8[i] < 0) continue;
        const [x, y] = toPx((i % MAP_W) + 0.5, Math.floor(i / MAP_W) + 0.5);
        if (x < -tilePx || y < -tilePx || x > arrowCanvas.width + tilePx || y > arrowCanvas.height + tilePx) continue;
        const dx = (MAP.dir8[i] % 3) - 1;
        const dy = Math.floor(MAP.dir8[i] / 3) - 1;
        const len = Math.hypot(dx, dy);
        const thick = width * (1 + 0.7 * Math.log2(MAP.acc[i] / MAP.CATCHMENT));
        arrow(ctx, x - (dx / len) * tilePx * 0.35, y - (dy / len) * tilePx * 0.35, dx / len, dy / len, tilePx * 0.7, thick, '#ffd27a');
      }
      return;
    }
    const gap = Math.max(tilePx / 2, 14 * dpr);
    const perTile = gap / tilePx;
    const x0 = Math.floor(view.ox / TILE_ART / perTile) * perTile;
    const y0 = Math.floor(view.oy / TILE_ART / perTile) * perTile;
    for (let ty = y0; ty < (view.oy + view.artH) / TILE_ART; ty += perTile)
      for (let tx = x0; tx < (view.ox + view.artW) / TILE_ART; tx += perTile) {
        const px = tx + perTile / 2;
        const py = ty + perTile / 2;
        if (px >= MAP_W || py >= MAP_H || !MAP.classes[Math.floor(py) * MAP_W + Math.floor(px)]) continue;
        const f = MAP.flow.at(px, py);
        const sp = Math.hypot(f.x, f.y);
        if (sp < 0.04 || f.mask < 0.04) continue;
        const [x, y] = toPx(px, py);
        const len = gap * (0.25 + 0.95 * Math.min(1, sp));
        arrow(ctx, x - (f.x / sp) * len * 0.5, y - (f.y / sp) * len * 0.5, f.x / sp, f.y / sp, len, width, `rgb(255 ${Math.round(250 - 150 * Math.min(1, sp))} ${Math.round(210 - 190 * Math.min(1, sp))} / ${0.35 + 0.65 * f.mask})`);
      }
  }

  let held = null;
  stage.addEventListener('pointerdown', (ev) => {
    if (state.zoom === 'fit') return;
    held = { x: ev.clientX, y: ev.clientY, cx: (view.ox + view.artW / 2) / TILE_ART, cy: (view.oy + view.artH / 2) / TILE_ART };
    stage.setPointerCapture(ev.pointerId);
    stage.classList.add('held');
  });
  stage.addEventListener('pointermove', (ev) => {
    if (!held) return;
    const perTile = TILE_ART * view.cssPerArt;
    camera.x = clamp(held.cx - (ev.clientX - held.x) / perTile, 0, MAP_W);
    camera.y = clamp(held.cy - (ev.clientY - held.y) / perTile, 0, MAP_H);
    if (state.at !== 'free') ui.set('at', 'free');
    else layout();
  });
  const release = () => {
    if (!held) return;
    held = null;
    stage.classList.remove('held');
    F4X.write({ cx: camera.x.toFixed(1), cy: camera.y.toFixed(1) });
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  const clock = new Clock();
  let last = null;

  function frame(now) {
    requestAnimationFrame(frame);
    if (!gpu || document.hidden) { last = null; return; }
    const secs = last === null ? 0 : Math.min(0.25, (now - last) / 1000) * Number(state.speed);
    last = now;
    const ice = freeze(secs);
    const calm = 1 - Math.min(1, ice / 0.6) * 0.75;
    const wind = Number(windIn.value) * calm;
    const heading = (HEADINGS[state.dir] * Math.PI) / 180;
    const dir = { x: Math.cos(heading), y: Math.sin(heading) };
    const push = Number(pushIn.value);
    clock.tick(secs, wind, dir, Number(state.current), push);
    const { gl, u } = gpu;
    gl.uniform4fv(u['u_sea[0]'], clock.sea(wind, dir, view.artPerPx));
    gl.uniform1i(u.u_waterBlock, view.shift);
    gl.uniform1f(u.u_step, view.step);
    const sky = weatherSea(state.weather);
    gl.uniform4f(u.u_weather, sky.gusty, sky.temp < 0 ? 0 : sky.rain, clock.t % 1000, 0);
    gl.uniform4f(u.u_ice, ice, 0, 0, 0);
    gl.uniform4f(u.u_river, push, clock.flow * MAP.flow.stream.pace * FLOW_PACE / ART_PER_UNIT, Number(state.current), state.river === 'off' ? 0 : 1);
    const fresh = 0.4 + 1.2 * wind;
    const zoom = clock.zoom(view.artPerPx);
    gl.uniform4f(u.u_air, wind, RIPPLE_PX * fresh, clock.t % CYCLE_WRAP, zoom.chop);
    gl.uniform4fv(u.u_fade, zoom.fade);
    gl.viewport(0, 0, waterCanvas.width, waterCanvas.height);
    const { grain, body } = clock.body(dir);
    gl.uniform4fv(u.u_grain, grain);
    gl.uniform4fv(u.u_body, body);
    gl.uniform2f(u.u_origin, view.ox, view.oy);
    gl.uniform1f(u.u_viewH, waterCanvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  const img = new Image();
  img.onload = () => {
    try {
      gpu = setup(waterCanvas, img);
    } catch (err) {
      fail.textContent = String(err.message || err);
    }
  };
  img.src = 'water-field.png';
  addEventListener('resize', layout);
  if (!q.has('dir')) ui.set('dir', weatherSea(state.weather).toward);
  layout();
  if (q.has('t')) clock.tick(Number(q.get('t')), Number(windIn.value), { x: Math.cos((HEADINGS[state.dir] * Math.PI) / 180), y: Math.sin((HEADINGS[state.dir] * Math.PI) / 180) }, Number(state.current), Number(pushIn.value));
  requestAnimationFrame(frame);
})();
