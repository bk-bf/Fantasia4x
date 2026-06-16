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
  import { currentWeather } from '$lib/stores/gameState';
  import { cameraTileSize } from '$lib/stores/cameraView';

  type Mode = 'none' | 'rain' | 'snow';

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let raf = 0;
  let lastT = 0;
  let ro: ResizeObserver | undefined;
  let reduceMotion = false;

  let mode: Mode = 'none';
  let intensity = 0; // 0–1
  let heavy = false; // heavy_rain / blizzard

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
      const spd = (heavy ? 950 : 680) * (0.7 + Math.random() * 0.6);
      // Drops slant LEFT as they fall, drifting `|wind| × height` px over a full descent. Seed them
      // across a width extended by that slant so they still cover the bottom-right corner — otherwise
      // the coverage is a left-leaning parallelogram with a triangular gap bottom-right.
      const slant = Math.abs(heavy ? -0.4 : -0.2) * h;
      return {
        x: Math.random() * (w + slant),
        y: atTop ? -20 - Math.random() * 40 : Math.random() * h,
        len: 9 + Math.random() * 13 + (heavy ? 6 : 0),
        spd,
        r: 0,
        ph: 0
      };
    }
    // snow
    const spd = (heavy ? 150 : 80) * (0.6 + Math.random() * 0.9);
    return {
      x: Math.random() * w,
      y: atTop ? -10 - Math.random() * 30 : Math.random() * h,
      len: 0,
      spd,
      r: 1 + Math.random() * 2.2,
      ph: Math.random() * TWO_PI
    };
  }

  /** How many particles we want right now (screen area × intensity × zoom-out), capped. */
  function targetCount(): number {
    if (!canvas || mode === 'none') return 0;
    const w = canvas.width;
    const h = canvas.height;
    if (w <= 0 || h <= 0) return 0;
    const density = mode === 'rain' ? 0.00016 : 0.00008; // per px²
    return Math.min(1600, Math.floor(w * h * density * (0.5 + intensity) * densityMul()));
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
      const wind = heavy ? -0.4 : -0.2; // horizontal slant (px per px fallen)
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
    } else {
      const wind = heavy ? 60 : 14; // sideways drift px/sec
      ctx.fillStyle = `rgba(255, 255, 255, ${0.5 + 0.4 * intensity})`;
      ctx.beginPath();
      for (const p of parts) {
        p.ph += dt;
        p.y += p.spd * dt;
        p.x += wind * dt;
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
    }
  }

  const unsub = currentWeather.subscribe((wx) => {
    const type = wx?.type;
    const next: Mode =
      type === 'rain' || type === 'heavy_rain'
        ? 'rain'
        : type === 'snow' || type === 'blizzard'
          ? 'snow'
          : 'none';
    intensity = Math.max(0.2, Math.min(1, wx?.intensity ?? 0));
    heavy = type === 'heavy_rain' || type === 'blizzard';
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
