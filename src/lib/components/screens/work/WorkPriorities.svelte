<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { WORK_CATEGORIES } from '$lib/game/core/Work';
  import { pawnStatService } from '$lib/game/services/PawnStatService';
  import type { Pawn, WorkAssignment } from '$lib/game/core/types';
  import {
    LABOR_LABELS,
    LABOR_COLORS,
    ABBR,
    STAR_MARK,
    STAR_COLORS,
    WORST_MARK,
    WORST_COLORS,
    rankWorkCells,
    stateColor,
    stateLabel,
    type CellRank
  } from '$lib/utils/workUtils';
  import WorkCellTooltip from './WorkCellTooltip.svelte';

  interface Props {
    pawns: Pawn[];
    workAssignments: Record<string, WorkAssignment>;
    selectedPawn?: string | null;
    /** Work category whose header is clicked → highlights related stats in the attributes grid. */
    selectedColumn?: string | null;
  }
  let {
    pawns,
    workAssignments,
    selectedPawn = $bindable(null),
    selectedColumn = $bindable(null)
  }: Props = $props();

  function toggleColumn(id: string) {
    selectedColumn = selectedColumn === id ? null : id;
  }

  function getPawnLaborLevel(pawnId: string, workId: string): 0 | 1 | 2 | 3 | 4 {
    const laborSettings = workAssignments[pawnId]?.laborSettings;
    if (laborSettings && workId in laborSettings) return laborSettings[workId] as 0 | 1 | 2 | 3 | 4;
    const pri = workAssignments[pawnId]?.workPriorities?.[workId] ?? 0;
    if (pri === 0) return 0;
    if (pri <= 3) return 1;
    if (pri <= 6) return 2;
    if (pri <= 9) return 3;
    return 4;
  }

  function updatePawnLaborLevel(pawnId: string, workId: string, level: 0 | 1 | 2 | 3 | 4) {
    gameState.update((state) => {
      const newAssignments = { ...state.workAssignments };
      if (!newAssignments[pawnId]) {
        newAssignments[pawnId] = {
          pawnId,
          workPriorities: {},
          laborSettings: {}
        };
      }
      newAssignments[pawnId] = {
        ...newAssignments[pawnId],
        laborSettings: { ...(newAssignments[pawnId].laborSettings ?? {}), [workId]: level },
        workPriorities: {
          ...(newAssignments[pawnId].workPriorities ?? {}),
          [workId]: level === 0 ? 0 : level * 3
        }
      };
      return { ...state, workAssignments: newAssignments };
    });
  }

  function cycleLevel(pawnId: string, workId: string) {
    const cur = getPawnLaborLevel(pawnId, workId);
    updatePawnLaborLevel(pawnId, workId, ((cur + 1) % 5) as 0 | 1 | 2 | 3 | 4);
  }

  // Speed / yield / quality per pawn/work from the single stats.jsonc model — drives both
  // the medal ranking (by throughput = speed × yield) and the hover tooltip.
  type WorkMods = { speed: number; yield: number | null; quality: number | null };
  let modMap = $derived.by(() => {
    // Touch $gameState so this recomputes as pawns' state (needs/conditions) changes.
    void $gameState.turn;
    const map: Record<string, Record<string, WorkMods>> = {};
    for (const pawn of pawns) {
      const row: Record<string, WorkMods> = {};
      for (const wc of WORK_CATEGORIES) {
        row[wc.id] = pawnStatService.getWorkModifiers(pawn, wc.id);
      }
      map[pawn.id] = row;
    }
    return map;
  });

  let rankMap = $derived.by(() => {
    const map: Record<string, Record<string, CellRank>> = {};
    for (const pawn of pawns) {
      const eff: Record<string, number> = {};
      for (const wc of WORK_CATEGORIES) {
        const m = modMap[pawn.id]?.[wc.id];
        eff[wc.id] = m ? m.speed * (m.yield ?? 1) * (m.quality ?? 1) : 0;
      }
      map[pawn.id] = rankWorkCells(eff);
    }
    return map;
  });

  let tip = $state<{ pawnId: string; workId: string; x: number; y: number } | null>(null);
  function showTip(e: MouseEvent, pawnId: string, workId: string) {
    tip = { pawnId, workId, x: e.clientX, y: e.clientY };
  }
  function moveTip(e: MouseEvent) {
    if (tip) tip = { ...tip, x: e.clientX, y: e.clientY };
  }
  function hideTip() {
    tip = null;
  }
  let tipPawn = $derived(tip ? (pawns.find((p) => p.id === tip!.pawnId) ?? null) : null);
  let tipWc = $derived(tip ? (WORK_CATEGORIES.find((w) => w.id === tip!.workId) ?? null) : null);
</script>

