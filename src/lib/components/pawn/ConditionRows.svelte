<script lang="ts">
  import { tick } from 'svelte';
  import HoverTip from '$lib/components/UI/tooltip/HoverTip.svelte';
  import SkinBadge from '$lib/components/UI/widget/SkinBadge.svelte';
  import type { ConditionView } from '$lib/components/util/conditionInfo';
  import { createPinnable } from '$lib/components/util/pinnable.svelte';
  import ConditionTooltip from './ConditionTooltip.svelte';
  import { BADGE_TONE, bySeverity, conditionBadge } from './badges';

  let {
    views,
    inline = false,
    rows = 0
  }: { views: ConditionView[]; inline?: boolean; rows?: number } = $props();

  const pin = createPinnable<ConditionView>();
  const keyOf = (v: ConditionView) => v.kind + ':' + v.id;

  let box = $state<HTMLElement | null>(null);
  let fits = $state(Infinity);
  let moreTip = $state<{ x: number; y: number } | null>(null);

  const ordered = $derived(rows ? [...views].sort(bySeverity) : views);
  const order = $derived(ordered.map(keyOf).join());
  const shown = $derived(ordered.slice(0, fits));
  const folded = $derived(ordered.slice(fits));

  async function fit() {
    await tick();
    if (!box) return;
    const kids = [...box.children] as HTMLElement[];
    const tops = [...new Set(kids.map((k) => k.offsetTop))].sort((a, b) => a - b);
    if (tops.length <= rows) return;
    const chips = kids.filter((k) => !k.classList.contains('more'));
    const inside = chips.filter((k) => k.offsetTop <= tops[rows - 1]).length;
    fits = Math.max(0, inside < chips.length ? inside : inside - 1);
    fit();
  }

  $effect(() => {
    if (!rows || !box) return;
    void order;
    fits = Infinity;
    fit();
  });
</script>

{#snippet chip(v: ConditionView)}
  {@const b = conditionBadge(v)}
  <SkinBadge glyph={b.glyph} kind={b.kind} />
  <b style:--tone={BADGE_TONE[b.kind]}>{v.name}</b>
{/snippet}

<div class="conds" class:inline bind:this={box}>
  {#each shown as v (keyOf(v))}
    <div
      class="crow"
      class:threatening={v.lifeThreatening}
      role="button"
      tabindex="0"
      aria-label={v.name}
      onmouseenter={(e) => pin.open(v, keyOf(v), e)}
      onmousemove={(e) => pin.move(e)}
      onmouseleave={() => pin.close()}
      onclick={(e) => pin.toggle(v, keyOf(v), e)}
      onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && pin.toggle(v, keyOf(v), e)}
    >
      {@render chip(v)}
      {#if !inline && v.stageLabel}<em>{v.stageLabel}</em>{/if}
    </div>
  {/each}
  {#if folded.length}
    <div
      class="crow more"
      role="group"
      onmouseenter={(e) => (moreTip = { x: e.clientX, y: e.clientY })}
      onmousemove={(e) => (moreTip = { x: e.clientX, y: e.clientY })}
      onmouseleave={() => (moreTip = null)}
    >
      <b>+{folded.length}</b>
    </div>
  {/if}
</div>

{#if pin.active}
  <HoverTip x={pin.x} y={pin.y} pinned={pin.pinned}>
    <ConditionTooltip view={pin.active} />
  </HoverTip>
{:else if moreTip && folded.length}
  <HoverTip x={moreTip.x} y={moreTip.y}>
    <div class="conds">
      {#each folded as v (keyOf(v))}
        <div class="crow" class:threatening={v.lifeThreatening}>{@render chip(v)}</div>
      {/each}
    </div>
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
    color: var(--tone, var(--text-dim));
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
