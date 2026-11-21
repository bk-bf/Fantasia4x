<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { buildHealthModel } from '$lib/components/UI/canvas/selectionCard';
  import { getActiveConditionViews } from '$lib/components/util/conditionInfo';
  import HealthReadout from '$lib/components/UI/canvas/HealthReadout.svelte';
  import StatPills from '$lib/components/UI/widget/StatPills.svelte';
  import BodyDoll from './BodyDoll.svelte';
  import ConditionRows from './ConditionRows.svelte';

  const pawn = $derived(($gameState.pawns ?? []).find((p) => p.id === $uiState.selectedPawnId));
  const health = $derived(pawn ? buildHealthModel(pawn) : undefined);
  const conditions = $derived(pawn ? getActiveConditionViews(pawn) : []);
</script>

<div class="health">
  {#if pawn && health}
    <h5>{pawn.name}</h5>
    <StatPills pills={health.pills ?? []} />
    {#if conditions.length}<div class="conds"><ConditionRows views={conditions} inline /></div>{/if}
    <div class="bodygrid">
      <BodyDoll {pawn} />
      <HealthReadout {health} pills={false} />
    </div>
  {:else}
    <p>Choose someone to look over.</p>
  {/if}
</div>

<style>
  .health {
    font: 16px/18px var(--font-pixel);
    color: var(--text);
  }
  h5 {
    margin: 0 0 4px;
    font: inherit;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1.6px;
  }
  .conds {
    margin-top: 3px;
  }
  .bodygrid {
    display: grid;
    grid-template-columns: 72px 1fr;
    gap: 12px;
    margin-top: 6px;
  }
  p {
    margin: 0;
    color: var(--text-muted);
  }
</style>
