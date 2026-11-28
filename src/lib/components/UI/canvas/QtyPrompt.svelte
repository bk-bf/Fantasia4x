<script lang="ts">
  import { chrome } from '$lib/pixelArt/chrome';
  import ClickAway from '../widget/ClickAway.svelte';
  import ChromeButton from '../widget/ChromeButton.svelte';
  import Stepper from '../widget/Stepper.svelte';

  let {
    x,
    y,
    name,
    max,
    value = $bindable(),
    onconfirm,
    onclose
  }: {
    x: number;
    y: number;
    name: string;
    max: number;
    value: number;
    onconfirm: () => void;
    onclose: () => void;
  } = $props();
</script>

<ClickAway {onclose} />
<div class="qty" style:left="{x}px" style:top="{y}px" {@attach chrome('tip')}>
  <h5>Pick up {name}</h5>
  <div class="row">
    <Stepper
      label="How many"
      {value}
      min={1}
      {max}
      onchange={(v) => (value = v)}
      onenter={onconfirm}
    />
    <em>of {max}</em>
  </div>
  <div class="minis">
    <ChromeButton on onclick={onconfirm}>Take</ChromeButton>
    <ChromeButton onclick={onclose}>Cancel</ChromeButton>
  </div>
</div>

<style>
  .qty {
    position: fixed;
    z-index: 999;
    width: 200px;
    box-sizing: border-box;
    padding: 8px 11px;
    color: var(--text);
    font: 16px/18px var(--font-pixel);
    letter-spacing: 0.6px;
  }
  h5 {
    margin: 0 0 4px;
    font: inherit;
    color: var(--accent-hi);
    text-transform: uppercase;
    letter-spacing: 1.6px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }
  em {
    font-style: normal;
    color: var(--text-muted);
  }
  .minis {
    display: flex;
    gap: 4px;
  }
  .minis :global(.cbtn) {
    flex: 1;
  }
</style>
