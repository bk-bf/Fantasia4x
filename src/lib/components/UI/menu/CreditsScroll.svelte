<script lang="ts">
  import ChromeButton from '$lib/components/UI/widget/ChromeButton.svelte';
  import ModalWindow from '$lib/components/UI/window/ModalWindow.svelte';
  import { CREDITS, CREDITS_TAGLINE } from './creditsList';

  let { onClose }: { onClose: () => void } = $props();
</script>

<ModalWindow id="credits" title="Fantasia" width={360} onclose={onClose}>
  <p class="lore">{CREDITS_TAGLINE}</p>
  <div class="view">
    <div class="roll">
      {#each CREDITS as block (block.role)}
        <section>
          <h5>{block.role}</h5>
          {#each block.lines as line (line)}<p>{line}</p>{/each}
        </section>
      {/each}
    </div>
  </div>
  <div class="foot">
    <ChromeButton onclick={onClose}>Close</ChromeButton>
  </div>
</ModalWindow>

<style>
  .lore {
    margin: 0 0 8px;
    color: var(--text-dim);
    line-height: 17px;
    text-align: center;
  }
  .view {
    position: relative;
    height: min(420px, 56vh);
    overflow: hidden;
    -webkit-mask-image: linear-gradient(transparent, #000 12%, #000 80%, transparent);
    mask-image: linear-gradient(transparent, #000 12%, #000 80%, transparent);
  }
  .roll {
    position: absolute;
    left: 0;
    right: 0;
    text-align: center;
    animation: roll 48s linear infinite;
  }
  @keyframes roll {
    from {
      top: 100%;
      transform: translateY(0);
    }
    to {
      top: 0;
      transform: translateY(-100%);
    }
  }
  section {
    margin-bottom: 14px;
  }
  h5 {
    margin: 0 0 2px;
    font: inherit;
    color: var(--accent-hi);
    text-transform: uppercase;
    letter-spacing: 1.6px;
  }
  p {
    margin: 0;
    color: var(--text);
  }
  .foot {
    display: flex;
    justify-content: center;
    margin-top: 10px;
  }
  @media (prefers-reduced-motion: reduce) {
    .view {
      overflow-y: auto;
    }
    .roll {
      position: static;
      animation: none;
      padding: 18px 0;
    }
  }
</style>