<div class="matrix-wrap">
  <table class="matrix">
    <thead>
      <tr>
        <th class="name-hdr">WORKER</th>
        <th class="state-hdr">STATUS</th>
        {#each WORK_CATEGORIES as wc}
          <th
            class="work-hdr"
            class:col-sel={selectedColumn === wc.id}
            title="{wc.name} — click to highlight related attributes"
            onclick={() => toggleColumn(wc.id)}>{ABBR[wc.id] ?? wc.id.slice(0, 3).toUpperCase()}</th
          >
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each pawns as pawn}
        <tr
          class:sel={selectedPawn === pawn.id}
          onclick={() => (selectedPawn = selectedPawn === pawn.id ? null : pawn.id)}
        >
          <td class="name-cell">{pawn.name.toUpperCase()}</td>
          <td class="state-cell" style="color:{stateColor(pawn)}">{stateLabel(pawn)}</td>
          {#each WORK_CATEGORIES as wc}
            {@const lvl = getPawnLaborLevel(pawn.id, wc.id)}
            {@const rk = rankMap[pawn.id]?.[wc.id]}
            <td>
              <button
                class="cell-btn"
                style="color:{LABOR_COLORS[lvl]}"
                onmouseenter={(e) => showTip(e, pawn.id, wc.id)}
                onmousemove={moveTip}
                onmouseleave={hideTip}
                onclick={(e) => {
                  e.stopPropagation();
                  cycleLevel(pawn.id, wc.id);
                }}
              >
                <span class="cell-lbl">{LABOR_LABELS[lvl]}</span>
                {#if rk && rk.best >= 0}
                  <span class="mark" style="color:{STAR_COLORS[rk.best]}">{STAR_MARK}</span>
                {:else if rk && rk.worst >= 0}
                  <span class="mark" style="color:{WORST_COLORS[rk.worst]}">{WORST_MARK}</span>
                {/if}
              </button>
            </td>
          {/each}
        </tr>
      {/each}
      {#if pawns.length === 0}
        <tr><td colspan={WORK_CATEGORIES.length + 2} class="empty">no colonists</td></tr>
      {/if}
    </tbody>
  </table>
</div>

<div class="legend">
  <span class="leg-title">LEVEL:</span>
  {#each ['—=off', '1=low', '2=nrm', '3=hi', '4=urg'] as leg}
    <span class="leg">{leg}</span>
  {/each}
  <span class="leg-sep">·</span>
  <span class="leg" style="color:{STAR_COLORS[0]}">{STAR_MARK} top jobs</span>
  <span class="leg" style="color:{WORST_COLORS[0]}">{WORST_MARK} weakest</span>
  <span class="leg-hint">· click cell to cycle · hover for stats · click row for detail</span>
</div>

{#if tip && tipPawn && tipWc && modMap[tip.pawnId]?.[tip.workId] && rankMap[tip.pawnId]?.[tip.workId]}
  <WorkCellTooltip
    pawn={tipPawn}
    wc={tipWc}
    mods={modMap[tip.pawnId][tip.workId]}
    rank={rankMap[tip.pawnId][tip.workId]}
    level={getPawnLaborLevel(tip.pawnId, tip.workId)}
    x={tip.x}
    y={tip.y}
  />
{/if}

<style>
  .matrix-wrap {
    overflow-x: auto;
    flex-shrink: 0;
  }
  .matrix {
    border-collapse: collapse;
    width: max-content;
    min-width: 100%;
  }
  .matrix th,
  .matrix td {
    border: 1px solid var(--border);
    padding: 0;
    text-align: center;
  }
  .name-hdr {
    text-align: left;
    padding: 2px 6px;
    color: var(--text-dim);
    font-size: 10px;
    min-width: 80px;
  }
  .state-hdr {
    text-align: left;
    padding: 2px 4px;
    color: var(--text-dim);
    font-size: 10px;
    min-width: 72px;
  }
  .work-hdr {
    padding: 2px 3px;
    color: var(--text-dim);
    font-size: 10px;
    width: 32px;
    min-width: 32px;
    cursor: pointer;
  }
  .work-hdr:hover {
    color: var(--text);
  }
  .work-hdr.col-sel {
    color: var(--accent-hi);
    background: color-mix(in srgb, var(--accent-hi) 18%, transparent);
  }
  .name-cell {
    text-align: left;
    padding: 2px 6px;
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
  }
  .state-cell {
    text-align: left;
    padding: 2px 4px;
    font-size: 10px;
    white-space: nowrap;
  }
  tr.sel {
    background: var(--bg-active, #1a2030);
  }
  .matrix tr:hover {
    background: var(--bg-hover, #151c26);
    cursor: pointer;
  }
  .cell-btn {
    position: relative;
    width: 32px;
    height: 32px;
    padding: 0;
    background: transparent;
    border: none;
    font-family: 'Courier New', monospace;
    font-size: 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .cell-btn:hover {
    background: var(--bg-hover, #151c26);
  }
  .cell-lbl {
    line-height: 1;
  }
  .mark {
    position: absolute;
    right: 2px;
    bottom: 1px;
    font-size: 8px;
    line-height: 1;
    pointer-events: none;
  }
  .legend {
    display: flex;
    gap: 8px;
    padding: 3px 8px;
    border-bottom: 1px solid var(--border);
    font-size: 10px;
    color: var(--text-dim);
    flex-shrink: 0;
    flex-wrap: wrap;
    align-items: center;
  }
  .leg-title {
    color: var(--text-muted, #555);
  }
  .leg-hint {
    margin-left: auto;
    color: var(--text-muted, #555);
    font-style: italic;
  }
  .empty {
    text-align: center;
    color: var(--text-muted, #555);
    padding: 8px;
    font-style: italic;
  }
</style>
