<script module lang="ts">
  const stack: symbol[] = [];
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ModalId } from '$lib/stores/uiState';
  import { panelAmbient } from '$lib/components/UI/theme/ambientStore';
  import GameWindow from './GameWindow.svelte';
  import ModalVeil from './ModalVeil.svelte';
  import { centreWindow } from './windowPlacement';

  let {
    id,
    title,
    width,
    onclose,
    children
  }: {
    id: ModalId;
    title: string;
    width: number;
    onclose: () => void;
    children: Snippet;
  } = $props();

  const me = Symbol('modal');
  $effect(() => {
    stack.push(me);
    return () => void stack.splice(stack.indexOf(me), 1);
  });

  let W = $state(0);
  let H = $state(0);
  let size = $state({ w: 0, h: 0 });
  const pos = $derived(
    W && size.w
      ? centreWindow(size.w, size.h, { left: 0, right: 0, top: 12, width: W, height: H })
      : null
  );

  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Escape' || stack.at(-1) !== me) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    onclose();
  }
</script>

<svelte:window onkeydowncapture={onKey} />

<div class="modal-layer" style={$panelAmbient.vars} bind:clientWidth={W} bind:clientHeight={H}>
  <ModalVeil />
  <GameWindow
    {id}
    {title}
    modal
    {pos}
    width={Math.min(width, W - 12)}
    height={null}
    z={40}
    onsize={(w, h) => (size = { w, h })}
    onmove={() => {}}
    onraise={() => {}}
    {onclose}
  >
    {@render children()}
  </GameWindow>
</div>

<style>
  .modal-layer {
    position: fixed;
    inset: 0;
    z-index: 1400;
    pointer-events: none;
    font: 16px/18px var(--font-pixel);
    letter-spacing: 0.6px;
  }
</style>
