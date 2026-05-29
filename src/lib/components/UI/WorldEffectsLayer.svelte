<!-- WorldEffectsLayer: sits above tiles (z-index 5) but below popup panels (z-index 10).
     All in-world animations and fullscreen shader overlays are docked here.
     To add a new effect: extend WorldEffectsState in worldEffects.ts and render it below. -->
<script lang="ts">
  import { worldEffects } from '$lib/stores/worldEffects';
</script>

<div class="world-effects-layer">
  <!-- ── World-Space Animations (positions derived from tile coordinates) ──────── -->

  {#each $worldEffects.sleepingOverlays as overlay (overlay.id)}
    <div class="zzz-float" style="left:{overlay.left}px;top:{overlay.top}px;">
      <span class="zzz-z" style="animation-delay:0s">Z</span><span
        class="zzz-z"
        style="animation-delay:0.7s">z</span
      ><span class="zzz-z" style="animation-delay:1.4s">z</span>
    </div>
  {/each}

  {#each $worldEffects.progressOverlays as overlay (overlay.id)}
    <div class="pawn-progress-float" style="left:{overlay.left}px;top:{overlay.top}px;">
      <div class="pawn-progress-fill" style="width:{overlay.progress * 100}%"></div>
    </div>
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
    width: 22px;
    height: 4px;
    margin-left: -11px;
    background: rgba(32, 24, 10, 0.85);
    border: 1px solid #705020;
    pointer-events: none;
  }

  .pawn-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #4ab85a, #8ad66a);
  }

  /* ── Zzz sleeping animation ──────────────────────────────────────────────────── */

  .zzz-float {
    position: absolute;
    pointer-events: none;
    display: flex;
    gap: 1px;
    transform: translateX(-50%);
  }

  .zzz-z {
    color: #7788ff;
    font-family: 'Courier New', monospace;
    font-size: 8px;
    font-weight: bold;
    opacity: 0;
    animation: zzz-rise 2.1s ease-out infinite;
    text-shadow: 0 0 4px #334;
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
</style>
