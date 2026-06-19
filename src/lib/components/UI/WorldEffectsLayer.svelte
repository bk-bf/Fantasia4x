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

  <!-- Ambient per-tile particle effects (lair smoke, …). -->
  {#each $worldEffects.particleOverlays as overlay (overlay.id)}
    {#if overlay.effect === 'smoke'}
      <div
        class="lair-smoke"
        style="transform: translate({overlay.left}px, {overlay.top}px) translateX(-50%);"
      >
        <span class="puff p1">°</span>
        <span class="puff p2">·</span>
        <span class="puff p3">°</span>
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
    font-size: 11px;
    color: #9a958c;
    opacity: 0;
    animation: smoke-rise 3.4s ease-out infinite;
    will-change: transform, opacity;
  }
  .puff.p1 {
    animation-delay: 0s;
    left: -2px;
  }
  .puff.p2 {
    animation-delay: 1.15s;
    left: 2px;
  }
  .puff.p3 {
    animation-delay: 2.3s;
    left: 0;
  }
  @keyframes smoke-rise {
    0% {
      opacity: 0;
      transform: translateY(0) translateX(0) scale(0.7);
    }
    25% {
      opacity: 0.32;
    }
    60% {
      opacity: 0.22;
      transform: translateY(-20px) translateX(4px) scale(1.15);
    }
    100% {
      opacity: 0;
      transform: translateY(-38px) translateX(8px) scale(1.6);
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
