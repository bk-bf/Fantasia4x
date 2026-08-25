<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { currentWeather, gameState } from '$lib/stores/gameState';
  import { cameraTileSize, cameraZoomRange } from '$lib/stores/cameraView';
  import { debugMode } from '$lib/stores/uiPrefs';
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
  const _DBG_BUILD =
    import.meta.env.VITE_DEBUG_MODE === 'true' || import.meta.env.VITE_DEBUG_LOG === 'true';
  let _wxDbg = _DBG_BUILD;
  const _unsubWxDbg = debugMode.subscribe((v) => (_wxDbg = _DBG_BUILD || v));
  let fogTime = 0;
  let ro: ResizeObserver | undefined;
  let reduceMotion = false;

  let ambLight = 1;
  let ambTint: [number, number, number] = [1, 1, 1];
  const unsubAmbient = gameState.subscribe((gs) => {
    const turn = environmentService.ambientTurn(gs);
    ambLight = getAmbientLight(turn);
    ambTint = getAmbientTint(turn);
  });

  let mode: Mode = 'none';
  let intensity = 0;
  let windStrength = 0.2;
  let fallSpeed = 680;
  let density = 160;
  let particleColor: [number, number, number] = [200, 120, 60];

  const rainSlant = () => -(0.12 + windStrength * 0.8);
  const sideDrift = () => 8 + windStrength * 120;
  const isDots = () => mode === 'snow' || mode === 'dust' || mode === 'snowdust';
  const isRain = () => mode === 'rain' || mode === 'foggy_rain';

  let fogBlobs: Particle[] = [];

  let tileSize = 8;
  let zoomMin = 8;
  let zoomMax = 40;
  const zoomInFrac = () => {
    const span = Math.max(1, zoomMax - zoomMin);
    return Math.max(0, Math.min(1, (tileSize - zoomMin) / span));
  };

  const sizeMul = () => 0.3 + zoomInFrac() * 1.0;

  const densityMul = () => 0.8 + (1 - zoomInFrac()) * 1.6;

  const SUBPIXEL_TILE = 4;
  const subpixelAtten = () => Math.max(0.2, Math.min(1, tileSize / SUBPIXEL_TILE));

  const RENDER_SCALE = 0.6;

  interface Particle {
    x: number;
    y: number;
    len: number;
    spd: number;
    r: number;
    ph: number;
  }
  let parts: Particle[] = [];

  const TWO_PI = Math.PI * 2;

  function resize() {
    if (!canvas || !ctx) return;
    const cw = Math.floor(canvas.clientWidth);
    const ch = Math.floor(canvas.clientHeight);
    if (cw <= 0 || ch <= 0) return;
    const bw = Math.max(1, Math.round(cw * RENDER_SCALE));
    const bh = Math.max(1, Math.round(ch * RENDER_SCALE));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
  }

  const cssW = () => (canvas ? canvas.width / RENDER_SCALE : 0);
  const cssH = () => (canvas ? canvas.height / RENDER_SCALE : 0);

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

  function setParticle(p: Particle, w: number, h: number, atTop: boolean): void {
    if (isRain()) {
      p.x = Math.random() * (w + Math.abs(rainSlant()) * h);
      p.y = atTop ? -20 - Math.random() * 40 : Math.random() * h;
      p.len = 9 + Math.random() * 13 + windStrength * 12;
      p.spd = fallSpeed * (0.7 + Math.random() * 0.6);
      p.r = 0;
      p.ph = 0;
      return;
    }
    if (mode === 'leaves') {
      p.x = Math.random() * (w + sideDrift() * 2);
      p.y = atTop ? -20 - Math.random() * 40 : Math.random() * h;
      p.len = 2 + Math.random() * 2;
      p.spd = fallSpeed * (0.6 + Math.random() * 0.8);
      p.r = 2 + Math.random() * 2;
      p.ph = Math.random() * TWO_PI;
      return;
    }
    p.x = Math.random() * (w + sideDrift() * 1.5);
    p.y = atTop ? -10 - Math.random() * 30 : Math.random() * h;
    p.len = 0;
    p.spd = fallSpeed * (0.6 + Math.random() * 0.9);
    p.r = mode === 'dust' ? 0.8 + Math.random() * 1.5 : 0.67 + Math.random() * 1.47;
    p.ph = Math.random() * TWO_PI;
  }

  function makeParticle(w: number, h: number, atTop: boolean): Particle {
    if (mode === 'fog') return makeFogBlob(w, h);
    const p: Particle = { x: 0, y: 0, len: 0, spd: 0, r: 0, ph: 0 };
    setParticle(p, w, h, atTop);
    return p;
  }

  function targetCount(): number {
    if (!canvas || mode === 'none') return 0;
    const w = cssW();
    const h = cssH();
    if (w <= 0 || h <= 0) return 0;
    if (mode === 'fog') return Math.min(40, Math.max(10, Math.round((w * h) / 95_000)));
    const perPx = density / 1_000_000;
    const cap = Math.min(2400, Math.round(1600 / Math.max(0.45, sizeMul())));
    const want = Math.min(cap, Math.floor(w * h * perPx * (0.5 + intensity) * densityMul()));
    return Math.round(want * subpixelAtten());
  }

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
    const _wxGap = _wxDbg && lastT ? t - lastT : 0;
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0.016;
    lastT = t;
    const _wxT0 = _wxDbg ? performance.now() : 0;
    const w = cssW();
    const h = cssH();
    ctx.clearRect(0, 0, w, h);

    if (isRain()) {
      if (mode === 'foggy_rain') {
        ensureFogBlobs();
        renderFog(w, h, fogBlobs, dt, 0.85);
      }
      const wind = rainSlant();
      const s = sizeMul();
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
        if (p.y > h) setParticle(p, w, h, true);
      }
      ctx.stroke();
    } else if (isDots()) {
      const drift = sideDrift() * (mode === 'snowdust' ? 1.4 : 1);
      const [cr, cg, cb] =
        mode === 'dust'
          ? particleColor.map((c, i) => Math.round(c * ambLight * ambTint[i]))
          : [255, 255, 255];
      const baseA = mode === 'dust' ? 0.3 + 0.28 * intensity : 0.5 + 0.4 * intensity;
      const s = sizeMul();
      ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${baseA})`;
      ctx.beginPath();
      for (const p of parts) {
        p.ph += dt;
        p.y += p.spd * dt;
        p.x += drift * dt;
        const dx = Math.sin(p.ph * 1.6) * 6;
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
      const drift = sideDrift();
      const scale = sizeMul();
      const swirl = windStrength * Math.max(0.3, intensity);
      const cr = Math.round(particleColor[0] * ambLight * ambTint[0]);
      const cg = Math.round(particleColor[1] * ambLight * ambTint[1]);
      const cb = Math.round(particleColor[2] * ambLight * ambTint[2]);
      ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.55 + 0.35 * intensity})`;
      for (const p of parts) {
        p.ph += dt * (1.8 + swirl * 2.6);
        p.y += p.spd * dt + Math.sin(p.ph * 1.3) * swirl * 55 * dt;
        p.x += (drift + Math.sin(p.ph) * (24 + swirl * 90)) * dt;
        const sway = Math.sin(p.ph * 0.8) * (8 + swirl * 22);
        const drawX = p.x + sway;
        const wobble = 0.45 + 0.55 * Math.abs(Math.cos(p.ph));
        const rad = p.len * scale;
        ctx.save();
        ctx.translate(drawX, p.y);
        ctx.rotate(p.ph);
        ctx.beginPath();
        ctx.ellipse(0, 0, rad, rad * wobble, 0, 0, TWO_PI);
        ctx.fill();
        ctx.restore();
        if (p.y > h + 8) setParticle(p, w, h, true);
        if (p.x > w + 16) p.x = -16;
        else if (p.x < -16) p.x = w + 16;
      }
    } else if (mode === 'fog') {
      renderFog(w, h, parts, dt, 1);
    }
    if (_wxDbg) wxProfile(_wxGap, performance.now() - _wxT0);
  }

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
    const next: Mode = weatherOverlayKind(wx?.type);
    intensity = Math.max(0.2, Math.min(1, wx?.intensity ?? 0));
    windStrength = ambientWind(wx ?? undefined);
    fallSpeed = weatherFallSpeed(wx?.type);
    density = weatherDensity(wx?.type);
    particleColor = weatherParticleColor(wx?.type) ?? particleColor;
    const changed = next !== mode;
    mode = next;
    if (mode !== 'foggy_rain') fogBlobs = [];
    if (mode === 'none') {
      clear();
      parts = [];
    } else if (canvas) {
      resize();
      if (changed) {
        spawn();
        lastT = 0;
      } else {
        reconcile();
      }
    }
  });

  const unsubZoom = cameraTileSize.subscribe((ts) => {
    tileSize = ts;
    if (mode !== 'none') reconcile();
  });
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
    if (!reduceMotion) raf = requestAnimationFrame(frame);
  });

  onDestroy(() => {
    if (raf) cancelAnimationFrame(raf);
    ro?.disconnect();
    unsub();
    unsubZoom();
    unsubZoomRange();
    unsubAmbient();
    _unsubWxDbg();
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
