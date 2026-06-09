<!-- PawnHealth.svelte — ASCII body silhouette + limb integrity panel -->
<script lang="ts">
  import type { Pawn, LimbState, LimbId, BodyPartState, BodyPartId } from '$lib/game/core/types';
  import { PART_DEF_MAP } from '$lib/game/systems/Combat';

  let { pawn }: { pawn: Pawn } = $props();

  const FALLBACK: LimbState[] = [
    { id: 'head', health: 100, isMissing: false, bleedRate: 0 },
    { id: 'torso', health: 100, isMissing: false, bleedRate: 0 },
    { id: 'left_arm', health: 100, isMissing: false, bleedRate: 0 },
    { id: 'right_arm', health: 100, isMissing: false, bleedRate: 0 },
    { id: 'left_leg', health: 100, isMissing: false, bleedRate: 0 },
    { id: 'right_leg', health: 100, isMissing: false, bleedRate: 0 }
  ];

  // Anatomical 3-column grid: left appendages | core | right appendages
  const GRID: { name: string; id: LimbId }[][] = [
    [
      { name: 'L.ARM', id: 'left_arm' },
      { name: 'HEAD', id: 'head' },
      { name: 'R.ARM', id: 'right_arm' }
    ],
    [
      { name: 'L.LEG', id: 'left_leg' },
      { name: 'TORSO', id: 'torso' },
      { name: 'R.LEG', id: 'right_leg' }
    ]
  ];

  const LIMB_NAME_MAP: Record<LimbId, string> = {
    head: 'HEAD',
    torso: 'TORSO',
    left_arm: 'L.ARM',
    right_arm: 'R.ARM',
    left_leg: 'L.LEG',
    right_leg: 'R.LEG'
  };

  let alive = $derived(pawn.isAlive !== false);
  let limbs = $derived(pawn.limbs?.length ? pawn.limbs : FALLBACK);
  let blood = $derived(pawn.bloodVolume ?? 100);
  let bleedRate = $derived(limbs.reduce((s, l) => s + (l.bleedRate ?? 0), 0));

  /** Collect every damaged / missing / injured sub-part so the UI can render them. */
  let damagedParts = $derived(
    limbs.flatMap((limb) => {
      const limbName = LIMB_NAME_MAP[limb.id];
      return (limb.parts ?? [])
        .filter((p) => p.isMissing || p.health < p.maxHp || p.injuries.length > 0)
        .map((part) => ({ limbName, part }));
    })
  );

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

  function partName(id: BodyPartId): string {
    return id
      .replace(/([A-Z])/g, ' $1')
      .toLowerCase()
      .trim();
  }

  function partHealthColor(part: BodyPartState): string {
    if (!alive) return '#2a1808';
    if (part.isMissing || part.health <= 0) return '#661010';
    const pct = part.health / part.maxHp;
    if (pct < 0.25) return 'var(--neg)';
    if (pct < 0.5) return 'var(--accent-hi)';
    if (pct < 0.75) return 'var(--text-dim)';
    return 'var(--pos)';
  }

  function injuryBadgeClass(type: string): string {
    switch (type) {
      case 'cut':
        return 'cut';
      case 'fracture':
        return 'fracture';
      case 'puncture':
        return 'puncture';
      case 'crush':
        return 'crush';
      default:
        return '';
    }
  }
</script>

<div class="health-section">
  <div class="section-hdr">| BODY</div>

  <div class="limb-grid">
    {#each GRID as row}
      {#each row as { name, id }}
        {@const limb = gl(id)}
        {@const status = limbStatus(limb)}
        {@const col = lc(limb)}
        <div class="limb-cell">
          <span class="cell-name">{name}</span>
          <span class="cell-val" style="color:{col}"
            >{status}{#if limb.bleedRate > 0}<span class="bleed-dot"> ●</span>{/if}</span
          >
        </div>
      {/each}
    {/each}
  </div>

  {#if blood < 100 || bleedRate > 0}
    <div class="blood-row">
      <span class="blood-lbl">BLOOD</span>
      <span class="blood-val" style="color:{bloodColor(blood)}">{Math.round(blood)}%</span>
      {#if bleedRate > 0}<span class="bleed-rate"> ▼{bleedRate.toFixed(1)}/t</span>{/if}
    </div>
  {/if}

  {#if damagedParts.length > 0}
    <div class="section-hdr sub-hdr">| INJURIES</div>
    <div class="parts-list">
      {#each damagedParts as { limbName, part }}
        <div class="part-row">
          <span class="part-limb">{limbName}</span>
          <span class="part-name">{partName(part.id)}</span>
          <span class="part-hp" style="color:{partHealthColor(part)}">
            {part.isMissing ? 'MISSING' : `${Math.round((part.health / part.maxHp) * 100)}%`}
          </span>
          {#if part.injuries.length > 0}
            <span class="part-badges">
              {#each part.injuries as injury}
                <span class="injury-badge {injuryBadgeClass(injury.type)}"
                  >{injury.type.toUpperCase()}</span
                >
              {/each}
            </span>
          {/if}
          {#if PART_DEF_MAP[part.id]?.isVital}
            <span class="vital-badge">V</span>
          {/if}
        </div>
      {/each}
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

  .sub-hdr {
    border-top: 1px solid var(--border);
    font-size: 10px;
  }

  .limb-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    padding: 4px 8px 2px;
    gap: 1px 6px;
  }

  .limb-cell {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 2px 0;
  }

  .cell-name {
    color: var(--text-muted);
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

  .parts-list {
    display: flex;
    flex-direction: column;
    padding: 2px 8px 4px;
    gap: 1px;
  }

  .part-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 1px 0;
    flex-wrap: wrap;
  }

  .part-limb {
    color: var(--text-muted);
    font-size: 10px;
    letter-spacing: 0.04em;
    min-width: 36px;
    flex-shrink: 0;
  }

  .part-name {
    font-size: 10px;
    flex: 1 1 auto;
    min-width: 60px;
  }

  .part-hp {
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    min-width: 36px;
    text-align: right;
    flex-shrink: 0;
  }

  .part-badges {
    display: flex;
    gap: 3px;
    flex-shrink: 0;
  }

  .injury-badge {
    font-size: 9px;
    padding: 0 3px;
    border-radius: 2px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    letter-spacing: 0.02em;
  }

  .injury-badge.cut {
    color: var(--neg);
    border-color: var(--neg);
  }

  .injury-badge.fracture {
    color: var(--accent-hi);
    border-color: var(--accent-hi);
  }

  .injury-badge.puncture {
    color: var(--text-dim);
    border-color: var(--text-dim);
  }

  .injury-badge.crush {
    color: #a08060;
    border-color: #a08060;
  }

  .vital-badge {
    font-size: 9px;
    padding: 0 3px;
    border-radius: 2px;
    background: var(--bg-panel);
    color: var(--accent);
    border: 1px solid var(--accent);
    letter-spacing: 0.02em;
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
