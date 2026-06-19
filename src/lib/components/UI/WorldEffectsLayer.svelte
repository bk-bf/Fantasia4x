<!-- WorldEffectsLayer: sits above tiles (z-index 5) but below popup panels (z-index 10).
     All in-world animations and fullscreen shader overlays are docked here.
     To add a new effect: extend WorldEffectsState in worldEffects.ts and render it below. -->
<script lang="ts">
  import { worldEffects } from '$lib/stores/worldEffects';
  import WeatherCanvas from './WeatherCanvas.svelte';
</script>

<div class="world-effects-layer">
  <!-- ── World-Space Animations (positions derived from tile coordinates) ──────── -->

  {#each $worldEffects.sleepingOverlays as overlay (overlay.id)}
    <div
      class="zzz-float"
      style="transform: translate({overlay.left}px, {overlay.top}px) translateX(-50%);"
    >
      <span class="zzz-z" style="animation-delay:0s">Z</span><span
        class="zzz-z"
        style="animation-delay:0.7s">z</span
      ><span class="zzz-z" style="animation-delay:1.4s">z</span>
    </div>
  {/each}

  {#each $worldEffects.progressOverlays as overlay (overlay.id)}
    <div
      class="pawn-progress-float"
      style="transform: translate({overlay.left}px, {overlay.top}px) translateX(-50%);"
    >
      <div class="pawn-progress-fill" style="width:{overlay.progress * 100}%"></div>
    </div>
  {/each}

  {#each $worldEffects.campfireOverlays as overlay (overlay.id)}
    <div
      class="fire-sparks"
      style="transform: translate({overlay.left}px, {overlay.top}px) translateX(-50%);"
    >
      <span class="spark s1">·</span>
      <span class="spark s2">*</span>
      <span class="spark s3">·</span>
      <span class="spark s4">*</span>
      <span class="spark s5">·</span>
    </div>
  {/each}

  <!-- Ambient per-tile particle effects — grim lair "tells". -->
  {#each $worldEffects.particleOverlays as overlay (overlay.id)}
    {@const xf = `transform: translate(${overlay.left}px, ${overlay.top}px) translateX(-50%);`}
    {#if overlay.effect === 'smoke'}
      <div class="lair-fx lair-smoke" style={xf}>
        <span class="puff p1">▒</span>
        <span class="puff p2">░</span>
        <span class="puff p3">▒</span>
        <span class="puff p4">░</span>
        <span class="puff p5">▒</span>
        <span class="puff p6">░</span>
      </div>
    {:else if overlay.effect === 'flies'}
      <div class="lair-fx lair-flies" style={xf}>
        <span class="fly f1">·</span>
        <span class="fly f2">·</span>
        <span class="fly f3">·</span>
        <span class="fly f4">·</span>
        <span class="fly f5">·</span>
        <span class="fly f6">·</span>
      </div>
    {:else if overlay.effect === 'bloodmist'}
      <div class="lair-fx lair-bloodmist" style={xf}>
        <span class="bmote b1">o</span>
        <span class="bmote b2">°</span>
        <span class="bmote b3">O</span>
        <span class="bmote b4">°</span>
        <span class="bmote b5">o</span>
      </div>
    {:else if overlay.effect === 'miasma'}
      <div class="lair-fx lair-miasma" style={xf}>
        <span class="bubble m1">O</span>
        <span class="bubble m2">o</span>
        <span class="bubble m3">°</span>
        <span class="bubble m4">O</span>
        <span class="bubble m5">o</span>
        <span class="bubble m6">°</span>
      </div>
    {:else if overlay.effect === 'feathers'}
      <div class="lair-fx lair-feathers" style={xf}>
        <span class="feather fe1">'</span>
        <span class="feather fe2">`</span>
        <span class="feather fe3">'</span>
        <span class="feather fe4">,</span>
        <span class="feather fe5">`</span>
      </div>
    {/if}
  {/each}

  {#each $worldEffects.healthOverlays as overlay (overlay.id)}
    <div
      class="health-bar-float"
      style="transform: translate({overlay.left}px, {overlay.top}px) translateX(-50%);"
    >
      <div
        class="health-bar-fill"
        class:pawn={overlay.type === 'pawn'}
        class:mob={overlay.type === 'mob'}
        style="width:{overlay.health * 100}%"
      ></div>
    </div>
  {/each}

  <!-- ── Draft target lines ────────────────────────────────────────────────────── -->
  {#each $worldEffects.draftTargetOverlays as overlay (overlay.id)}
    {@const last = overlay.points[overlay.points.length - 1]}
    <svg
      class="draft-target-line"
      style="position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none;"
    >
      <polyline
        points={overlay.points.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke="#ff4444"
        stroke-width="2"
        stroke-dasharray="4,4"
        opacity="0.7"
      />
      {#if last}
        <circle cx={last.x} cy={last.y} r="4" fill="#ff4444" opacity="0.5" />
      {/if}
    </svg>
  {/each}

  <!-- ── Floating combat text (damage / miss / dodge / crit / bleed) ───────────── -->
  {#each $worldEffects.floatingTextOverlays as overlay (overlay.id)}
    <div
      class="combat-float {overlay.kind}"
      style="transform: translate({overlay.left}px, {overlay.top}px) translateX(-50%);"
    >
      {overlay.text}
    </div>
  {/each}

  <!-- ── Fullscreen Weather Overlay (SEASONS_WEATHER) ──────────────────────────── -->
  <!-- Rain/snow particle system on a 2D canvas — reads the weather store itself, idles when clear. -->
  <WeatherCanvas />
</div>

<style>
  .world-effects-layer {
    position: absolute;
    inset: 0;
    /* Above canvas tiles, below overlay panels (z-index: 10) */
    z-index: 5;
    pointer-events: none;
    overflow: hidden;
  }

  /* ── Working progress bar ───────────────────────────────────────────────────── */

  .pawn-progress-float {
    position: absolute;
    left: 0;
    top: 0;
    width: 22px;
    height: 4px;
    background: rgba(32, 24, 10, 0.85);
    border: 1px solid #705020;
    pointer-events: none;
    /* centering + positioning via inline style transform: translate(X,Y) translateX(-50%) */
  }

  .pawn-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #4ab85a, #8ad66a);
  }

  /* ── Zzz sleeping animation ──────────────────────────────────────────────────── */

  .zzz-float {
    position: absolute;
    left: 0;
    top: 0;
    pointer-events: none;
    display: flex;
    gap: 1px;
    /* centering + positioning via inline style transform: translate(X,Y) translateX(-50%) */
  }

  .zzz-z {
    color: #7788ff;
    font-family: 'Courier New', monospace;
    font-size: 8px;
    font-weight: bold;
    opacity: 0;
    animation: zzz-rise 2.1s ease-out infinite;
    text-shadow: 0 0 4px #334;
    /* Promote to its own compositor layer so the looping opacity/transform
       animation composites on the GPU instead of re-rasterising the blurred
       text-shadow every frame — this is what tanked FPS at night when many
       pawns slept at once. */
    will-change: transform, opacity;
  }

  @keyframes zzz-rise {
    0% {
      opacity: 0;
      transform: translateY(2px) scale(0.75);
    }
    15% {
      opacity: 1;
    }
    70% {
      opacity: 0.7;
      transform: translateY(-14px) scale(1.1);
    }
    100% {
      opacity: 0;
      transform: translateY(-20px) scale(0.85);
    }
  }

  /* ── Campfire fire animation ─────────────────────────────────────────────────── */

  .fire-sparks {
    position: absolute;
    left: 0;
    top: 0;
    pointer-events: none;
    width: 0;
    height: 0;
    /* centering + positioning via inline style transform: translate(X,Y) translateX(-50%) */
  }

  .spark {
    position: absolute;
    font-family: 'Courier New', monospace;
    font-size: 10px;
    font-weight: bold;
    opacity: 0;
    animation: fire-rise 1.1s ease-out infinite;
    /* Same reasoning as .zzz-z: keep the blurred spark text-shadow off the
       per-frame raster path by compositing on the GPU. */
    will-change: transform, opacity;
  }

  .s1 {
    color: #ff3300;
    animation-delay: 0s;
    left: -5px;
    text-shadow: 0 0 6px #ff1100;
  }
  .s2 {
    color: #ff8800;
    animation-delay: 0.22s;
    left: 3px;
    text-shadow: 0 0 6px #ff5500;
  }
  .s3 {
    color: #ffcc00;
    animation-delay: 0.44s;
    left: -1px;
    text-shadow: 0 0 6px #ff9900;
  }
  .s4 {
    color: #ff5500;
    animation-delay: 0.66s;
    left: 5px;
    text-shadow: 0 0 6px #ff2200;
  }
  .s5 {
    color: #ffee44;
    animation-delay: 0.88s;
    left: -3px;
    text-shadow: 0 0 6px #ffbb00;
  }

  @keyframes fire-rise {
    0% {
      opacity: 0;
      transform: translateY(2px) scale(1.5);
    }
    10% {
      opacity: 1;
    }
    50% {
      opacity: 0.85;
      transform: translateY(-18px) scale(1.1);
    }
    100% {
      opacity: 0;
      transform: translateY(-36px) scale(0.4);
    }
  }

  /* Subtle lair smoke — a few faint grey puffs that drift up and dissipate slowly. */
  .lair-smoke {
    position: absolute;
    left: 0;
    top: 0;
    pointer-events: none;
    width: 0;
    height: 0;
  }
  .puff {
    position: absolute;
    font-family: 'Courier New', monospace;
    font-size: 16px;
    color: #9b958b;
    opacity: 0;
    /* Heavy blur dissolves the block glyph into a soft haze — reads as smoke, not a letter. */
    filter: blur(3px);
    text-shadow: 0 0 5px #8a847a;
    animation: smoke-rise 4.2s ease-out infinite;
    will-change: transform, opacity;
  }
  .puff.p1 {
    animation-delay: 0s;
    left: -3px;
  }
  .puff.p2 {
    animation-delay: 0.7s;
    left: 4px;
  }
  .puff.p3 {
    animation-delay: 1.4s;
    left: -6px;
  }
  .puff.p4 {
    animation-delay: 2.1s;
    left: 2px;
  }
  .puff.p5 {
    animation-delay: 2.8s;
    left: -1px;
  }
  .puff.p6 {
    animation-delay: 3.5s;
    left: 5px;
  }
  /* Gentle, organic rise: drifts up while widening and thinning, with a slow sideways curl. */
  @keyframes smoke-rise {
    0% {
      opacity: 0;
      transform: translateY(2px) translateX(0) scale(0.7);
    }
    15% {
      opacity: 0.55;
    }
    45% {
      opacity: 0.4;
      transform: translateY(-30px) translateX(6px) scale(1.6);
    }
    75% {
      opacity: 0.2;
      transform: translateY(-58px) translateX(2px) scale(2.4);
    }
    100% {
      opacity: 0;
      transform: translateY(-84px) translateX(10px) scale(3.2);
    }
  }

  /* Shared positioning for every lair particle effect (placed via inline transform). */
  .lair-fx {
    position: absolute;
    left: 0;
    top: 0;
    pointer-events: none;
    width: 0;
    height: 0;
  }

  /* ── flies (wolf den — carrion buzz): tiny dark specks jittering over the den ── */
  .fly {
    position: absolute;
    font-family: 'Courier New', monospace;
    font-size: 13px;
    font-weight: bold;
    color: #14110e;
    opacity: 0.85;
    will-change: transform;
  }
  /* Each fly has its OWN erratic path + speed (no shared keyframe), so the swarm darts chaotically
     instead of tracing one synchronised criss-cross. Paths stay within ~±10px of the den. */
  .fly.f1 {
    animation: fly1 0.62s linear infinite;
  }
  .fly.f2 {
    animation: fly2 0.74s linear infinite;
  }
  .fly.f3 {
    animation: fly3 0.53s linear infinite;
  }
  .fly.f4 {
    animation: fly4 0.81s linear infinite;
  }
  .fly.f5 {
    animation: fly5 0.67s linear infinite;
  }
  .fly.f6 {
    animation: fly6 0.58s linear infinite;
  }
  @keyframes fly1 {
    0% {
      transform: translate(-8px, -3px);
    }
    30% {
      transform: translate(4px, -9px);
    }
    55% {
      transform: translate(9px, 2px);
    }
    80% {
      transform: translate(-2px, 6px);
    }
    100% {
      transform: translate(-8px, -3px);
    }
  }
  @keyframes fly2 {
    0% {
      transform: translate(6px, 4px);
    }
    28% {
      transform: translate(-5px, 8px);
    }
    52% {
      transform: translate(-9px, -2px);
    }
    78% {
      transform: translate(3px, -7px);
    }
    100% {
      transform: translate(6px, 4px);
    }
  }
  @keyframes fly3 {
    0% {
      transform: translate(0, -7px);
    }
    33% {
      transform: translate(7px, -1px);
    }
    60% {
      transform: translate(2px, 7px);
    }
    82% {
      transform: translate(-7px, 3px);
    }
    100% {
      transform: translate(0, -7px);
    }
  }
  @keyframes fly4 {
    0% {
      transform: translate(-6px, 5px);
    }
    26% {
      transform: translate(8px, 3px);
    }
    54% {
      transform: translate(5px, -6px);
    }
    80% {
      transform: translate(-9px, -4px);
    }
    100% {
      transform: translate(-6px, 5px);
    }
  }
  @keyframes fly5 {
    0% {
      transform: translate(3px, -5px);
    }
    30% {
      transform: translate(-8px, -6px);
    }
    58% {
      transform: translate(-4px, 6px);
    }
    84% {
      transform: translate(8px, 5px);
    }
    100% {
      transform: translate(3px, -5px);
    }
  }
  @keyframes fly6 {
    0% {
      transform: translate(-9px, 1px);
    }
    32% {
      transform: translate(-1px, -8px);
    }
    56% {
      transform: translate(9px, -3px);
    }
    80% {
      transform: translate(4px, 8px);
    }
    100% {
      transform: translate(-9px, 1px);
    }
  }

  /* ── bloodmist (predator den — kill ground): faint dark-crimson motes rising + fading ── */
  .bmote {
    position: absolute;
    font-family: 'Courier New', monospace;
    font-size: 18px;
    color: #8c2e28;
    opacity: 0;
    animation: bloodmist-rise 3s ease-out infinite;
    will-change: transform, opacity;
  }
  .bmote.b1 {
    animation-delay: 0s;
    left: -6px;
  }
  .bmote.b2 {
    animation-delay: 0.7s;
    left: 6px;
  }
  .bmote.b3 {
    animation-delay: 1.4s;
    left: -10px;
  }
  .bmote.b4 {
    animation-delay: 2.1s;
    left: 2px;
  }
  .bmote.b5 {
    animation-delay: 2.8s;
    left: 9px;
  }
  @keyframes bloodmist-rise {
    0% {
      opacity: 0;
      transform: translateY(4px) translateX(0) scale(0.9);
    }
    25% {
      opacity: 0.7;
    }
    60% {
      opacity: 0.5;
      transform: translateY(-34px) translateX(-10px) scale(1.8);
    }
    100% {
      opacity: 0;
      transform: translateY(-62px) translateX(-18px) scale(2.6);
    }
  }

  /* ── miasma (swamp nest — fetid gas): sickly green bubbles wobbling slowly upward ── */
  .bubble {
    position: absolute;
    font-family: 'Courier New', monospace;
    font-size: 19px;
    color: #6e9450;
    opacity: 0;
    animation: miasma-rise 4s ease-in-out infinite;
    will-change: transform, opacity;
  }
  .bubble.m1 {
    animation-delay: 0s;
    left: -8px;
  }
  .bubble.m2 {
    animation-delay: 0.8s;
    left: 8px;
  }
  .bubble.m3 {
    animation-delay: 1.5s;
    left: -3px;
  }
  .bubble.m4 {
    animation-delay: 2.2s;
    left: 12px;
  }
  .bubble.m5 {
    animation-delay: 2.9s;
    left: -12px;
  }
  .bubble.m6 {
    animation-delay: 3.5s;
    left: 4px;
  }
  @keyframes miasma-rise {
    0% {
      opacity: 0;
      transform: translateY(4px) translateX(0) scale(0.7);
    }
    25% {
      opacity: 0.78;
      transform: translateX(-8px);
    }
    60% {
      opacity: 0.55;
      transform: translateY(-34px) translateX(8px) scale(1.9);
    }
    100% {
      opacity: 0;
      transform: translateY(-66px) translateX(-6px) scale(2.7);
    }
  }

  /* ── feathers (harpy roost): pale shed feathers drifting DOWN, swaying ── */
  .feather {
    position: absolute;
    font-family: 'Courier New', monospace;
    font-size: 17px;
    font-weight: bold;
    color: #c4bcb2;
    opacity: 0;
    animation: feather-fall 4s ease-in-out infinite;
    will-change: transform, opacity;
  }
  .feather.fe1 {
    animation-delay: 0s;
    left: -12px;
  }
  .feather.fe2 {
    animation-delay: 0.9s;
    left: 8px;
  }
  .feather.fe3 {
    animation-delay: 1.7s;
    left: -4px;
  }
  .feather.fe4 {
    animation-delay: 2.5s;
    left: 13px;
  }
  .feather.fe5 {
    animation-delay: 3.3s;
    left: -8px;
  }
  @keyframes feather-fall {
    0% {
      opacity: 0;
      transform: translateY(-34px) translateX(0) rotate(-18deg);
    }
    20% {
      opacity: 0.75;
    }
    50% {
      transform: translateY(-6px) translateX(16px) rotate(20deg);
    }
    80% {
      opacity: 0.5;
    }
    100% {
      opacity: 0;
      transform: translateY(26px) translateX(-10px) rotate(-14deg);
    }
  }

  /* ── Health bar overlays ───────────────────────────────────────────────────── */

  .health-bar-float {
    position: absolute;
    left: 0;
    top: 0;
    width: 20px;
    height: 3px;
    background: rgba(32, 24, 10, 0.9);
    border: 1px solid #503020;
    pointer-events: none;
  }

  .health-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #cc3322, #ee5544);
  }

  .health-bar-fill.pawn {
    background: linear-gradient(90deg, #44aa66, #66cc88);
  }

  .health-bar-fill.mob {
    background: linear-gradient(90deg, #cc3322, #ee5544);
  }

  /* ── Floating combat text ──────────────────────────────────────────────────── */

  .combat-float {
    position: absolute;
    left: 0;
    top: 0;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    font-weight: bold;
    white-space: nowrap;
    pointer-events: none;
    text-shadow:
      0 0 3px #000,
      0 1px 2px #000;
    /* GPU-composite the rise/fade so the blurred text-shadow isn't re-rasterised
       every frame (same reasoning as .zzz-z / .spark). */
    will-change: transform, opacity;
    animation: combat-float-rise 0.9s ease-out forwards;
  }

  /* The keyframe rise stacks ON TOP of the inline translate() that positions the
     label over its tile, so the base position still tracks the camera each frame. */
  @keyframes combat-float-rise {
    0% {
      opacity: 0;
      margin-top: 2px;
    }
    15% {
      opacity: 1;
    }
    70% {
      opacity: 1;
      margin-top: -16px;
    }
    100% {
      opacity: 0;
      margin-top: -24px;
    }
  }

  .combat-float.damage {
    color: #ff6644;
  }
  .combat-float.crit {
    color: #ff3322;
    font-size: 14px;
  }
  .combat-float.miss {
    color: #bbbbbb;
    font-size: 10px;
  }
  .combat-float.dodge {
    color: #66ccee;
    font-size: 10px;
  }
  .combat-float.bleed {
    color: #cc2222;
    font-size: 10px;
  }
  .combat-float.knockdown {
    color: #ffcc44;
    font-size: 10px;
  }
</style>
