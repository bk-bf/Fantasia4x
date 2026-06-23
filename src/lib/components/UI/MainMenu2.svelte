<!--
  MainMenu2 — EXPERIMENTAL alternate title screen, gated behind the build flag VITE_MM2 (launch via
  `./launch.sh --electron --play --mm2`). +page.svelte renders this instead of MainMenu when the flag
  is set. Same behaviour/affordances as MainMenu (New / Load / Settings / Exit, live world backdrop) —
  only the LAYOUT differs:
    • a huge engraved-serif FANTASIA wordmark (Cinzel, --font-display) in the upper-left corner,
    • the slogan + version/credit left-aligned beneath it at a proportionally larger size,
    • the four menu entries stacked down the left border.
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
  const isDesktop = typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent ?? '');

  onMount(async () => {
    canLoad = await hasSave();
  });

  function newGame() {
    gameState.startGame('new');
    uiState.setCustomMap(true);
  }

  function exitGame() {
    window.close();
  }

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

  <!-- Warm "reverse shadow" glow radiating from the upper-left logo out into the map (matches the
       original menu's ward-glow, repositioned to the corner the wordmark now lives in). -->
  <div class="glow" aria-hidden="true"></div>

  <div class="content">
    <h1 class="title">FANTASIA</h1>
    <div class="subtitle">a 4X colony chronicle</div>
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
    font-family: var(--font-mono);
    overflow: hidden;
  }

  /* Warm ward-glow bleeding from the upper-left (the logo) into the map — a soft "reverse shadow". Sits
     above the backdrop (DOM order) but below .content (z-index 1), so the text stays crisp over it. */
  .glow {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(
      circle at 24% 17%,
      rgba(240, 136, 40, 0.1) 0%,
      rgba(240, 136, 40, 0.035) 24%,
      transparent 52%
    );
  }

  /* Everything hugs the upper-left: huge wordmark in the corner, text + buttons left-aligned beneath. */
  .content {
    position: absolute;
    top: 5vh;
    left: 3.5vw;
    z-index: 1; /* above the live map backdrop (z-index 0) */
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75em; /* roomier spacing between the wordmark, slogan and credit lines */
    max-width: 94vw;
  }

  /* Huge engraved-serif wordmark (Cinzel) — ~1/5 of the viewport tall — in the upper-left corner. */
  .title {
    font-family: var(--font-display);
    color: var(--accent-hi);
    font-size: clamp(56px, 13vw, 200px);
    line-height: 0.92;
    font-weight: 700;
    letter-spacing: 0.04em;
    margin: 0;
    /* Warm glow + a soft dark drop-shadow underneath so the wordmark lifts off the busy map. */
    text-shadow:
      0 0 28px rgba(240, 136, 40, 0.35),
      0 6px 16px rgba(0, 0, 0, 0.75);
  }

  .subtitle {
    color: var(--text);
    font-family: var(--font-display); /* same engraved serif as the FANTASIA wordmark */
    font-size: clamp(18px, 2vw, 30px);
    letter-spacing: 0.1em;
    /* Dark drop-shadow underneath plus a tight halo for legibility over the map. */
    text-shadow:
      0 3px 8px rgba(0, 0, 0, 0.8),
      0 1px 2px rgba(0, 0, 0, 0.95),
      0 0 6px rgba(0, 0, 0, 0.9);
  }

  /* Version + tileset credit, in the cursive script (kept) — kept small, a disclaimer never the slogan. */
  .credit-line {
    font-family: var(--font-script);
    font-weight: 600;
    color: var(--text);
    font-size: clamp(13px, 1.15vw, 17px);
    letter-spacing: 0.04em;
    text-shadow:
      0 1px 2px rgba(0, 0, 0, 0.95),
      0 0 6px rgba(0, 0, 0, 0.9),
      0 0 12px rgba(0, 0, 0, 0.7);
  }

  .menu {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    margin-top: 7vh; /* dropped further below the credit line */
    /* Day/night + weather/season hue, exactly like the in-game side panels (see +page.svelte). */
    filter: url(#ambient-tint);
  }

  .menu-btn {
    min-width: 320px;
    padding: 13px 22px;
    text-align: left;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 16px;
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
