<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import type { AttrCell } from '$lib/components/util/attributeView';
  import HoverTip from '$lib/components/UI/tooltip/HoverTip.svelte';
  import KvRow from '$lib/components/UI/widget/KvRow.svelte';
  import WorkCellBody from '$lib/components/screens/work/WorkCellBody.svelte';

  let { pawn, cell, x, y }: { pawn: Pawn; cell: AttrCell; x: number; y: number } = $props();
</script>

<HoverTip {x} {y}>
  <h5>{cell.label} · {cell.value}</h5>
  <p>{cell.blurb}</p>
  {#if cell.work}
    <WorkCellBody
      {pawn}
      wc={cell.work.wc}
      mods={cell.work.mods}
      rank={cell.work.rank}
      level={cell.work.priority}
    />
  {/if}
  {#each cell.rows as r, i (r.label + i)}
    <KvRow label={r.label}>{r.value}</KvRow>
  {/each}
</HoverTip>
