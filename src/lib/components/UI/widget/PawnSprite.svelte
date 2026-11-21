<script lang="ts">
  import { paintedSpriteCanvas, PAINTED_BASE_URL } from '$lib/webgl/painted/loader';
  import { picture, toArt, type Art } from '$lib/pixelArt/picture';

  let {
    id,
    cultureId,
    height = 40
  }: { id: string; cultureId?: string; height?: number } = $props();

  let art = $state<Art | null>(null);

  $effect(() => {
    art = null;
    let live = true;
    paintedSpriteCanvas('pawn', cultureId ?? '*', PAINTED_BASE_URL, id).then(
      (c) => live && c && (art = toArt(c))
    );
    return () => (live = false);
  });
</script>

<i class="pawn-sprite" style:height="{height}px" style:--h="{height}px" aria-hidden="true">
  {#if art}<span {@attach picture(art)}></span>{/if}
</i>

<style>
  .pawn-sprite {
    display: inline-grid;
    place-items: end center;
    flex: none;
    overflow: hidden;
  }
  .pawn-sprite :global(img) {
    width: auto;
    height: var(--h);
    filter: url(#ambient-tint-data);
  }
</style>
