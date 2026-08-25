<script lang="ts">
  export let x: number;
  export let y: number;
  export let pinned = false;

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

    let left = x + GAP + w > vw - MARGIN ? x - GAP - w : x + GAP;
    left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));

    let top = y + GAP + h > vh - MARGIN ? y - GAP - h : y + GAP;
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

  $: (x, y, schedule());
</script>

<div class="tip" class:pinned use:portal data-pin-panel style="left:{x + GAP}px; top:{y + GAP}px;">
  <div class="tip-body">
    <slot />
  </div>
</div>

<style>
  .tip {
    position: fixed;
    z-index: 1000;
    min-width: 190px;
    max-width: 260px;
    max-height: calc(100vh - 16px);
    overflow-y: auto;
    padding: 5px 7px;
    background: transparent;
    border: 1px solid transparent;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.55);
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.4;
    color: var(--text);
    pointer-events: none;
  }
  .tip.pinned {
    pointer-events: auto;
    box-shadow:
      0 4px 14px rgba(0, 0, 0, 0.55),
      0 0 0 1px var(--accent, #e8c870);
  }
  .tip::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 0;
    background: var(--bg-panel, #11151c);
    box-shadow: inset 0 0 0 1px var(--border-hi, #3a4656);
    filter: url(#ambient-tint);
    pointer-events: none;
  }
  .tip-body {
    position: relative;
    z-index: 1;
    filter: url(#ambient-tint-legible);
  }
</style>
