<!-- ConditionChips.svelte — the pawn-tab CONDITIONS row: one tinted sprite-icon chip per active
     condition (persistent + transient), with a cursor-following hover panel (HoverTip) that explains
     the condition, where the pawn got it from, and what it does. Derivation lives in conditionInfo.ts. -->
<script lang="ts">
  import SpriteIcon from '$lib/components/UI/SpriteIcon.svelte';
  import HoverTip from '$lib/components/UI/HoverTip.svelte';
  import type { ConditionView } from '$lib/components/util/conditionInfo';

  let {
    views,
    showHeader = true,
    iconPx = 14
  }: { views: ConditionView[]; showHeader?: boolean; iconPx?: number } = $props();

  let hovered = $state<ConditionView | null>(null);
  let mx = $state(0);
  let my = $state(0);

  function enter(v: ConditionView, e: MouseEvent) {
    hovered = v;
    mx = e.clientX;
    my = e.clientY;
  }
  function move(e: MouseEvent) {
    mx = e.clientX;
    my = e.clientY;
  }
</script>

{#if views.length > 0}
  {#if showHeader}<div class="section-hdr sub">| CONDITIONS</div>{/if}
  <div class="cond-chips">
    {#each views as v (v.kind + ':' + v.id)}
      <div
        class="cond-chip"
        class:threatening={v.lifeThreatening}
        style="border-color: {v.color}; color: {v.color}"
        role="img"
        aria-label={v.name}
        onmouseenter={(e) => enter(v, e)}
        onmousemove={move}
        onmouseleave={() => (hovered = null)}
      >
        {#if v.charSpans}
          <SpriteIcon charSpans={v.charSpans} tint={v.color} px={iconPx} />
        {:else}
          <span class="cond-glyph">{v.name.charAt(0)}</span>
        {/if}
      </div>
    {/each}
  </div>
{/if}

{#if hovered}
  <HoverTip x={mx} y={my}>
    <div class="tip-name" style="color: {hovered.color}">
      {hovered.name.toUpperCase()}
      {#if hovered.severityPct != null}
        <span class="tip-sev"
          >· {hovered.severityPct}%{hovered.stageLabel ? ` ${hovered.stageLabel}` : ''}</span
        >
      {/if}
    </div>
    {#if hovered.lifeThreatening}
      <div class="tip-warn">⚠ life-threatening</div>
    {/if}
    <div class="tip-desc">{hovered.description}</div>
    {#if hovered.sources.length > 0}
      <div class="tip-hdr">FROM</div>
      {#each hovered.sources as s}
        <div class="tip-row">• {s}</div>
      {/each}
    {/if}
    {#if hovered.effects.length > 0}
      <div class="tip-hdr">EFFECT</div>
      <div class="tip-row">{hovered.effects.join('  ·  ')}</div>
    {/if}
  </HoverTip>
{/if}

<style>
  .section-hdr.sub {
    padding: 4px 8px;
    background: var(--bg);
    color: var(--text-dim);
    font-size: 11px;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
  }

  .cond-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 4px 8px;
  }

  .cond-chip {
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid;
    padding: 2px 4px;
    min-width: 20px;
    height: 22px;
    background: color-mix(in srgb, currentColor 8%, var(--bg));
    cursor: help;
  }

  .cond-glyph {
    font-weight: bold;
    font-size: 12px;
    line-height: 1;
  }

  .cond-chip.threatening {
    animation: pulse-threat 1.5s ease-in-out infinite;
  }

  @keyframes pulse-threat {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.45;
    }
  }

  .tip-name {
    font-weight: bold;
    letter-spacing: 0.04em;
  }
  .tip-sev {
    color: var(--text-muted);
    font-weight: normal;
  }
  .tip-warn {
    color: var(--neg, #ff5252);
    font-size: 10px;
    margin-top: 1px;
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
</style>
