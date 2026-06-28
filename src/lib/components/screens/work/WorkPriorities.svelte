<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { WORK_CATEGORIES } from '$lib/game/core/Work';
  import { pawnStatService } from '$lib/game/services/PawnStatService';
  import { jobService } from '$lib/game/services/JobService';
  import { persisted, persist } from '$lib/stores/uiPersist';
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

  // ── Subjobs: splittable categories (construction = build/demolish/refuel/repair, hauling =
  // haul/fetch) can be right-click-EXPANDED to rank their job types WITHIN the parent. ───────────────
  const subjobsByCat: Record<string, { id: string; label: string }[]> = {};
  for (const wc of WORK_CATEGORIES) subjobsByCat[wc.id] = jobService.getSubjobsForCategory(wc.id);

  // Which splittable columns are currently expanded (persisted across tab toggles).
  let expanded = $state<string[]>(persisted('work.expandedCols', []) ?? []);
  $effect(() => persist('work.expandedCols', expanded));
  function toggleExpand(catId: string) {
    expanded = expanded.includes(catId)
      ? expanded.filter((c) => c !== catId)
      : [...expanded, catId];
  }

  type Col =
    | { kind: 'cat'; catId: string; name: string; abbr: string; splittable: boolean }
    | { kind: 'sub'; catId: string; subId: string; label: string; abbr: string };

  // Flattened column list: each category, plus its subjob columns when expanded. Drives BOTH the
  // header row and every pawn row, so they can't drift.
  let columns = $derived.by<Col[]>(() => {
    const cols: Col[] = [];
    for (const wc of WORK_CATEGORIES) {
      const subs = subjobsByCat[wc.id];
      cols.push({
        kind: 'cat',
        catId: wc.id,
        name: wc.name,
        abbr: ABBR[wc.id] ?? wc.id.slice(0, 3).toUpperCase(),
        splittable: subs.length > 0
      });
      if (subs.length > 0 && expanded.includes(wc.id)) {
        for (const sj of subs)
          cols.push({
            kind: 'sub',
            catId: wc.id,
            subId: sj.id,
            label: sj.label,
            abbr: sj.label.slice(0, 3).toUpperCase()
          });
      }
    }
    return cols;
  });

  // A subjob's effective level for a pawn: its explicit override if set, else the parent category level
  // (inherited — shown dimmed). The assignment ranks an inherited subjob alongside its parent.
  function getSubjobLevel(
    pawnId: string,
    catId: string,
    subId: string
  ): { level: 0 | 1 | 2 | 3 | 4; inherited: boolean } {
    const ls = workAssignments[pawnId]?.laborSettings;
    if (ls && subId in ls) return { level: ls[subId] as 0 | 1 | 2 | 3 | 4, inherited: false };
    return { level: getPawnLaborLevel(pawnId, catId), inherited: true };
  }
  function cycleSubjob(pawnId: string, catId: string, subId: string, dir: 1 | -1) {
    const cur = getSubjobLevel(pawnId, catId, subId).level;
    updatePawnLaborLevel(pawnId, subId, (((cur + dir + 5) % 5) as 0 | 1 | 2 | 3 | 4));
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
    gameState.command({ type: 'setPawnLaborLevel', payload: { pawnId, workId, level } });
  }

  function cycleLevel(pawnId: string, workId: string, dir: 1 | -1 = 1) {
    const cur = getPawnLaborLevel(pawnId, workId);
    updatePawnLaborLevel(pawnId, workId, (((cur + dir + 5) % 5) as 0 | 1 | 2 | 3 | 4));
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

  // `workId` is always the parent CATEGORY (the tooltip's stats come from it). For a subjob cell we
  // also carry the subjob's id + name so the header reads the subjob ("Repair"), not its parent.
  let tip = $state<{
    pawnId: string;
    workId: string;
    subId?: string;
    label?: string;
    x: number;
    y: number;
  } | null>(null);
  function showTip(e: MouseEvent, pawnId: string, workId: string, subId?: string, label?: string) {
    tip = { pawnId, workId, subId, label, x: e.clientX, y: e.clientY };
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
        {#each columns as col}
          {#if col.kind === 'cat'}
            <th
              class="work-hdr"
              class:col-sel={selectedColumn === col.catId}
              class:splittable={col.splittable}
              title="{col.name} — click to highlight related attributes{col.splittable
                ? '; right-click to expand subjobs'
                : ''}"
              onclick={() => toggleColumn(col.catId)}
              oncontextmenu={(e) => {
                e.preventDefault();
                if (col.splittable) toggleExpand(col.catId);
              }}
              >{col.abbr}{#if col.splittable}<span class="caret"
                  >{expanded.includes(col.catId) ? '▾' : '▸'}</span
                >{/if}</th
            >
          {:else}
            <th
              class="work-hdr sub-hdr"
              title="{col.label} — subjob; ranks within its parent category"
              onclick={() => toggleColumn(col.catId)}
              oncontextmenu={(e) => {
                e.preventDefault();
                toggleExpand(col.catId);
              }}>{col.abbr}</th
            >
          {/if}
        {/each}
        <th class="state-hdr">STATUS</th>
      </tr>
    </thead>
    <tbody>
      {#each pawns as pawn}
        <tr
          class:sel={selectedPawn === pawn.id}
          onclick={() => (selectedPawn = selectedPawn === pawn.id ? null : pawn.id)}
        >
          <td class="name-cell">{pawn.name.toUpperCase()}</td>
          {#each columns as col}
            {#if col.kind === 'cat'}
              {@const lvl = getPawnLaborLevel(pawn.id, col.catId)}
              {@const rk = rankMap[pawn.id]?.[col.catId]}
              <td>
                <button
                  class="cell-btn"
                  style="color:{LABOR_COLORS[lvl]}"
                  onmouseenter={(e) => showTip(e, pawn.id, col.catId)}
                  onmousemove={moveTip}
                  onmouseleave={hideTip}
                  onclick={(e) => {
                    e.stopPropagation();
                    cycleLevel(pawn.id, col.catId, 1);
                  }}
                  oncontextmenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    cycleLevel(pawn.id, col.catId, -1);
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
            {:else}
              {@const sj = getSubjobLevel(pawn.id, col.catId, col.subId)}
              <td class="sub-cell">
                <button
                  class="cell-btn"
                  class:inherited={sj.inherited}
                  style="color:{LABOR_COLORS[sj.level]}"
                  title="{col.label}: {sj.inherited ? 'inherits parent' : 'override'} — click to set, right-click to lower"
                  onmouseenter={(e) => showTip(e, pawn.id, col.catId, col.subId, col.label)}
                  onmousemove={moveTip}
                  onmouseleave={hideTip}
                  onclick={(e) => {
                    e.stopPropagation();
                    cycleSubjob(pawn.id, col.catId, col.subId, 1);
                  }}
                  oncontextmenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    cycleSubjob(pawn.id, col.catId, col.subId, -1);
                  }}
                >
                  <span class="cell-lbl">{LABOR_LABELS[sj.level]}</span>
                </button>
              </td>
            {/if}
          {/each}
          <td class="state-cell" style="color:{stateColor(pawn)}">{stateLabel(pawn)}</td>
        </tr>
      {/each}
      {#if pawns.length === 0}
        <tr><td colspan={columns.length + 2} class="empty">no colonists</td></tr>
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
  <span class="leg-hint"
    >· click cell ↑ · right-click ↓ · right-click a ▸ column header to expand subjobs · click row for
    detail</span
  >
</div>

{#if tip && tipPawn && tipWc && modMap[tip.pawnId]?.[tip.workId] && rankMap[tip.pawnId]?.[tip.workId]}
  <WorkCellTooltip
    pawn={tipPawn}
    wc={tipWc}
    mods={modMap[tip.pawnId][tip.workId]}
    rank={rankMap[tip.pawnId][tip.workId]}
    level={tip.subId
      ? getSubjobLevel(tip.pawnId, tip.workId, tip.subId).level
      : getPawnLaborLevel(tip.pawnId, tip.workId)}
    name={tip.label}
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
    width: 100%;
  }
  .matrix th,
  .matrix td {
    border: 1px solid var(--border);
    padding: 0;
    text-align: center;
  }
  /* Equal fixed width on both end columns so the work grid is centered
     between them in the 100%-wide table. */
  .name-hdr,
  .state-hdr {
    text-align: left;
    padding: 2px 6px;
    color: var(--text-dim);
    font-size: 10px;
    width: 169px;
    white-space: nowrap;
  }
  .work-hdr {
    padding: 2px 3px;
    color: var(--text-dim);
    font-size: 10px;
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
  .work-hdr.splittable {
    /* a faint underline cue that this column expands on right-click */
    text-decoration: underline dotted color-mix(in srgb, var(--text-dim) 60%, transparent);
    text-underline-offset: 2px;
  }
  .caret {
    font-size: 7px;
    margin-left: 1px;
    opacity: 0.7;
  }
  /* Subjob columns read as children of the category to their left. */
  .work-hdr.sub-hdr {
    font-size: 9px;
    color: var(--text-muted, #6a7a8a);
    background: color-mix(in srgb, var(--accent-hi) 6%, transparent);
    border-left-style: dashed;
  }
  .sub-cell {
    background: color-mix(in srgb, var(--accent-hi) 5%, transparent);
    border-left-style: dashed !important;
  }
  /* An inherited (un-overridden) subjob cell is dimmed — it just follows its parent category. */
  .cell-btn.inherited {
    opacity: 0.4;
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
    width: 100%;
    height: 32px;
    padding: 0;
    background: transparent;
    border: none;
    font-family: var(--font-mono);
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
