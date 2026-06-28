<!-- TempTolerancePills.svelte — the health-tab cold/heat TOLERANCE row: two compact pills showing the
     temperature at which each exposure meter starts to rise, with a cursor-following hover panel
     (HoverTip) breaking the headroom down by source (comfort base + Constitution / Traits / Gear).
     Mirrors ConditionChips' chip+HoverTip pattern. Data comes from PawnStatService.temperatureTolerance. -->
<script lang="ts">
  import HoverTip from '$lib/components/UI/HoverTip.svelte';
  import type {
    TemperatureTolerance,
    TempToleranceSource
  } from '$lib/game/services/PawnStatService';

  let { tolerance }: { tolerance: TemperatureTolerance | undefined } = $props();

  interface Side {
    key: 'cold' | 'heat';
    label: string;
    glyph: string;
    color: string;
    onset: number;
    below: boolean; // meter rises BELOW the onset (cold) vs ABOVE (heat)
    comfortLabel: string;
    comfortVal: number;
    deg: number;
    sources: TempToleranceSource[];
    capped: boolean;
  }

  const sides = $derived<Side[]>(
    tolerance
      ? [
          {
            key: 'cold',
            label: 'Cold tolerance',
            glyph: '❄',
            color: '#4fc3f7',
            onset: tolerance.coldOnset,
            below: true,
            comfortLabel: 'Comfort floor',
            comfortVal: tolerance.comfortMin,
            deg: tolerance.coldDeg,
            sources: tolerance.coldSources,
            capped: tolerance.coldCapped
          },
          {
            key: 'heat',
            label: 'Heat tolerance',
            glyph: '☀',
            color: '#fb8c00',
            onset: tolerance.heatOnset,
            below: false,
            comfortLabel: 'Comfort ceiling',
            comfortVal: tolerance.comfortMax,
            deg: tolerance.heatDeg,
            sources: tolerance.heatSources,
            capped: tolerance.heatCapped
          }
        ]
      : []
  );

  let hovered = $state<Side | null>(null);
  let mx = $state(0);
  let my = $state(0);
  function enter(s: Side, e: MouseEvent) {
    hovered = s;
    mx = e.clientX;
    my = e.clientY;
  }
  function move(e: MouseEvent) {
    mx = e.clientX;
    my = e.clientY;
  }
  const fmtDeg = (d: number) => `${d >= 0 ? '+' : '−'}${Math.abs(Math.round(d))}°`;
</script>

{#if tolerance}
  <div class="tol-pills">
    {#each sides as s (s.key)}
      <div
        class="tol-pill"
        style="border-color:{s.color};color:{s.color}"
        role="img"
        aria-label="{s.label}: meter rises {s.below ? 'below' : 'above'} {Math.round(s.onset)}°C"
        onmouseenter={(e) => enter(s, e)}
        onmousemove={move}
        onmouseleave={() => (hovered = null)}
      >
        <span class="tol-glyph">{s.glyph}</span>{s.below ? '≤' : '≥'}{Math.round(s.onset)}°
      </div>
    {/each}
  </div>
{/if}

{#if hovered}
  <HoverTip x={mx} y={my}>
    <div class="tip-name" style="color:{hovered.color}">{hovered.label.toUpperCase()}</div>
    <div class="tip-desc">
      {hovered.key === 'cold' ? 'Cold' : 'Heat'} meter rises {hovered.below ? 'below' : 'above'}
      {Math.round(hovered.onset)}°C
    </div>
    <div class="tip-hdr">FROM</div>
    <div class="tip-row">• {hovered.comfortLabel} {Math.round(hovered.comfortVal)}°C</div>
    {#each hovered.sources as src (src.label)}
      <div class="tip-row">• {src.label} {fmtDeg(src.deg)}</div>
    {/each}
    {#if hovered.sources.length === 0}
      <div class="tip-row dim">• no resistance</div>
    {/if}
    <div class="tip-total">= {fmtDeg(hovered.deg)} headroom{hovered.capped ? ' (capped)' : ''}</div>
  </HoverTip>
{/if}

<style>
  .tol-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 2px 8px 4px;
  }
  .tol-pill {
    display: flex;
    align-items: center;
    gap: 2px;
    border: 1px solid;
    padding: 1px 5px;
    font-size: 11px;
    line-height: 1.3;
    background: color-mix(in srgb, currentColor 8%, var(--bg));
    cursor: help;
    white-space: nowrap;
  }
  .tol-glyph {
    font-size: 10px;
  }
  .tip-name {
    font-weight: bold;
    letter-spacing: 0.04em;
  }
  .tip-desc {
    color: var(--text-muted);
    font-style: italic;
    margin: 3px 0;
  }
  .tip-hdr {
    color: var(--text-dim);
    font-size: 9px;
    letter-spacing: 0.08em;
    margin-top: 4px;
  }
  .tip-row {
    color: var(--text);
    font-size: 10px;
  }
  .tip-row.dim {
    color: var(--text-dim);
  }
  .tip-total {
    color: var(--text-muted);
    font-size: 10px;
    margin-top: 3px;
    border-top: 1px solid var(--border);
    padding-top: 2px;
  }
</style>
