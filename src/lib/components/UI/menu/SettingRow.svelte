<script lang="ts">
  import { chrome } from '$lib/pixelArt/chrome';
  import CheckBox from '$lib/components/UI/widget/CheckBox.svelte';
  import Slider from '$lib/components/UI/widget/Slider.svelte';

  type Option = { value: string; label: string };
  let {
    label,
    sub = '',
    type,
    checked = false,
    value = '',
    sliderValue = 80,
    options = [],
    disabled = false,
    onToggle,
    onSelect,
    onInput
  }: {
    label: string;
    sub?: string;
    type: 'checkbox' | 'select' | 'slider';
    checked?: boolean;
    value?: string;
    sliderValue?: number;
    options?: Option[];
    disabled?: boolean;
    onToggle?: () => void;
    onSelect?: (v: string) => void;
    onInput?: (v: number) => void;
  } = $props();
</script>

{#if type === 'checkbox'}
  <CheckBox {checked} {disabled} onchange={() => onToggle?.()}
    >{label}{#if sub}<em>{sub}</em>{/if}</CheckBox
  >
{:else}
  <div class="srow" class:noted={!!sub} class:off={disabled}>
    <span class="lbl"
      >{label}{#if sub}<em>{sub}</em>{/if}</span
    >
    {#if type === 'select'}
      <span class="seg" role="radiogroup" aria-label={label}>
        {#each options as o (o.value)}
          <button
            class="segb"
            class:on={o.value === value}
            role="radio"
            aria-checked={o.value === value}
            {disabled}
            onclick={() => onSelect?.(o.value)}
            {@attach chrome(o.value === value ? 'cellOn' : 'cell')}><span>{o.label}</span></button
          >
        {/each}
      </span>
    {:else}
      <Slider
        class="srow-slider"
        value={disabled ? 80 : sliderValue}
        {disabled}
        {label}
        oninput={(v) => onInput?.(v)}
      />
    {/if}
  </div>
{/if}

<style>
  em {
    margin-left: 6px;
    font-style: normal;
    color: var(--text-muted);
  }
  .srow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 22px;
  }
  .srow.noted .lbl em {
    display: block;
    margin: 0;
    line-height: 14px;
  }
  .lbl {
    min-width: 0;
  }
  .off {
    opacity: 0.5;
    cursor: default;
  }
  .seg {
    display: inline-flex;
    gap: 1px;
    flex: none;
  }
  .segb {
    height: 20px;
    padding: 0 7px;
    border: 0;
    background: none;
    font: inherit;
    color: var(--text-dim);
    cursor: pointer;
  }
  .segb.on {
    color: var(--ember);
  }
  .srow :global(.srow-slider) {
    flex: none;
    width: 110px;
  }
</style>
