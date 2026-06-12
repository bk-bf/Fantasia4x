<script lang="ts">
  import type {
    GameState,
    Pawn,
    StatusEffectDef,
    ConditionDef,
    ConditionStage
  } from '$lib/game/core/types';
  import { getNeedColor, getNeedDescription } from '$lib/utils/pawnUtils';
  import statusEffectsData from '$lib/game/database/status-effects.jsonc';
  import conditionsData from '$lib/game/database/conditions.jsonc';
  import { pawnService } from '$lib/game/services/PawnService';

  const STATUS_EFFECTS_DB = statusEffectsData as unknown as StatusEffectDef[];
  const CONDITIONS_DB = conditionsData as unknown as ConditionDef[];

  export let pawn: Pawn;
  export let gameState: GameState;

  $: needs = pawn.needs;
  // All needs are flat 0–100.
  $: hungerPct = Math.round(needs.hunger);
  $: fatiguePct = Math.round(needs.fatigue);
  $: thirstPct = Math.round(needs.thirst ?? 0);
  $: hygienePct = Math.round(needs.hygiene ?? 0);
  function blockBar(value: number, width = 16): string {
    const filled = Math.max(0, Math.min(width, Math.round((value / 100) * width)));
    return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + ']';
  }
  function getBloodColor(pct: number): string {
    if (pct >= 70) return 'var(--pos)';
    if (pct >= 40) return '#c8a030';
    if (pct >= 20) return '#c86030';
    return 'var(--neg)';
  }
  function getStaminaColor(pct: number): string {
    if (pct >= 60) return '#38b8c8';
    if (pct >= 30) return '#c8a030';
    return '#c86030';
  }
  $: activeEffects = (pawn.activeEffects ?? [])
    .map((id) => STATUS_EFFECTS_DB.find((e) => e.id === id))
    .filter((e): e is StatusEffectDef => e !== undefined);

  type ActiveCond = { name: string; severity: number; stage: ConditionStage };
  $: activeConditions = (pawn.conditions ?? [])
    .filter((c) => c.severity > 0)
    .reduce<ActiveCond[]>((acc, c) => {
      const def = CONDITIONS_DB.find((d) => d.id === c.id);
      if (!def) return acc;
      let stage: ConditionStage | undefined;
      for (const s of def.stages) if (c.severity >= s.minSeverity) stage = s;
      if (stage) acc.push({ name: def.name, severity: c.severity, stage });
      return acc;
    }, []);
</script>

<div class="needs-section">
  <div class="section-hdr">| NEEDS</div>

  <div class="need-row">
    <span class="lbl">HUNGER</span>
    <span class="block-bar" style="color: {getNeedColor(hungerPct)}">{blockBar(hungerPct)}</span>
    <span class="val" style="color: {getNeedColor(hungerPct)}"
      >{Math.round(needs.hunger)}/100</span
    >
    <span class="desc">{getNeedDescription('hunger', needs.hunger)}</span>
  </div>

  <div class="need-row">
    <span class="lbl">REST</span>
    <span class="block-bar" style="color: {getNeedColor(fatiguePct)}">{blockBar(fatiguePct)}</span>
    <span class="val" style="color: {getNeedColor(fatiguePct)}"
      >{Math.round(needs.fatigue)}/100</span
    >
    <span class="desc">{getNeedDescription('fatigue', needs.fatigue)}</span>
  </div>

  <div class="need-row">
    <span class="lbl">THIRST</span>
    <span class="block-bar" style="color: {getNeedColor(thirstPct)}">{blockBar(thirstPct)}</span>
    <span class="val" style="color: {getNeedColor(thirstPct)}">{thirstPct}/100</span>
    <span class="desc">{getNeedDescription('thirst', thirstPct)}</span>
  </div>

  <div class="need-row">
    <span class="lbl">HYGIENE</span>
    <span class="block-bar" style="color: {getNeedColor(hygienePct)}">{blockBar(hygienePct)}</span>
    <span class="val" style="color: {getNeedColor(hygienePct)}">{hygienePct}/100</span>
    <span class="desc">{getNeedDescription('hygiene', hygienePct)}</span>
  </div>

  {#if pawn.maxBloodVolume}
    {@const maxBV = pawn.maxBloodVolume}
    {@const curBV = pawn.bloodVolume ?? maxBV}
    {@const bloodPct = Math.round((curBV / maxBV) * 100)}
    <div class="need-row">
      <span class="lbl">BLOOD</span>
      <span class="block-bar" style="color: {getBloodColor(bloodPct)}">{blockBar(bloodPct)}</span>
      <span class="val" style="color: {getBloodColor(bloodPct)}">{Math.round(curBV)}/{maxBV}</span>
      <span class="desc"
        >{bloodPct >= 90
          ? 'healthy'
          : bloodPct >= 60
            ? 'low'
            : bloodPct >= 30
              ? 'critical'
              : 'near death'}</span
      >
    </div>
  {/if}

  {#if pawn.maxStamina !== undefined}
    {@const maxST = pawn.maxStamina}
    {@const curST = pawn.stamina ?? maxST}
    {@const stPct = Math.round((curST / maxST) * 100)}
    <div class="need-row">
      <span class="lbl">STAMINA</span>
      <span class="block-bar" style="color: {getStaminaColor(stPct)}">{blockBar(stPct)}</span>
      <span class="val" style="color: {getStaminaColor(stPct)}">{Math.round(curST)}/{maxST}</span>
      <span class="desc"
        >{stPct >= 80
          ? 'fresh'
          : stPct >= 50
            ? 'tired'
            : stPct >= 20
              ? 'winded'
              : 'exhausted'}</span
      >
    </div>
  {/if}

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
          title="{name} — {Math.round(severity * 100)}% severity{stage.lifeThreatening
            ? ' ⚠ life-threatening'
            : ''}"
        >
          <span class="effect-name">{name.toUpperCase()}</span>
          <span class="cond-meta">{stage.label.toUpperCase()} · {Math.round(severity * 100)}%</span>
        </div>
      {/each}
    </div>
  {/if}

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
  .section-hdr {
    padding: 4px 8px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 11px;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
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
    min-height: 26px;
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
    min-width: 36px;
    text-align: right;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .desc {
    color: var(--text-muted);
    font-size: 11px;
    font-style: italic;
    flex: 1;
    white-space: nowrap;
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
    border-top: 1px solid var(--border);
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
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.45;
    }
  }
</style>
