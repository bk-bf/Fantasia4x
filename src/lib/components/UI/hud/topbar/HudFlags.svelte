<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import MenuSkyBowl from '$lib/components/UI/menu/MenuSkyBowl.svelte';
  import { menuAmbient } from '$lib/components/UI/menu/mainMenuAmbient';
  import { SKY_BOWL_W } from '$lib/pixelArt/skyBowl';
  import HudFlag from './HudFlag.svelte';
  import { LEFT_FLAGS, hudFlags, researchUnlocked } from './hudFlags';

  const HALF = 59;
  const GAP = 3;
  const MAX_W = 84;
  const MIN_W = 56;
  const ROOMY = 74;

  let {
    debug,
    left,
    right,
    under = $bindable(false)
  }: { debug: boolean; left: number; right: number; under?: boolean } = $props();

  let W = $state(0);

  const flags = $derived(hudFlags(debug));
  const sky = $derived(menuAmbient($gameState).sky);
  const hasResearch = $derived(researchUnlocked($gameState.buildings));

  const mid = $derived(Math.round(W / 2));
  const nRight = $derived(flags.length - LEFT_FLAGS);
  const fit = $derived(
    Math.min(
      Math.floor((mid - HALF - left - 20) / LEFT_FLAGS),
      Math.floor((W - mid - HALF - right - 17) / nRight)
    )
  );
  $effect(() => {
    under = fit < ROOMY;
  });
  const fw = $derived(
    Math.max(MIN_W, Math.min(MAX_W, fit < ROOMY ? Math.floor((mid - HALF - 16) / LEFT_FLAGS) : fit))
  );
  const leftX = $derived(mid - HALF - LEFT_FLAGS * fw - (LEFT_FLAGS - 1) * GAP);
</script>

<div class="hang" class:tight={fw < ROOMY} bind:clientWidth={W}>
  {#each [flags.slice(0, LEFT_FLAGS), flags.slice(LEFT_FLAGS)] as side, s (s)}
    <nav class="rib" style:left="{s === 0 ? leftX : mid + HALF}px">
      {#each side as f, i (f.id)}
        {@const locked = !!f.needsResearch && !hasResearch}
        <HudFlag
          label={f.label}
          key={f.key}
          dye={s * LEFT_FLAGS + i}
          width={fw}
          on={$uiState.windows.includes(f.id)}
          disabled={locked}
          note={locked ? 'Needs a knowledge building' : undefined}
          onclick={() => uiState.toggleWindow(f.id)}
        />
      {/each}
    </nav>
  {/each}
  <div class="bowl" style:left="{mid - SKY_BOWL_W / 2}px">
    <MenuSkyBowl ambient={sky} x={0} scale={1} />
  </div>
</div>

<style>
  .hang {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 0;
    pointer-events: none;
  }
  .rib {
    position: absolute;
    top: 23px;
    display: flex;
    gap: 3px;
    z-index: 5;
  }
  .bowl {
    position: absolute;
    top: 15px;
    z-index: 7;
  }
</style>
