<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { WORK_CATEGORIES } from '$lib/game/core/Work';
  import type { Pawn, WorkAssignment } from '$lib/game/core/types';
  import {
    LABOR_LABELS,
    LABOR_COLORS,
    LVL_NAMES,
    ABBR,
    stateColor,
    stateLabel
  } from '$lib/utils/workUtils';

  interface Props {
    pawns: Pawn[];
    workAssignments: Record<string, WorkAssignment>;
    selectedPawn?: string | null;
  }
  let { pawns, workAssignments, selectedPawn = $bindable(null) }: Props = $props();

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
</script>

<div class="matrix-wrap">
  <table class="matrix">
    <thead>
      <tr>
        <th class="name-hdr">WORKER</th>
        <th class="state-hdr">STATUS</th>
        {#each WORK_CATEGORIES as wc}
          <th class="work-hdr" title={wc.name}>{ABBR[wc.id] ?? wc.id.slice(0, 3).toUpperCase()}</th>
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
            <td>
              <button
                class="cell-btn"
                style="color:{LABOR_COLORS[lvl]}"
                onclick={(e) => {
                  e.stopPropagation();
                  cycleLevel(pawn.id, wc.id);
                }}
                title="{wc.name}: {LVL_NAMES[lvl]}">{LABOR_LABELS[lvl]}</button
              >
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
  <span class="leg-hint">· click cell to cycle · click row for pawn detail</span>
</div>

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
    min-width: 28px;
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
    width: 100%;
    padding: 2px 0;
    background: transparent;
    border: none;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    cursor: pointer;
    display: block;
  }
  .cell-btn:hover {
    background: var(--bg-hover, #151c26);
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
