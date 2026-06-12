<!-- PawnAttributes.svelte — compact table of ALL stats.jsonc stats for a pawn.
     Hover a cell to see its formula with the pawn's own numbers substituted in. -->
<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import statsData from '$lib/game/database/stats.jsonc';
  import { pawnStatService } from '$lib/game/services/PawnStatService';

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

  $: grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    label: CATEGORY_LABEL[cat] ?? cat.toUpperCase(),
    stats: STATS.filter((s) => s.category === cat)
  })).filter((g) => g.stats.length > 0);
</script>

<div class="attrs">
  <div class="base-row">
    {#each Object.entries(pawn.stats) as [k, v]}
      <span class="base" title={k}><b>{k.slice(0, 3).toUpperCase()}</b>{v}</span>
    {/each}
  </div>

  {#each grouped as g}
    <div class="cat">
      <div class="cat-hdr">{g.label}</div>
      <div class="grid">
        {#each g.stats as s}
          <div class="cell" title={derivation(s)}>
            <span class="nm">{fmtName(s.id)}</span>
            <span class="vl">{val(s.id)}</span>
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
  .base-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    padding: 4px 6px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 4px;
  }
  .base {
    color: var(--text);
  }
  .base b {
    color: var(--accent-hi);
    margin-right: 3px;
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
