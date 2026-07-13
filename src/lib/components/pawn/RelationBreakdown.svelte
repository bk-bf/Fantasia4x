<script lang="ts">
  /** SOCIAL-LAYER: the toggleable point breakdown for one relationship — its recent history
   *  (what happened, when, how many points each moment gave), newest first. */
  import type { PawnRelationship, RelationEventKind } from '$lib/game/core/types';
  import { dayIndexForTurn } from '$lib/game/services/EnvironmentService';

  export let rel: PawnRelationship;

  // Per-kind accent so the ledger reads at a glance (grief purple, strife red, warmth green…).
  const KIND_COLOR: Record<RelationEventKind, string> = {
    seed: '#8a8a8a',
    talk: '#6aa0d0',
    time: '#7a8a6a',
    rescue: '#5ab070',
    tend: '#5ab070',
    battle: '#d0a040',
    grief: '#a070c0',
    strife: '#cc5544',
    romance: '#e06699'
  };

  // Newest first; each `time` line is a rolled-up running total, the rest are discrete moments.
  $: entries = [...(rel.log ?? [])].reverse();
  $: sign = (n: number) => (n >= 0 ? '+' : '') + (Math.round(n * 10) / 10).toString();
</script>

<div class="breakdown">
  {#if entries.length > 0}
    {#each entries as e}
      <div class="brk-row">
        <span class="brk-day">day {dayIndexForTurn(e.turn) + 1}</span>
        <span class="brk-label" style:color={KIND_COLOR[e.kind]}>{e.label}</span>
        <span class="brk-delta" class:pos={e.delta > 0} class:neg={e.delta < 0}>
          {e.delta === 0 ? '·' : sign(e.delta)}
        </span>
      </div>
    {/each}
  {:else}
    <div class="brk-empty">nothing has passed between them yet</div>
  {/if}
</div>

<style>
  .breakdown {
    margin: 2px 0 4px 10px;
    padding-left: 8px;
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .brk-row {
    display: grid;
    grid-template-columns: 52px 1fr 40px;
    gap: 6px;
    font-size: 11px;
    line-height: 1.4;
  }
  .brk-day {
    color: var(--text-dim, #777);
  }
  .brk-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .brk-delta {
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--text-dim, #888);
  }
  .brk-delta.pos {
    color: #68a030;
  }
  .brk-delta.neg {
    color: #cc5544;
  }
  .brk-empty {
    font-size: 11px;
    font-style: italic;
    color: var(--text-dim, #777);
  }
</style>
