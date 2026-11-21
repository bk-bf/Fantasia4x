<script lang="ts">
  import type { LaborLevel } from '$lib/game/core/types';
  import type { CellRank } from '$lib/components/util/workUtils';

  const WORDS = ['—', 'low', 'nrm', 'hi', 'urg'];

  let {
    level,
    rank = null,
    inherited = false,
    sub = false,
    onstep,
    onenter,
    onmove,
    onleave
  }: {
    level: LaborLevel;
    rank?: CellRank | null;
    inherited?: boolean;
    sub?: boolean;
    onstep: (dir: 1 | -1) => void;
    onenter: (e: MouseEvent) => void;
    onmove: (e: MouseEvent) => void;
    onleave: () => void;
  } = $props();

  const best = $derived(rank && rank.best >= 0 ? rank.best : -1);
  const worst = $derived(rank && best < 0 && rank.worst >= 0 ? rank.worst : -1);
</script>

<button
  class="cell l{level}"
  class:sub
  class:inherited
  class:top={best >= 0}
  class:weak={worst >= 0}
  style:--tier={best >= 0 ? 1 - best * 0.3 : 1 - worst * 0.4}
  onmouseenter={onenter}
  onmousemove={onmove}
  onmouseleave={onleave}
  onclick={(e) => {
    e.stopPropagation();
    onstep(1);
  }}
  oncontextmenu={(e) => {
    e.preventDefault();
    e.stopPropagation();
    onstep(-1);
  }}>{WORDS[level]}</button
>

<style>
  .cell {
    height: 21px;
    padding: 0;
    border: 0;
    background: none;
    font: 16px/21px var(--font-pixel);
    white-space: nowrap;
    cursor: pointer;
  }
  .cell:hover {
    background: color-mix(in srgb, var(--accent-hi) 14%, transparent);
  }
  .sub {
    background: color-mix(in srgb, var(--accent-hi) 6%, transparent);
  }
  .inherited {
    opacity: 0.45;
  }
  .l0 {
    color: var(--text-muted);
    opacity: 0.7;
  }
  .l1 {
    color: var(--text-dim);
  }
  .l2 {
    color: var(--text);
  }
  .l3 {
    color: var(--accent-hi);
  }
  .l4 {
    color: var(--neg);
  }
  .top::after,
  .weak::after {
    margin-left: 1px;
    opacity: var(--tier);
  }
  .top::after {
    content: '★';
    color: var(--accent-hi);
    font-size: 10px;
    vertical-align: 5px;
  }
  .weak::after {
    content: '▾';
    color: var(--neg);
  }
</style>
