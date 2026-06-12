<script lang="ts">
  import type { Pawn, WorkCategory } from '$lib/game/core/types';
  import { getEfficiencyColor } from '$lib/utils/pawnUtils';
  import {
    LVL_NAMES,
    LABOR_COLORS,
    STAR_COLORS,
    STAR_TIERS,
    WORST_COLORS,
    WORST_TIERS,
    type CellRank
  } from '$lib/utils/workUtils';

  interface Props {
    pawn: Pawn;
    wc: WorkCategory;
    /** speed / yield / quality from pawnStatService.getWorkModifiers — the single work model. */
    mods: { speed: number; yield: number; quality: number };
    rank: CellRank;
    level: 0 | 1 | 2 | 3 | 4;
    x: number;
    y: number;
  }
  let { pawn, wc, mods, rank, level, x, y }: Props = $props();

  // The work screen lives inside `.overlay-panel`, which sets `filter` (making it
  // the containing block for fixed positioning) and `overflow: hidden`. Both would
  // mis-position and clip this box, so we portal it onto <body> to escape them.
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      }
    };
  }

  const mult = (n: number) => `×${n.toFixed(2)}`;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  let stats = $derived(
    [
      { label: cap(wc.primaryStat) + ' (primary)', val: pawn.stats[wc.primaryStat] ?? 0 },
      wc.secondaryStat
        ? { label: cap(wc.secondaryStat) + ' (secondary)', val: pawn.stats[wc.secondaryStat] ?? 0 }
        : null
    ].filter((s): s is { label: string; val: number } => s !== null)
  );
  let skill = $derived(pawn.skills?.[wc.id] ?? 0);

  // Racial-trait contributions to this job, read straight from the explicit trait data
  // (workSpeed / workYield / workQuality). Shown as a true +/- percentage.
  type TraitMod = { name: string; axis: string; pct: number };
  let traitMods = $derived.by(() => {
    const out: TraitMod[] = [];
    const axes: Array<['workSpeed' | 'workYield' | 'workQuality', string]> = [
      ['workSpeed', 'speed'],
      ['workYield', 'yield'],
      ['workQuality', 'quality']
    ];
    for (const trait of pawn.racialTraits ?? []) {
      for (const [key, axis] of axes) {
        const map = trait.effects?.[key] as Record<string, number> | undefined;
        const v = map?.[wc.id] ?? map?.['all'];
        if (v !== undefined && v !== 1) out.push({ name: trait.name, axis, pct: (v - 1) * 100 });
      }
    }
    return out;
  });

  // Flip the box to the cursor's left/upper side when near a viewport edge.
  let flipX = $derived(typeof window !== 'undefined' && x > window.innerWidth - 280);
  let flipY = $derived(typeof window !== 'undefined' && y > window.innerHeight - 240);
  let style = $derived(
    `${flipX ? `right:${window.innerWidth - x + 14}px` : `left:${x + 16}px`};` +
      `${flipY ? `bottom:${window.innerHeight - y + 14}px` : `top:${y + 16}px`};`
  );
</script>

<div class="tip" use:portal {style}>
  <div class="tip-hdr">
    <span class="tip-name">{wc.name}</span>
  </div>

  {#if rank.best >= 0}
    <div class="tip-rank" style="color:{STAR_COLORS[rank.best]}">★ {STAR_TIERS[rank.best]}</div>
  {:else if rank.worst >= 0}
    <div class="tip-rank" style="color:{WORST_COLORS[rank.worst]}">▾ {WORST_TIERS[rank.worst]}</div>
  {/if}

  <div class="tip-mods">
    <div class="tip-axis">
      <span class="tip-axis-lbl">Speed</span>
      <span class="tip-axis-val" style="color:{getEfficiencyColor(mods.speed)}"
        >{mult(mods.speed)}</span
      >
    </div>
    <div class="tip-axis">
      <span class="tip-axis-lbl">Yield</span>
      <span class="tip-axis-val" style="color:{getEfficiencyColor(mods.yield)}"
        >{mult(mods.yield)}</span
      >
    </div>
    <div class="tip-axis">
      <span class="tip-axis-lbl">Quality</span>
      <span class="tip-axis-val" style="color:{getEfficiencyColor(mods.quality)}"
        >{mult(mods.quality)}</span
      >
    </div>
  </div>

  <div class="tip-row">
    <span class="tip-lbl">Assigned</span>
    <span style="color:{LABOR_COLORS[level]}">{LVL_NAMES[level]}</span>
  </div>
  {#each stats as s}
    <div class="tip-row">
      <span class="tip-lbl">{s.label}</span>
      <span>{s.val}</span>
    </div>
  {/each}
  <div class="tip-row">
    <span class="tip-lbl">Skill</span>
    <span>{skill}</span>
  </div>

  {#if traitMods.length > 0}
    <div class="tip-sep">TRAITS</div>
    {#each traitMods as m}
      <div class="tip-mod">
        <span class="tip-mod-name" style="color:{m.pct >= 0 ? '#6bc' : '#e08'}">{m.name}</span>
        <span class="tip-mod-val">{m.pct >= 0 ? '+' : ''}{Math.round(m.pct)}% {m.axis}</span>
      </div>
    {/each}
  {/if}
</div>

<style>
  .tip {
    position: fixed;
    z-index: 1000;
    min-width: 190px;
    max-width: 260px;
    padding: 5px 7px;
    background: var(--bg-panel, #11151c);
    border: 1px solid var(--border-hi, #3a4656);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.55);
    font-family: 'Courier New', monospace;
    font-size: 11px;
    color: var(--text);
    pointer-events: none;
  }
  .tip-hdr {
    border-bottom: 1px solid var(--border);
    padding-bottom: 3px;
    margin-bottom: 3px;
  }
  .tip-name {
    color: var(--accent-hi);
    letter-spacing: 0.04em;
  }
  .tip-rank {
    font-size: 10px;
    margin-bottom: 3px;
  }
  .tip-mods {
    display: flex;
    gap: 4px;
    margin-bottom: 4px;
  }
  .tip-axis {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2px 0;
    border: 1px solid var(--border);
  }
  .tip-axis-lbl {
    color: var(--text-dim);
    font-size: 9px;
    letter-spacing: 0.04em;
  }
  .tip-axis-val {
    font-weight: bold;
  }
  .tip-row {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    line-height: 1.5;
  }
  .tip-lbl {
    color: var(--text-dim);
  }
  .tip-sep {
    margin-top: 4px;
    padding-top: 3px;
    border-top: 1px solid var(--border);
    color: var(--text-muted, #555);
    font-size: 9px;
    letter-spacing: 0.08em;
  }
  .tip-mod {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    line-height: 1.45;
  }
  .tip-mod-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tip-mod-val {
    color: var(--text-dim);
    flex-shrink: 0;
  }
</style>
