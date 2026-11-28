<script lang="ts">
  import { picture, type Art } from '$lib/pixelArt/picture';
  import { gameState } from '$lib/stores/gameState';
  import type { PawnLookOf } from '$lib/webgl/painted/pawnLook';
  import { pawnSpriteArt } from './pawnSpriteArt';

  let { pawn, height = 40 }: { pawn: PawnLookOf; height?: number } = $props();

  const id = $derived(pawn.id);
  const cultureId = $derived(pawn.cultureId);
  const pool = $derived($gameState?.culturePool);

  let art = $state<Art | null>(null);

  $effect(() => {
    art = null;
    let live = true;
    pawnSpriteArt({ id, cultureId }, pool).then((a) => live && a && (art = a));
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
