<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { menuPreviewReady, gameState } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { hasSave } from '$lib/stores/saveManager';
  import { getTimeOfDay, weatherOverlayKind } from '$lib/game/services/EnvironmentService';
  import MenuPreviewBackdrop from '$lib/components/UI/menu/MenuPreviewBackdrop.svelte';
  import SettingsModal from '$lib/components/UI/modal/SettingsModal.svelte';
  import SaveListMenu from '$lib/components/UI/menu/SaveListMenu.svelte';
  import CreditsScroll from '$lib/components/UI/menu/CreditsScroll.svelte';

  let canLoad = $state(false);
  let showSettings = $state(false);
  let showLoad = $state(false);
  let showCredits = $state(false);
  const isDesktop = typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent ?? '');

  const DAWN = 0.25;
  const DUSK = 0.78;
  const NIGHT_LEN = 1 - DUSK + DAWN;
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const edgeFade = (prog: number) => clamp01(Math.min(prog, 1 - prog) / 0.12);

  const tod = $derived(getTimeOfDay($gameState?.turn ?? 0));
  const isDay = $derived(tod >= DAWN && tod <= DUSK);
  const sunProg = $derived(clamp01((tod - DAWN) / (DUSK - DAWN)));
  const moonProg = $derived(clamp01(((((tod - DUSK) % 1) + 1) % 1) / NIGHT_LEN));
  const isRaining = $derived(weatherOverlayKind($gameState?.weather?.type) === 'rain');
  const sunX = $derived(8 + sunProg * 84);
  const sunY = $derived(38 - Math.sin(sunProg * Math.PI) * 24);
  const sunO = $derived(isDay && !isRaining ? edgeFade(sunProg) : 0);
  const moonX = $derived(8 + moonProg * 84);
  const moonY = $derived(12 - Math.sin(moonProg * Math.PI) * 4);
  const moonO = $derived(!isDay ? edgeFade(moonProg) : 0);

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
  {#if $menuPreviewReady}
    <MenuPreviewBackdrop />
  {/if}

  <div class="sun-glow" aria-hidden="true" style="left:{sunX}%; top:{sunY}%; opacity:{sunO};"></div>
  <div
    class="moon-glow"
    aria-hidden="true"
    style="left:{moonX}%; top:{moonY}%; opacity:{moonO};"
  ></div>

  <div class="content">
    <h1 class="title">FANTASIA</h1>
    <div class="subtitle">a 4X colony chronicle</div>
    <div class="credit-line">alpha {__APP_VERSION__} · tileset: Bitlands by DragonDePlatino</div>

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
      <button class="menu-btn" onclick={() => (showCredits = true)}>Credits</button>
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

{#if showCredits}
  <CreditsScroll onClose={() => (showCredits = false)} />
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

  .sun-glow,
  .moon-glow {
    position: absolute;
    width: 80vmin;
    height: 80vmin;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    pointer-events: none;
    transition:
      left 0.4s linear,
      top 0.4s linear,
      opacity 0.8s linear;
  }
  .sun-glow {
    background: radial-gradient(
      circle,
      rgba(240, 136, 40, 0.12) 0%,
      rgba(240, 136, 40, 0.04) 34%,
      transparent 64%
    );
  }
  .moon-glow {
    background: radial-gradient(
      circle,
      rgba(206, 222, 255, 0.12) 0%,
      rgba(206, 222, 255, 0.04) 34%,
      transparent 64%
    );
  }

  .content {
    position: absolute;
    top: 5vh;
    left: 3.5vw;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75em;
    max-width: 94vw;
  }

  .title {
    font-family: var(--font-display);
    color: var(--accent-hi);
    font-size: clamp(56px, 13vw, 200px);
    line-height: 0.92;
    font-weight: 700;
    letter-spacing: 0.04em;
    margin: 0;
    text-shadow:
      0 0 28px rgba(240, 136, 40, 0.35),
      0 6px 16px rgba(0, 0, 0, 0.75);
  }

  .subtitle {
    color: var(--text);
    font-family: var(--font-display);
    font-size: clamp(18px, 2vw, 30px);
    letter-spacing: 0.1em;
    text-shadow:
      -1px -1px 0 rgba(0, 0, 0, 0.95),
      1px -1px 0 rgba(0, 0, 0, 0.95),
      -1px 1px 0 rgba(0, 0, 0, 0.95),
      1px 1px 0 rgba(0, 0, 0, 0.95);
  }

  .credit-line {
    font-family: var(--font-script);
    font-weight: 600;
    color: var(--text);
    font-size: clamp(13px, 1.15vw, 17px);
    letter-spacing: 0.04em;
    text-shadow:
      -1px -1px 0 rgba(0, 0, 0, 0.95),
      1px -1px 0 rgba(0, 0, 0, 0.95),
      -1px 1px 0 rgba(0, 0, 0, 0.95),
      1px 1px 0 rgba(0, 0, 0, 0.95);
  }

  .menu {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    margin-top: 7vh;
    filter: url(#ambient-tint);
  }

  .menu-btn {
    min-width: 320px;
    padding: 13px 22px;
    text-align: left;
    background: rgba(28, 16, 6, 0.92);
    border: 1px solid #6b4a2a;
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 17px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    cursor: pointer;
    transition:
      background 0.12s,
      color 0.12s,
      border-color 0.12s;
  }
  .menu-btn:hover:not(.disabled) {
    background: #2a1a0a;
    color: var(--accent-hi);
    border-color: #c8a060;
  }
  .menu-btn:active:not(.disabled) {
    background: #4a2010;
  }
  .menu-btn.disabled {
    color: var(--text-muted);
    opacity: 0.5;
  }
</style>
