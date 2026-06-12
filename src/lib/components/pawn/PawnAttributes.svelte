<!-- PawnAttributes.svelte — compact table of ALL stats.jsonc stats for a pawn.
     Hover a cell to see its formula with the pawn's own numbers substituted in. -->
<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import statsData from '$lib/game/database/stats.jsonc';
  import { pawnStatService } from '$lib/game/services/PawnStatService';
  import PawnStatBanner from './PawnStatBanner.svelte';

  export let pawn: Pawn;

  type StatDef = {
    id: string;
    category: string;
    primaryStat: string;
    formula: string;
    description: string;
  };
  const STATS = statsData as unknown as StatDef[];

  const CATEGORY_ORDER = ['physical', 'capacity', 'combat', 'resistance', 'work'];
  const CATEGORY_LABEL: Record<string, string> = {
    physical: 'PHYSICAL',
    capacity: 'CAPACITIES',
    combat: 'COMBAT',
    resistance: 'RESISTANCES',
    work: 'WORK'
  };

  $: capacities = pawnStatService.computeCapacities(pawn);

  function val(id: string): number {
    return Math.round(pawnStatService.evaluateStat(id, pawn) * 100) / 100;
  }

  /** Substitute the pawn's actual numbers into the formula so the hover shows the derivation. */
  function derivation(s: StatDef): string {
    let e = s.formula;
    const st = pawn.stats;
    const base: [RegExp, string][] = [
      [/\bSTR\b/g, String(st.strength)],
      [/\bDEX\b/g, String(st.dexterity)],
      [/\bCON\b/g, String(st.constitution)],
      [/\bPER\b/g, String(st.perception)],
      [/\bINT\b/g, String(st.intelligence)],
      [/\bCHA\b/g, String(st.charisma)],
      [/\bweight\b/g, String(pawn.physicalTraits?.weight ?? 70)],
      [/\bheight\b/g, String(pawn.physicalTraits?.height ?? 170)]
    ];
    for (const [re, v] of base) e = e.replace(re, v);
    for (const [cap, cv] of Object.entries(capacities)) {
      e = e.replace(new RegExp(`\\b${cap}\\b`, 'g'), String(Math.round(cv * 100) / 100));
    }
    return `${s.formula}\n  = ${e}\n\n${s.description}`;
  }

  function fmtName(id: string): string {
    return id.replace(/_/g, ' ');
  }

  /** Colour a value relative to its 1.0 baseline (most stats are multipliers); physical = neutral. */
  function valColor(s: StatDef, v: number): string {
    if (s.category === 'physical') return 'var(--text)';
    if (v >= 1.05) return '#4caf50';
    if (v <= 0.95) return '#e0704f';
    return 'var(--text)';
  }

  $: grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    label: CATEGORY_LABEL[cat] ?? cat.toUpperCase(),
    stats: STATS.filter((s) => s.category === cat)
  })).filter((g) => g.stats.length > 0);
</script>

<div class="attrs">
  <PawnStatBanner {pawn} />

  {#each grouped as g}
    <div class="cat">
      <div class="cat-hdr">{g.label}</div>
      <div class="grid">
        {#each g.stats as s}
          {@const v = val(s.id)}
          <div class="cell">
            <span class="nm">{fmtName(s.id)}</span>
            <span class="vl" style="color: {valColor(s, v)}">{v}</span>
            <div class="tip">{derivation(s)}</div>
          </div>
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  .attrs {
    font-family: 'Courier New', monospace;
    font-size: 10px;
    color: var(--text-dim);
  }
  .cat {
    margin-bottom: 6px;
  }
  .cat-hdr {
    color: var(--accent-hi);
    font-size: 10px;
    letter-spacing: 0.06em;
    padding: 2px 6px;
    border-bottom: 1px solid var(--border);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0 8px;
  }
  .cell {
    position: relative;
    display: flex;
    justify-content: space-between;
    gap: 6px;
    padding: 1px 6px;
    border-bottom: 1px dotted var(--border, #222);
    cursor: help;
  }
  .cell:hover {
    background: var(--bg-hover, #151c26);
  }
  .tip {
    display: none;
    position: absolute;
    z-index: 60;
    left: 0;
    top: 100%;
    min-width: 220px;
    max-width: 340px;
    padding: 6px 8px;
    background: var(--bg-panel, #0c1118);
    border: 1px solid var(--border-hi, #3a4658);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
    color: var(--text);
    font-size: 10px;
    line-height: 1.4;
    white-space: pre-line;
    pointer-events: none;
  }
  .cell:hover .tip {
    display: block;
  }
  .nm {
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .vl {
    color: var(--text);
    flex-shrink: 0;
  }
</style>
