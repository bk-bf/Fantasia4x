<!--
  MainMenu — the title screen shown while `appPhase === 'menu'` (+page.svelte), before the sim boots.

  Centred FANTASIA wordmark (matching LoadingScreen's tokens) over a faint ward-glow, with the four
  classic entries. The heavy sim boot is HELD by gameState's boot gate until New/Load is chosen, so
  this screen is instant and the worker/WebGL only spin up on a choice:
    • New Game  → fresh colony + opens the Custom Map popup so the player can shape the world first.
    • Load Game → resumes the persisted save (disabled when none exists).
    • Settings  → inline panel (debug mode, cinematic layout).
    • Exit      → quits the desktop window (no-op in a browser tab).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { gameState, menuPreviewReady } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { hasSave } from '$lib/stores/saveManager';
  import { debugMode, hideSidebars } from '$lib/stores/uiPrefs';
  import MenuPreviewBackdrop from '$lib/components/UI/MenuPreviewBackdrop.svelte';

  let canLoad = $state(false);
  let showSettings = $state(false);
  // Exit is only meaningful in the desktop shell; window.close() is a no-op in a normal browser tab.
  const isDesktop = typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent ?? '');

  onMount(async () => {
    canLoad = await hasSave();
  });

  function newGame() {
    gameState.startGame('new');
    // Open the Custom Map popup over the freshly-generated world so the first thing the player does
    // is shape the terrain. It renders once the game-container mounts (storeReady).
    uiState.setCustomMap(true);
  }

  function loadGame() {
    if (!canLoad) return;
    gameState.startGame('load');
  }

  function exitGame() {
    window.close();
  }
</script>

<div class="main-menu" transition:fade={{ duration: 200 }}>
  <!-- Live atmospheric world behind the menu — mounts once the preview worker is ticking. -->
  {#if $menuPreviewReady}
    <MenuPreviewBackdrop />
  {/if}

  <div class="glow" aria-hidden="true"></div>

  <div class="content">
    <h1 class="title">FANTASIA</h1>
    <div class="subtitle">— a 4X colony chronicle —</div>

    {#if showSettings}
      <div class="panel" role="menu" tabindex="-1">
        <label class="row">
          <input type="checkbox" checked={$debugMode} onchange={debugMode.toggle} />
          <span>Debug mode</span>
        </label>
        <label class="row">
          <input type="checkbox" checked={$hideSidebars} onchange={hideSidebars.toggle} />
          <span>Cinematic layout</span>
        </label>
        <button class="menu-btn back" onclick={() => (showSettings = false)}>Back</button>
      </div>
    {:else}
      <nav class="menu">
        <button class="menu-btn" onclick={newGame}>New Game</button>
        <button class="menu-btn" class:disabled={!canLoad} disabled={!canLoad} onclick={loadGame}>
          Load Game
        </button>
        <button class="menu-btn" onclick={() => (showSettings = true)}>Settings</button>
        {#if isDesktop}
          <button class="menu-btn" onclick={exitGame}>Exit</button>
        {/if}
      </nav>
    {/if}
  </div>
</div>

<style>
  .main-menu {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: var(--bg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Courier New', monospace;
    overflow: hidden;
  }

  /* Faint warm ward-glow behind the wordmark — the only flourish, keeps it on-theme. */
  .glow {
    position: absolute;
    width: 70vmin;
    height: 70vmin;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(240, 136, 40, 0.12) 0%, transparent 70%);
    filter: blur(8px);
    pointer-events: none;
  }

  .content {
    position: relative;
    z-index: 1; /* above the live map backdrop (z-index 0) */
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    width: min(360px, 80vw);
  }

  /* Faint dark scrim hugging the wordmark + menu so the text stays legible over a vivid, busy map,
     without dimming the rest of the scene (near-full vividness). */
  .content::before {
    content: '';
    position: absolute;
    inset: -48px -80px;
    z-index: -1;
    background: radial-gradient(
      ellipse at center,
      rgba(6, 4, 2, 0.72) 0%,
      rgba(6, 4, 2, 0.45) 45%,
      transparent 80%
    );
    pointer-events: none;
  }

  .title {
    color: var(--accent-hi);
    font-size: 42px;
    font-weight: 700;
    letter-spacing: 0.5em;
    text-indent: 0.5em;
    margin: 0;
    text-shadow: 0 0 18px rgba(240, 136, 40, 0.35);
  }

  .subtitle {
    color: var(--text);
    font-size: 12px;
    letter-spacing: 0.2em;
    margin-bottom: 26px;
    /* Sits in the faded edge of the scrim, so carry its own dark backing — a tight drop shadow plus a
       soft black halo — to stay legible over the colourful, busy map. */
    text-shadow:
      0 1px 2px rgba(0, 0, 0, 0.95),
      0 0 6px rgba(0, 0, 0, 0.9),
      0 0 14px rgba(0, 0, 0, 0.75);
  }

  .menu,
  .panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    /* Day/night + weather/season hue, exactly like the in-game side panels: the same live
       #ambient-tint feColorMatrix (driven off the preview world's turn + weather in +page.svelte)
       multiplies the buttons' RGB so they shift warm at dawn/dusk, cool at night, with the scene. */
    filter: url(#ambient-tint);
  }

  .menu-btn {
    width: 100%;
    padding: 11px 0;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    color: var(--text);
    font-family: 'Courier New', monospace;
    font-size: 14px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    cursor: pointer;
    transition:
      background 0.12s,
      color 0.12s,
      border-color 0.12s;
  }
  .menu-btn:hover:not(.disabled) {
    background: var(--bg-hover);
    color: var(--accent-hi);
    border-color: var(--border-hi);
  }
  .menu-btn:active:not(.disabled) {
    background: var(--bg-active);
  }
  .menu-btn.disabled {
    color: var(--text-muted);
    cursor: not-allowed;
    opacity: 0.5;
  }

  .panel .row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 4px;
    color: var(--text);
    font-size: 13px;
    letter-spacing: 0.08em;
    cursor: pointer;
  }
  .panel .row input {
    accent-color: var(--accent);
  }
  .menu-btn.back {
    margin-top: 6px;
    font-size: 12px;
  }
</style>
