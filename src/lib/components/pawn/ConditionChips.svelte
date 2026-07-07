<!-- ConditionChips.svelte — the pawn-tab CONDITIONS row: one tinted sprite-icon chip per active
     condition (persistent + transient), with a cursor-following hover panel (HoverTip) that explains
     the condition, where the pawn got it from, and what it does. Derivation lives in conditionInfo.ts. -->
<script lang="ts">
  import SpriteIcon from '$lib/components/UI/SpriteIcon.svelte';
  import HoverTip from '$lib/components/UI/HoverTip.svelte';
  import ConditionTooltip from './ConditionTooltip.svelte';
  import type { ConditionView } from '$lib/components/util/conditionInfo';
  import { createPinnable } from '$lib/components/util/pinnable.svelte';

  let {
    views,
    showHeader = true,
    iconPx = 14
  }: { views: ConditionView[]; showHeader?: boolean; iconPx?: number } = $props();

  const pin = createPinnable<ConditionView>();
</script>

{#if views.length > 0}
  {#if showHeader}<div class="section-hdr sub">| CONDITIONS</div>{/if}
  <div class="cond-chips">
    {#each views as v (v.kind + ':' + v.id)}
      <div
        class="cond-chip"
        class:threatening={v.lifeThreatening}
        style="border-color: {v.color}; color: {v.color}"
        role="button"
        tabindex="0"
        aria-label={v.name}
        onmouseenter={(e) => pin.open(v, v.kind + ':' + v.id, e)}
        onmousemove={(e) => pin.move(e)}
        onmouseleave={() => pin.close()}
        onclick={(e) => pin.toggle(v, v.kind + ':' + v.id, e)}
        onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && pin.toggle(v, v.kind + ':' + v.id, e)}
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

{#if pin.active}
  <HoverTip x={pin.x} y={pin.y} pinned={pin.pinned}>
    <ConditionTooltip view={pin.active} />
  </HoverTip>
{/if}

<style>
  .section-hdr.sub {
    padding: 4px 8px;
    background: var(--bg);
    color: var(--text-dim);
    font-size: 12px;
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
    font-size: 13px;
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
</style>
