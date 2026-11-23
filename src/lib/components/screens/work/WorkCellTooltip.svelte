<script lang="ts">
  import HoverTip from '$lib/components/UI/tooltip/HoverTip.svelte';
  import WorkCellBody from './WorkCellBody.svelte';
  import type { Pawn, WorkCategory } from '$lib/game/core/types';
  import type { CellRank } from '$lib/components/util/workUtils';

  interface Props {
    pawn: Pawn;
    wc: WorkCategory;
    mods: { speed: number; yield: number | null; quality: number | null };
    rank: CellRank;
    level: 0 | 1 | 2 | 3 | 4;
    name?: string;
    x: number;
    y: number;
    pinned?: boolean;
  }
  let { pawn, wc, mods, rank, level, name, x, y, pinned = false }: Props = $props();
</script>

<HoverTip {x} {y} {pinned}>
  <h5>{pawn.name.split(' ')[0]} · {name ?? wc.name}</h5>
  <WorkCellBody {pawn} {wc} {mods} {rank} {level} />
</HoverTip>
