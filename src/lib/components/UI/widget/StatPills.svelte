<script lang="ts" module>
  export interface StatPillRow {
    label: string;
    value: string;
  }
  export interface StatPillView {
    label: string;
    value: string;
    color?: string;
    warn?: boolean;
    title?: string;
    desc?: string;
    formula?: string;
    rows?: StatPillRow[];
    sep?: boolean;
  }
</script>

<script lang="ts">
  import HoverTip from '$lib/components/UI/tooltip/HoverTip.svelte';
  import { createPinnable } from '$lib/components/util/pinnable.svelte';

  let { pills }: { pills: StatPillView[] } = $props();

  const pin = createPinnable<StatPillView>();
</script>

{#if pills.length > 0}
  <div class="stat-pills">
    {#each pills as p, i (p.label + ':' + i)}
      {#if p.sep && i > 0}<span class="pill-sep" aria-hidden="true"></span>{/if}
      <div
        class="stat-pill"
        class:warn={p.warn}
        style="--pill: {p.color ?? '#b8965a'}"
        role="button"
        tabindex="0"
        aria-label="{p.label} {p.value}"
        onmouseenter={(e) => pin.open(p, p.label + ':' + i, e)}
        onmousemove={(e) => pin.move(e)}
        onmouseleave={() => pin.close()}
        onclick={(e) => pin.toggle(p, p.label + ':' + i, e)}
        onkeydown={(e) =>
          (e.key === 'Enter' || e.key === ' ') && pin.toggle(p, p.label + ':' + i, e)}
      >
        <span class="pill-k">{p.label}</span><span class="pill-v">{p.value}</span>
      </div>
    {/each}
  </div>
{/if}

{#if pin.active}
  {@const h = pin.active}
  <HoverTip x={pin.x} y={pin.y} pinned={pin.pinned}>
    <div class="tip-name" style="color: {h.color ?? '#e8c870'}">
      {(h.title ?? h.label).toUpperCase()}<span class="tip-val">{h.value}</span>
    </div>
    {#if h.desc}<div class="tip-desc">{h.desc}</div>{/if}
    {#if h.formula}<div class="tip-formula">{h.formula}</div>{/if}
    {#if h.rows && h.rows.length > 0}
      <div class="tip-hdr">FROM</div>
      {#each h.rows as r (r.label)}
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
  .stat-pill {
    display: flex;
    align-items: center;
    gap: 3px;
    border: 0;
    background: color-mix(in srgb, var(--pill) 14%, rgba(28, 16, 6, 0.92));
    padding: 0 4px;
    height: 13px;
    font-size: 9px;
    line-height: 1;
    cursor: help;
    white-space: nowrap;
  }
  .stat-pill.warn {
    background: color-mix(in srgb, var(--pill) 22%, rgba(40, 12, 6, 0.92));
  }
  .pill-sep {
    flex-basis: 100%;
    width: 100%;
    height: 0;
    margin: 3px 0 1px;
    border-top: 1px solid rgba(122, 94, 40, 0.4);
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
    font-size: 10px;
    margin: 2px 0;
    white-space: normal;
  }
  .tip-hdr {
    color: var(--text-dim);
    font-size: 10px;
    letter-spacing: 0.08em;
    margin-top: 4px;
  }
  .tip-row {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    color: var(--text);
    font-size: 11px;
  }
  .tip-rk {
    color: var(--text-muted);
  }
  .tip-rv {
    font-weight: bold;
  }
</style>
