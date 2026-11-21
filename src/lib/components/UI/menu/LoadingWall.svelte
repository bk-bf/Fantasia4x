<script lang="ts">
  import { pixels } from '$lib/pixelArt/pixels';
  import { wallBackdrop } from '$lib/pixelArt/plankWall';
  import type { ThemeId } from '../theme/themes';
  import { WALL_SCALE, boardShadow } from './loadingArt';

  let {
    theme,
    width,
    height,
    board
  }: {
    theme: ThemeId;
    width: number;
    height: number;
    board: { x: number; y: number; w: number; h: number };
  } = $props();

  const art = $derived(
    wallBackdrop(
      Math.ceil(width / WALL_SCALE),
      Math.ceil(height / WALL_SCALE),
      boardShadow(theme, board)
    )
  );
</script>

<span class="wall" aria-hidden="true" {@attach pixels(art, WALL_SCALE)}></span>

<style>
  .wall {
    position: absolute;
    left: 0;
    top: 0;
  }
</style>
