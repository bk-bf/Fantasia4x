<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { gameState } from '$lib/stores/gameState';
  import SegmentedRow from '$lib/components/UI/widget/SegmentedRow.svelte';

  let { pawn }: { pawn: Pawn } = $props();

  type RestPolicy = NonNullable<Pawn['restPolicy']>;
  const POLICIES: { id: RestPolicy; label: string; title: string }[] = [
    {
      id: 'never',
      label: 'NO REST',
      title: 'Never break off to recover — keep working, accept the slow heal rate (emergencies)'
    },
    {
      id: 'shelter',
      label: 'SHELTER',
      title: 'Recover only when a bed/roofed shelter is reachable; otherwise keep working'
    },
    {
      id: 'always',
      label: 'ALWAYS',
      title: 'Recover freely, lying on the bare ground if no bed/shelter is near (default)'
    }
  ];

  const current = $derived(pawn.restPolicy ?? 'always');

  function setPolicy(policy: RestPolicy) {
    gameState.command({
      type: 'setPawnRestPolicy',
      payload: { pawnId: pawn.id, policy },
      save: true
    });
  }
</script>

<SegmentedRow label="REST" options={POLICIES} value={current} onSelect={setPolicy} />
