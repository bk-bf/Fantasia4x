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
  import { cameraTileSize } from '$lib/stores/cameraView';
  import {
    weatherOverlayKind,
    weatherFallSpeed,
    weatherDensity,
    weatherWindStrength,
    weatherParticleColor,
    environmentService,
    getAmbientLight,
    getAmbientTint
  } from '$lib/game/services/EnvironmentService';

  type Mode = 'none' | 'rain' | 'snow' | 'fog' | 'leaves' | 'dust' | 'snowdust';

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

  // Zoom-out "in the clouds" feel: the further the camera zooms OUT, the MORE particles (count only —
  // speed and size stay constant). The multiplier is LINEAR in tile size across the real zoom range so
  // it ramps gently as you scroll, rather than staying flat then doubling near the end (a hyperbola
  // did that). The pool grows/shrinks by the delta (reconcile) so the change is gradual, not a pop.
  const MIN_TILE = 6; // ~ fully zoomed out (whole map fits)
  const MAX_TILE = 40; // fully zoomed in
  let tileSize = 8; // current zoom (px per tile), from the camera store
  const densityMul = () => {
    const frac = Math.max(0, Math.min(1, (MAX_TILE - tileSize) / (MAX_TILE - MIN_TILE)));
    return 0.8 + frac * 1.4; // 0.8× zoomed in → 2.2× zoomed out, gentle linear ramp
  };

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
    if (!canvas) return;
    const w = Math.floor(canvas.clientWidth);
    const h = Math.floor(canvas.clientHeight);
    if (w <= 0 || h <= 0) return;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
  }

  function makeParticle(w: number, h: number, atTop: boolean): Particle {
    if (mode === 'rain') {
      const spd = fallSpeed * (0.7 + Math.random() * 0.6); // ±variance around the data fall speed
      // Drops slant LEFT as they fall, drifting `|slant| × height` px over a full descent. Seed them
      // across a width extended by that slant so they still cover the bottom-right corner — otherwise
      // the coverage is a left-leaning parallelogram with a triangular gap bottom-right.
      const slant = Math.abs(rainSlant()) * h;
      return {
        x: Math.random() * (w + slant),
        y: atTop ? -20 - Math.random() * 40 : Math.random() * h,
        len: 9 + Math.random() * 13 + windStrength * 12,
        spd,
        r: 0,
        ph: 0
      };
    }
    if (mode === 'leaves') {
      // Tumbling leaves/petals: slow fall, strong sideways wind drift, a rotation/sway phase. Seeded
      // across an extended width (like rain) so the wind-blown corner stays covered.
      const spd = fallSpeed * (0.6 + Math.random() * 0.8);
      return {
        x: Math.random() * (w + sideDrift() * 2),
        y: atTop ? -20 - Math.random() * 40 : Math.random() * h,
        len: 3 + Math.random() * 3, // half-length of the leaf
        spd,
        r: 2 + Math.random() * 2,
        ph: Math.random() * TWO_PI
      };
    }
    if (mode === 'fog') {
      // A big, soft, slow-drifting haze cloud. `spd` is horizontal drift (px/sec, either direction);
      // `r` is the base blob radius; `ph` a slow vertical-bob phase; `len` a separate phase driving a
      // gentle radius "breathing" so the bank morphs over time instead of holding rigid discs.
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
    // dots: snow / snowdust / dust — a falling, wind-drifting speck. Dust is finer than snow.
    const spd = fallSpeed * (0.6 + Math.random() * 0.9);
    const sz = mode === 'dust' ? 0.6 + Math.random() * 1.2 : 1 + Math.random() * 2.2;
    return {
      x: Math.random() * (w + sideDrift() * 1.5), // extend for the sideways drift's covered corner
      y: atTop ? -10 - Math.random() * 30 : Math.random() * h,
      len: 0,
      spd,
      r: sz,
      ph: Math.random() * TWO_PI
    };
  }

  /** How many particles we want right now: data `density` (per megapixel) × intensity × zoom-out, capped. */
  function targetCount(): number {
    if (!canvas || mode === 'none') return 0;
    const w = canvas.width;
    const h = canvas.height;
    if (w <= 0 || h <= 0) return 0;
    // Fog is a handful of big soft blobs, not a per-pixel particle field (no zoom scaling).
    // More, larger, overlapping blobs read as continuous haze rather than a scatter of distinct discs.
    if (mode === 'fog') return Math.min(40, Math.max(10, Math.round((w * h) / 95_000)));
    const perPx = density / 1_000_000; // density is per-megapixel for readable data values
    return Math.min(1600, Math.floor(w * h * perPx * (0.5 + intensity) * densityMul()));
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
    const w = canvas.width;
    const h = canvas.height;
    while (parts.length < target) parts.push(makeParticle(w, h, false));
  }

  /** Full rebuild — only on a mode switch (rain↔snow), where the particle kind changes. */
  function spawn() {
    parts = [];
    reconcile();
  }

  function clear() {
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function frame(t: number) {
    raf = requestAnimationFrame(frame);
    if (!ctx || mode === 'none') return;
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0.016;
    lastT = t;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (mode === 'rain') {
      const wind = rainSlant(); // horizontal slant (px per px fallen), wind-driven
      ctx.strokeStyle = `rgba(180, 205, 235, ${0.25 + 0.35 * intensity})`;
      ctx.lineWidth = 1.1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const p of parts) {
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + wind * p.len, p.y + p.len);
        p.y += p.spd * dt;
        p.x += wind * p.spd * dt;
        if (p.y > h) {
          const np = makeParticle(w, h, true);
          p.x = np.x;
          p.y = np.y;
          p.len = np.len;
          p.spd = np.spd;
        }
      }
      ctx.stroke();
    } else if (isDots()) {
      // snow / snowdust / dust — falling specks with wind-driven sideways drift + a gentle sway.
      // snowdust (blowing snow) and dust drift hard sideways; plain snow only when it's windy.
      const drift = sideDrift() * (mode === 'snowdust' ? 1.4 : 1);
      const [cr, cg, cb] = mode === 'dust' ? particleColor : [255, 255, 255];
      const baseA = mode === 'dust' ? 0.18 + 0.22 * intensity : 0.5 + 0.4 * intensity;
      ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${baseA})`;
      ctx.beginPath();
      for (const p of parts) {
        p.ph += dt;
        p.y += p.spd * dt;
        p.x += drift * dt;
        const dx = Math.sin(p.ph * 1.6) * 6; // gentle sway
        const drawX = p.x + dx;
        ctx.moveTo(drawX + p.r, p.y);
        ctx.arc(drawX, p.y, p.r, 0, TWO_PI);
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
      const drift = sideDrift();
      const [cr, cg, cb] = particleColor;
      for (const p of parts) {
        p.ph += dt * 2.2;
        p.y += p.spd * dt;
        p.x += (drift + Math.sin(p.ph) * 30) * dt; // gusty sideways flutter
        const sway = Math.sin(p.ph * 0.8) * 10;
        const drawX = p.x + sway;
        const wobble = 0.45 + 0.55 * Math.abs(Math.cos(p.ph)); // tumble → width pinches as it spins
        ctx.save();
        ctx.translate(drawX, p.y);
        ctx.rotate(p.ph);
        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.55 + 0.35 * intensity})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.len, p.len * wobble, 0, 0, TWO_PI);
        ctx.fill();
        ctx.restore();
        if (p.y > h + 8) {
          const np = makeParticle(w, h, true);
          p.x = np.x;
          p.y = np.y;
          p.spd = np.spd;
        }
        if (p.x > w + 16) p.x = -16;
        else if (p.x < -16) p.x = w + 16;
      }
    } else if (mode === 'fog') {
      // A faint flat veil + many big, soft, OVERLAPPING blobs = slow rolling fog. Radial gradients
      // can't batch into one path, so each blob is its own fill — but there are only a few dozen.
      // Two slow sines (bank-wide gust + per-blob phase) plus a gentle radius "breathing" make the
      // field continuously morph, so it reads as drifting haze rather than a ring of hard discs.
      fogTime += dt;
      const gust = Math.sin(fogTime * 0.5) * 55; // bank-wide sway (px)
      const gust2 = Math.cos(fogTime * 0.31) * 30; // second cross-rhythm so the motion never obviously repeats
      const gustDrift = Math.cos(fogTime * 0.27) * 10; // breathing of drift speed (px/sec)
      // Fog colour tracks the day/night ambient so it dims and cools at night instead of washing the
      // dark map white. Brightness floors low (0.18) so a hint of haze survives midnight; the hue comes
      // from the ambient tint (cool blue at night, warm by day) — same palette as the map beneath it.
      const fb = Math.max(0.18, ambLight);
      const fr = Math.round(220 * ambTint[0] * fb);
      const fgc = Math.round(223 * ambTint[1] * fb);
      const fbl = Math.round(229 * ambTint[2] * fb);
      const rgb = `${fr}, ${fgc}, ${fbl}`;
      ctx.fillStyle = `rgba(${rgb}, ${0.04 + 0.05 * intensity})`;
      ctx.fillRect(0, 0, w, h);
      // Lower per-blob alpha than before — density now comes from OVERLAP, not from each disc being
      // dense (which is what made the individual circles visible).
      const blobAlpha = 0.028 + 0.045 * intensity;
      for (const p of parts) {
        p.x += (p.spd + gustDrift) * dt;
        p.ph += dt * 0.45; // bob/drift phase
        p.len += dt * 0.6; // breathing phase
        // Radius breathes ±20% so blob edges keep moving and never settle into a fixed circle.
        const rad = p.r * (1 + Math.sin(p.len) * 0.2);
        const cx = p.x + gust + Math.sin(fogTime * 0.37 + p.ph) * 32;
        const cy = p.y + Math.sin(p.ph) * 34 + Math.cos(p.ph * 0.6 + gust2 * 0.01) * 18;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        // Soft, convex falloff (extra mid-stops) drains the outer half toward zero well before the
        // edge, hiding the hard circular rim a plain 2-stop gradient leaves behind.
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
  }

  const unsub = currentWeather.subscribe((wx) => {
    // Data-driven: the overlay kind and all visual params come from weather.jsonc, so a new weather
    // type renders the right overlay with no code change here. The slant strength is the type's
    // inherent windStrength combined with the live ambient `wind` (so plain rain on a windy day leans).
    const next: Mode = weatherOverlayKind(wx?.type);
    intensity = Math.max(0.2, Math.min(1, wx?.intensity ?? 0));
    windStrength = Math.max(0, Math.min(1, Math.max(weatherWindStrength(wx?.type), wx?.wind ?? 0)));
    fallSpeed = weatherFallSpeed(wx?.type);
    density = weatherDensity(wx?.type);
    particleColor = weatherParticleColor(wx?.type) ?? particleColor;
    const changed = next !== mode;
    mode = next;
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

  // Camera zoom → more particles as you zoom out. Reconcile (grow/shrink the delta) every step so the
  // density ramps smoothly while scrolling, with no respawn pop.
  const unsubZoom = cameraTileSize.subscribe((ts) => {
    tileSize = ts;
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
