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
  import { getTimeOfDay } from '$lib/game/services/EnvironmentService';
  import MenuPreviewBackdrop from '$lib/components/UI/MenuPreviewBackdrop.svelte';
  import SettingsModal from '$lib/components/UI/SettingsModal.svelte';
  import SaveListMenu from '$lib/components/UI/SaveListMenu.svelte';

  let canLoad = $state(false);
  let showSettings = $state(false);
  let showLoad = $state(false);
  const isDesktop = typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent ?? '');

  // ── Sun/moon glow tracking the preview world's day/night cycle ──────────────────────────────────
  // The warm "sun" glow rises at dawn on the left, arcs up to a noon peak, and sets on the right; then a
  // cooler/whiter "moon" glow rises on the left at dusk, tracks low along the top border, and sets on the
  // right by dawn. Positions/opacities are derived from `getTimeOfDay` (the same clock that lights the
  // scene), so the glow stays in lock-step with the backdrop's day/night.
  const DAWN = 0.25; // timeOfDay: sun up
  const DUSK = 0.78; // timeOfDay: sun down
  const NIGHT_LEN = 1 - DUSK + DAWN; // wraps midnight
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  // Fade an arc's opacity in over its first 12% and out over its last 12%, so rise/set are smooth.
  const edgeFade = (prog: number) => clamp01(Math.min(prog, 1 - prog) / 0.12);

  const tod = $derived(getTimeOfDay($gameState?.turn ?? 0));
  const isDay = $derived(tod >= DAWN && tod <= DUSK);
  const sunProg = $derived(clamp01((tod - DAWN) / (DUSK - DAWN)));
  const moonProg = $derived(clamp01(((((tod - DUSK) % 1) + 1) % 1) / NIGHT_LEN));
  // Sun: x left→right, y arcs high at noon (lower % = higher on screen). Moon: x left→right, low along top.
  const sunX = $derived(8 + sunProg * 84);
  const sunY = $derived(38 - Math.sin(sunProg * Math.PI) * 24);
  const sunO = $derived(isDay ? edgeFade(sunProg) : 0);
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
  <!-- Live atmospheric world behind the menu — mounts once the preview worker is ticking. -->
  {#if $menuPreviewReady}
    <MenuPreviewBackdrop />
  {/if}

  <!-- Day/night "reverse shadow" glows radiating into the map: a warm sun arcing across by day, a cool
       moon tracking the top border by night (positions/opacity driven by the preview time-of-day). -->
  <div class="sun-glow" aria-hidden="true" style="left:{sunX}%; top:{sunY}%; opacity:{sunO};"></div>
  <div class="moon-glow" aria-hidden="true" style="left:{moonX}%; top:{moonY}%; opacity:{moonO};"></div>

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

  /* Sun/moon ward-glows bleeding into the map — soft "reverse shadows" tracking the day/night cycle.
     left/top/opacity are set inline from the time-of-day; the short transition smooths the ~15Hz steps.
     Both sit above the backdrop (DOM order) but below .content (z-index 1), so the text stays crisp. */
  .sun-glow,
  .moon-glow {
    position: absolute;
    width: 80vmin;
    height: 80vmin;
    transform: translate(-50%, -50%); /* left/top position the CENTRE */
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
  /* Moon: colder, lighter, whiter than the sun. */
  .moon-glow {
    background: radial-gradient(
      circle,
      rgba(206, 222, 255, 0.12) 0%,
      rgba(206, 222, 255, 0.04) 34%,
      transparent 64%
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
    /* Day/night + weather/season hue, exactly like the in-game info panel (see +page.svelte). */
    filter: url(#ambient-tint);
  }

  /* Colours copied verbatim from the in-game info panel (SelectedEntityCard) so the buttons read — and
     day/night-tint — identically to it: warm panel fill + bronze border, gold-on-hover. */
  .menu-btn {
    min-width: 320px;
    padding: 13px 22px;
    text-align: left;
    background: rgba(28, 16, 6, 0.92);
    border: 1px solid #6b4a2a;
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
