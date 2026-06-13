<script module lang="ts">
  // Shared per-sheet canvas cache (magenta → transparent), loaded lazily.
  const _sheetCache = new Map<string, HTMLCanvasElement | null>();
  const _sheetWaiters = new Map<string, Set<() => void>>();

  function getSheet(name: string, onReady: () => void): HTMLCanvasElement | null {
    const cached = _sheetCache.get(name);
    if (cached) return cached;
    if (_sheetCache.has(name)) {
      // still loading — queue a redraw for when it's ready
      (
        _sheetWaiters.get(name) ?? (_sheetWaiters.set(name, new Set()), _sheetWaiters.get(name)!)
      ).add(onReady);
      return null;
    }
    _sheetCache.set(name, null);
    _sheetWaiters.set(name, new Set([onReady]));
    if (typeof window === 'undefined') return null;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const cx = c.getContext('2d', { willReadFrequently: true });
      if (!cx) return;
      cx.drawImage(img, 0, 0);
      const data = cx.getImageData(0, 0, c.width, c.height);
      const d = data.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] === 255 && d[i + 1] === 0 && d[i + 2] === 255) d[i + 3] = 0;
      }
      cx.putImageData(data, 0, 0);
      _sheetCache.set(name, c);
      _sheetWaiters.get(name)?.forEach((fn) => fn());
      _sheetWaiters.delete(name);
    };
    img.src = `/tilesets/bitlands_${name}.bmp`;
    return null;
  }
</script>

<!-- SpriteIcon.svelte — renders one cell of a bitlands sprite sheet (12×18, 16-col) as a small
     tinted canvas. Feed it a def's `charSpans`; used for building/crafting card icons. -->
<script lang="ts">
  type CharSpan = { sheet?: string; id?: number; from?: number; to?: number; literal?: string };

  let {
    charSpans = undefined,
    tint = null,
    px = 16
  }: { charSpans?: CharSpan[]; tint?: string | null; px?: number } = $props();

  const CELL_W = 12;
  const CELL_H = 18;
  const COLS = 16;

  // Module-level cache of magenta-keyed sheet canvases, shared across all icons.
  const span = $derived((charSpans ?? []).find((s) => s.sheet && (s.id != null || s.from != null)));
  const literal = $derived((charSpans ?? []).find((s) => s.literal)?.literal ?? null);

  let canvasEl: HTMLCanvasElement | undefined = $state();

  function draw() {
    const node = canvasEl;
    if (!node || !span?.sheet) return;
    const ctx = node.getContext('2d');
    if (!ctx) return;
    node.width = CELL_W;
    node.height = CELL_H;
    ctx.clearRect(0, 0, CELL_W, CELL_H);
    const sheet = getSheet(span.sheet, draw); // re-draws once the sheet finishes loading
    if (!sheet) return;
    const id = span.id ?? span.from ?? 0;
    const col = id % COLS;
    const row = Math.floor(id / COLS);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheet, col * CELL_W, row * CELL_H, CELL_W, CELL_H, 0, 0, CELL_W, CELL_H);
    if (tint) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, CELL_W, CELL_H);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  $effect(() => {
    // re-run on span/tint change (and once canvasEl is bound)
    void span;
    void tint;
    void canvasEl;
    draw();
  });
</script>

{#if span?.sheet}
  <canvas bind:this={canvasEl} class="sprite-icon" style="height:{px}px"></canvas>
{:else if literal}
  <span class="sprite-literal" style="font-size:{px}px; color:{tint ?? 'inherit'}">{literal}</span>
{/if}

<style>
  .sprite-icon {
    width: auto;
    aspect-ratio: 12 / 18;
    image-rendering: pixelated;
    flex-shrink: 0;
    display: block;
  }
  .sprite-literal {
    flex-shrink: 0;
    font-family: 'Courier New', monospace;
    line-height: 1;
  }
</style>
