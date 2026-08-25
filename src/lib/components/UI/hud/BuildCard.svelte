<script lang="ts">
  import SpriteIcon from '../widget/SpriteIcon.svelte';
  import HoverTip from '../tooltip/HoverTip.svelte';
  import ItemStatTooltip from '../tooltip/ItemStatTooltip.svelte';
  import BuildingStatTooltip from '../tooltip/BuildingStatTooltip.svelte';
  import type { Item, Recipe, Building } from '$lib/game/core/types';

  let descTip: { x: number; y: number } | null = null;
  function onDescEnter(e: MouseEvent) {
    const el = e.currentTarget as HTMLElement;
    if (el.scrollHeight > el.clientHeight + 1) descTip = { x: e.clientX, y: e.clientY };
  }
  function onDescMove(e: MouseEvent) {
    if (descTip) descTip = { x: e.clientX, y: e.clientY };
  }
  function onDescLeave() {
    descTip = null;
  }

  let statTip: { x: number; y: number } | null = null;
  function onStatEnter(e: MouseEvent) {
    if (hasStats) statTip = { x: e.clientX, y: e.clientY };
  }
  function onStatMove(e: MouseEvent) {
    if (statTip) statTip = { x: e.clientX, y: e.clientY };
  }
  function onStatLeave() {
    statTip = null;
  }

  type CharSpan = { sheet?: string; id?: number; from?: number; to?: number; literal?: string };

  export let name: string;
  export let charSpans: CharSpan[] | undefined = undefined;
  export let description: string | null = null;
  export let tint = 'var(--accent)';
  export let badge: string | null = null;
  export let workAmount: number | null = null;
  export let station: string | null = null;
  export let toolTier: number | null = null;
  export let toolMet = true;
  export let requiredTool: string | null = null;
  export let requiredToolMet = true;
  export let actionLabel: string;
  export let actionEnabled = true;
  export let variant: 'ok' | 'missing' | 'blocked' | 'pending' = 'ok';
  export let onAction: () => void;
  export let quantities: number[] | null = null;
  export let onQuantity: ((n: number) => void) | null = null;
  export let statItem: Item | null = null;
  export let statRecipe: Recipe | null = null;
  export let statIngredients: Record<string, string> = {};
  export let buildingDef: Building | null = null;
  export let statMaterials: Record<string, string> = {};
  export let jobLabel: string | null = null;

  $: hasItemStats =
    !!statItem &&
    (!!statItem.weaponProperties ||
      !!statItem.armorProperties ||
      (statItem.type === 'tool' && !!statItem.toolBoost) ||
      statItem.nutrition != null ||
      statItem.medicineQuality != null ||
      statItem.decaySeconds != null ||
      Object.keys(statItem.effects ?? {}).length > 0);
  $: showItemTip = !!statItem && (hasItemStats || !!jobLabel);
  $: hasStats = showItemTip || !!buildingDef;
</script>

<div class="build-card" class:disabled={!actionEnabled}>
  <div class="card-accent" style="background: {tint}"></div>
  <div class="card-body">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="card-header"
      class:has-stats={hasStats}
      on:mouseenter={onStatEnter}
      on:mousemove={onStatMove}
      on:mouseleave={onStatLeave}
    >
      <SpriteIcon {charSpans} px={18} />
      <span class="card-name">{name}</span>
      {#if workAmount != null}<span class="card-work" title="work to complete">⚒{workAmount}</span
        >{/if}
      {#if badge}<span class="card-badge">{badge}</span>{/if}
    </div>
    {#if description}<div
        class="card-desc"
        role="note"
        on:mouseenter={onDescEnter}
        on:mousemove={onDescMove}
        on:mouseleave={onDescLeave}
      >
        {description}
      </div>{/if}
    {#if station}<div class="card-station" title="required workstation">⚒ {station}</div>{/if}
    {#if toolTier}<div class="card-tool" class:unmet={!toolMet} title="required tool tier">
        🔧 tier {toolTier} tools{#if !toolMet}
          (locked){/if}
      </div>{/if}
    {#if requiredTool}<div
        class="card-tool"
        class:unmet={!requiredToolMet}
        title="required implement"
      >
        🍲 needs {requiredTool}{#if !requiredToolMet}
          (none){/if}
      </div>{/if}
    <div class="card-cost"><slot /></div>
    {#if quantities && onQuantity}
      <div class="card-actions">
        <button
          class="card-action card-action--{variant}"
          disabled={!actionEnabled}
          title="craft 1"
          on:click={onAction}
        >
          {actionLabel}
        </button>
        {#each quantities as q}
          <button
            class="card-action card-action--{variant}"
            disabled={!actionEnabled}
            title="queue {q}"
            on:click={() => onQuantity?.(q)}
          >
            +{q}
          </button>
        {/each}
      </div>
    {:else}
      <button
        class="card-action card-action--{variant}"
        disabled={!actionEnabled}
        on:click={onAction}
      >
        {actionLabel}
      </button>
    {/if}
  </div>
</div>

{#if descTip && description}
  <HoverTip x={descTip.x} y={descTip.y}>{description}</HoverTip>
{/if}

{#if statTip && buildingDef}
  <BuildingStatTooltip
    building={buildingDef}
    materials={statMaterials}
    x={statTip.x}
    y={statTip.y}
  />
{:else if statTip && showItemTip && statItem}
  <ItemStatTooltip
    item={statItem}
    recipe={statRecipe}
    selectedIngredients={statIngredients}
    {jobLabel}
    x={statTip.x}
    y={statTip.y}
  />
{/if}

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
  .card-header.has-stats {
    cursor: help;
  }
  .card-name {
    color: var(--accent-hi);
    font-size: 12px;
    letter-spacing: 0.04em;
    font-weight: 600;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .card-work {
    color: var(--text-dim);
    font-size: 10px;
    flex-shrink: 0;
    white-space: nowrap;
  }
  .card-badge {
    color: var(--accent-hi);
    font-size: 11px;
    flex-shrink: 0;
  }
  .card-desc {
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .card-station {
    color: var(--text-dim);
    font-size: 10px;
    letter-spacing: 0.03em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .card-tool {
    color: var(--text-dim);
    font-size: 10px;
    letter-spacing: 0.03em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .card-tool.unmet {
    color: var(--neg, #d05050);
  }
  .card-cost {
    color: var(--text-dim);
    font-size: 11px;
    line-height: 1.4;
    min-height: 14px;
  }
  .card-actions {
    margin-top: 2px;
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }
  .card-action {
    margin-top: 2px;
    align-self: flex-start;
    padding: 2px 8px;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.05em;
    cursor: pointer;
  }
  .card-actions .card-action {
    margin-top: 0;
    padding: 2px 6px;
  }
  .card-action--ok {
    border-color: var(--accent-hi);
    color: var(--accent-hi);
  }
  .card-action--ok:hover {
    background: color-mix(in srgb, var(--accent-hi) 18%, transparent);
  }
  .card-action--pending {
    border-color: var(--text-dim);
    color: var(--text-dim);
  }
  .card-action--pending:hover {
    background: color-mix(in srgb, var(--text-dim) 18%, transparent);
  }
  .card-action--missing {
    color: var(--neg, #d05050);
    border-color: var(--neg, #d05050);
  }
  .card-action--blocked {
    color: var(--text-muted, #777);
  }
</style>
