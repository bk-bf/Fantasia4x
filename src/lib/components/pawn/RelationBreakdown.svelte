<script lang="ts">
  import type { PawnRelationship, RelationEventKind } from '$lib/game/core/types';
  import { dayIndexForTurn } from '$lib/game/services/EnvironmentService';

  export let rel: PawnRelationship;

  const KIND_COLOR: Record<RelationEventKind, string> = {
    seed: 'var(--text-muted)',
    talk: 'var(--cold)',
    time: 'var(--text-dim)',
    rescue: 'var(--pos)',
    tend: 'var(--pos)',
    battle: 'var(--accent-hi)',
    grief: 'var(--text-dim)',
    strife: 'var(--neg)',
    romance: 'var(--neg)'
  };

  $: entries = [...(rel.log ?? [])].reverse();
  $: sign = (n: number) => (n >= 0 ? '+' : '') + (Math.round(n * 10) / 10).toString();

  let openLines = new Set<number>();
  function toggleLines(i: number) {
    openLines.has(i) ? openLines.delete(i) : openLines.add(i);
    openLines = openLines;
  }
</script>

<div class="breakdown">
  {#if entries.length > 0}
    {#each entries as e, i}
      {@const hasLines = !!(e.lines && e.lines.length)}
      {#if hasLines}
        <button
          class="brk-row has-lines"
          class:open={openLines.has(i)}
          title="Click to read what was said"
          on:click={() => toggleLines(i)}
        >
          <span class="brk-day">day {dayIndexForTurn(e.turn) + 1}</span>
          <span class="brk-label" style:color={KIND_COLOR[e.kind]}
            >{openLines.has(i) ? '▾ ' : '▸ '}{e.label}</span
          >
          <span class="brk-delta" class:pos={e.delta > 0} class:neg={e.delta < 0}>
            {e.delta === 0 ? '·' : sign(e.delta)}
          </span>
        </button>
        {#if openLines.has(i)}
          <div class="transcript">
            {#each e.lines ?? [] as line}
              <div class="ts-line"><span class="ts-who">{line.name}:</span> “{line.text}”</div>
            {/each}
          </div>
        {/if}
      {:else}
        <div class="brk-row">
          <span class="brk-day">day {dayIndexForTurn(e.turn) + 1}</span>
          <span class="brk-label" style:color={KIND_COLOR[e.kind]}>{e.label}</span>
          <span class="brk-delta" class:pos={e.delta > 0} class:neg={e.delta < 0}>
            {e.delta === 0 ? '·' : sign(e.delta)}
          </span>
        </div>
      {/if}
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
    font-size: inherit;
    line-height: 1.4;
  }
  button.brk-row {
    width: 100%;
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    font: inherit;
    color: inherit;
    text-align: left;
  }
  .brk-row.has-lines {
    cursor: pointer;
  }
  .brk-row.has-lines:hover {
    background: rgba(255, 255, 255, 0.04);
  }
  .transcript {
    margin: 1px 0 3px 58px;
    padding-left: 6px;
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .ts-line {
    font-size: inherit;
    font-style: italic;
    opacity: 0.9;
    line-height: 1.4;
  }
  .ts-who {
    font-style: normal;
    color: var(--accent-hi);
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
    color: var(--pos);
  }
  .brk-delta.neg {
    color: var(--neg);
  }
  .brk-empty {
    font-size: inherit;
    font-style: italic;
    color: var(--text-dim, #777);
  }
</style>
