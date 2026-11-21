<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { gameState } from '$lib/stores/gameState';
  import SegmentedRow from '$lib/components/UI/widget/SegmentedRow.svelte';

  let { pawn }: { pawn: Pawn } = $props();

  const TIERS: Array<{ id: number | null; label: string; title: string }> = [
    { id: null, label: 'Best', title: 'Dress wounds with the best medicine in stock (default)' },
    { id: 0, label: 'Prim', title: 'Nothing above foraged moss, woundwort and chewed poultice' },
    {
      id: 1,
      label: 'Bronze',
      title: 'Up to honey salve — keep the worked medicine for someone else'
    },
    { id: 2, label: 'Iron', title: 'Up to spirit tincture' },
    { id: 3, label: 'Steel', title: "Up to a surgeon's dressing" },
    { id: 4, label: 'Runed', title: 'Up to Emberbloom Balm' }
  ];

  const current = $derived(pawn.medicineTierCap ?? null);

  function setTier(tier: number | null) {
    gameState.command({
      type: 'setPawnMedicineTier',
      payload: { pawnId: pawn.id, tier },
      save: true
    });
  }
</script>

<SegmentedRow
  label="Medicine"
  labelTitle="Ceiling on medicine spent dressing this pawn's wounds"
  options={TIERS}
  value={current}
  onSelect={setTier}
/>
