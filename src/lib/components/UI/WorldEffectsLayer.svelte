<!-- WorldEffectsLayer: sits above tiles (z-index 5) but below popup panels (z-index 10).
     All in-world animations and fullscreen shader overlays are docked here.
     To add a new effect: extend WorldEffectsState in worldEffects.ts and render it below. -->
<script lang="ts">
  import { worldEffects } from '$lib/stores/worldEffects';
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

  <!-- ── Fullscreen Weather / Shader Overlays ──────────────────────────────────── -->
  <!-- To add rain: create RainCanvas.svelte and mount it here when weather='rain'  -->
  <!-- Example:                                                                      -->
  <!--   {#if $worldEffects.weather === 'rain'}<RainCanvas />{/if}                  -->
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
</style>
