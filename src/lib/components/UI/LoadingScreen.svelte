<!--
  LoadingScreen — the single full-screen loading overlay.

  Shown by +page.svelte while `!storeReady || !rendererReady`, i.e. through the whole boot: save
  load → sim-worker warmup → WebGL init (which happens BEHIND this overlay). Replaces the two old
  inline screens ("LOADING…" in +page + "Initializing renderer…" in GameCanvas).

  The bar is indeterminate-but-smooth: it eases toward ~95% over the expected load window; the parent
  unmounts this component the instant the game is actually ready, so it never sits at a fake 100%.
  Phase text comes from the `loadingStatus` store, updated through the boot in stores/gameState.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { fade } from 'svelte/transition';
  import {
    loadingStatus,
    storeReady,
    rendererReady,
    WORKER_WARMUP_MS
  } from '$lib/stores/gameState';

  const progress = tweened(0, { duration: 400, easing: cubicOut });

  onMount(() => {
    // Pace the fill to the warmup window (the dominant boot phase) so the bar is ~full right as the
    // worker finishes warming. WORKER_WARMUP_MS is the single knob for both the warmup and this.
    progress.set(0.95, { duration: WORKER_WARMUP_MS, easing: cubicOut });
  });

  // Top the bar off to 100% the instant the game is actually ready — this is the same condition
  // +page uses to remove the overlay, so the bar reaches the end EXACTLY as the screen drops
  // (no popping at a partial fill).
  $effect(() => {
    if ($storeReady && $rendererReady) progress.set(1, { duration: 200 });
  });
</script>

<div class="loading-screen" out:fade={{ duration: 250 }}>
  <div class="box">
    <div class="title">FANTASIA</div>
    <div class="bar" role="progressbar" aria-valuenow={Math.round($progress * 100)}>
      <div class="fill" style:width="{$progress * 100}%"></div>
    </div>
    <div class="status">{$loadingStatus}</div>
  </div>
</div>

<style>
  .loading-screen {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: var(--bg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Courier New', monospace;
  }
  .box {
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: min(360px, 70vw);
    align-items: center;
  }
  .title {
    color: var(--accent-hi);
    font-size: 18px;
    letter-spacing: 0.5em;
    text-indent: 0.5em; /* balance the trailing letter-spacing */
  }
  .bar {
    width: 100%;
    height: 4px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--accent-hi);
    transition: none; /* width is driven by the tweened store, not CSS */
  }
  .status {
    color: var(--text-muted, #555);
    font-size: 12px;
    letter-spacing: 0.15em;
    min-height: 1em;
  }
</style>
