<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { chrome } from '$lib/pixelArt/chrome';
  import { WORK_CATEGORIES } from '$lib/game/core/defs/work';
  import { persisted, persist } from '$lib/stores/uiPersist';
  import type { LaborLevel, Pawn, WorkAssignment } from '$lib/game/core/types';
  import { getPawnLaborLevel, stateLabel } from '$lib/components/util/workUtils';
  import WorkCellTooltip from './WorkCellTooltip.svelte';
  import WorkCell from './WorkCell.svelte';
  import WorkLegend from './WorkLegend.svelte';
  import WorkHeader from './WorkHeader.svelte';
  import { subjobLevel, workColumns, workMods, workRanks } from './workGrid';

  let {
    pawns,
    workAssignments,
    selectedPawn = $bindable(null),
    selectedColumn = $bindable(null)
  }: {
    pawns: Pawn[];
    workAssignments: Record<string, WorkAssignment>;
    selectedPawn?: string | null;
    selectedColumn?: string | null;
  } = $props();

  let expanded = $state<string[]>(persisted('work.expandedCols', []) ?? []);
  $effect(() => persist('work.expandedCols', expanded));
  function toggleExpand(catId: string) {
    expanded = expanded.includes(catId)
      ? expanded.filter((c) => c !== catId)
      : [...expanded, catId];
  }

  const columns = $derived(workColumns(expanded));
  const mods = $derived.by(() => {
    void $gameState.turn;
    return workMods(pawns);
  });
  const ranks = $derived(workRanks(pawns, mods));
  const template = $derived(`150px repeat(${columns.length}, minmax(28px, 1fr)) 150px`);

  function setLevel(pawnId: string, workId: string, level: number) {
    gameState.command({
      type: 'setPawnLaborLevel',
      payload: { pawnId, workId, level: ((level + 5) % 5) as LaborLevel }
    });
  }

  let tip = $state<{
    pawnId: string;
    workId: string;
    subId?: string;
    label?: string;
    x: number;
    y: number;
  } | null>(null);
  const tipPawn = $derived(tip ? (pawns.find((p) => p.id === tip!.pawnId) ?? null) : null);
  const tipWc = $derived(tip ? (WORK_CATEGORIES.find((w) => w.id === tip!.workId) ?? null) : null);
  const show = (e: MouseEvent, pawnId: string, workId: string, subId?: string, label?: string) =>
    (tip = { pawnId, workId, subId, label, x: e.clientX, y: e.clientY });
  const move = (e: MouseEvent) => tip && (tip = { ...tip, x: e.clientX, y: e.clientY });
</script>

<div class="wgrid" {@attach chrome('well')}>
  <WorkHeader {columns} {expanded} {template} bind:selectedColumn ontoggle={toggleExpand} />
  {#each pawns as pawn (pawn.id)}
    {@const on = selectedPawn === pawn.id}
    {@const a = workAssignments[pawn.id]}
    <div
      class="wr"
      class:on
      style:grid-template-columns={template}
      role="row"
      tabindex="-1"
      onclick={() => (selectedPawn = pawn.id)}
      onkeydown={(e) => e.key === 'Enter' && (selectedPawn = pawn.id)}
      {@attach chrome(on ? 'cellOn' : 'cell')}
    >
      <span class="who">{pawn.name}</span>
      {#each columns as col (col.kind === 'cat' ? col.catId : col.subId)}
        {#if col.kind === 'cat'}
          {@const lvl = getPawnLaborLevel(a, col.catId)}
          <WorkCell
            level={lvl}
            rank={ranks[pawn.id]?.[col.catId]}
            onstep={(d) => setLevel(pawn.id, col.catId, lvl + d)}
            onenter={(e) => show(e, pawn.id, col.catId)}
            onmove={move}
            onleave={() => (tip = null)}
          />
        {:else}
          {@const sj = subjobLevel(a, col.catId, col.subId)}
          <WorkCell
            sub
            level={sj.level}
            inherited={sj.inherited}
            onstep={(d) => setLevel(pawn.id, col.subId, sj.level + d)}
            onenter={(e) => show(e, pawn.id, col.catId, col.subId, col.label)}
            onmove={move}
            onleave={() => (tip = null)}
          />
        {/if}
      {/each}
      <span class="st">{stateLabel(pawn).toLowerCase()}</span>
    </div>
  {:else}
    <p class="empty">no one to set to work</p>
  {/each}
</div>

<WorkLegend />

{#if tip && tipPawn && tipWc && mods[tip.pawnId]?.[tip.subId ?? tip.workId] && ranks[tip.pawnId]?.[tip.workId]}
  <WorkCellTooltip
    pawn={tipPawn}
    wc={tipWc}
    mods={mods[tip.pawnId][tip.subId ?? tip.workId]}
    rank={ranks[tip.pawnId][tip.workId]}
    level={tip.subId
      ? subjobLevel(workAssignments[tip.pawnId], tip.workId, tip.subId).level
      : getPawnLaborLevel(workAssignments[tip.pawnId], tip.workId)}
    name={tip.label}
    x={tip.x}
    y={tip.y}
  />
{/if}

<style>
  .wgrid {
    flex: none;
    padding: 2px;
    overflow-x: auto;
  }
  .wr {
    display: grid;
    align-items: center;
    height: 21px;
    text-align: center;
    cursor: pointer;
  }
  .who {
    padding-left: 8px;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .st {
    padding-right: 8px;
    text-align: right;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .on .who,
  .on .st,
  .on :global(.cell) {
    color: var(--ember);
  }
  .empty {
    margin: 6px 8px;
    color: var(--text-muted);
  }
</style>
