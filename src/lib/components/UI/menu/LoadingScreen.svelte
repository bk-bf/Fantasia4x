<script lang="ts">
  import { fade } from 'svelte/transition';
  import { onMount } from 'svelte';
  import { pixels } from '$lib/pixelArt/pixels';
  import { loadingStatus } from '$lib/stores/gameState';
  import { uiTheme } from '$lib/stores/uiPrefs';
  import LoadingSandglass from './LoadingSandglass.svelte';
  import LoadingWall from './LoadingWall.svelte';
  import { loadingBoard } from './loadingArt';

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

  let width = $state(0);
  let height = $state(0);
  let boardW = $state(0);
  let boardH = $state(0);
  const board = $derived({
    x: Math.round((width - boardW) / 2),
    y: Math.round((height - boardH) / 2),
    w: boardW,
    h: boardH
  });
  const boardArt = $derived(boardW && boardH ? loadingBoard($uiTheme, boardW, boardH) : null);

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

<svelte:window bind:innerWidth={width} bind:innerHeight={height} />

<div class="loading-screen" data-skin={$uiTheme} out:fade={{ duration: 250 }}>
  {#if boardArt}
    <LoadingWall theme={$uiTheme} {width} {height} {board} />
  {/if}
  <section class="board" bind:offsetWidth={boardW} bind:offsetHeight={boardH}>
    {#if boardArt}
      <span class="board-art" aria-hidden="true" {@attach pixels(boardArt, 1)}></span>
    {/if}
    <h1 class="title">Fantasia</h1>
    <LoadingSandglass kind={$uiTheme} />
    <p class="status" class:ready={$loadingStatus === 'Ready'} role="status">{$loadingStatus}</p>
    <div class="tip">
      <p class:fading aria-live="polite">{tip}</p>
    </div>
  </section>
</div>

<style>
  .loading-screen {
    position: fixed;
    inset: 0;
    z-index: 1000;
    overflow: hidden;
    background: var(--bg);
    display: grid;
    place-items: center;
    font: 18px/20px var(--font-pixel);
    letter-spacing: 0.6px;
    color: var(--text);
    --hot: var(--accent-hi);
  }
  .board {
    position: relative;
    isolation: isolate;
    width: min(460px, calc(100vw - 32px));
    padding: 26px 30px 30px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
  .board-art {
    position: absolute;
    left: 0;
    top: 0;
    z-index: -1;
  }
  .title {
    margin: 0.67em 0;
    font: 52px/44px 'Fantasia Banner', var(--font-display);
    letter-spacing: 3px;
    text-transform: uppercase;
    color: #ffc466;
  }
  .status {
    margin: 0;
    min-height: 20px;
    color: var(--text-dim);
  }
  .status.ready {
    color: var(--hot);
  }
  .tip {
    align-self: stretch;
    min-height: 76px;
    padding: 4px 16px 0;
    display: grid;
    place-items: center;
    border-top: 1px solid color-mix(in srgb, var(--text-dim) 30%, transparent);
  }
  .tip p {
    margin: 0;
    text-align: center;
    color: var(--text-dim);
    transition: opacity 0.26s;
  }
  .tip p.fading {
    opacity: 0;
  }
  [data-skin='timber'] {
    text-shadow: 1px 1px 0 #0b0806;
  }
  [data-skin='timber'] .title {
    text-shadow:
      0 0 14px rgb(255 160 60 / 0.55),
      2px 2px 0 #0b0806;
  }
  [data-skin='timber'] .board-art {
    filter: drop-shadow(0 4px 0 #24170d) drop-shadow(3px 0 0 #160e08);
  }
  [data-skin='vellum'] {
    --hot: var(--accent);
  }
  [data-skin='vellum'] .title {
    font: 60px/50px 'Fantasia Blackletter', var(--font-display);
    text-transform: none;
    letter-spacing: 0;
    color: var(--text);
  }
  [data-skin='vellum'] .title::first-letter {
    color: var(--hot);
  }
  [data-skin='vellum'] .board-art {
    filter: drop-shadow(5px 7px 0 rgb(4 3 2 / 0.55));
  }
  [data-skin='vellum'] .tip p {
    color: var(--text);
  }
  @media (prefers-reduced-motion: reduce) {
    .tip p {
      transition: none;
    }
  }
</style>
