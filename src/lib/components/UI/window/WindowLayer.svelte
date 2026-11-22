<script lang="ts">
  import { uiState, type WindowId } from '$lib/stores/uiState';
  import { panelAmbient } from '$lib/components/UI/theme/ambientStore';
  import GameWindow from './GameWindow.svelte';
  import ModalVeil from './ModalVeil.svelte';
  import { BIG_WIDTH_MAX, BIG_WIDTH_MIN, WINDOW_HEIGHT_MAX, WINDOWS } from './windowRegistry';
  import {
    centreWindow,
    dragTo,
    placeWindow,
    resizeTo,
    type Area,
    type Point,
    type Rect
  } from './windowPlacement';

  let { left, right, top }: { left: number; right: number; top: number } = $props();

  let W = $state(0);
  let H = $state(0);
  let pos: Partial<Record<WindowId, Point>> = $state({});
  let size: Partial<Record<WindowId, { w: number; h: number }>> = $state({});
  let chosen: Partial<Record<WindowId, { w: number; h: number }>> = $state({});

  const open = $derived($uiState.windows);
  const ORDER = Object.keys(WINDOWS) as WindowId[];
  const mounted = $derived(ORDER.filter((id) => open.includes(id)));
  const area: Area = $derived({ left, right, top, width: W, height: H });
  const veiled = $derived(open.some((id) => WINDOWS[id].modal));

  $effect(() => {
    void [W, H, left, right];
    pos = {};
  });
  $effect(() => {
    for (const id of Object.keys(pos) as WindowId[]) if (!open.includes(id)) delete pos[id];
  });

  function widthOf(id: WindowId): number {
    if (chosen[id]) return Math.min(chosen[id].w, W - 12);
    const want = WINDOWS[id].width;
    if (want !== 'big') return Math.min(want, W - 12);
    return Math.min(W - 12, BIG_WIDTH_MAX, Math.max(BIG_WIDTH_MIN, W - left - right - 16));
  }
  const capOf = () => Math.min(WINDOW_HEIGHT_MAX, H - top - 12);

  function heightOf(id: WindowId): number | null {
    const spec = WINDOWS[id];
    if (spec.modal) return null;
    if (chosen[id]) return Math.min(chosen[id].h, H - 12);
    if (spec.fit) return null;
    return Math.min(spec.height ?? WINDOW_HEIGHT_MAX, H - top - 12);
  }

  function resize(id: WindowId, w: number, h: number) {
    if (pos[id]) chosen[id] = resizeTo(pos[id], w, h, area);
  }

  function sized(id: WindowId, w: number, h: number) {
    size[id] = { w, h };
    if (pos[id]) return;
    if (WINDOWS[id].modal) {
      pos[id] = centreWindow(w, h, area);
      return;
    }
    const placed: Rect[] = open
      .filter((o) => o !== id && !WINDOWS[o].modal && pos[o] && size[o])
      .map((o) => ({ ...pos[o]!, w: size[o]!.w, h: size[o]!.h }));
    pos[id] = placeWindow(placed, w, h, area);
  }
</script>

<svelte:window bind:innerWidth={W} bind:innerHeight={H} />

{#if mounted.length}
  <div class="window-layer" style={$panelAmbient.vars}>
    {#if veiled}<ModalVeil />{/if}
    {#each mounted as id (id)}
      {@const spec = WINDOWS[id]}
      <GameWindow
        {id}
        title={spec.title}
        modal={spec.modal}
        pos={pos[id] ?? null}
        width={widthOf(id)}
        height={heightOf(id)}
        maxHeight={spec.modal || chosen[id] ? null : capOf()}
        z={(spec.modal ? 40 : 10) + open.indexOf(id)}
        onsize={(w, h) => sized(id, w, h)}
        onmove={(p) => (pos[id] = dragTo(p, size[id]?.w ?? 0, area))}
        onraise={() => uiState.raiseWindow(id)}
        onclose={() => uiState.closeWindow(id)}
        onresize={(w, h) => resize(id, w, h)}
        onresetsize={() => delete chosen[id]}
      >
        <spec.component />
      </GameWindow>
    {/each}
  </div>
{/if}

<style>
  .window-layer {
    position: absolute;
    inset: 0;
    z-index: 60;
    pointer-events: none;
    will-change: transform;
  }
</style>
