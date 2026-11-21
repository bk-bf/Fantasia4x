<script lang="ts">
  import {
    SANDGLASS,
    sandglassFrame,
    sandglassGlass,
    type SandglassKind
  } from '$lib/pixelArt/sandglass';

  let { kind }: { kind: SandglassKind } = $props();

  const SCALE = 4;
  const RUN_MS = 9000;
  const TURN_MS = 900;
  const TICK_MS = 70;

  let canvas: HTMLCanvasElement | undefined = $state();
  let turning = $state(false);
  const frame = $derived(sandglassFrame(kind));

  $effect(() => {
    const g = canvas?.getContext('2d');
    if (!g) return;
    const art = frame;
    const skin = kind;
    let start = performance.now();
    let turnedAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const paint = (f: number, tick: number) => {
      g.clearRect(0, 0, SANDGLASS.w, SANDGLASS.h);
      g.drawImage(sandglassGlass(skin, f, tick), 0, 0);
      g.drawImage(art, 0, 0);
    };
    const settle = () => {
      start = performance.now();
      turnedAt = 0;
      paint(0, Math.floor(start / TICK_MS));
      turning = false;
    };
    const step = () => {
      const now = performance.now();
      const f = turnedAt ? 1 : Math.min(1, (now - start) / RUN_MS);
      paint(f, Math.floor(now / TICK_MS));
      if (f >= 1 && !turnedAt) {
        turnedAt = now;
        turning = true;
        timer = setTimeout(settle, TURN_MS + 40);
      }
    };
    step();
    const ticker = setInterval(step, TICK_MS);
    return () => {
      clearInterval(ticker);
      clearTimeout(timer);
    };
  });
</script>

<div
  class="glass"
  class:turning
  style:width="{SANDGLASS.w * SCALE}px"
  style:height="{SANDGLASS.h * SCALE}px"
>
  <canvas bind:this={canvas} width={SANDGLASS.w} height={SANDGLASS.h} aria-hidden="true"></canvas>
</div>

<style>
  .glass {
    transform-origin: 50% 50%;
  }
  .glass.turning {
    transform: rotate(180deg);
    transition: transform 900ms cubic-bezier(0.5, 0, 0.3, 1);
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
    filter: drop-shadow(4px 5px 0 rgb(6 4 3 / 0.45));
  }
  @media (prefers-reduced-motion: reduce) {
    .glass.turning {
      transition: none;
    }
  }
</style>
