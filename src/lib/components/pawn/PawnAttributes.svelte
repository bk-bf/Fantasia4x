<!-- PawnAttributes.svelte — compact table of ALL stats.jsonc stats for a pawn.
     Hover a cell to see its formula with the pawn's own numbers substituted in. -->
<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import statsData from '$lib/game/database/stats.jsonc';
  import { pawnStatService } from '$lib/game/services/PawnStatService';
  import { itemService } from '$lib/game/services/ItemService';
  import PawnStatBanner from './PawnStatBanner.svelte';

  export let pawn: Pawn;
  /** Soft-highlight the stats related to this work category (its *_speed/yield/quality plus the
   *  capacities those formulas use). Set by clicking a column in the work-priority grid. */
  export let highlightCategory: string | null = null;

  type StatDef = {
    id: string;
    category: string;
    primaryStat: string;
    formula: string;
    description: string;
  };
  const STATS = statsData as unknown as StatDef[];
  const CAPACITY_IDS = STATS.filter((s) => s.category === 'capacity').map((s) => s.id);

  // Stats relevant to the highlighted work category: its work stats + the capacities they depend on.
  $: relevant = (() => {
    const set = new Set<string>();
    if (!highlightCategory) return set;
    const workStats = STATS.filter((s) => s.id.startsWith(`${highlightCategory}_`));
    for (const ws of workStats) {
      set.add(ws.id);
      for (const cap of CAPACITY_IDS) {
        if (new RegExp(`\\b${cap}\\b`).test(ws.formula)) set.add(cap);
      }
    }
    return set;
  })();

  const CATEGORY_ORDER = ['physical', 'capacity', 'combat', 'resistance', 'work'];
  const CATEGORY_LABEL: Record<string, string> = {
    physical: 'PHYSICAL',
    capacity: 'CAPACITIES',
    combat: 'COMBAT',
    resistance: 'RESISTANCES',
    work: 'WORK'
  };

  $: capacities = pawnStatService.computeCapacities(pawn);
  // carry_weight / carry_volume aren't evaluable through the generic formula engine (their
  // formulas use custom vars + gear bonuses), so pull the real budget from ItemService.
  $: carry = itemService.getCarryCapacityBreakdown(pawn);
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const signed = (n: number) => (n >= 0 ? '+' : '−') + round2(Math.abs(n));

  function val(id: string): number {
    if (id === 'carry_weight') return round2(carry.weight.total);
    if (id === 'carry_volume') return round2(carry.volume.total);
    return Math.round(pawnStatService.evaluateStat(id, pawn) * 100) / 100;
  }

  function unit(id: string): string {
    if (id === 'carry_weight') return ' kg';
    if (id === 'carry_volume') return ' L';
    return '';
  }

  type Deriv = { formula: string; vars: { name: string; value: string }[]; description: string };

  /** Keep the symbolic formula, and list ONLY the variables it uses with this pawn's value —
   *  so the player reads "CON = 15, consciousness = 1.01" instead of decoding raw numbers. */
  function derivation(s: StatDef): Deriv {
    if (s.id === 'carry_weight') {
      return {
        formula: '5 + (STR−10)×1.5 + bodySize×3 + gear',
        vars: [
          { name: 'STR', value: String(carry.strength) },
          { name: 'bodySize', value: `${carry.size} (${signed(carry.bodySizeScore)})` },
          { name: 'gear', value: signed(carry.weight.gear) }
        ],
        description: s.description
      };
    }
    if (s.id === 'carry_volume') {
      return {
        formula: '8 + bodySize×4 + gear',
        vars: [
          { name: 'bodySize', value: `${carry.size} (${signed(carry.bodySizeScore)})` },
          { name: 'gear', value: signed(carry.volume.gear) }
        ],
        description: s.description
      };
    }
    const vars: { name: string; value: string }[] = [];
    const add = (name: string, value: number | string) => {
      if (new RegExp(`\\b${name}\\b`).test(s.formula)) vars.push({ name, value: String(value) });
    };
    const st = pawn.stats;
    add('STR', st.strength);
    add('DEX', st.dexterity);
    add('CON', st.constitution);
    add('PER', st.perception);
    add('INT', st.intelligence);
    add('CHA', st.charisma);
    add('weight', pawn.physicalTraits?.weight ?? 70);
    add('height', pawn.physicalTraits?.height ?? 170);
    for (const [cap, cv] of Object.entries(capacities)) add(cap, Math.round(cv * 100) / 100);
    return { formula: s.formula, vars, description: s.description };
  }

  function fmtName(id: string): string {
    return id.replace(/_/g, ' ');
  }

  /** Colour a value relative to its 1.0 baseline (most stats are multipliers); physical = neutral. */
  function valColor(s: StatDef, v: number): string {
    // carry_weight/carry_volume are kg/L magnitudes, not 1.0-baseline multipliers — keep neutral.
    if (s.category === 'physical' || s.id === 'carry_weight' || s.id === 'carry_volume')
      return 'var(--text)';
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
          {@const d = derivation(s)}
          <div class="cell" class:hl={relevant.has(s.id)}>
            <span class="nm">{fmtName(s.id)}</span>
            <span class="vl" style="color: {valColor(s, v)}">{v}{unit(s.id)}</span>
            <div class="tip">
              <div class="tip-formula">{d.formula}</div>
              {#if d.vars.length}
                <div class="tip-where">
                  {#each d.vars as vv, i}{i > 0 ? ',  ' : ''}<span class="tv-name">{vv.name}</span>
                    = <span class="tv-val">{vv.value}</span>{/each}
                </div>
              {/if}
              <div class="tip-result">= <span class="tv-val">{v}</span></div>
              <div class="tip-desc">{d.description}</div>
            </div>
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
  .cell.hl {
    background: color-mix(in srgb, var(--accent-hi) 16%, transparent);
    box-shadow: inset 2px 0 0 var(--accent-hi);
  }
  .cell.hl .nm {
    color: var(--text);
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
    line-height: 1.5;
    pointer-events: none;
  }
  .cell:hover .tip {
    display: block;
  }
  .tip-formula {
    color: var(--accent-hi);
  }
  .tip-where {
    margin-top: 3px;
    color: var(--text-dim);
  }
  .tv-name {
    color: var(--text);
  }
  .tv-val {
    color: #4caf50;
  }
  .tip-result {
    margin-top: 2px;
    color: var(--text-dim);
  }
  .tip-desc {
    margin-top: 5px;
    padding-top: 4px;
    border-top: 1px solid var(--border);
    color: var(--text-dim);
    font-style: italic;
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
