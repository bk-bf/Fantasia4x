<!-- PawnHealth.svelte — ASCII body silhouette + limb integrity panel -->
<script lang="ts">
  import type { Pawn, LimbState, LimbId } from '$lib/game/core/types';

  let { pawn }: { pawn: Pawn } = $props();

  const FALLBACK: LimbState[] = [
    { id: 'head', health: 100, isMissing: false, bleedRate: 0 },
    { id: 'torso', health: 100, isMissing: false, bleedRate: 0 },
    { id: 'left_arm', health: 100, isMissing: false, bleedRate: 0 },
    { id: 'right_arm', health: 100, isMissing: false, bleedRate: 0 },
    { id: 'left_leg', health: 100, isMissing: false, bleedRate: 0 },
    { id: 'right_leg', health: 100, isMissing: false, bleedRate: 0 }
  ];

  const LIMBS: { name: string; id: LimbId }[] = [
    { name: 'HEAD', id: 'head' },
    { name: 'TORSO', id: 'torso' },
    { name: 'L.ARM', id: 'left_arm' },
    { name: 'R.ARM', id: 'right_arm' },
    { name: 'L.LEG', id: 'left_leg' },
    { name: 'R.LEG', id: 'right_leg' }
  ];

  let alive = $derived(pawn.isAlive !== false);
  let limbs = $derived(pawn.limbs?.length ? pawn.limbs : FALLBACK);
  let blood = $derived(pawn.bloodVolume ?? 100);
  let bleedRate = $derived(limbs.reduce((s, l) => s + (l.bleedRate ?? 0), 0));

  function gl(id: LimbId): LimbState {
    return limbs.find((l) => l.id === id) ?? FALLBACK.find((l) => l.id === id)!;
  }

  function lc(limb: LimbState): string {
    if (!alive) return '#2a1808';
    if (limb.isMissing || limb.health <= 0) return '#661010';
    if (limb.health < 25) return 'var(--neg)';
    if (limb.health < 50) return 'var(--accent-hi)';
    if (limb.health < 75) return 'var(--text-dim)';
    return 'var(--pos)';
  }

  function limbStatus(limb: LimbState): string {
    if (limb.isMissing) return 'MISSING';
    if (limb.health <= 0) return 'GONE';
    return `${limb.health}%`;
  }

  function bloodColor(v: number): string {
    if (v >= 80) return 'var(--pos)';
    if (v >= 60) return 'var(--text-dim)';
    if (v >= 40) return 'var(--accent-hi)';
    return 'var(--neg)';
  }
</script>

<div class="health-section">
  <div class="section-hdr">| BODY</div>

  <div class="limb-list">
    {#each LIMBS as { name, id }}
      {@const limb = gl(id)}
      {@const status = limbStatus(limb)}
      {@const col = lc(limb)}
      <div class="limb-row">
        <span class="cell-name" style="color:{col}">{name}</span>
        <span class="cell-val" style="color:{col}"
          >{status}{#if limb.bleedRate > 0}<span class="bleed-dot"> ●</span>{/if}</span
        >
      </div>
    {/each}
  </div>

  {#if blood < 100 || bleedRate > 0}
    <div class="blood-row">
      <span class="blood-lbl">BLOOD</span>
      <span class="blood-val" style="color:{bloodColor(blood)}">{Math.round(blood)}%</span>
      {#if bleedRate > 0}<span class="bleed-rate"> ▼{bleedRate.toFixed(1)}/t</span>{/if}
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

  .limb-list {
    padding: 2px 8px;
  }

  .limb-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 2px 0;
  }
  .limb-row:hover {
    background: var(--bg-hover);
    margin: 0 -8px;
    padding: 2px 8px;
  }

  .cell-name {
    font-size: 10px;
    letter-spacing: 0.04em;
    flex-shrink: 0;
  }

  .cell-val {
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .bleed-dot {
    color: var(--neg);
    animation: blink 1s step-end infinite;
  }

  .blood-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 2px 8px 4px;
    border-top: 1px solid var(--border);
  }

  .blood-lbl {
    color: var(--text-muted);
    font-size: 10px;
    letter-spacing: 0.04em;
    min-width: 40px;
    flex-shrink: 0;
  }

  .blood-val {
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }

  .bleed-rate {
    color: var(--neg);
    font-size: 10px;
  }

  @keyframes blink {
    0%,
    50% {
      opacity: 1;
    }
    51%,
    100% {
      opacity: 0;
    }
  }
</style>
