<script lang="ts">
  import { picture, type Art } from '$lib/pixelArt/picture';
  import { pawnSpriteArt } from './pawnSpriteArt';

  let {
    id,
    cultureId,
    height = 40
  }: { id: string; cultureId?: string; height?: number } = $props();

  let art = $state<Art | null>(null);

  $effect(() => {
    art = null;
    let live = true;
    pawnSpriteArt(cultureId ?? '*', id).then((a) => live && a && (art = a));
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
