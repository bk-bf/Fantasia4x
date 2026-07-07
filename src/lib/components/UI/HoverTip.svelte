<!-- HoverTip.svelte — floating hover panel that follows the cursor, portaled onto <body>
     so it escapes ancestor `overflow:hidden`/`filter` clipping. Same visual style as the
     work-tab job-priority tooltip (WorkCellTooltip). Drop a slot in for the contents.

     Positioning MEASURES the rendered panel and clamps it fully inside the viewport, so no tooltip
     — however tall its contents — can ever clip under/over an edge.

     CRITICAL: measurement is always deferred to a requestAnimationFrame, never done synchronously
     in the reactive flush. When the cursor moves between two pills, the SLOT CONTENT (owned by the
     parent) and our x/y props change in the same flush; a synchronous measure reads the OLD, shorter
     height and clamps a tall panel off the bottom edge. Measuring in rAF runs AFTER the slot has
     committed + laid out, so `h` is always the real height. The ResizeObserver + window listeners are
     backstops for content/viewport changes that don't come with a cursor move. -->
<script lang="ts">
  /** Cursor position in viewport coords (clientX/clientY). */
  export let x: number;
  export let y: number;
  /** Pinned (clicked) — the panel stops following the cursor and becomes pointer-interactive so its
   *  contents (and nested tooltips later) are reachable. Dismissal is handled by the pin controller. */
  export let pinned = false;

  let node: HTMLElement;
  let raf = 0;

  const GAP = 16; // offset from the cursor so the panel doesn't sit under it
  const MARGIN = 8; // min distance kept from every viewport edge

  /** Place the panel near the cursor, flipping to the opposite side when it would overflow, then
   *  HARD-clamping into the viewport so it's always fully visible regardless of its measured size. */
  function reposition() {
    if (!node || typeof window === 'undefined') return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = node.offsetWidth;
    const h = node.offsetHeight;

    // Horizontal: prefer right of the cursor; flip left if it would run off the right edge.
    let left = x + GAP + w > vw - MARGIN ? x - GAP - w : x + GAP;
    left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));

    // Vertical: prefer below the cursor; flip above if it would run off the bottom edge.
    let top = y + GAP + h > vh - MARGIN ? y - GAP - h : y + GAP;
    top = Math.max(MARGIN, Math.min(top, vh - h - MARGIN));

    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
  }

  /** Coalesce all reposition triggers (cursor move, content resize, window resize/scroll) into a
   *  single post-layout measure. Deferring past the current flush is what makes the height correct. */
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
    // Re-clamp whenever the CONTENT changes size (e.g. hovering a taller condition) — not just on
    // cursor moves — so a grown panel can't push past the bottom edge.
    const ro = new ResizeObserver(() => schedule());
    ro.observe(n);
    // Reposition if the viewport itself changes under a pinned tooltip.
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

  // Re-clamp on cursor move (deferred to rAF so the slot content has committed first).
  $: (x, y, schedule());
</script>

<div class="tip" class:pinned use:portal data-pin-panel style="left:{x + GAP}px; top:{y + GAP}px;">
  <!-- Text layer lifted above the day/night+weather overlay (#ambient-tint-legible) while the tip's
       background + frame are dimmed beneath it (.tip::before, #ambient-tint) — so the tooltip folds
       under the overlay like the panels/cards instead of floating over it at full brightness. The SVG
       filters are global-by-id, so they still apply even though this panel is portaled onto <body>. -->
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
    /* Never taller than the viewport — an over-long panel scrolls instead of overflowing it. */
    max-height: calc(100vh - 16px);
    overflow-y: auto;
    padding: 5px 7px;
    /* Background + frame moved to ::before (dimmed by #ambient-tint); the box itself is transparent so
       the text layer can be lifted separately. A transparent 1px border keeps the box model. */
    background: transparent;
    border: 1px solid transparent;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.55);
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.4;
    color: var(--text);
    pointer-events: none;
  }
  /* Pinned: the panel is frozen and clickable (nested content reachable), with a faint accent outline
     so it reads as "stuck" rather than a passing hover. */
  .tip.pinned {
    pointer-events: auto;
    box-shadow:
      0 4px 14px rgba(0, 0, 0, 0.55),
      0 0 0 1px var(--accent, #e8c870);
  }
  /* Dimmed chrome layer: tooltip background + inset frame, darkened with the day/night+weather scene. */
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
  /* Lifted text layer: tooltip contents sit above the dimmed chrome and the overlay — hue-shifted but
     brightness-preserved (#ambient-tint-legible) so the text stays readable at night / in fog. */
  .tip-body {
    position: relative;
    z-index: 1;
    filter: url(#ambient-tint-legible);
  }
</style>
