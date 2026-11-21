<script lang="ts">
  import { paintedSpriteCanvas, PAINTED_BASE_URL } from '$lib/webgl/painted/loader';

  let {
    id,
    cultureId,
    height = 40
  }: { id: string; cultureId?: string; height?: number } = $props();

  let art = $state<HTMLCanvasElement | null>(null);
  let box: HTMLCanvasElement | undefined = $state();

  $effect(() => {
    art = null;
    let live = true;
    paintedSpriteCanvas('pawn', cultureId ?? '*', PAINTED_BASE_URL, id).then(
      (c) => live && (art = c)
    );
    return () => (live = false);
  });

  $effect(() => {
    if (!art || !box) return;
    box.width = art.width;
    box.height = art.height;
    box.getContext('2d')?.drawImage(art, 0, 0);
  });
</script>

<i class="pawn-sprite" style:height="{height}px" aria-hidden="true">
  {#if art}<canvas bind:this={box} style:height="{height}px"></canvas>{/if}
</i>

<style>
  .pawn-sprite {
    display: inline-grid;
    place-items: end center;
    flex: none;
    overflow: hidden;
  }
  canvas {
    image-rendering: pixelated;
    width: auto;
    filter: url(#ambient-tint-data);
  }
</style>
