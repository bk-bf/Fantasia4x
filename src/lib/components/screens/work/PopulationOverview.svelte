<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { getPawnTaskSummary } from '$lib/components/util/pawnUtils';
  import type { Pawn } from '$lib/game/core/types';
  import SkillRows from '$lib/components/pawn/SkillRows.svelte';
  import SkinBar from '$lib/components/UI/widget/SkinBar.svelte';
  import Well from '$lib/components/UI/widget/Well.svelte';

  let { pawn, highlightCategory = null }: { pawn: Pawn; highlightCategory?: string | null } =
    $props();

  const task = $derived(getPawnTaskSummary(pawn, $gameState));
  const needs = $derived([
    ['Hunger', pawn.needs.hunger],
    ['Fatigue', pawn.needs.fatigue],
    ['Thirst', pawn.needs.thirst ?? 0],
    ['Hygiene', pawn.needs.hygiene ?? 0]
  ] as const);
</script>

<div class="strip">
  <Well title={pawn.name}>
    <div class="kv hot"><em>Doing</em><span>{task?.currentTask ?? 'idle'}</span></div>
    <div class="kv"><em>Next</em><span>{task?.nextTask ?? 'no work'}</span></div>
    {#each needs as [label, v] (label)}
      <div class="meter">
        <em>{label}</em>
        <SkinBar value={v / 100} ramp={v > 70 ? 'ember' : 'honey'} />
        <span class:neg={v > 70}>{Math.round(v)}%</span>
      </div>
    {/each}
  </Well>
  <Well title="Work skills">
    <SkillRows {pawn} rows={4} highlight={highlightCategory} />
  </Well>
</div>

<style>
  .strip {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 6px;
    margin-top: 6px;
  }
  .kv,
  .meter {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 18px;
  }
  em {
    flex: none;
    width: 70px;
    font-style: normal;
    color: var(--text-muted);
  }
  .kv span {
    flex: 1;
    min-width: 0;
    text-align: right;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .kv.hot span {
    color: var(--accent-hi);
  }
  .meter span {
    width: 40px;
    text-align: right;
    color: var(--text-dim);
  }
  .meter span.neg {
    color: var(--neg);
  }
</style>
