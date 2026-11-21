<script lang="ts">
  import { untrack } from 'svelte';
  import { picture, toArt } from '$lib/pixelArt/picture';
  import { SKY_BOWL_H, SKY_BOWL_W, skyBowl, type SkyAmbient } from '$lib/pixelArt/skyBowl';
  import { skyKey } from './mainMenuAmbient';

  let { ambient, x, scale }: { ambient: SkyAmbient; x: number; scale: number } = $props();

  const key = $derived(skyKey(ambient));
  const art = $derived.by(() => {
    void key;
    return untrack(() => toArt(skyBowl(ambient)));
  });
</script>

<span
  class="bowl"
  aria-hidden="true"
  style:left="{x * scale}px"
  style:--s={scale}
  style:width="{SKY_BOWL_W * scale}px"
  style:height="{SKY_BOWL_H * scale}px"
  {@attach picture(art)}
></span>

<style>
  .bowl {
    position: absolute;
    top: 0;
  }
  .bowl :global(img) {
    width: 100%;
    height: 100%;
    filter: drop-shadow(0 calc(var(--s) * 1px) 0 rgb(5 5 8 / 0.6));
  }
</style>
