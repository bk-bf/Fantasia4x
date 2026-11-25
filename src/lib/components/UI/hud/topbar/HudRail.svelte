<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { gameState, currentTurn } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { renderFps } from '$lib/stores/perfStats';
  import { showFps, showTps, resourcesHidden, chronicleHidden } from '$lib/stores/uiPrefs';
  import { chrome } from '$lib/pixelArt/chrome';
  import ChromeButton from '$lib/components/UI/widget/ChromeButton.svelte';
  import PanelTitle from '$lib/components/UI/widget/PanelTitle.svelte';
  import RailSpeeds from './RailSpeeds.svelte';
  import RailWeather from './RailWeather.svelte';
  import { turnToGameDate } from './gameDate';
  import { startGameLoop } from './gameLoop';

  let { mapGen = false }: { mapGen?: boolean } = $props();

  let tps = $state(0);
  onMount(() => (browser ? startGameLoop((v) => (tps = v)) : undefined));

  const date = $derived(turnToGameDate($currentTurn));
  const souls = $derived($gameState.pawns?.length ?? 0);
  const debugBuild = import.meta.env.VITE_DEBUG_MODE === 'true';
  const branch = import.meta.env.VITE_DEV_BRANCH?.replace(/^feat\//, '');
</script>

<svelte:head>
  <title>{branch ? `Fantasia4x - ${branch}` : 'Fantasia4x'}</title>
</svelte:head>

<div class="rail" {@attach chrome('rail')}>
  <div class="b-l">
    <ChromeButton
      mini
      glyph={$resourcesHidden ? 'right' : 'left'}
      label={$resourcesHidden ? 'Show stores' : 'Hide stores'}
      onclick={resourcesHidden.toggle}
    />
    {#if $gameState.culture?.name}<PanelTitle>{$gameState.culture.name}</PanelTitle>{/if}
    <span>{souls} {souls === 1 ? 'soul' : 'souls'}</span>
    {#if branch}<span class="dev">{branch}</span>{/if}
    {#if $showFps || $showTps}
      <span class="dev"
        >{#if $showFps}{$renderFps} fps{/if}{#if $showFps && $showTps}
          ·
        {/if}{#if $showTps}{tps} tps{/if}</span
      >
    {/if}
  </div>
  {#if mapGen}
    <div class="b-time"><span>Map generation</span></div>
    <i></i>
    <div></div>
  {:else}
    <div class="b-time">
      <span>{date.day} {date.monthName} Y{date.year}</span><b class="clock">{date.clock}</b>
    </div>
    <i></i>
    <div class="b-wx">
      <RailWeather hour={date.hour} />
      <RailSpeeds />
    </div>
  {/if}
  <div class="b-r">
    {#if debugBuild && !mapGen}
      <ChromeButton on={$uiState.customMapOpen} onclick={() => uiState.toggleCustomMap()}
        >Custom map</ChromeButton
      >
    {/if}
    <PanelTitle>Chronicle</PanelTitle>
    <ChromeButton
      mini
      glyph={$chronicleHidden ? 'left' : 'right'}
      label={$chronicleHidden ? 'Show chronicle' : 'Hide chronicle'}
      onclick={chronicleHidden.toggle}
    />
  </div>
</div>

<style>
  .rail {
    position: relative;
    z-index: 6;
    height: 24px;
    display: grid;
    grid-template-columns: 1fr 250px 118px 250px 1fr;
    align-items: center;
    padding: 0 6px 2px;
    white-space: nowrap;
    color: var(--text);
    font: 16px/18px var(--font-pixel);
    letter-spacing: 0.6px;
  }
  :global(:root[data-theme='timber']) .rail {
    text-shadow: 1px 1px 0 #0b0806;
  }
  .b-l,
  .b-r {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    overflow: hidden;
    height: 22px;
  }
  .b-r {
    justify-content: flex-end;
  }
  .b-l span,
  .b-time span {
    color: var(--text-dim);
  }
  .b-l .dev {
    color: var(--text-muted);
  }
  .rail :global(.mini) {
    width: 18px;
    height: 18px;
    flex: none;
  }
  .b-time {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
  }
  .clock {
    font:
      20px/20px 'Fantasia Block',
      var(--font-pixel);
    letter-spacing: 1px;
    font-weight: normal;
    color: var(--accent-hi);
  }
  :global(:root[data-theme='timber']) .clock {
    color: var(--ember);
  }
  .b-wx {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
</style>
