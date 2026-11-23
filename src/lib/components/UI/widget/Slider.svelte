<script lang="ts">
  import type { Snippet } from 'svelte';
  import { chrome } from '$lib/pixelArt/chrome';

  let {
    value,
    min = 0,
    max = 100,
    step = 1,
    disabled = false,
    label,
    class: cls = '',
    oninput,
    children
  }: {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    label: string;
    class?: string;
    oninput?: (v: number) => void;
    children?: Snippet;
  } = $props();

  const level = $derived(
    max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0
  );
</script>

<span class="slider {cls}">
  <span class="rail">
    <i class="track" {@attach chrome('well')}>
      <i class="fill" style:width="{level}%"></i>
      <i class="knob" style:left="{level}%" {@attach chrome('btn')}></i>
    </i>
    <input
      type="range"
      {min}
      {max}
      {step}
      {value}
      {disabled}
      aria-label={label}
      oninput={(e) => oninput?.(Number(e.currentTarget.value))}
    />
  </span>
  {#if children}<b>{@render children()}</b>{/if}
</span>

<style>
  .slider {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    height: 20px;
  }
  .rail {
    position: relative;
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    height: 20px;
  }
  .track {
    display: block;
    flex: 1;
    height: 8px;
  }
  .fill {
    position: absolute;
    left: 1px;
    top: 1px;
    bottom: 1px;
    display: block;
    background: var(--accent);
  }
  .knob {
    position: absolute;
    top: -5px;
    display: block;
    width: 9px;
    height: 18px;
    margin-left: -4px;
  }
  input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
    width: 100%;
    height: 100%;
    cursor: pointer;
  }
  input:disabled {
    cursor: default;
  }
  b {
    flex: none;
    font-weight: normal;
    color: var(--text);
  }
</style>
