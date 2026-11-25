<script lang="ts">
  import { picture, type Art } from '$lib/pixelArt/picture';
  import { gameState } from '$lib/stores/gameState';
  import { untrack } from 'svelte';
  import { folkPawn, type PawnLookOf } from '$lib/webgl/painted/pawnLook';
  import { lookKey } from '$lib/webgl/painted/pawnBand';
  import { pawnSpriteArt } from './pawnSpriteArt';

  let { pawn, height = 40 }: { pawn: PawnLookOf; height?: number } = $props();

  const folk = $derived(folkPawn(pawn));
  const key = $derived(folk ? lookKey(folk) : `${pawn.id}:${pawn.cultureId}`);
  const pool = $derived($gameState?.culturePool);

  let art = $state<Art | null>(null);

  $effect(() => {
    void key;
    art = null;
    let live = true;
    pawnSpriteArt(
      untrack(() => pawn),
      pool
    ).then((a) => live && a && (art = a));
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
