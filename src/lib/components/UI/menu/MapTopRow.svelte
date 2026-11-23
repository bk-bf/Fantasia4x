<script lang="ts">
  import { chrome } from '$lib/pixelArt/chrome';
  import ChromeButton from '$lib/components/UI/widget/ChromeButton.svelte';
  import SegmentedRow from '$lib/components/UI/widget/SegmentedRow.svelte';

  let {
    sizes,
    size,
    seed,
    onsize,
    onseed,
    onroll,
    onreset
  }: {
    sizes: { id: number; label: string; title: string }[];
    size: number;
    seed: number;
    onsize: (dim: number) => void;
    onseed: (seed: number) => void;
    onroll: () => void;
    onreset: () => void;
  } = $props();
</script>

<div class="top">
  <SegmentedRow label="Size" options={sizes} value={size} onSelect={onsize} />
  <span class="lbl">Seed</span>
  <label class="seed" {@attach chrome('well')}>
    <input
      type="number"
      aria-label="Seed"
      value={seed}
      onchange={(e) => onseed(Number(e.currentTarget.value))}
    />
  </label>
  <ChromeButton glyph="bang" onclick={onroll}>Roll</ChromeButton>
  <ChromeButton onclick={onreset}>Reset</ChromeButton>
</div>

<style>
  .top {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 4px 0 8px;
  }
  .lbl {
    color: var(--text);
  }
  .seed {
    display: flex;
    align-items: center;
    width: 130px;
    height: 20px;
    padding: 0 7px;
  }
  input {
    width: 100%;
    padding: 0;
    border: 0;
    outline: none;
    background: none;
    color: var(--text-muted);
    font: inherit;
    appearance: textfield;
  }
  input::-webkit-inner-spin-button,
  input::-webkit-outer-spin-button {
    appearance: none;
    margin: 0;
  }
  input:focus {
    color: var(--text);
  }
</style>
