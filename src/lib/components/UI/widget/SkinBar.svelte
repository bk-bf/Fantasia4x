<script lang="ts">
  import { picture, toArt } from '$lib/pixelArt/picture';
  import type { RampName } from '$lib/pixelArt/palette';
  import { SKINS } from '$lib/pixelArt/skins';
  import { uiTheme } from '$lib/stores/uiPrefs';

  let {
    value,
    ramp = 'honey',
    thin = false,
    title
  }: { value: number; ramp?: RampName; thin?: boolean; title?: string } = $props();

  let w = $state(0);
  const h = $derived(thin ? 5 : 9);
  const frac = $derived(Math.round(Math.max(0, Math.min(1, value)) * 200) / 200);
  const art = $derived(w > 2 ? toArt(SKINS[$uiTheme].bar(w, h, frac, ramp)) : null);
</script>

<i class="skin-bar" class:thin data-title={title} bind:clientWidth={w}>
  {#if art}<span {@attach picture(art)}></span>{/if}
</i>

<style>
  .skin-bar {
    display: inline-block;
    position: relative;
    flex: 1 1 auto;
    min-width: 20px;
    height: 9px;
    vertical-align: middle;
  }
  .skin-bar.thin {
    height: 5px;
  }
  .skin-bar span {
    position: absolute;
    inset: 0;
  }
  .skin-bar :global(img) {
    filter: url(#ambient-tint-data);
  }
  :global(:root[data-theme='vellum']) .skin-bar :global(img) {
    filter: url(#ambient-tint-lit);
  }
</style>
