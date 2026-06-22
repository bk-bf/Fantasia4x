<!--
  LoadingScreen — the single full-screen loading overlay.

  Shown by +page.svelte while `!bootReveal`, i.e. through the whole boot: save load → WebGL init
  (which happens BEHIND this overlay, once storeReady mounts the game-container) → a paused warmup
  linger that hides the worker-boot/WebGL-init GC.

  Indeterminate circular spinner — the boot is brief and not linear (it doesn't pass through fixed
  phases on the menu→game path), so a determinate bar misrepresented progress. The parent unmounts
  this the instant `bootReveal` fires. Phase text (when present) comes from the `loadingStatus` store.
-->
<script lang="ts">
  import { fade } from 'svelte/transition';
  import { loadingStatus } from '$lib/stores/gameState';
</script>

<div class="loading-screen" out:fade={{ duration: 250 }}>
  <div class="box">
    <div class="title">FANTASIA</div>
    <div class="spinner" role="status" aria-label="Loading"></div>
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
    font-family: var(--font-mono);
  }
  .box {
    display: flex;
    flex-direction: column;
    gap: 18px;
    align-items: center;
  }
  .title {
    color: var(--accent-hi);
    font-size: 18px;
    letter-spacing: 0.5em;
    text-indent: 0.5em; /* balance the trailing letter-spacing */
  }
  .spinner {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 3px solid var(--border);
    border-top-color: var(--accent-hi);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .status {
    color: var(--text-muted, #555);
    font-size: 12px;
    letter-spacing: 0.15em;
    min-height: 1em;
  }
  /* Respect reduced-motion: pause the rotation, keep the ring visible as a static indicator. */
  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation: none;
    }
  }
</style>
