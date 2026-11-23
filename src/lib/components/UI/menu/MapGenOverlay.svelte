<script lang="ts">
  import { chrome } from '$lib/pixelArt/chrome';
  import PanelTitle from '$lib/components/UI/widget/PanelTitle.svelte';
  import { panelAmbient } from '$lib/components/UI/theme/ambientStore';
  import ModalVeil from '$lib/components/UI/window/ModalVeil.svelte';

  let { size }: { size: number } = $props();
</script>

<div class="layer" role="status" aria-live="polite" style={$panelAmbient.vars}>
  <ModalVeil />
  <div class="box" {@attach chrome('win')}>
    <PanelTitle>Shaping the land</PanelTitle>
    <i class="track" {@attach chrome('well')}><i class="fill"></i></i>
    <p>{size} × {size}</p>
  </div>
</div>

<style>
  .layer {
    position: fixed;
    inset: 0;
    z-index: 1500;
    display: flex;
    align-items: center;
    justify-content: center;
    font: 16px/18px var(--font-pixel);
    letter-spacing: 0.6px;
  }
  .box {
    position: relative;
    z-index: 31;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 14px 26px 12px;
  }
  .track {
    display: block;
    width: 260px;
    height: 8px;
    overflow: hidden;
  }
  .fill {
    position: absolute;
    top: 1px;
    bottom: 1px;
    left: 0;
    width: 35%;
    background: var(--accent);
    animation: slide 1s linear infinite;
  }
  @keyframes slide {
    from {
      transform: translateX(-110%);
    }
    to {
      transform: translateX(390%);
    }
  }
  p {
    margin: 0;
    color: var(--text-muted);
  }
</style>
