<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { WORK_CATEGORIES } from '$lib/game/core/defs/work';
  import {
    SKILL_CATEGORIES,
    MAX_WORK_LEVEL,
    xpToNext
  } from '$lib/game/core/rules/body/workExperience';
  import SkinBar from '$lib/components/UI/widget/SkinBar.svelte';
  export let pawn: Pawn;

  const NAME: Record<string, string> = Object.fromEntries(
    WORK_CATEGORIES.map((c) => [c.id, c.name])
  );

  $: cells = SKILL_CATEGORIES.map((id) => {
    const level = pawn.skills?.[id] ?? 1;
    const xp = Math.floor(pawn.skillXp?.[id] ?? 0);
    const mastered = level >= MAX_WORK_LEVEL;
    const need = mastered ? 0 : xpToNext(level);
    return {
      id,
      name: NAME[id] ?? id,
      level,
      xp,
      need,
      mastered,
      frac: mastered ? 1 : Math.min(1, xp / need)
    };
  });
</script>

<div class="skills">
  {#each cells as c (c.id)}
    <div
      class="skill"
      title={c.mastered
        ? `${c.name} — level ${c.level}, a true master`
        : `${c.name} — level ${c.level}, ${c.xp} / ${c.need} experience to the next level`}
    >
      <em>{c.name}</em>
      <b>{c.level}</b>
      <SkinBar value={c.frac} ramp="honey" thin />
      <span>{c.mastered ? 'max' : `${c.xp}/${c.need}`}</span>
    </div>
  {/each}
</div>

<style>
  .skills {
    columns: 210px;
    column-gap: 18px;
  }
  .skill {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 18px;
    break-inside: avoid;
    cursor: help;
  }
  em {
    width: 92px;
    flex: none;
    font-style: normal;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  b {
    width: 18px;
    flex: none;
    text-align: right;
    font-weight: normal;
  }
  span {
    width: 52px;
    flex: none;
    text-align: right;
    color: var(--text-muted);
  }
</style>
