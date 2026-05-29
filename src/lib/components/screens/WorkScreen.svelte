<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { WORK_CATEGORIES } from '$lib/game/core/Work';
  import { locationService } from '$lib/game/services/LocationServices';
  import { itemService } from '$lib/game/services/ItemService';
  import { workService } from '$lib/game/services/WorkService';
  import { modifierSystem } from '$lib/game/systems/ModifierSystem';
  import { get } from 'svelte/store';
  import { onMount, onDestroy } from 'svelte';
  import { getPawnTaskSummary, getEfficiencyColor } from '$lib/utils/pawnUtils';

  let race: any = null;
  let pawns: any[] = [];
  let discoveredLocations: any[] = [];
  let workAssignments: Record<string, any> = {};
  let productionTargets: any[] = [];
  let currentJobIndex: Record<string, number> = {};
  // Track current job for each pawn (RimWorld-style cycling)
  let pawnCurrentJobs: Record<string, { workId: string; priority: number; startTime: number }> = {};
  let jobCycleInterval: ReturnType<typeof setInterval>;

  // UI State
  let selectedPawn: string | null = null;
  let selectedLocation: string | null = null;
  let selectedWorkCategory: string | null = null;
  let priorityWarning: string | null = null;

  const unsubscribeGame = gameState.subscribe((state) => {
    pawns = state.pawns || [];
    race = state.race;
    discoveredLocations = locationService.getDiscoveredLocations();
    workAssignments = state.workAssignments || {};
    productionTargets = state.productionTargets || [];
    currentJobIndex = state.currentJobIndex || {};

    // Initialize current jobs for new pawns
    pawns.forEach((pawn) => {
      if (!pawnCurrentJobs[pawn.id]) {
        const nextJob = getNextJobForPawn(pawn.id);
        if (nextJob) {
          pawnCurrentJobs[pawn.id] = {
            workId: nextJob.workId,
            priority: nextJob.priority,
            startTime: Date.now()
          };
        }
      }
    });
  });

  // RimWorld-style job cycling system
  function getNextJobForPawn(pawnId: string): { workId: string; priority: number } | null {
    const assignments = workAssignments[pawnId];
    if (!assignments) return null;

    // Get all assigned work sorted by priority (1 = highest, 12 = lowest)
    const sortedWork = Object.entries(assignments.workPriorities)
      .filter(([_, priority]) => Number(priority) > 0)
      .sort(([_, a], [__, b]) => Number(a) - Number(b)) // Sort by priority ascending (1, 2, 3...)
      .map(([workId, priority]) => ({ workId, priority: Number(priority) }));

    if (sortedWork.length === 0) return null;

    const currentJob = pawnCurrentJobs[pawnId];
    if (!currentJob) {
      // No current job, start with highest priority (lowest number)
      return sortedWork[0];
    }

    // Find current job in sorted list
    const currentIndex = sortedWork.findIndex((work) => work.workId === currentJob.workId);

    if (currentIndex === -1) {
      // Current job no longer assigned, start over
      return sortedWork[0];
    }

    // Move to next job in priority order, cycling back to start
    const nextIndex = (currentIndex + 1) % sortedWork.length;
    return sortedWork[nextIndex];
  }

  function getCurrentJobForPawn(pawnId: string): { workId: string; priority: number } | null {
    const assignments = workAssignments[pawnId];
    if (!assignments) return null;

    const sortedWork = Object.entries(assignments.workPriorities)
      .filter(([_, priority]) => Number(priority) > 0)
      .sort(([_, a], [__, b]) => Number(a) - Number(b))
      .map(([workId, priority]) => ({ workId, priority: Number(priority) }));

    if (sortedWork.length === 0) return null;

    const idx = currentJobIndex[pawnId] ?? 0;
    return sortedWork[idx % sortedWork.length];
  }

  onMount(() => {
    // Job cycling timer - like RimWorld's task switching
    jobCycleInterval = setInterval(() => {
      pawns.forEach((pawn) => {
        const currentJob = pawnCurrentJobs[pawn.id];
        if (currentJob) {
          // Check if job has been running long enough to switch (2-5 seconds based on priority)
          const jobDuration = Date.now() - currentJob.startTime;
          const switchTime = Math.max(2000, 6000 - currentJob.priority * 400); // Higher priority = longer duration

          if (jobDuration >= switchTime) {
            const nextJob = getNextJobForPawn(pawn.id);
            if (nextJob && nextJob.workId !== currentJob.workId) {
              pawnCurrentJobs[pawn.id] = {
                ...nextJob,
                startTime: Date.now()
              };
            } else if (nextJob) {
              // Same job, reset timer
              pawnCurrentJobs[pawn.id] = {
                ...currentJob,
                startTime: Date.now()
              };
            }
          }
        } else {
          // No current job, assign one
          const nextJob = getNextJobForPawn(pawn.id);
          if (nextJob) {
            pawnCurrentJobs[pawn.id] = {
              ...nextJob,
              startTime: Date.now()
            };
          }
        }
      });
    }, 500); // Check every 500ms

    return () => {
      if (jobCycleInterval) clearInterval(jobCycleInterval);
    };
  });

  onDestroy(() => {
    unsubscribeGame();
    if (jobCycleInterval) clearInterval(jobCycleInterval);
  });

  function getNextAvailablePriority(
    pawnId: string,
    currentWorkId: string,
    direction: 1 | -1
  ): number {
    const used = new Set(
      Object.entries(workAssignments[pawnId]?.workPriorities || {})
        .filter(([wid, _]) => wid !== currentWorkId)
        .map(([_, p]) => Number(p))
    );
    let priority = getPawnWorkPriority(pawnId, currentWorkId);
    do {
      priority += direction;
    } while (priority > 0 && priority <= 12 && used.has(priority));
    if (priority < 0) priority = 0;
    if (priority > 12) priority = 12;
    return priority;
  }

  function updatePawnWorkPriority(pawnId: string, workId: string, priority: number) {
    gameState.update((state) => {
      const newAssignments = { ...state.workAssignments };
      if (!newAssignments[pawnId]) {
        newAssignments[pawnId] = {
          pawnId,
          workPriorities: {},
          authorizedLocations: discoveredLocations.map((loc) => loc.id)
        };
      }

      // Check for duplicate priority (except 0)
      if (priority > 0) {
        for (const [otherWorkId, otherPriority] of Object.entries(
          newAssignments[pawnId].workPriorities
        )) {
          if (otherWorkId !== workId && otherPriority === priority) {
            priorityWarning = `Priority ${priority} is already assigned to another work.`;
            return state;
          }
        }
      }

      priorityWarning = null;
      newAssignments[pawnId].workPriorities[workId] = priority;

      // Reset current job when priorities change
      if (pawnCurrentJobs[pawnId]) {
        const nextJob = getNextJobForPawn(pawnId);
        if (nextJob) {
          pawnCurrentJobs[pawnId] = {
            ...nextJob,
            startTime: Date.now()
          };
        } else {
          delete pawnCurrentJobs[pawnId];
        }
      }

      return {
        ...state,
        workAssignments: newAssignments
      };
    });
  }

  function getExpectedHarvest(pawnId: string, workType: string): number {
    const pawn = pawns.find((p) => p.id === pawnId);
    if (!pawn) return 0;
    const priority = getPawnWorkPriority(pawnId, workType);
    const state = get(gameState);
    return workService.calculateHarvestAmount(pawn, workType, priority, state);
  }

  function getPawnWorkPriority(pawnId: string, workId: string): number {
    return workAssignments[pawnId]?.workPriorities[workId] || 0;
  }

  // Phase 5a: 5-level labor settings (Celestia model)
  function getPawnLaborLevel(pawnId: string, workId: string): 0 | 1 | 2 | 3 | 4 {
    const laborSettings = workAssignments[pawnId]?.laborSettings;
    if (laborSettings && workId in laborSettings) return laborSettings[workId] as 0 | 1 | 2 | 3 | 4;
    // Fall back: map legacy priority to labor level
    const pri = workAssignments[pawnId]?.workPriorities[workId] || 0;
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
          laborSettings: {},
          authorizedLocations: discoveredLocations.map((loc) => loc.id)
        };
      }
      newAssignments[pawnId] = {
        ...newAssignments[pawnId],
        laborSettings: {
          ...(newAssignments[pawnId].laborSettings ?? {}),
          [workId]: level
        },
        // Keep workPriorities in sync for backward compat
        workPriorities: {
          ...(newAssignments[pawnId].workPriorities ?? {}),
          [workId]: level === 0 ? 0 : level * 3
        }
      };
      return { ...state, workAssignments: newAssignments };
    });
  }

  const LABOR_LABELS: Record<number, string> = { 0: '—', 1: 'LOW', 2: 'NRM', 3: 'HI', 4: 'URG' };
  const LABOR_COLORS: Record<number, string> = {
    0: '#555',
    1: '#4a9',
    2: '#8bc',
    3: '#fa0',
    4: '#f44'
  };

  function getWorkCategoryColor(workId: string): string {
    const work = workService.getWorkCategory(workId);
    return work?.color || '#9E9E9E';
  }

  function getWorkProgress(pawnId: string, workType: string): number {
    const priority = getPawnWorkPriority(pawnId, workType);
    return (priority / 12) * 100; // Convert 0-12 priority to 0-100 percentage
  }

  function getWorkEfficiencyColor(efficiency: number): string {
    if (efficiency >= 12) return '#9c27b0'; // Purple for excellent
    if (efficiency >= 10) return '#8bc34a'; // Light green for good
    if (efficiency >= 8) return '#ffeb3b'; // Yellow for average
    if (efficiency >= 6) return '#ff9800'; // Orange for below average
    return '#f44336'; // Red for poor
  }

  function getPawnWorkEfficiency(pawnId: string, workType: string): number {
    const pawn = pawns.find((p) => p.id === pawnId);
    const workCategory = workService.getWorkCategory(workType);

    if (!pawn || !workCategory) return 0;

    const primaryStat = pawn.stats[workCategory.primaryStat] || 10;
    return Math.round(primaryStat);
  }

  // Get all assigned work for a pawn in priority order
  function getPawnWorkQueue(
    pawnId: string
  ): Array<{ workId: string; priority: number; workCategory: any }> {
    const assignments = workAssignments[pawnId];
    if (!assignments) return [];

    return Object.entries(assignments.workPriorities)
      .filter(([_, priority]) => Number(priority) > 0)
      .sort(([_, a], [__, b]) => Number(a) - Number(b))
      .map(([workId, priority]) => ({
        workId,
        priority: Number(priority),
        workCategory: workService.getWorkCategory(workId)
      }));
  }

  // ── Matrix: 3-letter work abbreviations ────────────────────────────
  const ABBR: Record<string, string> = {
    foraging: 'FRG',
    woodcutting: 'WOD',
    mining: 'MNE',
    hunting: 'HNT',
    fishing: 'FSH',
    crafting: 'CRF',
    metalworking: 'MTL',
    leatherworking: 'LTH',
    digging: 'DIG',
    research: 'RSH',
    construction: 'BLD',
    alchemy: 'ALH',
    cooking: 'COK'
  };

  function cycleLevel(pawnId: string, workId: string) {
    const cur = getPawnLaborLevel(pawnId, workId);
    const next = ((cur + 1) % 5) as 0 | 1 | 2 | 3 | 4;
    updatePawnLaborLevel(pawnId, workId, next);
  }

  function stateLabel(pawn: any): string {
    const s = pawn.currentState ?? 'Idle';
    if (s === 'Working' && pawn.activeJob) {
      if (pawn.activeJob.type === 'harvest')
        return pawn.activeJob.resourceId?.toUpperCase() ?? 'HARVEST';
      if (pawn.activeJob.type === 'construct') return 'BUILDING';
      if (pawn.activeJob.type === 'craft') return 'CRAFTING';
    }
    return s.toUpperCase();
  }

  function stateColor(pawn: any): string {
    switch (pawn.currentState) {
      case 'Working':
        return '#4a9';
      case 'Hungry':
      case 'Eating':
        return '#f44';
      case 'Tired':
      case 'Sleeping':
        return '#fa0';
      default:
        return '#555';
    }
  }

  function needBar(val: number): string {
    const f = Math.round(val / 10);
    return '█'.repeat(f) + '░'.repeat(10 - f);
  }

  const LVL_NAMES = ['Off', 'Low', 'Normal', 'High', 'Urgent'];

  $: selected = pawns.find((p) => p.id === selectedPawn) ?? null;
  $: selectedTaskSummary = selected ? getPawnTaskSummary(selected, $gameState) : null;
  $: selectedWorkEfficiency = selected
    ? Object.fromEntries(
        WORK_CATEGORIES.map((wc) => [
          wc.id,
          modifierSystem.calculateWorkEfficiency(selected.id, wc.id, $gameState)
        ])
      )
    : {};
  $: sortedWorkCategories = [...WORK_CATEGORIES].sort(
    (a, b) =>
      (selectedWorkEfficiency[b.id]?.totalValue ?? 0) -
      (selectedWorkEfficiency[a.id]?.totalValue ?? 0)
  );
