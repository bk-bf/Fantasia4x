<script lang="ts">
  import { fade } from 'svelte/transition';
  import { onMount } from 'svelte';
  import { loadingStatus } from '$lib/stores/gameState';

  const TIPS = [
    'A colonist who collapses is down, not dead — send a caretaker before the bleeding wins.',
    'Wounds bleed by the second. Tend them and a small ✚ marks the mend.',
    'Stone tools come first. Flint is the scarce gate to everything sharper.',
    'Light shapes labour — raise a campfire before dusk or work crawls in the dark.',
    'Every pawn drops a task to eat or sleep once a need turns dire.',
    'Rain soaks the unsheltered; a roof and a fire dry them faster than the wind.',
    'Winter drains the colour from the world — and warmth becomes a daily worry.',
    'Mountains hoard ore, rivers carry fish, and a swamp rots what you store in it.',
    'Click any resource in the sidebar to leap the camera straight to a stack of it.',
    'No number changes without a reason — every result remembers its sources.',
    'A felled beast is meat, hide, and bone, if a butcher reaches it before the rot.',
    'Hunger, cold, and exhaustion stack. A tired, freezing pawn is a slow one.',
    'Idle hands drift to the nearest useful task — set priorities to bend the colony.',
    'Build a workbench before you dream of fine goods; crude comes before clever.'
  ];

  let order = TIPS.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  let cursor = $state(0);
  let tip = $state(TIPS[order[0]]);
  let fading = $state(false);

  onMount(() => {
    const id = setInterval(() => {
      fading = true;
      setTimeout(() => {
        cursor = (cursor + 1) % order.length;
        tip = TIPS[order[cursor]];
        fading = false;
      }, 260);
    }, 4200);
    return () => clearInterval(id);
  });
</script>

<div class="loading-screen" out:fade={{ duration: 250 }}>
  <div class="box">
    <div class="title">FANTASIA</div>
    <div class="bar" role="status" aria-label="Loading"><div class="fill"></div></div>
    <div class="status">{$loadingStatus}</div>
    <div class="tip" class:fading aria-live="polite">{tip}</div>
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
    gap: 16px;
    align-items: center;
    width: min(440px, 80vw);
  }
  .title {
    color: var(--accent-hi);
    font-size: 19px;
    letter-spacing: 0.5em;
    text-indent: 0.5em;
  }
  .bar {
    position: relative;
    width: 260px;
    height: 6px;
    overflow: hidden;
    background: var(--bg-panel);
    border: 1px solid var(--border);
  }
  .fill {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 35%;
    background: var(--accent-hi);
    animation: bar-slide 1s linear infinite;
  }
  @keyframes bar-slide {
    from {
      transform: translateX(-110%);
    }
    to {
      transform: translateX(390%);
    }
  }
  .status {
    color: var(--text-muted, #555);
    font-size: 13px;
    letter-spacing: 0.15em;
    min-height: 1em;
  }
  .tip {
    color: var(--text-dim);
    font-size: 13px;
    font-style: italic;
    line-height: 1.5;
    letter-spacing: 0.02em;
    text-align: center;
    min-height: 2.4em;
    max-width: 38ch;
    opacity: 0.85;
    transition: opacity 0.26s ease;
  }
  .tip.fading {
    opacity: 0;
  }
  @media (prefers-reduced-motion: reduce) {
    .fill {
      animation: none;
      width: 100%;
      opacity: 0.5;
    }
    .tip {
      transition: none;
    }
  }
</style>
