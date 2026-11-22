<script lang="ts">
  import type { Attachment } from 'svelte/attachments';
  import { scrim } from '$lib/pixelArt/scrim';

  let { right = false }: { right?: boolean } = $props();

  const painted: Attachment<HTMLCanvasElement> = (c) => {
    const draw = () => {
      const w = c.offsetWidth;
      const h = c.offsetHeight;
      if (w < 2 || h < 2 || (c.width === w && c.height === h)) return;
      c.width = w;
      c.height = h;
      c.getContext('2d')?.drawImage(scrim(w, h, right), 0, 0);
    };
    const seen = new ResizeObserver(draw);
    seen.observe(c);
    return () => seen.disconnect();
  };
</script>

<canvas class="scrim" class:right aria-hidden="true" {@attach painted}></canvas>

<style>
  .scrim {
    position: absolute;
    top: 0;
    left: 0;
    width: calc(100% + 26px);
    height: 100%;
    z-index: -1;
    pointer-events: none;
    image-rendering: pixelated;
    filter: url(#ambient-tint);
  }
  .scrim.right {
    left: auto;
    right: 0;
  }
</style>
