<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import statsData from '$lib/game/database/pawns/stats.json';
  import PawnStatBanner from './PawnStatBanner.svelte';
  import { APTITUDE_IDS, type AptitudeId } from '$lib/game/core/rules/body/aptitudes';
  import { computeAptitudeView } from '$lib/components/util/statView';
  import PawnSkillBanner from './PawnSkillBanner.svelte';
  import StatTooltip from './StatTooltip.svelte';
  import { chrome } from '$lib/pixelArt/chrome';
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
  export let showBanner = true;

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
    physical: 'Body',
    capacity: 'Capacities',
    combat: 'Fight',
    resistance: 'Resist',
    social: 'Social',
    work: 'Work'
  };

  $: ctx = buildStatContext(pawn);
  const TREND: Record<string, string> = { '▲': 'var(--pos)', '▼': 'var(--neg)' };

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
        label: 'Aptitudes',
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
  {#if showBanner}<PawnStatBanner {pawn} />{/if}
  {#if categories.includes('work')}
    <PawnSkillBanner {pawn} />
  {/if}

  {#each catRows as g}
    <div class="dcat">
      <h5>{g.label}</h5>
      <div class="dcells">
        {#each g.cells as c (c.id)}
          <div
            class="dcell"
            class:hl={c.hl}
            role="note"
            on:mouseenter={(e) => (tip = { id: c.id, x: e.clientX, y: e.clientY })}
            on:mousemove={(e) => tip && (tip = { ...tip, x: e.clientX, y: e.clientY })}
            on:mouseleave={() => (tip = null)}
            {@attach chrome('well')}
          >
            <em>{c.view.name}</em>
            <b style:color={TREND[c.view.trend.glyph]}
              >{c.view.value}{c.view.unit}<small>{c.view.trend.glyph}</small></b
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
    display: flex;
    flex-direction: column;
    gap: 2px;
    font: 16px/18px var(--font-pixel);
    color: var(--text);
  }
  .dcat {
    display: grid;
    grid-template-columns: 86px 1fr;
    align-items: start;
    gap: 6px;
  }
  h5 {
    margin: 4px 0 0;
    font: inherit;
    color: var(--accent-hi);
    text-transform: uppercase;
    letter-spacing: 1.6px;
  }
  .dcells {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 2px;
  }
  .dcell {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 1px 7px 2px;
    white-space: nowrap;
    cursor: help;
  }
  .dcell:hover {
    z-index: 2;
  }
  .dcell.hl {
    box-shadow: inset 2px 0 0 var(--accent-hi);
  }
  em {
    font-style: normal;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    text-transform: capitalize;
  }
  b {
    flex-shrink: 0;
    font-weight: normal;
  }
</style>
