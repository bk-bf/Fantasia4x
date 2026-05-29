<!-- PawnHealth.svelte — ASCII body silhouette + limb integrity panel -->
<script lang="ts">
  import type { Pawn, LimbState, LimbId, PawnCondition, ConditionDef, ConditionStage } from '$lib/game/core/types';
  import conditionsData from '$lib/game/database/conditions.jsonc';

  let { pawn }: { pawn: Pawn } = $props();

  const CONDITIONS_DB = conditionsData as unknown as ConditionDef[];

  const FALLBACK: LimbState[] = [
    { id: 'head',      health: 100, isMissing: false, bleedRate: 0 },
    { id: 'torso',     health: 100, isMissing: false, bleedRate: 0 },
    { id: 'left_arm',  health: 100, isMissing: false, bleedRate: 0 },
    { id: 'right_arm', health: 100, isMissing: false, bleedRate: 0 },
    { id: 'left_leg',  health: 100, isMissing: false, bleedRate: 0 },
    { id: 'right_leg', health: 100, isMissing: false, bleedRate: 0 },
  ];

  const LIMB_DEFS: { name: string; id: LimbId }[] = [
    { name: 'HEAD',  id: 'head' },
    { name: 'TORSO', id: 'torso' },
    { name: 'L.ARM', id: 'left_arm' },
    { name: 'R.ARM', id: 'right_arm' },
    { name: 'L.LEG', id: 'left_leg' },
    { name: 'R.LEG', id: 'right_leg' },
  ];

  let alive   = $derived(pawn.isAlive !== false);
  let limbs   = $derived(pawn.limbs?.length ? pawn.limbs : FALLBACK);
  let blood   = $derived(pawn.bloodVolume ?? 100);
  let conditions = $derived((pawn.conditions ?? []).filter(c => c.severity > 0));
  let bleedRate  = $derived(limbs.reduce((s, l) => s + (l.bleedRate ?? 0), 0));

  function gl(id: LimbId): LimbState {
    return limbs.find(l => l.id === id) ?? FALLBACK.find(l => l.id === id)!;
  }

  // Color based on limb health
  function lc(limb: LimbState): string {
    if (!alive) return '#2a1808';
    if (limb.isMissing || limb.health <= 0) return '#661010';
    if (limb.health < 25) return 'var(--neg)';
    if (limb.health < 50) return 'var(--accent-hi)';
    if (limb.health < 75) return 'var(--text-dim)';
    return 'var(--pos)';
  }

  // Block character representing limb integrity
  function ch(limb: LimbState): string {
    if (!alive) return '░';
    if (limb.isMissing || limb.health <= 0) return '▒';
    if (limb.health < 50) return '▓';
    return '█';
  }

  function statusLabel(limb: LimbState): string {
    if (!alive) return '---';
    if (limb.isMissing) return 'GONE';
    if (limb.health <= 0) return 'DEST';
    if (limb.health < 25) return 'CRIT';
    if (limb.health < 50) return 'HURT';
    if (limb.health < 75) return 'BRSD';
    return 'OK';
  }

  function bloodColor(v: number): string {
    if (v >= 80) return 'var(--pos)';
    if (v >= 60) return 'var(--text-dim)';
    if (v >= 40) return 'var(--accent-hi)';
    return 'var(--neg)';
  }

  function condStage(c: PawnCondition): ConditionStage | undefined {
    const def = CONDITIONS_DB.find(d => d.id === c.id);
    if (!def) return undefined;
    let active: ConditionStage | undefined;
    for (const s of def.stages) if (c.severity >= s.minSeverity) active = s;
    return active;
  }

  function condName(c: PawnCondition): string {
    return CONDITIONS_DB.find(d => d.id === c.id)?.name ?? c.id;
  }

  // ── ASCII silhouette ──────────────────────────────────────────────────────
  // Figure is 13 chars wide; each row is an array of {color, text} segments.
  //
  //   "    █████    "  ← HEAD  (rows 0–1)
  //   " ██ █████ ██ "  ← L.ARM + TORSO + R.ARM  (rows 2–4)
  //   "    ██ ██    "  ← L.LEG + R.LEG  (rows 5–7)
  //
  type Seg = { color: string; text: string };

  let h  = $derived(gl('head'));
  let t  = $derived(gl('torso'));
  let la = $derived(gl('left_arm'));
  let ra = $derived(gl('right_arm'));
  let ll = $derived(gl('left_leg'));
  let rl = $derived(gl('right_leg'));

  let figRows = $derived<Seg[][]>([
    [{ color: lc(h),  text: '    ' + ch(h).repeat(5) + '    ' }],
    [{ color: lc(h),  text: '    ' + ch(h).repeat(5) + '    ' }],
    [
      { color: lc(la), text: ' ' + ch(la).repeat(2) },
      { color: lc(t),  text: ' ' + ch(t).repeat(5) + ' ' },
      { color: lc(ra), text: ch(ra).repeat(2) + ' ' },
    ],
    [
      { color: lc(la), text: ' ' + ch(la).repeat(2) },
      { color: lc(t),  text: ' ' + ch(t).repeat(5) + ' ' },
      { color: lc(ra), text: ch(ra).repeat(2) + ' ' },
    ],
    [
      { color: lc(la), text: ' ' + ch(la).repeat(2) },
      { color: lc(t),  text: ' ' + ch(t).repeat(5) + ' ' },
      { color: lc(ra), text: ch(ra).repeat(2) + ' ' },
    ],
    [
      { color: lc(ll), text: '    ' + ch(ll).repeat(2) },
      { color: lc(rl), text: ' ' + ch(rl).repeat(2) + '   ' },
    ],
    [
      { color: lc(ll), text: '    ' + ch(ll).repeat(2) },
      { color: lc(rl), text: ' ' + ch(rl).repeat(2) + '   ' },
    ],
    [
      { color: lc(ll), text: '    ' + ch(ll).repeat(2) },
      { color: lc(rl), text: ' ' + ch(rl).repeat(2) + '   ' },
    ],
  ]);
