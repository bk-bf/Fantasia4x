<script lang="ts">
  import HoverTip from '$lib/components/UI/tooltip/HoverTip.svelte';
  import SkinBadge from '$lib/components/UI/widget/SkinBadge.svelte';
  import type { ConditionView } from '$lib/components/util/conditionInfo';
  import { createPinnable } from '$lib/components/util/pinnable.svelte';
  import ConditionTooltip from './ConditionTooltip.svelte';
  import { BADGE_TONE, conditionBadge } from './badges';

  let { views, inline = false }: { views: ConditionView[]; inline?: boolean } = $props();

  const pin = createPinnable<ConditionView>();
</script>

<div class="conds" class:inline>
  {#each views as v (v.kind + ':' + v.id)}
    {@const b = conditionBadge(v)}
    {@const key = v.kind + ':' + v.id}
    <div
      class="crow"
      class:threatening={v.lifeThreatening}
      style:--tone={BADGE_TONE[b.kind]}
      role="button"
      tabindex="0"
      aria-label={v.name}
      onmouseenter={(e) => pin.open(v, key, e)}
      onmousemove={(e) => pin.move(e)}
      onmouseleave={() => pin.close()}
      onclick={(e) => pin.toggle(v, key, e)}
      onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && pin.toggle(v, key, e)}
    >
      <SkinBadge glyph={b.glyph} kind={b.kind} />
      <b>{v.name}</b>
      {#if !inline && v.stageLabel}<em>{v.stageLabel}</em>{/if}
    </div>
  {/each}
</div>

{#if pin.active}
  <HoverTip x={pin.x} y={pin.y} pinned={pin.pinned}>
    <ConditionTooltip view={pin.active} />
  </HoverTip>
{/if}

<style>
  .conds.inline {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
  }
  .crow {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 21px;
    white-space: nowrap;
    cursor: help;
  }
  .inline .crow {
    gap: 5px;
  }
  b {
    font-weight: normal;
    color: var(--tone);
  }
  em {
    margin-left: auto;
    font-style: normal;
    color: var(--text-dim);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .threatening {
    animation: pulse-threat 1.5s ease-in-out infinite;
  }
  @keyframes pulse-threat {
    50% {
      opacity: 0.45;
    }
  }
</style>
