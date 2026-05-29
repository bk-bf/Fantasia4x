<!-- PawnHealth.svelte — ASCII body silhouette + limb integrity panel -->
<script lang="ts">
  import type { Pawn, LimbState, LimbId } from '$lib/game/core/types';

  let { pawn }: { pawn: Pawn } = $props();

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

  let alive      = $derived(pawn.isAlive !== false);
  let limbs      = $derived(pawn.limbs?.length ? pawn.limbs : FALLBACK);
  let blood      = $derived(pawn.bloodVolume ?? 100);
  let bleedRate  = $derived(limbs.reduce((s, l) => s + (l.bleedRate ?? 0), 0));

  function gl(id: LimbId): LimbState {
    return limbs.find(l => l.id === id) ?? FALLBACK.find(l => l.id === id)!;
  }

  function lc(limb: LimbState): string {
    if (!alive) return '#2a1808';
    if (limb.isMissing || limb.health <= 0) return '#661010';
    if (limb.health < 25) return 'var(--neg)';
    if (limb.health < 50) return 'var(--accent-hi)';
    if (limb.health < 75) return 'var(--text-dim)';
    return 'var(--pos)';
  }

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

  /** Unicode block-char progress bar, e.g. [████████████░░░░░░░░] */
  function blockBar(value: number, width = 20): string {
    const filled = Math.max(0, Math.min(width, Math.round((value / 100) * width)));
    return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + ']';
  }

  // ── ASCII silhouette ──────────────────────────────────────────────────────
  // 13 chars wide, 8 rows:
  //   "    █████    "  HEAD        (rows 0–1)
  //   " ██ █████ ██ "  ARMS+TORSO  (rows 2–4)
  //   "    ██ ██    "  LEGS        (rows 5–7)
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
    <!-- ASCII body silhouette — block chars colored by health state -->
    <div class="silhouette" title="Body integrity">
      {#each figRows as row}
        <div class="fig-line">{#each row as seg}<span style="color:{seg.color}">{seg.text}</span>{/each}</div>
      {/each}
    </div>

    <!-- Limb stats: name · health% · status label (no bars — figure shows health) -->
    <div class="limb-list">
      {#each LIMB_DEFS as def}
        {@const limb = gl(def.id)}
        {@const col  = lc(limb)}
        <div class="limb-row">
          <span class="limb-name">{def.name}</span>
          <span class="limb-hp" style="color:{col}"
            >{limb.isMissing ? ' --' : String(limb.health).padStart(3)}%</span
          >
          <span class="limb-status" style="color:{col}">{statusLabel(limb)}</span>
          {#if limb.bleedRate > 0}
            <span class="bleed-dot" title="Bleeding">●</span>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <!-- Blood volume — Unicode block bar, only when < 100 or bleeding -->
  {#if blood < 100 || bleedRate > 0}
    <div class="stat-row">
      <span class="stat-lbl">BLOOD</span>
      <span class="block-bar" style="color:{bloodColor(blood)}">{blockBar(blood)}</span>
      <span class="stat-val" style="color:{bloodColor(blood)}">{Math.round(blood)}%</span>
      {#if bleedRate > 0}
        <span class="bleed-rate">▼{bleedRate.toFixed(2)}/t</span>
      {/if}
    </div>
  {/if}


</div>

<style>
  .health-section {
    border-bottom: 1px solid var(--border);
    font-family: 'Courier New', monospace;
    font-size: 11px;
  }

  .section-hdr {
    padding: 4px 8px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
  }

  .section-hdr.sub {
    background: transparent;
    border-top: 1px solid var(--border);
  }

  /* ── Body panel: silhouette left + limb stats right ── */
  .body-panel {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 6px 8px 4px;
  }

  .silhouette {
    flex-shrink: 0;
    line-height: 1.35;
    user-select: none;
  }

  .fig-line {
    white-space: pre;
    line-height: 1.35;
  }

  .limb-list {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    padding-top: 4px;
  }

  .limb-row {
    display: flex;
    align-items: baseline;
    gap: 4px;
  }

  .limb-name {
    color: var(--text-dim);
    font-size: 10px;
    letter-spacing: 0.04em;
    min-width: 38px;
    flex-shrink: 0;
  }

  .limb-hp {
    font-size: 10px;
    min-width: 36px;
    text-align: right;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }

  .limb-status {
    font-size: 10px;
    min-width: 28px;
    flex-shrink: 0;
  }

  .bleed-dot {
    color: var(--neg);
    font-size: 8px;
    flex-shrink: 0;
    animation: blink 1s step-end infinite;
  }

  /* ── Stat rows (blood + conditions) ── */
  .stat-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 2px 8px;
    border-top: 1px solid var(--border);
  }

  .stat-lbl {
    color: var(--text-dim);
    font-size: 10px;
    letter-spacing: 0.04em;
    min-width: 40px;
    flex-shrink: 0;
  }

  .block-bar {
    flex: 1;
    font-size: 10px;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }

  .stat-val {
    font-size: 10px;
    min-width: 52px;
    text-align: right;
    flex-shrink: 0;
  }

  .bleed-rate {
    color: var(--neg);
    font-size: 10px;
    flex-shrink: 0;
  }

  @keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
  }
</style>
