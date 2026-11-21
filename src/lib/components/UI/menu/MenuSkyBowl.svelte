<script lang="ts">
  import { untrack } from 'svelte';
  import { pixels } from '$lib/pixelArt/pixels';
  import { skyBowl, type SkyAmbient } from '$lib/pixelArt/skyBowl';
  import { skyKey } from './mainMenuAmbient';

  let { ambient, x, scale }: { ambient: SkyAmbient; x: number; scale: number } = $props();

  const key = $derived(skyKey(ambient));
  const art = $derived.by(() => {
    void key;
    return untrack(() => skyBowl(ambient));
  });
</script>

<span
  class="bowl"
  aria-hidden="true"
  style:left="{x * scale}px"
  style:--s={scale}
  {@attach pixels(art, scale)}
></span>

<style>
  .bowl {
    position: absolute;
    top: 0;
    filter: drop-shadow(0 calc(var(--s) * 1px) 0 rgb(5 5 8 / 0.6));
  }
</style>
