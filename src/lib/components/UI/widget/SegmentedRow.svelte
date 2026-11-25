<script lang="ts" generics="T">
  import { chrome } from '$lib/pixelArt/chrome';

  let {
    label,
    labelTitle,
    options,
    value,
    onSelect
  }: {
    label: string;
    labelTitle?: string;
    options: { id: T; label: string; title: string; danger?: boolean }[];
    value: T;
    onSelect: (id: T) => void;
  } = $props();
</script>

<div class="row">
  <em title={labelTitle}>{label}</em>
  <span class="seg">
    {#each options as o (o.label)}
      <button
        class="segb"
        class:danger={o.danger}
        class:on={value === o.id}
        title={o.title}
        onclick={() => onSelect(o.id)}
        {@attach chrome(value === o.id ? 'cellOn' : 'cell')}><span>{o.label}</span></button
      >
    {/each}
  </span>
</div>

<style>
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    height: 24px;
  }
  em {
    font-style: normal;
    white-space: nowrap;
  }
  .seg {
    display: inline-flex;
    gap: 1px;
  }
  .segb {
    height: 20px;
    padding: 0 7px;
    border: 0;
    background: none;
    color: var(--text-dim);
    font: 16px/18px var(--font-pixel);
    white-space: nowrap;
    cursor: pointer;
  }
  .segb.on {
    color: var(--ember);
  }
  .segb.danger.on {
    color: var(--neg);
  }
</style>
