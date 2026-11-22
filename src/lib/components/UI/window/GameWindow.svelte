<script lang="ts">
  import type { Snippet } from 'svelte';
  import { chrome } from '$lib/pixelArt/chrome';
  import { autohideScroll } from '$lib/actions/autohideScroll';
  import type { ModalId, WindowId } from '$lib/stores/uiState';
  import ChromeButton from '$lib/components/UI/widget/ChromeButton.svelte';
  import PanelTitle from '$lib/components/UI/widget/PanelTitle.svelte';
  import ResizeGrip from './ResizeGrip.svelte';
  import { provideWindow, type WindowBar } from './windowContext';
  import type { Point } from './windowPlacement';

  let {
    id,
    title,
    modal = false,
    pos,
    width,
    height,
    z,
    tabs,
    tools,
    onsize,
    onmove,
    onraise,
    onclose,
    onresize,
    onresetsize,
    children
  }: {
    id: WindowId | ModalId;
    title: string;
    modal?: boolean;
    pos: Point | null;
    width: number;
    height: number | null;
    z: number;
    tabs?: Snippet;
    tools?: Snippet;
    onsize: (w: number, h: number) => void;
    onmove: (p: Point) => void;
    onraise: () => void;
    onclose: () => void;
    onresize?: (w: number, h: number) => void;
    onresetsize?: () => void;
    children: Snippet;
  } = $props();

  const bar: WindowBar = $state({});
  provideWindow({
    get id() {
      return id;
    },
    close: () => onclose(),
    bar
  });

  let w = $state(0);
  let h = $state(0);
  $effect(() => {
    if (w && h) onsize(w, h);
  });

  let grab: { dx: number; dy: number } | null = null;

  function startDrag(e: PointerEvent) {
    if (modal || !pos || (e.target as Element).closest('button')) return;
    grab = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function drag(e: PointerEvent) {
    if (grab) onmove({ x: e.clientX - grab.dx, y: e.clientY - grab.dy });
  }
  function endDrag() {
    grab = null;
  }
</script>

<div
  class="win"
  class:modal
  data-modal={modal || undefined}
  data-window={id}
  role="dialog"
  tabindex="-1"
  aria-modal={modal}
  aria-label={title}
  style:left="{pos?.x ?? 0}px"
  style:top="{pos?.y ?? 0}px"
  style:width="{width}px"
  style:height={height ? `${height}px` : null}
  style:z-index={z}
  style:visibility={pos ? null : 'hidden'}
  bind:offsetWidth={w}
  bind:offsetHeight={h}
  onpointerdown={onraise}
  {@attach chrome('win')}
>
  <header
    class="wh"
    role="toolbar"
    tabindex="-1"
    class:fixed={modal}
    onpointerdown={startDrag}
    onpointermove={drag}
    onpointerup={endDrag}
    onpointercancel={endDrag}
    {@attach chrome('winbar')}
  >
    <PanelTitle>{title}</PanelTitle>
    <nav class="tabs">{@render (tabs ?? bar.tabs)?.()}</nav>
    {@render (tools ?? bar.tools)?.()}
    <ChromeButton mini glyph="x" label="Close" onclick={onclose} />
  </header>
  <div class="wb window-body" use:autohideScroll>
    {@render children()}
  </div>
  {#if onresize && !modal}
    <ResizeGrip from={() => ({ w, h })} {onresize} onreset={() => onresetsize?.()} />
  {/if}
</div>

<style>
  .win {
    position: absolute;
    display: flex;
    flex-direction: column;
    padding: 5px 13px 12px;
    color: var(--text);
    pointer-events: auto;
  }
  .wh {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    height: 28px;
    margin: 0 -8px 8px;
    padding: 0 5px 2px 8px;
    cursor: grab;
    user-select: none;
    touch-action: none;
  }
  .wh.fixed {
    cursor: default;
  }
  .tabs {
    flex: 1;
    display: flex;
    gap: 2px;
    min-width: 0;
    height: 20px;
    overflow: hidden;
  }
  .wb {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: auto;
  }
</style>
