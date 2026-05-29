<script lang="ts">
  import type { GameState, Pawn, StatusEffectDef, ConditionDef, ConditionStage } from '$lib/game/core/types';
  import {
    getNeedColor,
    getNeedDescription,
    getPawnTaskSummary,
    getMoodColor,
    getMoodDescription
  } from '$lib/utils/pawnUtils';
  import statusEffectsData from '$lib/game/database/status-effects.jsonc';
  import conditionsData from '$lib/game/database/conditions.jsonc';

  const STATUS_EFFECTS_DB = statusEffectsData as unknown as StatusEffectDef[];
  const CONDITIONS_DB = conditionsData as unknown as ConditionDef[];

  export let pawn: Pawn;
  export let gameState: GameState;

  $: needs = pawn.needs;

  function blockBar(value: number, width = 20): string {
    const filled = Math.max(0, Math.min(width, Math.round((value / 100) * width)));
    return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + ']';
  }
  $: taskSummary = getPawnTaskSummary(pawn, gameState);
  $: activeEffects = (pawn.activeEffects ?? [])
    .map((id) => STATUS_EFFECTS_DB.find((e) => e.id === id))
    .filter((e): e is StatusEffectDef => e !== undefined);

  type ActiveCond = { name: string; severity: number; stage: ConditionStage };
  $: activeConditions = (pawn.conditions ?? [])
    .filter(c => c.severity > 0)
    .reduce<ActiveCond[]>((acc, c) => {
      const def = CONDITIONS_DB.find(d => d.id === c.id);
      if (!def) return acc;
      let stage: ConditionStage | undefined;
      for (const s of def.stages) if (c.severity >= s.minSeverity) stage = s;
      if (stage) acc.push({ name: def.name, severity: c.severity, stage });
      return acc;
    }, []);

  function stateColor(state: string | undefined): string {
    const normalized = (state ?? 'Idle').replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
    switch (normalized) {
      case 'working':
      case 'moving_to_resource':
      case 'moving_to_deposit':
      case 'moving_to_need':
        return '#4a9';
      case 'hungry':
      case 'eating':
        return '#f44';
      case 'tired':
      case 'sleeping':
        return '#fa0';
      default:
        return 'var(--text-muted)';
    }
  }
</script>

<div class="needs-section">
  <div class="section-hdr">| NEEDS</div>

  <div class="need-row">
    <span class="lbl">HUNGER</span>
    <span class="block-bar" style="color: {getNeedColor(needs.hunger)}">{blockBar(needs.hunger)}</span>
    <span class="val" style="color: {getNeedColor(needs.hunger)}">{Math.round(needs.hunger)}%</span>
    <span class="desc">{getNeedDescription('hunger', needs.hunger)}</span>
  </div>

  <div class="need-row">
    <span class="lbl">REST</span>
    <span class="block-bar" style="color: {getNeedColor(needs.fatigue)}">{blockBar(needs.fatigue)}</span>
    <span class="val" style="color: {getNeedColor(needs.fatigue)}">{Math.round(needs.fatigue)}%</span>
    <span class="desc">{getNeedDescription('fatigue', needs.fatigue)}</span>
  </div>

  <div class="section-hdr sub">| STATUS</div>

  {#if activeEffects.length > 0 || activeConditions.length > 0}
    <div class="effects-row">
      {#each activeEffects as effect}
        <div
          class="effect-card"
          style="border-color: {effect.color}; color: {effect.color}"
          title={effect.description}
        >
          <span class="effect-name">{effect.name.toUpperCase()}</span>
        </div>
      {/each}
      {#each activeConditions as { name, severity, stage }}
        <div
          class="effect-card cond-card"
          class:threatening={stage.lifeThreatening}
          style="border-color: {stage.color}; color: {stage.color}"
          title="{name} — {Math.round(severity * 100)}% severity{stage.lifeThreatening ? ' ⚠ life-threatening' : ''}"
        >
          <span class="effect-name">{name.toUpperCase()}</span>
          <span class="cond-meta">{stage.label.toUpperCase()} · {Math.round(severity * 100)}%</span>
        </div>
      {/each}
    </div>
  {/if}

  <div class="info-grid">
    <div class="info-col">
      <span class="lbl">STATE</span>
      <span class="info-val state" style="color: {stateColor(pawn.currentState)}">{taskSummary.currentState}</span>
    </div>
    <div class="info-col">
      <span class="lbl">MOOD</span>
      <span class="info-val" style="color: {getMoodColor(pawn.state.mood)}">{pawn.state.mood}% — {getMoodDescription(pawn.state.mood)}</span>
    </div>
    <div class="info-col">
      <span class="lbl">WORK</span>
      <span class="info-val">{taskSummary.workAssignment}</span>
    </div>
    <div class="info-col">
      <span class="lbl">SIZE</span>
      <span class="info-val">{pawn.physicalTraits.size} · {pawn.physicalTraits.height}cm {pawn.physicalTraits.weight}kg</span>
    </div>
    <div class="info-span">
      <span class="lbl">TASK</span>
      <span class="info-val">{taskSummary.currentTask}</span>
    </div>
    <div class="info-span">
      <span class="lbl">NEXT</span>
      <span class="info-val">{taskSummary.nextTask}</span>
    </div>
  </div>

  <!-- TODO: draft-control mode will re-enable direct REST/EAT/WORK/IDLE commands later.
  <div class="btn-row">
    <button class="act-btn">REST</button>
    <button class="act-btn">EAT</button>
    <button class="act-btn">WORK</button>
    <button class="act-btn">IDLE</button>
  </div>
  -->
</div>

<style>
  .needs-section {
    border-bottom: 1px solid var(--border);
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
  }
  .section-hdr.sub {
    background: var(--bg);
    color: var(--text-dim);
    border-top: none;
  }

  .need-row {
    display: flex;
    align-items: center;
    padding: 3px 8px;
    gap: 8px;
  }
  .need-row:hover {
    background: var(--bg-hover);
  }

  .row {
    display: flex;
    padding: 2px 8px;
    align-items: baseline;
    gap: 6px;
  }
  .row:hover {
    background: var(--bg-hover);
  }

  .lbl {
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 11px;
    width: 70px;
    flex-shrink: 0;
  }
  .val {
    color: var(--text);
    font-size: 11px;
    width: 36px;
    text-align: right;
    flex-shrink: 0;
  }

  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .info-col {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 2px 8px;
  }
  .info-col:hover {
    background: var(--bg-hover);
  }

  .info-span {
    grid-column: 1 / -1;
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 2px 8px;
  }
  .info-span:hover {
    background: var(--bg-hover);
  }

  .info-val {
    color: var(--text);
    font-size: 11px;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .state {
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .desc {
    color: var(--text-muted);
    font-size: 11px;
    font-style: italic;
    flex: 1;
  }

  .block-bar {
    font-family: 'Courier New', monospace;
    font-size: 11px;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }

  .effects-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 4px 8px;
  }

  .effect-card {
    border: 1px solid;
    padding: 1px 6px;
    font-size: 10px;
    letter-spacing: 0.06em;
    background: color-mix(in srgb, currentColor 8%, var(--bg));
    cursor: default;
  }

  .effect-name {
    font-weight: bold;
  }

  .cond-card {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .cond-meta {
    font-size: 9px;
    letter-spacing: 0.03em;
    opacity: 0.85;
  }

  .cond-card.threatening {
    animation: pulse-threat 1.5s ease-in-out infinite;
  }

  @keyframes pulse-threat {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.45; }
  }
</style>
