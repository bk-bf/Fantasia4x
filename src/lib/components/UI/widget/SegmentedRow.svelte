<script lang="ts" generics="T">
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
  <span class="lbl" title={labelTitle}>{label}</span>
  <div class="seg">
    {#each options as o (o.label)}
      <button
        class="seg-btn"
        class:danger={o.danger}
        class:active={value === o.id}
        title={o.title}
        onclick={() => onSelect(o.id)}
      >
        {o.label}
      </button>
    {/each}
  </div>
</div>

<style>
  .row {
    display: flex;
    padding: 2px 8px;
    align-items: center;
    gap: 6px;
  }

  .lbl {
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
    min-width: 80px;
    flex-shrink: 0;
  }

  .seg {
    display: flex;
    margin-left: auto;
    border: 1px solid var(--border);
  }

  .seg-btn {
    background: var(--bg-panel);
    color: var(--text-dim);
    border: none;
    border-left: 1px solid var(--border);
    padding: 2px 8px;
    font-family: inherit;
    font-size: 11px;
    letter-spacing: 0.04em;
    cursor: pointer;
  }
  .seg-btn:first-child {
    border-left: none;
  }
  .seg-btn:hover {
    background: var(--bg-hover);
    color: var(--text);
  }
  .seg-btn.active {
    background: var(--accent);
    color: var(--bg);
    font-weight: 600;
  }
  .seg-btn.danger.active {
    background: var(--neg, #c0392b);
    color: #fff;
  }
</style>
