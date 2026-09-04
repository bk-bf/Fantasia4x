<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import statsData from '$lib/game/database/pawns/stats.json';
  import PawnStatBanner from './PawnStatBanner.svelte';
  import { APTITUDE_IDS } from '$lib/game/core/rules/body/aptitudes';
  import { computeAptitudeView } from '$lib/components/util/statView';
  import PawnSkillBanner from './PawnSkillBanner.svelte';
  import StatTooltip from './StatTooltip.svelte';
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
      const up = tipH <= below ? false : tipH <= above ? true : above > below;
      cell.classList.toggle('up', up);
      const avail = up ? above : below;
      tip.style.maxHeight = tipH > avail ? `${Math.max(60, avail)}px` : '';
    };
    cell.addEventListener('mouseenter', onEnter);
    return { destroy: () => cell.removeEventListener('mouseenter', onEnter) };
  }

  $: grouped = CATEGORY_ORDER.filter((cat) => categories.includes(cat))
    .map((cat) => ({
      cat,
      label: CATEGORY_LABEL[cat] ?? cat.toUpperCase(),
      stats: STATS.filter((s) => s.category === cat)
    }))
    .filter((g) => g.stats.length > 0);

  const APT_META: Record<string, { label: string; desc: string; mass?: boolean }> = {
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
          const m = APT_META[id] ?? { label: id, desc: '' };
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
    pointer-events: auto;
  }
  .cell:hover .tip {
    display: block;
  }
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
