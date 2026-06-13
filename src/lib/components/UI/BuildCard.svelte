<!-- BuildCard.svelte — compact card for a buildable/craftable, styled like the pawn TRAITS cards:
     left accent · sprite icon + name + badge · cost (slot) · action. Shared by Buildings/Crafting. -->
<script lang="ts">
  import SpriteIcon from './SpriteIcon.svelte';

  type CharSpan = { sheet?: string; id?: number; from?: number; to?: number; literal?: string };

  export let name: string;
  export let charSpans: CharSpan[] | undefined = undefined;
  export let description: string | null = null;
  /** Accent + icon tint (rgb/hex), usually the def's fg colour. */
  export let tint = 'var(--accent)';
  export let badge: string | null = null;
  /** Work units the job costs (recipe/building workAmount). Shown as a small chip. */
  export let workAmount: number | null = null;
  /** Required workstation display name (recipe.station). Omitted for hand-craftable recipes. */
  export let station: string | null = null;
  export let actionLabel: string;
  export let actionEnabled = true;
  /** ok = buildable/craftable, missing = can't afford, blocked = unmet requirement. */
  export let variant: 'ok' | 'missing' | 'blocked' = 'ok';
  export let onAction: () => void;
</script>

<div class="build-card" class:disabled={!actionEnabled}>
  <div class="card-accent" style="background: {tint}"></div>
  <div class="card-body">
    <div class="card-header">
      <SpriteIcon {charSpans} px={18} />
      <span class="card-name">{name}</span>
      {#if workAmount != null}<span class="card-work" title="work to complete">⚒{workAmount}</span
        >{/if}
      {#if badge}<span class="card-badge">{badge}</span>{/if}
    </div>
    {#if description}<div class="card-desc">{description}</div>{/if}
    {#if station}<div class="card-station" title="required workstation">⚒ {station}</div>{/if}
    <div class="card-cost"><slot /></div>
    <button
      class="card-action card-action--{variant}"
      disabled={!actionEnabled}
      on:click={onAction}
    >
      {actionLabel}
    </button>
  </div>
</div>

<style>
  .build-card {
    display: flex;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 2px;
    overflow: hidden;
    transition: border-color 0.15s ease;
  }
  .build-card:hover {
    border-color: var(--border-hi);
  }
  .build-card.disabled {
    opacity: 0.75;
  }
  .card-accent {
    width: 3px;
    flex-shrink: 0;
  }
  .card-body {
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }
  .card-header {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .card-name {
    color: var(--accent-hi);
    font-size: 11px;
    letter-spacing: 0.04em;
    font-weight: 600;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .card-work {
    color: var(--text-dim);
    font-size: 9px;
    flex-shrink: 0;
    white-space: nowrap;
  }
  .card-badge {
    color: var(--accent-hi);
    font-size: 10px;
    flex-shrink: 0;
  }
  .card-desc {
    color: var(--text-muted);
    font-size: 10px;
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .card-station {
    color: var(--text-dim);
    font-size: 9px;
    letter-spacing: 0.03em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .card-cost {
    color: var(--text-dim);
    font-size: 10px;
    line-height: 1.4;
    min-height: 14px;
  }
  .card-action {
    margin-top: 2px;
    align-self: flex-start;
    padding: 2px 8px;
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
