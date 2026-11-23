<script lang="ts">
  import { chrome } from '$lib/pixelArt/chrome';
  import ChromeButton from './ChromeButton.svelte';

  let {
    value,
    min = 0,
    max,
    label,
    onchange,
    onenter
  }: {
    value: number;
    min?: number;
    max: number;
    label: string;
    onchange: (v: number) => void;
    onenter?: () => void;
  } = $props();

  const clamp = (n: number) => Math.max(min, Math.min(max, Math.floor(n) || min));
</script>

<span class="stepper">
  <ChromeButton
    mini
    label="Fewer"
    disabled={value <= min}
    onclick={() => onchange(clamp(value - 1))}>−</ChromeButton
  >
  <label class="num" {@attach chrome('well')}>
    <input
      type="number"
      {min}
      {max}
      {value}
      aria-label={label}
      onchange={(e) => onchange(clamp(Number(e.currentTarget.value)))}
      onkeydown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') onenter?.();
      }}
    />
  </label>
  <ChromeButton mini label="More" disabled={value >= max} onclick={() => onchange(clamp(value + 1))}
    >+</ChromeButton
  >
</span>

<style>
  .stepper {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .num {
    display: flex;
    align-items: center;
    width: 50px;
    height: 20px;
    padding: 0 6px;
    box-sizing: border-box;
  }
  input {
    width: 100%;
    min-width: 0;
    padding: 0;
    border: 0;
    background: none;
    color: var(--text);
    font: 16px/18px var(--font-pixel);
    text-align: center;
    appearance: textfield;
    -moz-appearance: textfield;
  }
  input::-webkit-inner-spin-button,
  input::-webkit-outer-spin-button {
    appearance: none;
    margin: 0;
  }
  input:focus {
    outline: none;
  }
</style>
