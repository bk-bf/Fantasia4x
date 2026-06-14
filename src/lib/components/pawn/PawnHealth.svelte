<!-- PawnHealth.svelte — limb tree with nested sub-parts + 3-state reveal cycle -->
<script lang="ts">
  import type { Pawn, LimbState, LimbId, BodyPartState, BodyPartId } from '$lib/game/core/types';
  import { PART_DEF_MAP, createDefaultBodyParts } from '$lib/game/systems/Combat';
  import {
    healthPctColor,
    bloodColor as bloodColorShared,
    painColor as painColorShared
  } from '$lib/components/UI/gameCanvas/healthColors';

  let { pawn }: { pawn: Pawn } = $props();

  const FALLBACK: LimbState[] = [
    { id: 'head', health: 100, isMissing: false, bleedRate: 0 },
    { id: 'torso', health: 100, isMissing: false, bleedRate: 0 },
    { id: 'left_arm', health: 100, isMissing: false, bleedRate: 0 },
    { id: 'right_arm', health: 100, isMissing: false, bleedRate: 0 },
    { id: 'left_leg', health: 100, isMissing: false, bleedRate: 0 },
    { id: 'right_leg', health: 100, isMissing: false, bleedRate: 0 }
  ];

  // Anatomical top-down order; sub-parts nest directly beneath each limb.
  const LIMB_ORDER: { name: string; id: LimbId }[] = [
    { name: 'HEAD', id: 'head' },
    { name: 'TORSO', id: 'torso' },
    { name: 'L.ARM', id: 'left_arm' },
    { name: 'R.ARM', id: 'right_arm' },
    { name: 'L.LEG', id: 'left_leg' },
    { name: 'R.LEG', id: 'right_leg' }
  ];

  let alive = $derived(pawn.isAlive !== false);
  let limbs = $derived(pawn.limbs?.length ? pawn.limbs : FALLBACK);
  // Blood as a % of capacity — matches the info-card readout. (Showing raw bloodVolume
  // mislabelled a light pawn's full blood as e.g. "59%" while the info card said 100%.)
  let maxBlood = $derived(pawn.maxBloodVolume ?? 100);
  let blood = $derived(Math.round(((pawn.bloodVolume ?? maxBlood) / maxBlood) * 100));
  let bleedRate = $derived(limbs.reduce((s, l) => s + (l.bleedRate ?? 0), 0));
  let pain = $derived(pawn.pain ?? 0);
  let prone = $derived(
    (pawn.activeEffects ?? []).includes('knockdown') ||
      (pawn.activeEffects ?? []).includes('collapse')
  );

  // Per-limb reveal cycle: damaged sub-limbs (default) → show all → hide everything → back.
  type Reveal = 'hidden' | 'injured' | 'all';
  let override = $state<Map<LimbId, Reveal>>(new Map());

  function isInjured(p: BodyPartState): boolean {
    return p.isMissing || p.health < p.maxHp || p.injuries.length > 0;
  }
  function reveal(id: LimbId, _limb: LimbState): Reveal {
    // Default everywhere = 'injured' (show only damaged sub-limbs; healthy limbs show none).
    return override.get(id) ?? 'injured';
  }
  function cycle(id: LimbId, limb: LimbState) {
    const cur = reveal(id, limb);
    const next: Reveal = cur === 'injured' ? 'all' : cur === 'all' ? 'hidden' : 'injured';
    const m = new Map(override);
    m.set(id, next);
    override = m;
  }
  function shownParts(id: LimbId, limb: LimbState): BodyPartState[] {
    const st = reveal(id, limb);
    if (st === 'hidden') return [];
    const all = (limb.parts ?? []).length > 0 ? limb.parts! : createDefaultBodyParts(id);
    return st === 'all' ? all : all.filter(isInjured);
  }

  function gl(id: LimbId): LimbState {
    return limbs.find((l) => l.id === id) ?? FALLBACK.find((l) => l.id === id)!;
  }

  function lc(limb: LimbState): string {
    return healthPctColor(limb.health, { missing: limb.isMissing, alive });
  }

  function limbStatus(limb: LimbState): string {
    if (limb.isMissing) return 'MISSING';
    if (limb.health <= 0) return 'GONE';
    return `${limb.health}%`;
  }

  const bloodColor = bloodColorShared;
  const painColor = painColorShared;

  function partName(id: BodyPartId): string {
    return id
      .replace(/([A-Z])/g, ' $1')
      .toLowerCase()
      .trim();
  }

  function partHealthColor(part: BodyPartState): string {
    return healthPctColor((part.health / part.maxHp) * 100, {
      missing: part.isMissing,
      alive
    });
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
      case 'burn':
        return 'burn';
      default:
        return '';
    }
  }
</script>

