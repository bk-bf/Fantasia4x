<!-- HoverTip.svelte — floating hover panel that follows the cursor, portaled onto <body>
     so it escapes ancestor `overflow:hidden`/`filter` clipping. Same visual style as the
     work-tab job-priority tooltip (WorkCellTooltip). Drop a slot in for the contents. -->
<script lang="ts">
  /** Cursor position in viewport coords (clientX/clientY). */
  export let x: number;
  export let y: number;

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      }
    };
  }

  // Flip to the cursor's left/upper side when near a viewport edge.
  $: flipX = typeof window !== 'undefined' && x > window.innerWidth - 280;
  $: flipY = typeof window !== 'undefined' && y > window.innerHeight - 160;
  $: style =
    `${flipX ? `right:${window.innerWidth - x + 14}px` : `left:${x + 16}px`};` +
    `${flipY ? `bottom:${window.innerHeight - y + 14}px` : `top:${y + 16}px`};`;
</script>

<div class="tip" use:portal {style}>
  <slot />
</div>

<style>
  .tip {
    position: fixed;
    z-index: 1000;
    min-width: 190px;
    max-width: 260px;
    padding: 5px 7px;
    background: var(--bg-panel, #11151c);
    border: 1px solid var(--border-hi, #3a4656);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.55);
    font-family: 'Courier New', monospace;
    font-size: 11px;
    line-height: 1.4;
    color: var(--text);
    pointer-events: none;
  }
</style>
