<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { awakeningLabel, lineageDef } from '$lib/game/core/defs/lineages';
  import SkinBar from '$lib/components/UI/widget/SkinBar.svelte';

  let { pawn }: { pawn: Pawn } = $props();

  const active = $derived((pawn.lineagePaths ?? []).filter((p) => p.value > 0));
</script>

{#if active.length}
  <h5>Awakening</h5>
  {#each active as path (path.lineage)}
    {@const pct = Math.round((path.value / path.target) * 100)}
    <div class="meter" title={awakeningLabel(path.condition) ?? ''}>
      <em>{lineageDef(path.lineage)?.name ?? path.lineage}</em>
      <SkinBar value={pct / 100} ramp={pct >= 100 ? 'leaf' : 'violet'} />
      <span class:ready={pct >= 100}>{pct >= 100 ? 'ready' : pct + '%'}</span>
    </div>
  {/each}
{/if}

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
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  span {
    flex: none;
    width: 96px;
    text-align: right;
    color: var(--text-dim);
  }
  .ready {
    color: var(--pos);
  }
</style>
