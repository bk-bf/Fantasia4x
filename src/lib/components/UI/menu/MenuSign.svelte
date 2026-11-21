<script lang="ts">
  import { blank } from '$lib/pixelArt/canvas';
  import { lampGlow } from '$lib/pixelArt/cloth';
  import { goldLetters, stamp, textMask } from '$lib/pixelArt/lettering';
  import { pixels } from '$lib/pixelArt/pixels';
  import { timber } from '$lib/pixelArt/timber';
  import { PIXEL_FONT, type Rect, type TitleArt } from './mainMenuPlan';

  let { rect, title, scale, lamp }: { rect: Rect; title: TitleArt; scale: number; lamp: number } =
    $props();

  function letters(): HTMLCanvasElement {
    const c = blank(rect.w, rect.h);
    const g = c.getContext('2d');
    if (!g) return c;
    const { mask, bevel } = title;
    g.drawImage(
      goldLetters(mask, bevel),
      Math.round((rect.w - mask.w) / 2) - bevel - 1,
      10 - bevel
    );
    const sub = textMask('a 4X colony chronicle', PIXEL_FONT, 16, 1);
    stamp(g, sub, (rect.w - sub.w) / 2, rect.h - 13 - sub.base, [206, 178, 128]);
    return c;
  }

  const board = $derived(
    timber(rect.w, rect.h, { dir: 'h', beam: 5, strap: 13, seed: 8, base: 0.36, lo: 22, hi: 30 })
  );
  const glow = $derived(lampGlow(rect.w, rect.h));
  const ink = $derived(letters());
</script>

<div
  class="sign"
  aria-hidden="true"
  style:left="{rect.x * scale}px"
  style:top="{rect.y * scale}px"
  style:--s={scale}
  style:--lamp={lamp}
>
  <span class="board" {@attach pixels(board, scale)}></span>
  <span class="glow" {@attach pixels(glow, scale)}></span>
  <span class="ink" {@attach pixels(ink, scale)}></span>
</div>

<style>
  .sign {
    position: absolute;
  }
  .sign span {
    position: absolute;
    left: 0;
    top: 0;
  }
  .board {
    filter: url(#ambient-tint)
      drop-shadow(calc(var(--s) * 2px) calc(var(--s) * 2px) 0 rgb(6 4 3 / 0.5));
  }
  .glow {
    mix-blend-mode: screen;
    opacity: var(--lamp);
  }
  .ink {
    filter: url(#ambient-tint-legible);
  }
</style>
