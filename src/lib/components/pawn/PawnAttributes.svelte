<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import statsData from '$lib/game/database/pawns/stats.json';
  import PawnStatBanner from './PawnStatBanner.svelte';
  import { APTITUDE_IDS, type AptitudeId } from '$lib/game/core/rules/body/aptitudes';
  import { computeAptitudeView } from '$lib/components/util/statView';
  import PawnSkillBanner from './PawnSkillBanner.svelte';
  import StatTooltip from './StatTooltip.svelte';
  import HoverTip from '$lib/components/UI/tooltip/HoverTip.svelte';
  import {
    buildStatContext,
    computeStatView,
    type StatDef,
    type StatView
  } from '$lib/components/util/statView';

  export let pawn: Pawn;
  export let highlightCategory: string | null = null;
  export let categories: string[] = ['physical', 'capacity', 'combat', 'resistance', 'work'];

  const STATS = statsData as unknown as StatDef[];
  const CAPACITY_IDS = STATS.filter((s) => s.category === 'capacity').map((s) => s.id);

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

  $: ctx = buildStatContext(pawn);

  let tip: { id: string; x: number; y: number } | null = null;

  $: categoryOrder = [
    ...CATEGORY_ORDER,
    ...[...new Set(STATS.map((s) => s.category))].filter((cat) => !CATEGORY_ORDER.includes(cat))
  ];

  $: grouped = categoryOrder
    .filter((cat) => categories.includes(cat))
    .map((cat) => ({
      cat,
      label: CATEGORY_LABEL[cat] ?? cat.toUpperCase(),
      stats: STATS.filter((s) => s.category === cat)
    }))
    .filter((g) => g.stats.length > 0);

  const APT_META: Record<AptitudeId, { label: string; desc: string; mass?: boolean }> = {
    hit_chance: { label: 'accuracy', desc: 'How reliably a swing finds its mark.' },
    attack_speed: { label: 'attack speed', desc: 'How quickly blows follow one another.' },
    hit_precision: {
      label: 'precision',
      desc: 'How often a blow finds something that ends a fight.'
    },
    armor_damage: {
      label: 'leverage',
      desc: 'How much force is put through a foe’s armour.',
      mass: true
    },
    dodge: { label: 'evasion', desc: 'How readily a blow is slipped.', mass: true },
    aim_accuracy: { label: 'marksmanship', desc: 'How true a shot flies.' },
    block: { label: 'blocking', desc: 'How well a blow is caught on shield or guard.', mass: true }
  };

  $: catRows = buildRows(pawn, ctx, relevant);
  $: tipView = tip && catRows.flatMap((g) => g.cells).find((c) => c.id === tip?.id)?.view;

  function buildRows(..._deps: unknown[]) {
    const rows = grouped.map((g) => ({
      label: g.label,
      cells: g.stats.map((s) => ({
        id: s.id,
        hl: relevant.has(s.id),
        view: computeStatView(s.id, pawn, ctx) as StatView
      }))
    }));
    if (categories.includes('combat'))
      rows.unshift({
        label: 'APTITUDES',
        cells: APTITUDE_IDS.map((id) => {
          const m = APT_META[id];
          return {
            id,
            hl: false,
            view: computeAptitudeView(id, pawn, m.label, m.desc, !!m.mass) as StatView
          };
        })
      });
    return rows;
  }
</script>

<div class="attrs">
  <PawnStatBanner {pawn} />
  {#if categories.includes('work')}
    <PawnSkillBanner {pawn} />
  {/if}

  {#each catRows as g}
    <div class="cat">
      <div class="cat-hdr">{g.label}</div>
      <div class="grid">
        {#each g.cells as c (c.id)}
          <div
            class="cell"
            class:hl={c.hl}
            role="note"
            on:mouseenter={(e) => (tip = { id: c.id, x: e.clientX, y: e.clientY })}
            on:mousemove={(e) => tip && (tip = { ...tip, x: e.clientX, y: e.clientY })}
            on:mouseleave={() => (tip = null)}
          >
            <span class="nm">{c.view.name}</span>
            <span class="vl" style="color: {c.view.trend.color}"
              >{c.view.value}{c.view.unit}<span class="trend">{c.view.trend.glyph}</span></span
            >
          </div>
        {/each}
      </div>
    </div>
  {/each}
</div>

{#if tip && tipView}
  <HoverTip x={tip.x} y={tip.y}><StatTooltip view={tipView} /></HoverTip>
{/if}

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
