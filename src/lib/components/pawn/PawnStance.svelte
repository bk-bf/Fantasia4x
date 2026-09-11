<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { gameState } from '$lib/stores/gameState';
  import SegmentedRow from '$lib/components/UI/widget/SegmentedRow.svelte';

  let { pawn }: { pawn: Pawn } = $props();

  type Stance = NonNullable<Pawn['combatStance']>;
  const STANCES: { id: Stance; label: string; title: string }[] = [
    { id: 'aggressive', label: 'AGGRO', title: 'Engage any hostile within vision range' },
    { id: 'defensive', label: 'DEF', title: 'Only fight once a hostile is adjacent (default)' },
    { id: 'flee', label: 'FLEE', title: 'Retreat as soon as a hostile is seen' }
  ];

  const current = $derived(pawn.combatStance ?? 'defensive');

  function setStance(stance: Stance) {
    gameState.command({ type: 'setPawnStance', payload: { pawnId: pawn.id, stance }, save: true });
  }
</script>

<SegmentedRow label="STANCE" options={STANCES} value={current} onSelect={setStance} />
