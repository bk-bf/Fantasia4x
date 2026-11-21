<script module lang="ts">
  import { paintedSpriteCanvas } from '$lib/webgl/painted/loader';
  import type { PaintedKind } from '$lib/webgl/painted/manifest';
  import { fitInto } from '$lib/pixelArt/shrink';
  import { itemService } from '$lib/game/services/ItemService';
  import { blank, pen } from '$lib/pixelArt/canvas';
  import { picture, toArt, type Art } from '$lib/pixelArt/picture';

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

  const _painted = new Map<string, Promise<Art | null>>();
  function paintedArt(kind: PaintedKind, id: string, px: number): Promise<Art | null> {
    const key = `${kind}/${id}@${px}`;
    let hit = _painted.get(key);
    if (!hit)
      _painted.set(
        key,
        (hit = paintedSpriteCanvas(kind, id)
          .then((c) => (c ? toArt(fitInto(c, px)) : null))
          .catch(() => null))
      );
    return hit;
  }

  const CELL_W = 12;
  const CELL_H = 18;
  const COLS = 16;
  const _cells: Record<string, Art> = {};
  function sheetCell(sheet: HTMLCanvasElement, name: string, id: number, tone: string | null): Art {
    const key = `${name}/${id}/${tone ?? ''}`;
    const hit = _cells[key];
    if (hit) return hit;
    const c = blank(CELL_W, CELL_H);
    const ctx = pen(c);
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        sheet,
        (id % COLS) * CELL_W,
        Math.floor(id / COLS) * CELL_H,
        CELL_W,
        CELL_H,
        0,
        0,
        CELL_W,
        CELL_H
      );
      if (tone) {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = tone;
        ctx.fillRect(0, 0, CELL_W, CELL_H);
      }
    }
    const art = toArt(c);
    _cells[key] = art;
    return art;
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';

  type CharSpan = { sheet?: string; id?: number; from?: number; to?: number; literal?: string };

  let {
    charSpans = undefined,
    tint = null,
    px = 16,
    item = null,
    building = null,
    creature = null,
    resource = null,
    fallback
  }: {
    charSpans?: CharSpan[];
    tint?: string | null;
    px?: number;
    item?: string | null;
    building?: string | null;
    creature?: string | null;
    resource?: string | null;
    fallback?: Snippet;
  } = $props();

  const itemDef = $derived(item ? itemService.getItemById(item) : undefined);
  const spans = $derived(charSpans ?? itemDef?.charSpans);
  const tone = $derived(tint ?? itemDef?.color ?? null);
  const painted = $derived<[PaintedKind, string] | null>(
    item
      ? ['item', item]
      : building
        ? ['building', building]
        : creature
          ? ['creature', creature]
          : resource
            ? ['resource', resource]
            : null
  );

  let art = $state<Art | null>(null);

  $effect(() => {
    art = null;
    if (!painted) return;
    let live = true;
    paintedArt(painted[0], painted[1], px).then((a) => live && (art = a));
    return () => (live = false);
  });

  const span = $derived((spans ?? []).find((s) => s.sheet && (s.id != null || s.from != null)));
  const literal = $derived((spans ?? []).find((s) => s.literal)?.literal ?? null);

  let sheetReady = $state(0);
  const cell = $derived.by(() => {
    void sheetReady;
    if (!span?.sheet) return null;
    const sheet = getSheet(span.sheet, () => sheetReady++);
    return sheet ? sheetCell(sheet, span.sheet, span.id ?? span.from ?? 0, tone) : null;
  });
</script>

{#if art}
  <i class="painted-icon" style:width="{px}px" style:height="{px}px" {@attach picture(art)}></i>
{:else if cell}
  <i class="sprite-icon" style:height="{px}px" {@attach picture(cell)}></i>
{:else if literal}
  <span class="sprite-literal" style="font-size:{px}px; color:{tone ?? 'inherit'}">{literal}</span>
{:else}
  {@render fallback?.()}
{/if}

<style>
  .sprite-icon,
  .painted-icon {
    flex-shrink: 0;
    display: block;
  }
  .sprite-icon {
    aspect-ratio: 12 / 18;
  }
  i :global(img) {
    width: 100%;
    height: 100%;
  }
  .sprite-literal {
    flex-shrink: 0;
    font-family: var(--font-mono);
    line-height: 1;
  }
</style>