<div class="health-section">
  <div class="section-hdr">| BODY</div>

  <!-- Pain + prone summary -->
  {#if pain > 0 || prone || blood < 100 || bleedRate > 0}
    <div class="status-row">
      {#if pain > 0}
        <span class="status-lbl">PAIN</span>
        <span class="status-val" style="color:{painColor(pain)}">{Math.round(pain)}%</span>
      {/if}
      {#if prone}
        <span class="prone-badge">DOWN</span>
      {/if}
      {#if blood < 100 || bleedRate > 0}
        <span class="status-lbl">BLOOD</span>
        <span class="status-val" style="color:{bloodColor(blood)}">{Math.round(blood)}%</span>
        {#if bleedRate > 0}<span class="bleed-rate">▼{bleedRate.toFixed(1)}/t</span>{/if}
      {/if}
    </div>
  {/if}

  <!-- Limb tree: each root limb, sub-parts nested beneath. Click a limb to cycle
       hidden → injured-only → all. -->
  <div class="limb-list">
    {#each LIMB_ORDER as { name, id }}
      {@const limb = gl(id)}
      {@const st = reveal(id, limb)}
      {@const parts = shownParts(id, limb)}
      <div
        class="limb-row"
        role="button"
        tabindex="0"
        title="click: cycle damaged → all → hidden"
        onclick={() => cycle(id, limb)}
        onkeydown={(e) => e.key === 'Enter' && cycle(id, limb)}
      >
        <span class="limb-name">{name}</span>
        <span class="limb-cue" class:open={st !== 'hidden'} class:all={st === 'all'}
          >{st === 'hidden' ? '▸' : '▾'}</span
        >
        <span class="limb-val" style="color:{lc(limb)}"
          >{limbStatus(limb)}{#if limb.bleedRate > 0}<span class="bleed-dot">●</span>{/if}</span
        >
      </div>
      {#if parts.length > 0}
        <div class="limb-children">
          {#each parts as part}
            <div class="part-row" class:damaged={isInjured(part)}>
              <span class="part-name"
                >{partName(part.id)}{#if PART_DEF_MAP[part.id]?.isVital}<span class="vital-star"
                    >★</span
                  >{/if}</span
              >
              <span class="part-hp" style="color:{partHealthColor(part)}"
                >{part.isMissing
                  ? 'MISSING'
                  : `${Math.round((part.health / part.maxHp) * 100)}%`}</span
              >
              {#if part.injuries.length > 0}
                <span class="part-badges">
                  {#each part.injuries as injury}
                    <span
                      class="injury-badge {injuryBadgeClass(injury.type)}"
                      title="{injury.severity} {injury.type}"
                      >{injury.type.toUpperCase()} · {injury.severity}</span
                    >
                  {/each}
                </span>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    {/each}
  </div>
</div>

<style>
  .health-section {
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

  .status-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 3px 8px;
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
  }

  .status-lbl {
    color: var(--text-muted);
    font-size: 10px;
    letter-spacing: 0.04em;
  }

  .status-val {
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }

  .prone-badge {
    font-size: 9px;
    padding: 0 4px;
    border-radius: 2px;
    background: var(--bg-panel);
    color: var(--neg);
    border: 1px solid var(--neg);
    letter-spacing: 0.04em;
  }

  .bleed-rate {
    color: var(--neg);
    font-size: 10px;
  }

  .limb-list {
    display: flex;
    flex-direction: column;
    padding: 3px 8px 5px;
  }

  .limb-row {
    display: flex;
    align-items: baseline;
    gap: 5px;
    padding: 2px 0;
    cursor: pointer;
  }
  .limb-row:hover .limb-name {
    color: var(--text);
  }

  .limb-name {
    color: var(--text-dim);
    font-size: 10px;
    letter-spacing: 0.04em;
    flex-shrink: 0;
  }

  .limb-cue {
    color: var(--text-muted);
    font-size: 8px;
    flex-shrink: 0;
  }
  .limb-cue.open {
    color: var(--accent-hi);
  }
  .limb-cue.all {
    color: var(--text-muted);
  }

  .limb-val {
    margin-left: auto;
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    text-align: right;
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .bleed-dot {
    color: var(--neg);
    animation: blink 1s step-end infinite;
  }

  /* Sub-parts indented directly under their parent limb. */
  .limb-children {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 1px 0 3px 14px;
    margin-left: 3px;
    border-left: 1px solid var(--border);
  }

  .part-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 1px 0;
    opacity: 0.55;
  }
  .part-row.damaged {
    opacity: 1;
  }

  .part-name {
    font-size: 10px;
    color: var(--text-dim);
    flex: 0 1 auto;
  }

  .part-hp {
    margin-left: auto;
    font-size: 10px;
    font-variant-numeric: tabular-nums;
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
    white-space: nowrap;
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
  .injury-badge.burn {
    color: #ff7043;
    border-color: #ff7043;
  }

  .vital-star {
    font-size: 8px;
    color: var(--accent);
    margin-left: 2px;
    line-height: 1;
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