</script>

<div class="work-screen">
  <div class="screen-hdr">
    | LABOR ASSIGNMENTS
    <button class="hdr-btn" on:click={() => uiState.setScreen('main')}>BACK</button>
  </div>

  <!-- Matrix grid: rows=pawns, cols=work categories -->
  <div class="matrix-wrap">
    <table class="matrix">
      <thead>
        <tr>
          <th class="name-hdr">WORKER</th>
          <th class="state-hdr">STATUS</th>
          {#each WORK_CATEGORIES as wc}
            <th class="work-hdr" title={wc.name}
              >{ABBR[wc.id] ?? wc.id.slice(0, 3).toUpperCase()}</th
            >
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each pawns as pawn}
          <tr
            class:sel={selectedPawn === pawn.id}
            on:click={() => (selectedPawn = selectedPawn === pawn.id ? null : pawn.id)}
          >
            <td class="name-cell">{pawn.name.toUpperCase()}</td>
            <td class="state-cell" style="color:{stateColor(pawn)}">{stateLabel(pawn)}</td>
            {#each WORK_CATEGORIES as wc}
              {@const lvl = getPawnLaborLevel(pawn.id, wc.id)}
              <td>
                <button
                  class="cell-btn"
                  style="color:{LABOR_COLORS[lvl]}"
                  on:click|stopPropagation={() => cycleLevel(pawn.id, wc.id)}
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

  <!-- Legend -->
  <div class="legend">
    <span class="leg-title">LEVEL:</span>
    {#each ['—=off', '1=low', '2=nrm', '3=hi', '4=urg'] as leg}
      <span class="leg">{leg}</span>
    {/each}
    <span class="leg-hint">· click cell to cycle · click row for pawn detail</span>
  </div>

  <!-- Selected pawn detail -->
  {#if selected}
    <div class="section-hdr">| {selected.name.toUpperCase()} — PAWN DETAIL</div>
    <div class="detail-row">
      <span class="lbl">ACTIVITY</span>
      <span style="color:{stateColor(selected)}">{stateLabel(selected)}</span>
    </div>
    <div class="detail-row">
      <span class="lbl">TASK</span>
      <span class="sval">{selectedTaskSummary?.currentTask ?? 'idle'}</span>
    </div>
    <div class="detail-row">
      <span class="lbl">NEXT</span>
      <span class="sval">{selectedTaskSummary?.nextTask ?? 'no work'}</span>
    </div>
    <div class="need-row">
      <span class="lbl">HUNGER</span>
      <span class="bar-ascii">{needBar(selected.needs.hunger)}</span>
      <span class="val" class:neg={selected.needs.hunger > 70}
        >{Math.round(selected.needs.hunger)}%</span
      >
    </div>
    <div class="need-row">
      <span class="lbl">FATIGUE</span>
      <span class="bar-ascii">{needBar(selected.needs.fatigue)}</span>
      <span class="val" class:neg={selected.needs.fatigue > 70}
        >{Math.round(selected.needs.fatigue)}%</span
      >
    </div>
    <div class="stats-row">
      {#each Object.entries(selected.stats) as [stat, val]}
        <span class="stat-chip">
          <span class="slbl">{stat.slice(0, 3).toUpperCase()}</span>
          <span class="sval">{val}</span>
        </span>
      {/each}
    </div>
    <div class="section-hdr sub">| WORK EFFICIENCY</div>
    <div class="eff-grid">
      {#each sortedWorkCategories as wc}
        {@const eff = selectedWorkEfficiency[wc.id]}
        {#if eff}
          <div class="eff-item" title="{wc.name}: {eff.totalValue.toFixed(2)}x">
            <span class="eff-name">{wc.name.toUpperCase()}</span>
            <span class="eff-val" style="color:{getEfficiencyColor(eff.totalValue)}"
              >{eff.totalValue.toFixed(2)}x</span
            >
          </div>
        {/if}
      {/each}
    </div>
  {:else if pawns.length > 0}
    <div class="section-hdr sub">| CLICK A ROW FOR PAWN DETAIL</div>
  {/if}
</div>

<style>
  .work-screen {
    height: 100%;
    overflow-y: auto;
    background: var(--bg);
    color: var(--text);
    font-family: 'Courier New', monospace;
    font-size: 11px;
    display: flex;
    flex-direction: column;
  }
  .screen-hdr {
    padding: 5px 10px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 11px;
    letter-spacing: 0.08em;
    border-bottom: 1px solid var(--border-hi);
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }
  .hdr-btn {
    margin-left: auto;
    padding: 2px 8px;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-family: 'Courier New', monospace;
    font-size: 11px;
    cursor: pointer;
  }
  .hdr-btn:hover {
    color: var(--text);
    border-color: var(--border-hi);
  }

  .section-hdr {
    padding: 4px 8px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 11px;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
    border-top: 1px solid var(--border);
    margin-top: 1px;
    flex-shrink: 0;
  }
  .section-hdr.sub {
    background: var(--bg);
    color: var(--text-dim);
  }

  /* Matrix table */
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

  /* Legend */
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

  /* Pawn detail */
  .detail-row {
    display: flex;
    padding: 2px 8px;
    gap: 8px;
    align-items: baseline;
  }
  .need-row {
    display: flex;
    align-items: center;
    padding: 2px 8px;
    gap: 6px;
  }
  .lbl {
    color: var(--text-dim);
    font-size: 11px;
    width: 60px;
    flex-shrink: 0;
  }
  .bar-ascii {
    font-size: 11px;
    color: var(--accent);
    letter-spacing: -1px;
  }
  .val {
    font-size: 11px;
  }
  .val.neg {
    color: #f44;
  }
  .stats-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 4px 8px;
  }
  .stat-chip {
    display: flex;
    gap: 2px;
    font-size: 10px;
    border: 1px solid var(--border);
    padding: 1px 4px;
  }
  .slbl {
    color: var(--text-muted, #555);
  }
  .sval {
    color: var(--text);
  }

  .eff-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
    gap: 2px;
    padding: 4px 8px;
  }
  .eff-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    border: 1px solid var(--border);
    padding: 2px 4px;
    cursor: default;
  }
  .eff-item:hover {
    background: var(--bg-hover);
  }
  .eff-name {
    font-size: 9px;
    color: var(--text-muted);
    letter-spacing: 0.04em;
  }
  .eff-val {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .empty {
    text-align: center;
    color: var(--text-muted, #555);
    padding: 8px;
    font-style: italic;
  }
</style>
