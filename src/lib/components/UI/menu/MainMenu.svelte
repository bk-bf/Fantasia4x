<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { menuPreviewReady, gameState } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { listSaves, type SaveEntry } from '$lib/stores/saveManager';
  import { paintedSpriteCanvas } from '$lib/webgl/painted/loader';
  import { pole } from '$lib/pixelArt/cloth';
  import { pixels } from '$lib/pixelArt/pixels';
  import MenuPreviewBackdrop from '$lib/components/UI/menu/MenuPreviewBackdrop.svelte';
  import SettingsModal from '$lib/components/UI/modal/SettingsModal.svelte';
  import SaveListMenu from '$lib/components/UI/menu/SaveListMenu.svelte';
  import CreditsScroll from '$lib/components/UI/menu/CreditsScroll.svelte';
  import MenuSign from './MenuSign.svelte';
  import MenuFlag from './MenuFlag.svelte';
  import MenuSkyBowl from './MenuSkyBowl.svelte';
  import { BANNER_FONT, PIXEL_FONT, TITLE_FONT, planMenu } from './mainMenuPlan';
  import { menuAmbient } from './mainMenuAmbient';
  import { stepFocus } from './mainMenuKeys';
  import { MENU_ITEMS } from './mainMenuFlagArt';

  let saves = $state<SaveEntry[]>([]);
  let showSettings = $state(false);
  let showLoad = $state(false);
  let showCredits = $state(false);
  let fontsReady = $state(false);
  let emblems = $state<Record<string, HTMLCanvasElement | null>>({});
  let viewW = $state(0);
  let viewH = $state(0);
  const isDesktop = typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent ?? '');

  const latest = $derived(saves[0]);
  const acts: Record<string, () => void> = {
    Continue: () => latest && gameState.startGame('load', latest.id),
    'New Game': newGame,
    'Load Game': () => (showLoad = true),
    Settings: () => (showSettings = true),
    Credits: () => (showCredits = true),
    Exit: () => window.close()
  };
  const entries = MENU_ITEMS.filter((m) => isDesktop || !m.desktopOnly);
  const plan = $derived(fontsReady && viewW > 0 ? planMenu(viewW, viewH, entries.length) : null);
  const ambient = $derived(menuAmbient($gameState));
  const wind = $derived(ambient.wind);
  const poleArt = $derived(plan ? pole(plan.pole.h) : null);

  onMount(async () => {
    saves = await listSaves();
    const faces = [`48px "${TITLE_FONT}"`, `20px "${BANNER_FONT}"`, `16px "${PIXEL_FONT}"`];
    await Promise.all(faces.map((f) => document.fonts.load(f))).catch(() => undefined);
    fontsReady = true;
    const art = await Promise.all(entries.map((e) => paintedSpriteCanvas('item', e.emblem)));
    emblems = Object.fromEntries(entries.map((e, i) => [e.emblem, art[i]]));
  });

  function newGame() {
    gameState.startGame('new');
    uiState.setCustomMap(true);
  }

  async function closeLoad() {
    showLoad = false;
    saves = await listSaves();
  }

  function step(e: KeyboardEvent) {
    if (!showLoad && !showSettings && !showCredits)
      stepFocus(e, '.main-menu .flags button:enabled');
  }
</script>

<svelte:window bind:innerWidth={viewW} bind:innerHeight={viewH} onkeydown={step} />

<div class="main-menu" transition:fade={{ duration: 200 }}>
  {#if $menuPreviewReady}
    <MenuPreviewBackdrop />
  {/if}
  <div class="shade" aria-hidden="true"></div>

  <div class="stage">
    <h1 class="title">Fantasia</h1>
    {#if plan && poleArt}
      <MenuSkyBowl ambient={ambient.sky} x={plan.bowlX} scale={plan.scale} />
      <span
        class="pole"
        aria-hidden="true"
        style:left="{plan.pole.x * plan.scale}px"
        style:top="{plan.pole.y * plan.scale}px"
        style:--s={plan.scale}
        {@attach pixels(poleArt, plan.scale)}
      ></span>
      <MenuSign rect={plan.board} title={plan.title} scale={plan.scale} lamp={ambient.lamp} />
      <nav class="flags" aria-label="Main menu">
        {#each entries as entry, i (entry.label)}
          <MenuFlag
            face={{
              label: entry.label,
              note: entry.label === 'Continue' ? (latest?.meta.cultureName ?? '') : '',
              dye: entry.dye,
              emblem: emblems[entry.emblem] ?? null
            }}
            index={i}
            {wind}
            rect={plan.flags[i]}
            scale={plan.scale}
            disabled={!!entry.needsSave && !latest}
            onclick={acts[entry.label]}
          />
        {/each}
      </nav>
    {/if}
    <p class="credit-line">alpha {__APP_VERSION__} · tileset: Bitlands by DragonDePlatino</p>
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
    overflow: hidden;
  }
  .shade {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    background: linear-gradient(
      to bottom,
      rgb(8 6 10 / 0.5),
      rgb(8 6 10 / 0.16) 46%,
      rgb(8 6 10 / 0) 74%
    );
  }
  .stage {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
  }
  .title {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    margin: 0;
  }
  .pole {
    position: absolute;
    filter: url(#ambient-tint)
      drop-shadow(calc(var(--s) * 2px) calc(var(--s) * 2px) 0 rgb(6 4 3 / 0.5));
  }
  .credit-line {
    position: absolute;
    right: 14px;
    bottom: 8px;
    margin: 0;
    font: 16px/18px var(--font-pixel);
    letter-spacing: 0.6px;
    color: #ecdcb4;
    text-shadow:
      1px 0 0 #08060a,
      -1px 0 0 #08060a,
      0 1px 0 #08060a,
      0 -1px 0 #08060a,
      1px 1px 0 #08060a;
  }
</style>
