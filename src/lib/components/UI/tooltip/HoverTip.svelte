<script lang="ts">
  import type { Snippet } from 'svelte';
  import { chrome } from '$lib/pixelArt/chrome';
  import { tipPlacement } from '$lib/stores/uiPrefs';

  let {
    x,
    y,
    pinned = false,
    children
  }: { x: number; y: number; pinned?: boolean; children: Snippet } = $props();

  let node: HTMLElement;
  let raf = 0;

  const GAP = 16;
  const MARGIN = 8;
  const WINDOW_GAP = 6;

  function nearCursor(w: number, h: number, vw: number, vh: number) {
    return {
      left: x + GAP + w <= vw - MARGIN ? x + GAP : x - GAP - w,
      top: y + GAP + h <= vh - MARGIN ? y + GAP : y - GAP - h
    };
  }

  function underWindow(h: number, vh: number) {
    const win = document.elementFromPoint(x, y)?.closest('[data-window]');
    if (!win) return null;
    const r = win.getBoundingClientRect();
    if (r.bottom + WINDOW_GAP + h <= vh - MARGIN) return { left: x, top: r.bottom + WINDOW_GAP };
    if (r.top - WINDOW_GAP - h >= MARGIN) return { left: x, top: r.top - WINDOW_GAP - h };
    return null;
  }

  function reposition() {
    if (!node || typeof window === 'undefined') return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = node.offsetWidth;
    const h = node.offsetHeight;
    const spot = ($tipPlacement === 'window' && underWindow(h, vh)) || nearCursor(w, h, vw, vh);
    node.style.left = `${Math.max(MARGIN, Math.min(spot.left, vw - w - MARGIN))}px`;
    node.style.top = `${Math.max(MARGIN, Math.min(spot.top, vh - h - MARGIN))}px`;
  }

  function schedule() {
    if (typeof window === 'undefined') return;
    if (raf) return;
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      reposition();
    });
  }

  function portal(n: HTMLElement) {
    node = n;
    document.body.appendChild(n);
    const ro = new ResizeObserver(() => schedule());
    ro.observe(n);
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    reposition();
    return {
      destroy() {
        ro.disconnect();
        window.removeEventListener('resize', schedule);
        window.removeEventListener('scroll', schedule, { capture: true } as EventListenerOptions);
        if (raf) cancelAnimationFrame(raf);
        n.remove();
      }
    };
  }

  $effect(() => {
    void [x, y, $tipPlacement];
    reposition();
  });
</script>

<div class="tip" class:pinned use:portal data-pin-panel {@attach chrome('tip')}>
  <div class="tip-body">
    {@render children()}
  </div>
</div>

<style>
  .tip {
    position: fixed;
    z-index: 1000;
    box-sizing: border-box;
    width: 260px;
    max-height: calc(100vh - 16px);
    overflow-y: auto;
    scrollbar-width: none;
    padding: 9px 12px 10px;
    font: 16px/18px var(--font-pixel);
    letter-spacing: 0.6px;
    color: var(--text);
    pointer-events: none;
  }
  .tip.pinned {
    pointer-events: auto;
    outline: 1px solid var(--accent);
    outline-offset: -4px;
  }
  .tip-body {
    filter: url(#ambient-tint-legible);
  }
  .tip .tip-body :global(*) {
    font-family: inherit;
    font-size: inherit;
    font-weight: inherit;
    font-style: normal;
    line-height: inherit;
  }
  .tip :global(:is(h5, .tip-name)) {
    text-transform: uppercase;
    letter-spacing: 1.6px;
  }
  .tip :global(h5) {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    margin: 0 0 2px;
    color: var(--accent-hi);
  }
  .tip :global(:is(p, .tip-desc)) {
    margin: 2px 0 5px;
    line-height: 16px;
    color: var(--text-dim);
  }
  .tip :global(.kv) {
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }
  .tip :global(.kv > :last-child) {
    text-align: right;
  }
  .tip :global(.kv em) {
    color: var(--text-dim);
  }
  .tip :global(.tip-eff) {
    color: var(--accent);
    white-space: nowrap;
  }
  .tip :global(.tip-sep) {
    margin: 6px 0 1px;
    text-transform: uppercase;
    letter-spacing: 1.6px;
    color: var(--text-muted);
  }
  .tip :global(.tip-mod) {
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }
  .tip :global(.tip-mod-name) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tip :global(.tip-mod-val) {
    flex-shrink: 0;
    color: var(--text-dim);
  }
</style>
