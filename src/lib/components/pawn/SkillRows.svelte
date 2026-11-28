<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { gameState } from '$lib/stores/gameState';
  import { skillRows, type SkillRow } from '$lib/components/util/skillRows';
  import { createPinnable } from '$lib/components/util/pinnable.svelte';
  import SkinBar from '$lib/components/UI/widget/SkinBar.svelte';
  import SkillTip from './SkillTip.svelte';

  let {
    pawn,
    rows: lines = 3,
    stars = false,
    highlight = null
  }: { pawn: Pawn; rows?: number; stars?: boolean; highlight?: string | null } = $props();

  const rows = $derived.by(() => {
    void $gameState.turn;
    return skillRows(pawn, $gameState.workAssignments?.[pawn.id]);
  });
  const tip = createPinnable<SkillRow>();
  const shown = $derived(
    tip.active ? (rows.find((r) => r.label === tip.active?.label) ?? null) : null
  );
  const lit = (r: SkillRow) =>
    !!highlight &&
    (r.best.id === highlight || r.kids.some((k) => k.id === highlight || k.wc.id === highlight));
</script>

<div class="skills" style:--rows={lines}>
  {#each rows as r (r.label)}
    <div
      class="skill"
      class:par={r.kids.length > 0}
      class:pin={tip.pinned && shown?.label === r.label}
      class:hl={lit(r)}
      role="button"
      tabindex="-1"
      onmouseenter={(e) => tip.open(r, r.label, e)}
      onmousemove={(e) => tip.move(e)}
      onmouseleave={() => tip.close()}
      onclick={(e) => r.kids.length && tip.toggle(r, r.label, e)}
      onkeydown={(e) => e.key === 'Enter' && r.kids.length && tip.toggle(r, r.label, e)}
    >
      <em>{r.label}</em><b>{r.level}</b><SkinBar value={r.frac} thin />
      {#if stars}<span class="stars">{'★'.repeat(r.stars)}<i>{'★'.repeat(3 - r.stars)}</i></span
        >{/if}
    </div>
  {/each}
</div>

{#if shown}
  <SkillTip {pawn} row={shown} x={tip.x} y={tip.y} pinned={tip.pinned} />
{/if}

<style>
  .skills {
    display: grid;
    grid-auto-flow: column;
    grid-template-rows: repeat(var(--rows), 18px);
    grid-auto-columns: minmax(0, 1fr);
    column-gap: 12px;
  }
  .skill {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 18px;
    min-width: 0;
    cursor: help;
  }
  .skill.par {
    cursor: pointer;
  }
  .skill:hover,
  .skill.hl {
    background: color-mix(in srgb, var(--accent-hi) 16%, transparent);
  }
  .skill :global(.skin-bar) {
    min-width: 12px;
  }
  em {
    flex: none;
    width: 92px;
    font-style: normal;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .par > em::after {
    content: ' »';
    color: var(--text-muted);
  }
  .par.pin > em::after {
    content: ' «';
  }
  b {
    flex: none;
    width: 16px;
    text-align: right;
    font-weight: normal;
  }
  .stars {
    flex: none;
    color: var(--accent-hi);
  }
  .stars i {
    font-style: normal;
    color: var(--text-muted);
    opacity: 0.5;
  }
</style>
