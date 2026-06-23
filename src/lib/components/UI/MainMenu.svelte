<!--
  MainMenu — the title screen shown while `appPhase === 'menu'` (+page.svelte), before the sim boots.

  Centred FANTASIA wordmark (matching LoadingScreen's tokens) over a faint ward-glow, with the four
  classic entries. The heavy sim boot is HELD by gameState's boot gate until New/Load is chosen, so
  this screen is instant and the worker/WebGL only spin up on a choice:
    • New Game  → starts a fresh colony immediately (then the Custom Map popup) — no slot to pick.
    • Load Game → opens the save list (SaveListMenu); disabled when there are no saves.
    • Settings  → opens the shared SettingsModal popup (graphics / gameplay / advanced toggles).
    • Exit      → quits the desktop window (no-op in a browser tab).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { menuPreviewReady, gameState } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { hasSave } from '$lib/stores/saveManager';
  import MenuPreviewBackdrop from '$lib/components/UI/MenuPreviewBackdrop.svelte';
  import SettingsModal from '$lib/components/UI/SettingsModal.svelte';
  import SaveListMenu from '$lib/components/UI/SaveListMenu.svelte';

  let canLoad = $state(false);
  let showSettings = $state(false);
  let showLoad = $state(false);
  // Exit is only meaningful in the desktop shell; window.close() is a no-op in a normal browser tab.
  const isDesktop = typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent ?? '');

  onMount(async () => {
    canLoad = await hasSave();
  });

  // New Game boots a fresh colony directly (no slot picker now that saves are an open list) and opens the
  // Custom Map popup over the freshly-generated world, exactly as before.
  function newGame() {
    gameState.startGame('new');
    uiState.setCustomMap(true);
  }

  function exitGame() {
    window.close();
  }

  // The load list lets you delete snapshots (its ✕). Re-check on close so the Load Game button goes
  // disabled/transparent again the moment the last snapshot is gone — `canLoad` is otherwise only
  // sampled once at mount and would stay clickable over an empty list.
  async function closeLoad() {
    showLoad = false;
    canLoad = await hasSave();
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
    <div class="credit-line">alpha 0.1.0 · tileset: Bitlands by DragonDePlatino</div>

    <nav class="menu">
      <button class="menu-btn" onclick={newGame}>New Game</button>
      <button
        class="menu-btn"
        class:disabled={!canLoad}
        disabled={!canLoad}
        onclick={() => (showLoad = true)}
      >
        Load Game
      </button>
      <button class="menu-btn" onclick={() => (showSettings = true)}>Settings</button>
      {#if isDesktop}
        <button class="menu-btn" onclick={exitGame}>Exit</button>
      {/if}
    </nav>
  </div>
</div>

{#if showLoad}
  <SaveListMenu onClose={closeLoad} />
{/if}

{#if showSettings}
  <SettingsModal onClose={() => (showSettings = false)} />
{/if}

<style>
  .main-menu {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: var(--bg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono);
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
    margin-bottom: 4px;
    /* Sits in the faded edge of the scrim, so carry its own dark backing — a tight drop shadow plus a
       soft black halo — to stay legible over the colourful, busy map. */
    text-shadow:
      0 1px 2px rgba(0, 0, 0, 0.95),
      0 0 6px rgba(0, 0, 0, 0.9),
      0 0 14px rgba(0, 0, 0, 0.75);
  }

  /* Third sub-header under the subtitle: version + tileset credit, in a cursive script to set it apart
     from the terminal wordmark while echoing the subtitle's muted, dark-backed treatment. */
  .credit-line {
    font-family: var(--font-script);
    font-weight: 600; /* matches the bundled Dancing Script weight (app.css @font-face) */
    color: var(--text);
    /* Kept below the 12px subtitle — a disclaimer line should never read larger than the slogan. */
    font-size: 11px;
    letter-spacing: 0.04em;
    margin-bottom: 24px;
    text-shadow:
      0 1px 2px rgba(0, 0, 0, 0.95),
      0 0 6px rgba(0, 0, 0, 0.9),
      0 0 12px rgba(0, 0, 0, 0.7);
  }

  .menu {
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
    font-family: var(--font-mono);
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
    opacity: 0.5;
  }
</style>
