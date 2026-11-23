<script lang="ts">
  import PixelGlyph from '$lib/components/UI/widget/PixelGlyph.svelte';

  let {
    from,
    onresize,
    onreset
  }: {
    from: () => { w: number; h: number };
    onresize: (w: number, h: number) => void;
    onreset: () => void;
  } = $props();

  let grab: { x: number; y: number; w: number; h: number } | null = null;
  let want: { w: number; h: number } | null = null;
  let frame = 0;

  function flush() {
    frame = 0;
    if (want) onresize(want.w, want.h);
    want = null;
  }

  function start(e: PointerEvent) {
    if (e.button !== 0) return;
    grab = { x: e.clientX, y: e.clientY, ...from() };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function move(e: PointerEvent) {
    if (!grab) return;
    want = { w: grab.w + e.clientX - grab.x, h: grab.h + e.clientY - grab.y };
    frame ||= requestAnimationFrame(flush);
  }
  function end() {
    if (frame) cancelAnimationFrame(frame);
    flush();
    grab = null;
  }
</script>

<span
  class="grip"
  role="separator"
  aria-label="Resize"
  aria-orientation="horizontal"
  onpointerdown={start}
  onpointermove={move}
  onpointerup={end}
  onpointercancel={end}
  ondblclick={onreset}
>
  <PixelGlyph name="grip" />
</span>

<style>
  .grip {
    position: absolute;
    right: 10px;
    bottom: 10px;
    z-index: 2;
    display: grid;
    place-items: center;
    width: 15px;
    height: 15px;
    cursor: nwse-resize;
    touch-action: none;
    user-select: none;
  }
</style>
