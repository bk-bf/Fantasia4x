<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { getActiveConditionViews } from '$lib/components/util/conditionInfo';
  import SkinBar from '$lib/components/UI/widget/SkinBar.svelte';
  import ConditionRows from './ConditionRows.svelte';
  import AwakeningMeters from './AwakeningMeters.svelte';
  import { needMeters } from './needMeters';

  let { pawn }: { pawn: Pawn } = $props();

  const meters = $derived(needMeters(pawn));

  const conditions = $derived(getActiveConditionViews(pawn));
</script>

{#each meters as m (m.label)}
  <div class="meter" title="{Math.round(m.value)}/{Math.round(m.max)}">
    <em>{m.label}</em>
    <SkinBar value={m.value / m.max} ramp={m.ramp} />
    <span>{m.word}</span>
  </div>
{/each}

{#if conditions.length > 0}
  <h5>Conditions</h5>
  <ConditionRows views={conditions} />
{/if}

<AwakeningMeters {pawn} />

<style>
  .meter {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 18px;
  }
  em {
    flex: none;
    width: 70px;
    font-style: normal;
  }
  span {
    flex: none;
    width: 96px;
    text-align: right;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
