<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import type { SkillRow } from '$lib/components/util/skillRows';
  import HoverTip from '$lib/components/UI/tooltip/HoverTip.svelte';
  import KvRow from '$lib/components/UI/widget/KvRow.svelte';
  import SkinBar from '$lib/components/UI/widget/SkinBar.svelte';
  import WorkCellBody from '$lib/components/screens/work/WorkCellBody.svelte';

  let {
    pawn,
    row,
    x,
    y,
    pinned = false
  }: { pawn: Pawn; row: SkillRow; x: number; y: number; pinned?: boolean } = $props();

  const b = $derived(row.best);
</script>

<HoverTip {x} {y} {pinned}>
  <h5>{row.label} · {row.level}</h5>
  {#if row.kids.length}<p>{b.name} leads.</p>{/if}
  <KvRow label="Next level">{b.need ? `${b.xp} of ${b.need}` : 'mastered'}</KvRow>
  <WorkCellBody {pawn} wc={b.wc} mods={b.mods} rank={b.rank} level={b.priority} />
  {#if row.kids.length}
    <div class="tip-sep">Specialties</div>
    {#each row.kids as k (k.id)}
      <div class="kid"><em>{k.name}</em><b>{k.level}</b><SkinBar value={k.frac} thin /></div>
    {/each}
  {/if}
</HoverTip>

<style>
  .kid {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 18px;
  }
  .kid em {
    flex: none;
    width: 108px;
    color: var(--text-dim);
  }
  .kid b {
    flex: none;
    width: 16px;
    text-align: right;
  }
</style>
