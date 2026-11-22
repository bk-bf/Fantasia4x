<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { buildHealthModel, mobDisplayName } from '$lib/components/UI/canvas/selectionCard';
  import { getCreatureById } from '$lib/game/core/defs/creatures';
  import { getActiveConditionViews } from '$lib/components/util/conditionInfo';
  import HealthReadout from '$lib/components/UI/canvas/HealthReadout.svelte';
  import StatPills from '$lib/components/UI/widget/StatPills.svelte';
  import BodyDoll from './BodyDoll.svelte';
  import ConditionRows from './ConditionRows.svelte';

  const pawn = $derived(($gameState.pawns ?? []).find((p) => p.id === $uiState.selectedPawnId));
  const mob = $derived(
    pawn ? undefined : ($gameState.mobs ?? []).find((m) => m.id === $uiState.selectedMobId)
  );
  const mobDef = $derived(mob ? getCreatureById(mob.creatureId) : undefined);
  const entity = $derived(pawn ?? mob);
  const name = $derived(pawn?.name ?? (mob && mobDef ? mobDisplayName(mob, mobDef) : ''));
  const health = $derived(entity ? buildHealthModel(entity) : undefined);
  const conditions = $derived(entity ? getActiveConditionViews(entity) : []);
</script>

<div class="health">
  {#if entity && health}
    <h5>{name}</h5>
    <StatPills pills={health.pills ?? []} />
    {#if conditions.length}<div class="conds"><ConditionRows views={conditions} inline /></div>{/if}
    <div class="bodygrid" class:whole={!pawn}>
      {#if pawn}<BodyDoll {pawn} />{/if}
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
  .bodygrid.whole {
    grid-template-columns: 1fr;
  }
  p {
    margin: 0;
    color: var(--text-muted);
  }
</style>