</script>

<div class="health-section">
  <div class="section-hdr">| BODY</div>

  <div class="body-panel">
    <!-- ASCII body silhouette (left) -->
    <div class="silhouette" title="Body integrity">
      {#each figRows as row}
        <div class="fig-line">{#each row as seg}<span style="color:{seg.color}">{seg.text}</span>{/each}</div>
      {/each}
    </div>

    <!-- Limb health list (right) -->
    <div class="limb-list">
      {#each LIMB_DEFS as def}
        {@const limb = gl(def.id)}
        {@const col  = lc(limb)}
        <div class="limb-row">
          <span class="limb-name">{def.name}</span>
          <div class="limb-bar-wrap">
            <div
              class="limb-bar-fill"
              style="width:{limb.isMissing ? 0 : limb.health}%; background:{col}"
            ></div>
          </div>
          <span class="limb-status" style="color:{col}">{statusLabel(limb)}</span>
          {#if limb.bleedRate > 0}
            <span class="bleed-dot" title="Bleeding">●</span>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <!-- Blood volume — only rendered when below full or actively bleeding -->
  {#if blood < 100 || bleedRate > 0}
    <div class="blood-row">
      <span class="row-lbl">BLOOD</span>
      <div class="blood-bar-wrap">
        <div class="blood-bar-fill" style="width:{blood}%; background:{bloodColor(blood)}"></div>
      </div>
      <span class="row-val" style="color:{bloodColor(blood)}">{Math.round(blood)}%</span>
      {#if bleedRate > 0}
        <span class="bleed-rate">▼{bleedRate.toFixed(2)}/t</span>
      {/if}
    </div>
  {/if}

  <!-- Active conditions (severity > 0) -->
  {#if conditions.length > 0}
    <div class="section-hdr sub">| CONDITIONS</div>
    {#each conditions as cond}
      {@const stage = condStage(cond)}
      {#if stage}
        <div class="cond-row" class:threatening={stage.lifeThreatening}>
          <span class="cond-name" style="color:{stage.color}"
            >{condName(cond).toUpperCase()}</span
          >
          <div class="cond-bar-wrap">
            <div
              class="cond-bar-fill"
              style="width:{Math.round(cond.severity * 100)}%; background:{stage.color}"
            ></div>
          </div>
          <span class="cond-stage" style="color:{stage.color}"
            >{stage.label.toUpperCase()}</span
          >
          {#if stage.lifeThreatening}
            <span class="threat-icon" title="Life-threatening">⚠</span>
          {/if}
        </div>
      {/if}
    {/each}
  {/if}
</div>

<style>
  .health-section {
    border-bottom: 1px solid var(--border);
  }

  .section-hdr {
    padding: 4px 8px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 11px;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
  }

  .section-hdr.sub {
    background: transparent;
    border-top: 1px solid var(--border);
  }

  /* ── Body panel: silhouette + limb list side-by-side ── */
  .body-panel {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 6px 8px 4px;
  }

  /* ASCII silhouette */
  .silhouette {
    flex-shrink: 0;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    line-height: 1.35;
    user-select: none;
  }

  .fig-line {
    white-space: pre;
    line-height: 1.35;
  }

  /* Limb list */
  .limb-list {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    padding-top: 3px;
  }

  .limb-row {
    display: flex;
    align-items: center;
    gap: 5px;
    min-height: 13px;
  }

  .limb-name {
    color: var(--text-dim);
    font-size: 10px;
    letter-spacing: 0.04em;
    min-width: 38px;
    flex-shrink: 0;
  }

  .limb-bar-wrap {
    flex: 1;
    height: 5px;
    background: var(--bg-active);
    border: 1px solid var(--border);
    overflow: hidden;
  }

  .limb-bar-fill {
    height: 100%;
    transition: width 0.15s, background 0.15s;
  }

  .limb-status {
    font-size: 10px;
    min-width: 28px;
    text-align: right;
    flex-shrink: 0;
  }

  .bleed-dot {
    color: var(--neg);
    font-size: 8px;
    flex-shrink: 0;
    animation: blink 1s step-end infinite;
  }

  /* Blood volume row */
  .blood-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px 3px;
    border-top: 1px solid var(--border);
  }

  .row-lbl {
    color: var(--text-dim);
    font-size: 10px;
    letter-spacing: 0.04em;
    min-width: 40px;
    flex-shrink: 0;
  }

  .blood-bar-wrap {
    flex: 1;
    height: 5px;
    background: var(--bg-active);
    border: 1px solid var(--border);
    overflow: hidden;
  }

  .blood-bar-fill {
    height: 100%;
    transition: width 0.15s;
  }

  .row-val {
    font-size: 10px;
    min-width: 32px;
    text-align: right;
    flex-shrink: 0;
  }

  .bleed-rate {
    color: var(--neg);
    font-size: 10px;
    flex-shrink: 0;
  }

  /* Conditions */
  .cond-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
  }

  .cond-row.threatening {
    animation: pulse-bg 1.5s ease-in-out infinite;
  }

  @keyframes pulse-bg {
    0%, 100% { background: transparent; }
    50% { background: rgba(200, 48, 24, 0.10); }
  }

  .cond-name {
    font-size: 10px;
    letter-spacing: 0.03em;
    min-width: 90px;
    flex-shrink: 0;
  }

  .cond-bar-wrap {
    flex: 1;
    height: 5px;
    background: var(--bg-active);
    border: 1px solid var(--border);
    overflow: hidden;
  }

  .cond-bar-fill {
    height: 100%;
  }

  .cond-stage {
    font-size: 10px;
    min-width: 52px;
    text-align: right;
    flex-shrink: 0;
  }

  .threat-icon {
    color: var(--neg);
    font-size: 11px;
    flex-shrink: 0;
    animation: blink 1s step-end infinite;
  }

  @keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
  }
</style>
