<!-- PawnAttributes.svelte — compact table of ALL stats.jsonc stats for a pawn.
     Hover a cell to see its formula with the pawn's own numbers substituted in.
     The per-stat computation + tooltip now live in the SHARED statView module + StatTooltip component,
     so the trait card's stat/resistance pill renders the identical panel (no more baked-in duplication). -->
<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import statsData from '$lib/game/database/stats.jsonc';
  import PawnStatBanner from './PawnStatBanner.svelte';
  import PawnSkillBanner from './PawnSkillBanner.svelte';
  import StatTooltip from './StatTooltip.svelte';
  import {
    buildStatContext,
    computeStatView,
    type StatDef,
    type StatView
  } from '$lib/components/util/statView';

  export let pawn: Pawn;
  /** Soft-highlight the stats related to this work category (its *_speed/yield/quality plus the
   *  capacities those formulas use). Set by clicking a column in the work-priority grid. */
  export let highlightCategory: string | null = null;
  /** WORK-EXPERIENCE UI split: which stats.jsonc categories this instance renders. The pawn
   *  Attributes tab shows the body (physical/capacity/combat/resistance); the Work screen's pawn
   *  detail shows only the work skills — no more identical table in both places. */
  export let categories: string[] = ['physical', 'capacity', 'combat', 'resistance', 'work'];

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

  const CATEGORY_ORDER = ['physical', 'capacity', 'combat', 'resistance', 'social', 'work'];
  const CATEGORY_LABEL: Record<string, string> = {
    physical: 'PHYSICAL',
    capacity: 'CAPACITIES',
    combat: 'COMBAT',
    resistance: 'RESISTANCES',
    social: 'SOCIAL',
    work: 'WORK'
  };

  // Per-pawn derived state (capacities, carry, condition multipliers) computed ONCE, shared by every cell.
  $: ctx = buildStatContext(pawn);

  // The hover tooltip opens below its cell; on low rows that clips past the panel's scroll viewport. A
  // Svelte action measures against the nearest scrollable ancestor on enter and flips the tooltip ABOVE
  // the cell when there isn't room below (CSS `.cell.up .tip`). An action (vs an on:mouseenter handler)
  // keeps it off the a11y static-interaction path.
  function flipTip(cell: HTMLElement) {
    const onEnter = () => {
      const tip = cell.querySelector<HTMLElement>('.tip');
      if (!tip) return;
      let clip: HTMLElement | null = cell.parentElement;
      while (clip && clip !== document.body) {
        const oy = getComputedStyle(clip).overflowY;
        if (oy === 'auto' || oy === 'scroll' || oy === 'hidden') break;
        clip = clip.parentElement;
      }
      const cr =
        clip && clip !== document.body
          ? clip.getBoundingClientRect()
          : ({ top: 0, bottom: window.innerHeight } as DOMRect);
      // Tip is display:none until hover — make it briefly measurable (uncapped), then restore.
      const prev = tip.style.cssText;
      tip.style.visibility = 'hidden';
      tip.style.display = 'block';
      tip.style.maxHeight = 'none';
      const tipH = tip.offsetHeight;
      tip.style.cssText = prev;
      const r = cell.getBoundingClientRect();
      const margin = 6;
      const below = cr.bottom - r.bottom - margin;
      const above = r.top - cr.top - margin;
      // Open downward if it fits, else upward if it fits, else whichever side has more room.
      const up = tipH <= below ? false : tipH <= above ? true : above > below;
      cell.classList.toggle('up', up);
      // Never overrun the viewport: cap to the chosen side's space (the tip scrolls if longer).
      const avail = up ? above : below;
      tip.style.maxHeight = tipH > avail ? `${Math.max(60, avail)}px` : '';
    };
    cell.addEventListener('mouseenter', onEnter);
    return { destroy: () => cell.removeEventListener('mouseenter', onEnter) };
  }

  $: grouped = CATEGORY_ORDER.filter((cat) => categories.includes(cat)).map((cat) => ({
    cat,
    label: CATEGORY_LABEL[cat] ?? cat.toUpperCase(),
    stats: STATS.filter((s) => s.category === cat)
  })).filter((g) => g.stats.length > 0);

  // buildRows takes the reactive values (pawn, ctx, relevant) as args purely so Svelte tracks them as
  // dependencies and recomputes the whole table on any change (function calls hide deps from the compiler).
  $: catRows = buildRows(pawn, ctx, relevant);

  function buildRows(..._deps: unknown[]) {
    return grouped.map((g) => ({
      label: g.label,
      cells: g.stats.map((s) => ({
        id: s.id,
        hl: relevant.has(s.id),
        view: computeStatView(s.id, pawn, ctx) as StatView
      }))
    }));
  }
</script>

<div class="attrs">
  <!-- Core attributes show on EVERY view (they still supplement the work formulas); the work view
       adds the experience-level banner (WORK-EXPERIENCE) between them and the skills table. -->
  <PawnStatBanner {pawn} />
  {#if categories.includes('work')}
    <PawnSkillBanner {pawn} />
  {/if}

  {#each catRows as g}
    <div class="cat">
      <div class="cat-hdr">{g.label}</div>
      <div class="grid">
        {#each g.cells as c (c.id)}
          <div class="cell" class:hl={c.hl} use:flipTip>
            <span class="nm">{c.view.name}</span>
            <span class="vl" style="color: {c.view.trend.color}"
              >{c.view.value}{c.view.unit}<span class="trend">{c.view.trend.glyph}</span></span
            >
            <div class="tip"><StatTooltip view={c.view} /></div>
          </div>
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  .attrs {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-dim);
  }
  .cat {
    margin-bottom: 6px;
  }
  .cat-hdr {
    color: var(--accent-hi);
    font-size: 11px;
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
    max-height: 60vh;
    overflow-y: auto;
    padding: 6px 8px;
    background: var(--bg-panel, #0c1118);
    border: 1px solid var(--border-hi, #3a4658);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
    color: var(--text);
    font-size: 11px;
    line-height: 1.5;
    /* auto (not none) so an over-tall tip — capped by flipTip — can be scrolled to read */
    pointer-events: auto;
  }
  .cell:hover .tip {
    display: block;
  }
  /* Low rows: flipTip toggles `.up` (via JS, hence :global) to flip the tooltip above the
     cell so it doesn't clip past the panel's scroll viewport. */
  .cell:global(.up) .tip {
    top: auto;
    bottom: 100%;
  }
  .trend {
    font-size: 9px;
    margin-left: 3px;
    vertical-align: middle;
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
