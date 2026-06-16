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

  // Zoom-out "in the clouds" feel: the further out the camera, the more (and faster, longer) the
  // particles — as if flying up through the weather. `zoom` ≈ how many times more zoomed-out than the
  // reference tile size (1 = reference, >1 = zoomed out, <1 = zoomed in).
  const REF_TILE = 16;
  let zoom = 1;
  const densityMul = () => Math.max(0.7, Math.min(4, zoom)); // up to 4× particles zoomed way out
  const speedMul = () => Math.max(0.8, Math.min(2.4, 0.85 + (zoom - 1) * 0.5));
  const sizeMul = () => Math.max(0.8, Math.min(1.8, 0.9 + (zoom - 1) * 0.3));

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
    const sm = speedMul();
    const zm = sizeMul();
    if (mode === 'rain') {
      const spd = (heavy ? 950 : 680) * (0.7 + Math.random() * 0.6) * sm;
      return {
        x: Math.random() * w * 1.15 - w * 0.1, // bias left so the slant still fills the right edge
        y: atTop ? -20 - Math.random() * 40 : Math.random() * h,
        len: (9 + Math.random() * 13 + (heavy ? 6 : 0)) * zm,
        spd,
        r: 0,
        ph: 0
      };
    }
    // snow
    const spd = (heavy ? 150 : 80) * (0.6 + Math.random() * 0.9) * sm;
    return {
      x: Math.random() * w,
      y: atTop ? -10 - Math.random() * 30 : Math.random() * h,
      len: 0,
      spd,
      r: (1 + Math.random() * 2.2) * zm,
      ph: Math.random() * TWO_PI
    };
  }

  function spawn() {
    if (!canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    if (w <= 0 || h <= 0 || mode === 'none') {
      parts = [];
      return;
    }
    // Count scales with screen area × intensity × zoom-out (more particles the further out you are).
    const density = mode === 'rain' ? 0.00016 : 0.00008; // per px²
    const count = Math.min(
      1600,
      Math.floor(w * h * density * (0.5 + intensity) * densityMul())
    );
    parts = new Array(count);
    for (let i = 0; i < count; i++) parts[i] = makeParticle(w, h, false);
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
    if (mode === 'none') clear();
    else if (canvas) {
      resize();
      spawn(); // (re)seed for a mode change or an intensity/heavy change
      if (changed) lastT = 0;
    }
  });

  // Re-seed particle count/speed/size as the camera zooms — more, faster, longer when zoomed out.
  let zoomReseed: ReturnType<typeof setTimeout> | undefined;
  const unsubZoom = cameraTileSize.subscribe((tileSize) => {
    const z = Math.max(0.5, Math.min(4, REF_TILE / Math.max(1, tileSize)));
    if (Math.abs(z - zoom) < 0.05) return; // ignore tiny changes
    zoom = z;
    if (mode === 'none' || !canvas) return;
    // Debounce: a zoom gesture fires many steps; respawn once it settles.
    if (zoomReseed) clearTimeout(zoomReseed);
    zoomReseed = setTimeout(() => spawn(), 120);
  });

  onMount(() => {
    if (!browser) return;
    ctx = canvas.getContext('2d');
    reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    resize();
    ro = new ResizeObserver(() => {
      resize();
      if (mode !== 'none') spawn();
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
