<!--
  WeatherCanvas — fullscreen rain/snow particle overlay (SEASONS_WEATHER Subsystem 5).

  A 2D-canvas particle system (the standard, glitch-free way to do precipitation): rain = short
  translucent slanted line segments; snow = drifting dots. Driven by the global `currentWeather`
  store; idles (no draws) when it's clear. Self-contained — mounted once inside WorldEffectsLayer.

  Perf: this is the ONLY thing here that runs per animation frame, and only while it's actually
  raining/snowing. One canvas, a few hundred line/arc draws batched into a single path → trivial next
  to the WebGL terrain. It does NOT touch the sim worker or the terrain renderer.
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { currentWeather, gameState } from '$lib/stores/gameState';
  import { cameraTileSize, cameraZoomRange } from '$lib/stores/cameraView';
  import {
    weatherOverlayKind,
    weatherFallSpeed,
    weatherDensity,
    ambientWind,
    weatherParticleColor,
    environmentService,
    getAmbientLight,
    getAmbientTint
  } from '$lib/game/services/EnvironmentService';

  type Mode = 'none' | 'rain' | 'snow' | 'fog' | 'leaves' | 'dust' | 'snowdust' | 'foggy_rain';

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let raf = 0;
  let lastT = 0;
  let fogTime = 0; // seconds accumulator driving the fog's slow gust/shift
  let ro: ResizeObserver | undefined;
  let reduceMotion = false;

  // Live ambient brightness/hue, mirrored from the day/night cycle (honours the debug time-of-day
  // override). The fog overlay multiplies its colour by these so it dims and cools at night instead
  // of washing the dark map white. Updated from the gameState turn below.
  let ambLight = 1;
  let ambTint: [number, number, number] = [1, 1, 1];
  const unsubAmbient = gameState.subscribe((gs) => {
    const turn = environmentService.ambientTurn(gs);
    ambLight = getAmbientLight(turn);
    ambTint = getAmbientTint(turn);
  });

  let mode: Mode = 'none';
  let intensity = 0; // 0–1
  let windStrength = 0.2; // 0–1, type windStrength combined with ambient wind, from weather.jsonc
  let fallSpeed = 680; // px/sec, from weather.jsonc
  let density = 160; // particles per megapixel, from weather.jsonc
  let particleColor: [number, number, number] = [200, 120, 60]; // leaves/dust tint, from weather.jsonc

  // Effective overlay slant (px of horizontal travel per px fallen) and snow/dust sideways drift
  // (px/sec) — both derived from windStrength so a windy day visibly leans the precipitation and a
  // storm drives it near-horizontal. Negative = leftward (matches the seeding in makeParticle).
  const rainSlant = () => -(0.12 + windStrength * 0.8);
  const sideDrift = () => 8 + windStrength * 120;
  const isDots = () => mode === 'snow' || mode === 'dust' || mode === 'snowdust';
  const isRain = () => mode === 'rain' || mode === 'foggy_rain';

  // foggy_rain composites rain drops (in `parts`) with a separate, small pool of slow fog blobs.
  let fogBlobs: Particle[] = [];

  // Zoom-reactive "in the clouds" feel, scaled against the REAL per-map zoom range (not a hardcoded
  // tile span): `zoomMin` is the zoom-out floor (fitTileSize — smaller on bigger maps, ~1px on a 750²
  // map) and `zoomMax` the zoom-in ceiling, both from cameraZoomRange. `zoomInFrac` is therefore 0 at
  // each map's OWN fully-zoomed-out extreme and 1 fully zoomed in — so on M/L maps, which zoom out far
  // past where an S map bottoms out, the weather keeps scaling instead of flat-lining at an old fixed
  // floor. The pool grows/shrinks by the delta (reconcile) so the change is gradual, not a pop.
  let tileSize = 8; // current zoom (px per tile), from the camera store
  let zoomMin = 8; // zoom-out floor (fitTileSize), from cameraZoomRange
  let zoomMax = 40; // zoom-in ceiling (MAX_TILE_W), from cameraZoomRange
  const zoomInFrac = () => {
    const span = Math.max(1, zoomMax - zoomMin);
    return Math.max(0, Math.min(1, (tileSize - zoomMin) / span));
  };

  // Particle SIZE multiplier: rain streaks / snow specks / dust / leaves all shrink as you zoom OUT,
  // so far-out on a big map they read as a fine mist rather than a sparse scatter of screen-huge blobs
  // (a 12px streak was 12 tiles wide at the zoom-out floor). UNCAPPED at the small end against the real
  // range, so the L/750² far-zoom genuinely gets smaller than the S/250² floor ever does.
  const sizeMul = () => 0.3 + zoomInFrac() * 1.0; // ~0.3× fully out → 1.3× fully in

  // Particle COUNT multiplier: DENSER as you zoom out (frac → 0). Crucially this rises in lock-step
  // with the shrink above — smaller particles cost proportionally less fillrate, so packing in more of
  // them keeps the per-frame draw cost bounded while the look gets visibly denser. (See targetCount's
  // fillrate-aware cap, which is what actually guards §R5's perf budget.)
  const densityMul = () => 0.8 + (1 - zoomInFrac()) * 1.6; // 0.8× fully in → 2.4× fully out

  // EXTREME zoom-out gate: below SUBPIXEL_TILE px/tile the whole map is on screen and individual drops
  // are sub-pixel — you read weather as a faint haze, not distinct particles. There, the PER-PARTICLE
  // overhead (the draw-loop iteration + path/arc setup per particle, which does NOT shrink with size)
  // dominates the frame, so 2400 invisible specks just tank FPS for no visual gain (the zoom-out FPS
  // crater). Hard-attenuate the count from 1× at SUBPIXEL_TILE down to a 0.2× floor as tiles vanish.
  const SUBPIXEL_TILE = 4; // px per tile (matches GameCanvas's FREEZE_TILE_PX — the static-view threshold)
  const subpixelAtten = () => Math.max(0.2, Math.min(1, tileSize / SUBPIXEL_TILE));

  // §R5: render the weather into a buffer at this fraction of the (CSS-pixel) canvas size, then let the
  // browser upscale it for display. Weather is soft/blurry, so the resolution drop is invisible — but
  // the per-frame full-screen ops (clear + vignette fill) cost ~RENDER_SCALE² as much fillrate (~64%
  // less at 0.6). Drawing stays in CSS coordinates via a matching ctx transform, so sizes / density /
  // fall speed are all preserved exactly.
  const RENDER_SCALE = 0.6;

  interface Particle {
    x: number;
    y: number;
    len: number; // rain streak length
    spd: number; // px/sec downward
    r: number; // snow flake radius
    ph: number; // snow sway phase
  }
  let parts: Particle[] = [];

  const TWO_PI = Math.PI * 2;

  function resize() {
    if (!canvas || !ctx) return;
    const cw = Math.floor(canvas.clientWidth);
    const ch = Math.floor(canvas.clientHeight);
    if (cw <= 0 || ch <= 0) return;
    // §R5: buffer is RENDER_SCALE × the CSS size; we draw in CSS coords and the matching ctx transform
    // rasterizes into the smaller buffer (the browser upscales it for display).
    const bw = Math.max(1, Math.round(cw * RENDER_SCALE));
    const bh = Math.max(1, Math.round(ch * RENDER_SCALE));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    // Setting canvas.width/height resets the context — (re)apply the draw-in-CSS-coords transform.
    ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
  }

  // CSS-pixel drawing dimensions (the coordinate space all the particle code works in — the ctx
  // transform maps it into the RENDER_SCALE buffer).
  const cssW = () => (canvas ? canvas.width / RENDER_SCALE : 0);
  const cssH = () => (canvas ? canvas.height / RENDER_SCALE : 0);

  /** A big, soft, slow-drifting haze cloud blob (shared by `fog` and the veil under `foggy_rain`).
   *  `spd` is horizontal drift; `r` the base radius; `ph` a bob phase; `len` a radius-breathing phase. */
  function makeFogBlob(w: number, h: number): Particle {
    const dir = Math.random() < 0.5 ? -1 : 1;
    return {
      x: Math.random() * (w + 800) - 400,
      y: Math.random() * h,
      len: Math.random() * TWO_PI,
      spd: (16 + Math.random() * 26) * dir,
      r: 220 + Math.random() * 280,
      ph: Math.random() * TWO_PI
    };
  }

  /** Reseed a particle's fields IN PLACE for the current mode (no allocation — called every frame on
   *  respawn, so it must not churn garbage; see the per-frame-allocation trap in ENGINE-PERFORMANCE). */
  function setParticle(p: Particle, w: number, h: number, atTop: boolean): void {
    if (isRain()) {
      // Drops slant LEFT as they fall, drifting `|slant| × height` px over a full descent. Seed them
      // across a width extended by that slant so they still cover the bottom-right corner — otherwise
      // the coverage is a left-leaning parallelogram with a triangular gap bottom-right.
      p.x = Math.random() * (w + Math.abs(rainSlant()) * h);
      p.y = atTop ? -20 - Math.random() * 40 : Math.random() * h;
      p.len = 9 + Math.random() * 13 + windStrength * 12;
      p.spd = fallSpeed * (0.7 + Math.random() * 0.6); // ±variance around the data fall speed
      p.r = 0;
      p.ph = 0;
      return;
    }
    if (mode === 'leaves') {
      // Tumbling leaves/petals: slow fall, strong sideways wind drift, a rotation/sway phase. Seeded
      // across an extended width (like rain) so the wind-blown corner stays covered.
      p.x = Math.random() * (w + sideDrift() * 2);
      p.y = atTop ? -20 - Math.random() * 40 : Math.random() * h;
      p.len = 2 + Math.random() * 2; // half-length of the leaf (~⅓ smaller, less distracting)
      p.spd = fallSpeed * (0.6 + Math.random() * 0.8);
      p.r = 2 + Math.random() * 2;
      p.ph = Math.random() * TWO_PI;
      return;
    }
    // dots: snow / snowdust / dust — a falling, wind-drifting speck. Dust is finer than snow.
    p.x = Math.random() * (w + sideDrift() * 1.5); // extend for the sideways drift's covered corner
    p.y = atTop ? -10 - Math.random() * 30 : Math.random() * h;
    p.len = 0;
    p.spd = fallSpeed * (0.6 + Math.random() * 0.9);
    // snow/snowdust ~⅓ smaller (less distracting); dust (summer pollen) a touch larger for visibility.
    p.r = mode === 'dust' ? 0.8 + Math.random() * 1.5 : 0.67 + Math.random() * 1.47;
    p.ph = Math.random() * TWO_PI;
  }

  function makeParticle(w: number, h: number, atTop: boolean): Particle {
    if (mode === 'fog') return makeFogBlob(w, h);
    const p: Particle = { x: 0, y: 0, len: 0, spd: 0, r: 0, ph: 0 };
    setParticle(p, w, h, atTop);
    return p;
  }

  /** How many particles we want right now: data `density` (per megapixel) × intensity × zoom-out, capped. */
  function targetCount(): number {
    if (!canvas || mode === 'none') return 0;
    const w = cssW();
    const h = cssH();
    if (w <= 0 || h <= 0) return 0;
    // Fog is a handful of big soft blobs, not a per-pixel particle field (no zoom scaling).
    // More, larger, overlapping blobs read as continuous haze rather than a scatter of distinct discs.
    if (mode === 'fog') return Math.min(40, Math.max(10, Math.round((w * h) / 95_000)));
    const perPx = density / 1_000_000; // density is per-megapixel for readable data values
    // §R5 fillrate-aware cap: the per-frame draw cost is roughly count × particle-size, so as the
    // particles shrink (sizeMul → 0.3 zoomed out) we can afford proportionally MORE of them for the
    // same budget. Dividing the old flat 1600 cap by sizeMul lets the count climb to ~2400 at the
    // far-zoom on big maps (denser) while keeping total fillrate bounded BELOW the old worst case
    // (each particle is ~0.3× the size). Clamped so it never explodes if sizeMul gets tiny.
    const cap = Math.min(2400, Math.round(1600 / Math.max(0.45, sizeMul())));
    const want = Math.min(cap, Math.floor(w * h * perPx * (0.5 + intensity) * densityMul()));
    // Sub-pixel zoom-out: cut the count hard (per-particle overhead, not fillrate, is the cost there).
    return Math.round(want * subpixelAtten());
  }

  /** Grow/shrink the pool toward the target — adds/removes only the delta, so zoom/intensity/resize
   *  changes are gradual (no full-respawn pop). Existing drops keep falling. */
  function reconcile() {
    if (!canvas) return;
    const target = targetCount();
    if (target < parts.length) {
      parts.length = target;
      return;
    }
    const w = cssW();
    const h = cssH();
    while (parts.length < target) parts.push(makeParticle(w, h, false));
  }

  /** Full rebuild — only on a mode switch (rain↔snow), where the particle kind changes. */
  function spawn() {
    parts = [];
    reconcile();
  }

  function clear() {
    if (ctx && canvas) ctx.clearRect(0, 0, cssW(), cssH());
  }

  function frame(t: number) {
    raf = requestAnimationFrame(frame);
    if (!ctx || mode === 'none') return;
    const _wxGap = lastT ? t - lastT : 0; // DEBUG: raw inter-frame gap (the weather-stutter metric)
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0.016;
    lastT = t;
    const _wxT0 = import.meta.env.DEV ? performance.now() : 0; // DEBUG: draw-time start
    const w = cssW();
    const h = cssH();
    ctx.clearRect(0, 0, w, h);

    if (isRain()) {
      // foggy_rain lays a soft fog veil BEHIND the rain first, then the drops fall over it.
      if (mode === 'foggy_rain') {
        ensureFogBlobs();
        renderFog(w, h, fogBlobs, dt, 0.85);
      }
      const wind = rainSlant(); // horizontal slant (px per px fallen), wind-driven
      const s = sizeMul(); // zoom-driven streak length (shorter zoomed out → finer rain)
      ctx.strokeStyle = `rgba(180, 205, 235, ${0.25 + 0.35 * intensity})`;
      ctx.lineWidth = 1.1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const p of parts) {
        const len = p.len * s;
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + wind * len, p.y + len);
        p.y += p.spd * dt;
        p.x += wind * p.spd * dt;
        if (p.y > h) setParticle(p, w, h, true); // recycle in place — no per-frame allocation
      }
      ctx.stroke();
    } else if (isDots()) {
      // snow / snowdust / dust — falling specks with wind-driven sideways drift + a gentle sway.
      // snowdust (blowing snow) and dust drift hard sideways; plain snow only when it's windy.
      const drift = sideDrift() * (mode === 'snowdust' ? 1.4 : 1);
      // Dust is coloured debris (dim it by ambient so it doesn't glow at night); snow stays white.
      const [cr, cg, cb] =
        mode === 'dust'
          ? particleColor.map((c, i) => Math.round(c * ambLight * ambTint[i]))
          : [255, 255, 255];
      const baseA = mode === 'dust' ? 0.3 + 0.28 * intensity : 0.5 + 0.4 * intensity;
      const s = sizeMul(); // zoom-driven speck radius (smaller zoomed out → finer flurry)
      ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${baseA})`;
      ctx.beginPath();
      for (const p of parts) {
        p.ph += dt;
        p.y += p.spd * dt;
        p.x += drift * dt;
        const dx = Math.sin(p.ph * 1.6) * 6; // gentle sway
        const drawX = p.x + dx;
        const r = p.r * s;
        ctx.moveTo(drawX + r, p.y);
        ctx.arc(drawX, p.y, r, 0, TWO_PI);
        if (p.y > h + 6) {
          p.y = -6;
          p.x = Math.random() * w;
        }
        if (p.x > w + 12) p.x = -12;
        else if (p.x < -12) p.x = w + 12;
      }
      ctx.fill();
    } else if (mode === 'leaves') {
      // Tumbling leaves/petals in the type's particleColor (green spring, red/orange autumn). Each
      // drifts hard sideways on the wind, bobs, and rotates — drawn as a small rotated ellipse.
      // - sizeMul() shrinks them as you zoom out (dense fine flurry, not big blobs).
      // - colour is multiplied by ambient day/night light so they sit UNDER the brightness and don't
      //   glow at night (foliage goes dark like the scene).
      // - `swirl` (windStrength × intensity) drives gusts: an extreme dry gale whips them sideways
      //   and tosses them up/down, so strong wind reads as chaotic swirl rather than a steady fall.
      const drift = sideDrift();
      const scale = sizeMul(); // shrink leaves as you zoom out (dense fine flurry, not big blobs)
      const swirl = windStrength * Math.max(0.3, intensity);
      const cr = Math.round(particleColor[0] * ambLight * ambTint[0]);
      const cg = Math.round(particleColor[1] * ambLight * ambTint[1]);
      const cb = Math.round(particleColor[2] * ambLight * ambTint[2]);
      // Colour/alpha are constant for the whole frame — build the fillStyle string ONCE here, not once
      // per leaf inside the loop (that churned hundreds of identical strings per frame → GC stutter).
      ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.55 + 0.35 * intensity})`;
      for (const p of parts) {
        p.ph += dt * (1.8 + swirl * 2.6); // faster tumble in high wind
        p.y += p.spd * dt + Math.sin(p.ph * 1.3) * swirl * 55 * dt; // updraughts/downdraughts
        p.x += (drift + Math.sin(p.ph) * (24 + swirl * 90)) * dt; // gusty sideways flutter
        const sway = Math.sin(p.ph * 0.8) * (8 + swirl * 22);
        const drawX = p.x + sway;
        const wobble = 0.45 + 0.55 * Math.abs(Math.cos(p.ph)); // tumble → width pinches as it spins
        const rad = p.len * scale;
        ctx.save();
        ctx.translate(drawX, p.y);
        ctx.rotate(p.ph);
        ctx.beginPath();
        ctx.ellipse(0, 0, rad, rad * wobble, 0, 0, TWO_PI);
        ctx.fill();
        ctx.restore();
        if (p.y > h + 8) setParticle(p, w, h, true); // recycle in place — no per-frame allocation
        if (p.x > w + 16) p.x = -16;
        else if (p.x < -16) p.x = w + 16;
      }
    } else if (mode === 'fog') {
      renderFog(w, h, parts, dt, 1);
    }
    // DEBUG: weather frame profiler — logs hiccup gaps + a ~2s summary so the weather stutter can be
    // correlated with the GameCanvas [MENU-PERF] terrain numbers. Dev only; remove when solved.
    if (import.meta.env.DEV) wxProfile(_wxGap, performance.now() - _wxT0);
  }

  // ── DEBUG weather profiler (see frame) ──────────────────────────────────────────────────────────
  let _wxN = 0;
  let _wxDrawSum = 0;
  let _wxDrawMax = 0;
  let _wxGapMax = 0;
  let _wxHiccups = 0;
  let _wxWinStart = 0;
  function wxProfile(gap: number, drawMs: number) {
    _wxN++;
    _wxDrawSum += drawMs;
    if (drawMs > _wxDrawMax) _wxDrawMax = drawMs;
    if (gap > _wxGapMax) _wxGapMax = gap;
    if (gap > 33) {
      _wxHiccups++;
      console.warn(
        `[WX-PERF] HICCUP gap=${gap.toFixed(1)}ms draw=${drawMs.toFixed(2)}ms mode=${mode} parts=${parts.length}`
      );
    }
    const now = performance.now();
    if (!_wxWinStart) _wxWinStart = now;
    if (now - _wxWinStart >= 2000) {
      console.info(
        `[WX-PERF] ${_wxN}f mode=${mode} parts=${parts.length} | ` +
          `draw avg=${(_wxDrawSum / _wxN).toFixed(2)} max=${_wxDrawMax.toFixed(2)}ms | ` +
          `gapMax=${_wxGapMax.toFixed(1)}ms hiccups=${_wxHiccups}`
      );
      _wxWinStart = now;
      _wxN = 0;
      _wxDrawSum = 0;
      _wxDrawMax = 0;
      _wxGapMax = 0;
      _wxHiccups = 0;
    }
  }

  /**
   * Draw the rolling-haze layer (a faint flat veil + many big, soft, OVERLAPPING radial blobs).
   * Shared by `fog` (blobs = `parts`) and the veil under `foggy_rain` (blobs = `fogBlobs`, lighter
   * via `alphaScale`). Two slow sines (bank-wide gust + per-blob phase) plus a radius "breathing"
   * keep it morphing so it reads as drifting haze, not a ring of discs. Colour is the midway blend
   * between pale daytime haze and the ambient-dimmed colour, so night fog stays visible but muted.
   */
  function renderFog(w: number, h: number, blobs: Particle[], dt: number, alphaScale: number) {
    if (!ctx) return;
    fogTime += dt;
    const gust = Math.sin(fogTime * 0.5) * 55;
    const gust2 = Math.cos(fogTime * 0.31) * 30;
    const gustDrift = Math.cos(fogTime * 0.27) * 10;
    const fb = Math.max(0.18, ambLight);
    const mid = (base: number, i: number) => Math.round((base + base * ambTint[i] * fb) / 2);
    const rgb = `${mid(220, 0)}, ${mid(223, 1)}, ${mid(229, 2)}`;
    ctx.fillStyle = `rgba(${rgb}, ${(0.04 + 0.05 * intensity) * alphaScale})`;
    ctx.fillRect(0, 0, w, h);
    const blobAlpha = (0.028 + 0.045 * intensity) * alphaScale;
    for (const p of blobs) {
      p.x += (p.spd + gustDrift) * dt;
      p.ph += dt * 0.45;
      p.len += dt * 0.6;
      const rad = p.r * (1 + Math.sin(p.len) * 0.2);
      const cx = p.x + gust + Math.sin(fogTime * 0.37 + p.ph) * 32;
      const cy = p.y + Math.sin(p.ph) * 34 + Math.cos(p.ph * 0.6 + gust2 * 0.01) * 18;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, `rgba(${rgb}, ${blobAlpha})`);
      g.addColorStop(0.4, `rgba(${rgb}, ${blobAlpha * 0.5})`);
      g.addColorStop(0.75, `rgba(${rgb}, ${blobAlpha * 0.13})`);
      g.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, TWO_PI);
      ctx.fill();
      if (p.spd > 0 && p.x - rad > w) p.x = -rad;
      else if (p.spd < 0 && p.x + rad < 0) p.x = w + rad;
    }
  }

  /** Keep the foggy_rain veil's blob pool at a screen-sized count (independent of zoom, like fog). */
  function ensureFogBlobs() {
    if (!canvas) return;
    const target = Math.min(18, Math.max(4, Math.round((cssW() * cssH()) / 220_000)));
    if (fogBlobs.length === target) return;
    if (fogBlobs.length > target) {
      fogBlobs.length = target;
      return;
    }
    while (fogBlobs.length < target) fogBlobs.push(makeFogBlob(cssW(), cssH()));
  }

  const unsub = currentWeather.subscribe((wx) => {
    // Data-driven: the overlay kind and all visual params come from weather.jsonc, so a new weather
    // type renders the right overlay with no code change here. The slant strength is the type's
    // inherent windStrength combined with the live ambient `wind` (so plain rain on a windy day leans).
    const next: Mode = weatherOverlayKind(wx?.type);
    intensity = Math.max(0.2, Math.min(1, wx?.intensity ?? 0));
    windStrength = ambientWind(wx ?? undefined);
    fallSpeed = weatherFallSpeed(wx?.type);
    density = weatherDensity(wx?.type);
    particleColor = weatherParticleColor(wx?.type) ?? particleColor;
    const changed = next !== mode;
    mode = next;
    if (mode !== 'foggy_rain') fogBlobs = []; // free the veil pool when not in foggy rain
    if (mode === 'none') {
      clear();
      parts = [];
    } else if (canvas) {
      resize();
      if (changed) {
        spawn(); // full rebuild on a rain↔snow switch
        lastT = 0;
      } else {
        reconcile(); // intensity/heavy change — adjust count, keep existing drops
      }
    }
  });

  // Camera zoom → more (and finer) particles as you zoom out. Reconcile (grow/shrink the delta) every
  // step so the density ramps smoothly while scrolling, with no respawn pop. (Particle SIZE is applied
  // at draw time from sizeMul(), so it re-scales every frame without needing a reconcile.)
  const unsubZoom = cameraTileSize.subscribe((ts) => {
    tileSize = ts;
    if (mode !== 'none') reconcile();
  });
  // The zoom RANGE itself shifts when the map size changes (a new game / map regen): re-anchor the
  // floor/ceiling so zoomInFrac is measured against the active map's real range.
  const unsubZoomRange = cameraZoomRange.subscribe((r) => {
    zoomMin = r.min;
    zoomMax = r.max;
    if (mode !== 'none') reconcile();
  });

  onMount(() => {
    if (!browser) return;
    ctx = canvas.getContext('2d');
    reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    resize();
    ro = new ResizeObserver(() => {
      resize();
      if (mode !== 'none') reconcile();
    });
    ro.observe(canvas);
    if (mode !== 'none') spawn();
    // Reduced-motion: skip the animation loop entirely (no precipitation rather than a static smear).
    if (!reduceMotion) raf = requestAnimationFrame(frame);
  });

  onDestroy(() => {
    if (raf) cancelAnimationFrame(raf);
    ro?.disconnect();
    unsub();
    unsubZoom();
    unsubZoomRange();
    unsubAmbient();
  });
</script>

<canvas bind:this={canvas} class="weather-canvas"></canvas>

<style>
  .weather-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
</style>
