<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { gameState } from '$lib/stores/gameState';
  import SegmentedRow from '$lib/components/UI/widget/SegmentedRow.svelte';

  let { pawn }: { pawn: Pawn } = $props();

  const MODES = [
    {
      id: false,
      label: 'OFF',
      title:
        'Normal — the pawn breaks off to eat, drink and rest when needs get pressing (default)'
    },
    {
      id: true,
      label: 'FORCE',
      title:
        'Neglect ALL needs and keep working — no eating, drinking or resting. Can collapse or starve the pawn; for emergencies only.',
      danger: true
    }
  ];

  const forced = $derived(pawn.forceWork === true);

  function setForceWork(forceWork: boolean) {
    gameState.command({
      type: 'setPawnForceWork',
      payload: { pawnId: pawn.id, forceWork },
      save: true
    });
  }
</script>

<SegmentedRow label="FORCE WORK" options={MODES} value={forced} onSelect={setForceWork} />
