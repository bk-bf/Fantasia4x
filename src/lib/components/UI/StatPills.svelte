<!-- StatPills.svelte — a row of compact stat pills in the same tight brown-amber theme as the crafting
     material pills (ItemPills), tintable per pill. Each pill shows a short label + value; hovering opens
     the shared cursor-following HoverTip with a detailed breakdown (description, formula, and the
     contributing factors). Used by the health tab for blood / pain / exposure / tolerance / combat. -->
<script lang="ts" module>
  export interface StatPillRow {
    label: string;
    value: string;
  }
  export interface StatPillView {
    /** Short pill label, e.g. "Hit", "Blood", "Cold". */
    label: string;
    /** Formatted value shown on the pill, e.g. "×0.95", "82%", "≤−11°". */
    value: string;
    /** Pill tint (CSS colour). Defaults to the amber material-pill look. */
    color?: string;
    /** Dim/penalty styling. */
    warn?: boolean;
    /** Tooltip header (defaults to the label). */
    title?: string;
    /** Italic description line in the tooltip. */
    desc?: string;
    /** Symbolic formula line (monospace), for stat-derived pills. */
    formula?: string;
    /** Breakdown rows (factor → value). */
    rows?: StatPillRow[];
  }
</script>

<script lang="ts">
  import HoverTip from '$lib/components/UI/HoverTip.svelte';

  let { pills }: { pills: StatPillView[] } = $props();

  let hovered = $state<StatPillView | null>(null);
  let mx = $state(0);
  let my = $state(0);
  function enter(p: StatPillView, e: MouseEvent) {
    hovered = p;
    mx = e.clientX;
    my = e.clientY;
  }
  function move(e: MouseEvent) {
    mx = e.clientX;
    my = e.clientY;
  }
</script>

{#if pills.length > 0}
  <div class="stat-pills">
    {#each pills as p, i (p.label + ':' + i)}
      <div
        class="stat-pill"
        class:warn={p.warn}
        style="--pill: {p.color ?? '#b8965a'}"
        role="img"
        aria-label="{p.label} {p.value}"
        onmouseenter={(e) => enter(p, e)}
        onmousemove={move}
        onmouseleave={() => (hovered = null)}
      >
        <span class="pill-k">{p.label}</span><span class="pill-v">{p.value}</span>
      </div>
    {/each}
  </div>
{/if}

{#if hovered}
  <HoverTip x={mx} y={my}>
    <div class="tip-name" style="color: {hovered.color ?? '#e8c870'}">
      {(hovered.title ?? hovered.label).toUpperCase()}<span class="tip-val">{hovered.value}</span>
    </div>
    {#if hovered.desc}<div class="tip-desc">{hovered.desc}</div>{/if}
    {#if hovered.formula}<div class="tip-formula">{hovered.formula}</div>{/if}
    {#if hovered.rows && hovered.rows.length > 0}
      <div class="tip-hdr">FROM</div>
      {#each hovered.rows as r (r.label)}
        <div class="tip-row">
          <span class="tip-rk">{r.label}</span><span class="tip-rv">{r.value}</span>
        </div>
      {/each}
    {/if}
  </HoverTip>
{/if}

<style>
  .stat-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: 2px 8px 3px;
  }
  /* Same tight brown-amber pill as the crafting material pills, tinted toward each pill's colour. */
  .stat-pill {
    display: flex;
    align-items: center;
    gap: 3px;
    border: 0;
    background: color-mix(in srgb, var(--pill) 14%, rgba(28, 16, 6, 0.92));
    padding: 0 4px;
    height: 13px;
    font-size: 8px;
    line-height: 1;
    cursor: help;
    white-space: nowrap;
  }
  .stat-pill.warn {
    background: color-mix(in srgb, var(--pill) 22%, rgba(40, 12, 6, 0.92));
  }
  .pill-k {
    color: color-mix(in srgb, var(--pill) 45%, #9a8458);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .pill-v {
    color: color-mix(in srgb, var(--pill) 75%, #e8c870);
    font-weight: bold;
  }
  .tip-name {
    font-weight: bold;
    letter-spacing: 0.04em;
  }
  .tip-val {
    color: var(--text-muted);
    font-weight: normal;
    margin-left: 6px;
  }
  .tip-desc {
    color: var(--text-muted);
    font-style: italic;
    margin: 3px 0;
  }
  .tip-formula {
    color: var(--text-dim);
    font-family: var(--font-mono);
    font-size: 9px;
    margin: 2px 0;
    white-space: normal;
  }
  .tip-hdr {
    color: var(--text-dim);
    font-size: 9px;
    letter-spacing: 0.08em;
    margin-top: 4px;
  }
  .tip-row {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    color: var(--text);
    font-size: 10px;
  }
  .tip-rk {
    color: var(--text-muted);
  }
  .tip-rv {
    font-weight: bold;
  }
</style>
