<!-- BuildCard.svelte — compact card for a buildable/craftable: icon · name · cost (slot) · action.
     Shared by the Buildings and Crafting screens. Cost markup is slotted so each screen keeps its
     own (rich) cost/yield formatting and styling. -->
<script lang="ts">
  export let icon = '';
  export let iconColor = 'var(--text-dim)';
  export let name: string;
  export let badge: string | null = null;
  export let actionLabel: string;
  export let actionEnabled = true;
  /** ok = buildable/craftable, missing = can't afford, blocked = unmet requirement. */
  export let variant: 'ok' | 'missing' | 'blocked' = 'ok';
  export let onAction: () => void;
</script>

<div class="card" class:disabled={!actionEnabled}>
  <div class="card-hd">
    <span class="card-icon" style="color: {iconColor}">{icon}</span>
    <span class="card-name">{name}</span>
    {#if badge}<span class="card-badge">{badge}</span>{/if}
  </div>
  <div class="card-body"><slot /></div>
  <button
    class="card-action card-action--{variant}"
    disabled={!actionEnabled}
    on:click={onAction}
  >
    {actionLabel}
  </button>
</div>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 8px;
    background: var(--bg-panel, #0c1118);
    border: 1px solid var(--border);
    border-left: 2px solid var(--border-hi, #3a4658);
    font-family: 'Courier New', monospace;
  }
  .card:hover {
    border-left-color: var(--accent-hi);
    background: var(--bg-hover, #151c26);
  }
  .card.disabled {
    opacity: 0.7;
  }
  .card-hd {
    display: flex;
    align-items: baseline;
    gap: 5px;
  }
  .card-icon {
    font-size: 12px;
    flex-shrink: 0;
  }
  .card-name {
    color: var(--text);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.03em;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .card-badge {
    color: var(--accent-hi);
    font-size: 10px;
    flex-shrink: 0;
  }
  .card-body {
    font-size: 10px;
    color: var(--text-dim);
    line-height: 1.4;
    min-height: 14px;
  }
  .card-action {
    margin-top: 2px;
    padding: 3px 6px;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-family: 'Courier New', monospace;
    font-size: 10px;
    letter-spacing: 0.05em;
    cursor: pointer;
  }
  .card-action--ok {
    border-color: var(--accent-hi);
    color: var(--accent-hi);
  }
  .card-action--ok:hover {
    background: color-mix(in srgb, var(--accent-hi) 18%, transparent);
  }
  .card-action--missing {
    color: var(--neg, #d05050);
    border-color: var(--neg, #d05050);
  }
  .card-action--blocked {
    color: var(--text-muted, #777);
  }
  .card-action:disabled {
    cursor: not-allowed;
  }
</style>
