<script module lang="ts">
  import { paintedSpriteCanvas } from '$lib/webgl/painted/loader';
  import type { PaintedKind } from '$lib/webgl/painted/manifest';
  import { fitInto } from '$lib/pixelArt/shrink';
  import { itemService } from '$lib/game/services/ItemService';

  const _sheetCache = new Map<string, HTMLCanvasElement | null>();
  const _sheetWaiters = new Map<string, Set<() => void>>();

  function getSheet(name: string, onReady: () => void): HTMLCanvasElement | null {
    const cached = _sheetCache.get(name);
    if (cached) return cached;
    if (_sheetCache.has(name)) {
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

  const _painted: Record<string, Promise<HTMLCanvasElement | null>> = {};
  function paintedArt(kind: PaintedKind, id: string): Promise<HTMLCanvasElement | null> {
    const key = `${kind}/${id}`;
    return (_painted[key] ??= paintedSpriteCanvas(kind, id).catch(() => null));
  }
</script>

<script lang="ts">
  type CharSpan = { sheet?: string; id?: number; from?: number; to?: number; literal?: string };

  let {
    charSpans = undefined,
    tint = null,
    px = 16,
    item = null,
    building = null
  }: {
    charSpans?: CharSpan[];
    tint?: string | null;
    px?: number;
    item?: string | null;
    building?: string | null;
  } = $props();

  const itemDef = $derived(item ? itemService.getItemById(item) : undefined);
  const spans = $derived(charSpans ?? itemDef?.charSpans);
  const tone = $derived(tint ?? itemDef?.color ?? null);
  const painted = $derived<[PaintedKind, string] | null>(
    item ? ['item', item] : building ? ['building', building] : null
  );

  let art = $state<HTMLCanvasElement | null>(null);
  let paintedBox: HTMLCanvasElement | undefined = $state();

  $effect(() => {
    art = null;
    if (!painted) return;
    let live = true;
    paintedArt(painted[0], painted[1]).then((c) => live && (art = c));
    return () => (live = false);
  });

  $effect(() => {
    if (!art || !paintedBox) return;
    const fit = fitInto(art, px);
    paintedBox.width = fit.width;
    paintedBox.height = fit.height;
    paintedBox.getContext('2d', { willReadFrequently: true })?.drawImage(fit, 0, 0);
  });

  const CELL_W = 12;
  const CELL_H = 18;
  const COLS = 16;

  const span = $derived((spans ?? []).find((s) => s.sheet && (s.id != null || s.from != null)));
  const literal = $derived((spans ?? []).find((s) => s.literal)?.literal ?? null);

  let canvasEl: HTMLCanvasElement | undefined = $state();

  function draw() {
    const node = canvasEl;
    if (!node || !span?.sheet) return;
    const ctx = node.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    node.width = CELL_W;
    node.height = CELL_H;
    ctx.clearRect(0, 0, CELL_W, CELL_H);
    const sheet = getSheet(span.sheet, draw);
    if (!sheet) return;
    const id = span.id ?? span.from ?? 0;
    const col = id % COLS;
    const row = Math.floor(id / COLS);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheet, col * CELL_W, row * CELL_H, CELL_W, CELL_H, 0, 0, CELL_W, CELL_H);
    if (tone) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = tone;
      ctx.fillRect(0, 0, CELL_W, CELL_H);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  $effect(() => {
    void span;
    void tone;
    void canvasEl;
    draw();
  });
</script>

{#if art}
  <canvas bind:this={paintedBox} class="painted-icon" style="width:{px}px;height:{px}px"></canvas>
{:else if span?.sheet}
  <canvas bind:this={canvasEl} class="sprite-icon" style="height:{px}px"></canvas>
{:else if literal}
  <span class="sprite-literal" style="font-size:{px}px; color:{tone ?? 'inherit'}">{literal}</span>
{/if}

<style>
  .sprite-icon {
    width: auto;
    aspect-ratio: 12 / 18;
    image-rendering: pixelated;
    flex-shrink: 0;
    display: block;
  }
  .painted-icon {
    image-rendering: pixelated;
    flex-shrink: 0;
    display: block;
  }
  .sprite-literal {
    flex-shrink: 0;
    font-family: var(--font-mono);
    line-height: 1;
  }
</style>
