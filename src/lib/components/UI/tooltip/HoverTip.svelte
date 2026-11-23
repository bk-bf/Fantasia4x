<script lang="ts">
  import type { Snippet } from 'svelte';
  import { chrome } from '$lib/pixelArt/chrome';

  let {
    x,
    y,
    pinned = false,
    anchored = false,
    children
  }: { x: number; y: number; pinned?: boolean; anchored?: boolean; children: Snippet } = $props();

  let node: HTMLElement;
  let raf = 0;

  const GAP = 16;
  const MARGIN = 8;

  function reposition() {
    if (!node || typeof window === 'undefined') return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = node.offsetWidth;
    const h = node.offsetHeight;

    const gap = anchored ? 0 : GAP;
    let left = anchored || x + gap + w <= vw - MARGIN ? x + gap : x - gap - w;
    left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));

    let top = anchored || y + gap + h <= vh - MARGIN ? y + gap : y - gap - h;
    top = Math.max(MARGIN, Math.min(top, vh - h - MARGIN));

    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
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
    schedule();
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
    void [x, y];
    schedule();
  });
</script>

<div
  class="tip"
  class:pinned
  use:portal
  data-pin-panel
  style="left:{x + (anchored ? 0 : GAP)}px; top:{y + (anchored ? 0 : GAP)}px;"
  {@attach chrome('tip')}
>
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
