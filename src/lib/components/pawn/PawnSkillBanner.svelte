<!-- PawnSkillBanner.svelte — WORK-EXPERIENCE fork of PawnStatBanner: one chip per work category
     showing the pawn's experience LEVEL, a compact XP bar beneath it, and the exact
     current / needed XP toward the next level. Rendered above the Work screen's skills table. -->
<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { WORK_CATEGORIES } from '$lib/game/core/Work';
  import { SKILL_CATEGORIES, MAX_WORK_LEVEL, xpToNext } from '$lib/game/core/workExperience';
  import { ABBR } from '$lib/utils/workUtils';
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
      abbr: ABBR[id] ?? id.slice(0, 3).toUpperCase(),
      name: NAME[id] ?? id,
      level,
      xp,
      need,
      mastered,
      frac: mastered ? 1 : Math.min(1, xp / need)
    };
  });
</script>

<div class="skills-grid">
  {#each cells as c (c.id)}
    <div
      class="skill-cell"
      title={c.mastered
        ? `${c.name} — level ${c.level}, a true master`
        : `${c.name} — level ${c.level}, ${c.xp} / ${c.need} experience to the next level`}
    >
      <span class="skill-lbl">{c.abbr}</span>
      <span class="skill-val">{c.level}</span>
      <div class="xp-bar">
        <div class="xp-fill" style="width: {Math.round(c.frac * 100)}%"></div>
      </div>
      <span class="xp-num">{c.mastered ? 'MAX' : `${c.xp}/${c.need}`}</span>
    </div>
  {/each}
</div>

<style>
  .skills-grid {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 4px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--border);
  }
  .skill-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    padding: 2px 0;
    cursor: help;
  }
  .skill-lbl {
    color: var(--text-dim);
    font-size: 10px;
    letter-spacing: 0.04em;
  }
  .skill-val {
    color: var(--accent-hi);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.1;
  }
  .xp-bar {
    width: 80%;
    height: 3px;
    background: var(--bg-panel, #1a1408);
    border: 1px solid var(--border, #3a2e14);
    overflow: hidden;
  }
  .xp-fill {
    height: 100%;
    background: var(--accent, #c8871e);
  }
  .xp-num {
    color: var(--text-dim);
    font-size: 8px;
    line-height: 1.2;
    opacity: 0.8;
  }
</style>
