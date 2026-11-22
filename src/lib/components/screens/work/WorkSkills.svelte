<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import statsData from '$lib/game/database/pawns/stats.json';
  import { WORK_CATEGORIES } from '$lib/game/core/defs/work';
  import { DISCIPLINE_LABEL } from '$lib/game/core/defs/disciplines';
  import {
    SKILL_CATEGORIES,
    MAX_WORK_LEVEL,
    workSkillCategory,
    xpToNext
  } from '$lib/game/core/rules/body/workExperience';
  import {
    buildStatContext,
    computeStatView,
    type StatDef,
    type StatView
  } from '$lib/components/util/statView';
  import SkinBar from '$lib/components/UI/widget/SkinBar.svelte';
  import HoverTip from '$lib/components/UI/tooltip/HoverTip.svelte';

  let { pawn, highlight = null }: { pawn: Pawn; highlight?: string | null } = $props();

  const NAME = new Map(WORK_CATEGORIES.map((c) => [c.id, c.name]));
  const WORK_STATS = (statsData as unknown as StatDef[]).filter((s) => s.category === 'work');
  const statsOf = (skill: string): string[] =>
    WORK_STATS.filter((s) => workSkillCategory(s.id.slice(0, s.id.lastIndexOf('_'))) === skill).map(
      (s) => s.id
    );

  const ctx = $derived(buildStatContext(pawn));
  const skills = $derived(
    SKILL_CATEGORIES.map((id) => {
      const level = pawn.skills?.[id] ?? 1;
      const mastered = level >= MAX_WORK_LEVEL;
      const xp = Math.floor(pawn.skillXp?.[id] ?? 0);
      const need = mastered ? 0 : xpToNext(level);
      return {
        id,
        name: NAME.get(id) ?? DISCIPLINE_LABEL.get(id) ?? id,
        level,
        xp,
        need,
        mastered,
        frac: mastered ? 1 : Math.min(1, xp / need)
      };
    })
  );

  let tip = $state<{ id: string; x: number; y: number } | null>(null);
  const shown = $derived(skills.find((s) => s.id === tip?.id) ?? null);
  const views = $derived(
    (shown ? statsOf(shown.id) : [])
      .map((sid) => computeStatView(sid, pawn, ctx))
      .filter((v): v is StatView => !!v)
  );

  function labelOf(view: StatView, skillId: string): string {
    const n = view.name.startsWith(`${skillId} `) ? view.name.slice(skillId.length + 1) : view.name;
    return n.charAt(0).toUpperCase() + n.slice(1);
  }
</script>

<div class="skills">
  {#each skills as s (s.id)}
    <div
      class="skill"
      class:hl={highlight === s.id}
      role="group"
      onmouseenter={(e) => (tip = { id: s.id, x: e.clientX, y: e.clientY })}
      onmousemove={(e) => (tip = { id: s.id, x: e.clientX, y: e.clientY })}
      onmouseleave={() => (tip = null)}
    >
      <em>{s.name}</em><b>{s.level}</b><SkinBar value={s.frac} thin />
    </div>
  {/each}
</div>

{#if tip && shown}
  <HoverTip x={tip.x} y={tip.y}>
    <div class="hd"><span>{shown.name}</span><b>{shown.level}</b></div>
    <div class="xp">
      {shown.mastered ? 'a true master' : `${shown.xp} / ${shown.need} to the next level`}
    </div>
    {#each views as v (v.id)}
      <div class="row">
        <span>{labelOf(v, shown.id)}</span>
        <b>{v.value}{v.unit}<i style:color={v.trend.color}>{v.trend.glyph}</i></b>
      </div>
    {/each}
  </HoverTip>
{/if}

<style>
  .skills {
    columns: 190px;
    column-gap: 18px;
  }
  .skill {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 18px;
    padding: 0 2px;
    break-inside: avoid;
    cursor: help;
  }
  .skill:hover,
  .skill.hl {
    background: color-mix(in srgb, var(--accent-hi) 16%, transparent);
  }
  em {
    flex: none;
    width: 104px;
    font-style: normal;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  b {
    flex: none;
    width: 18px;
    font-weight: normal;
    text-align: right;
  }
  .hd,
  .row {
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }
  .hd {
    color: var(--accent-hi);
    letter-spacing: 1.4px;
    text-transform: uppercase;
  }
  .hd b,
  .row b {
    width: auto;
  }
  .xp {
    margin-bottom: 3px;
    color: var(--text-dim);
  }
  .row span {
    color: var(--text-dim);
  }
  .row i {
    margin-left: 3px;
    font-style: normal;
  }
</style>
