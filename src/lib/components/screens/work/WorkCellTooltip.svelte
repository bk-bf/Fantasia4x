<script lang="ts">
  import HoverTip from '$lib/components/UI/tooltip/HoverTip.svelte';
  import type { Pawn, WorkCategory } from '$lib/game/core/types';
  import { getEfficiencyColor } from '$lib/components/util/pawnUtils';
  import { getActiveConditionViews } from '$lib/components/util/conditionInfo';
  import { pawnStatService } from '$lib/game/services/PawnStatService';
  import { itemService } from '$lib/game/services/ItemService';
  import {
    LVL_NAMES,
    LABOR_COLORS,
    STAR_COLORS,
    STAR_TIERS,
    WORST_COLORS,
    WORST_TIERS,
    NON_SKILL_TASKS,
    type CellRank
  } from '$lib/components/util/workUtils';

  interface Props {
    pawn: Pawn;
    wc: WorkCategory;
    mods: { speed: number; yield: number | null; quality: number | null };
    rank: CellRank;
    level: 0 | 1 | 2 | 3 | 4;
    name?: string;
    x: number;
    y: number;
    pinned?: boolean;
  }
  let { pawn, wc, mods, rank, level, name, x, y, pinned = false }: Props = $props();

  const mult = (n: number) => `×${n.toFixed(2)}`;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  let nonSkill = $derived(NON_SKILL_TASKS[wc.id]);
  let relevantStats = $derived.by(() => {
    if (!nonSkill) return [];
    const carry = nonSkill.some((s) => s.statId.startsWith('carry_'))
      ? itemService.getCarryCapacityBreakdown(pawn)
      : null;
    return nonSkill.map((s) => {
      if (s.statId === 'carry_weight')
        return { label: s.label, text: `${Math.round(carry!.weight.total)} kg` };
      if (s.statId === 'carry_volume')
        return { label: s.label, text: `${Math.round(carry!.volume.total)} L` };
      const v = pawnStatService.evaluateStat(s.statId, pawn);
      return { label: s.label, text: s.statId === 'hit_precision' ? v.toFixed(3) : mult(v) };
    });
  });

  let eff = $derived(mods.speed * (mods.yield ?? 1) * (mods.quality ?? 1));

  let stats = $derived(
    [
      { label: cap(wc.primaryStat) + ' (primary)', val: pawn.stats[wc.primaryStat] ?? 0 },
      wc.secondaryStat
        ? { label: cap(wc.secondaryStat) + ' (secondary)', val: pawn.stats[wc.secondaryStat] ?? 0 }
        : null
    ].filter((s): s is { label: string; val: number } => s !== null)
  );
  let skill = $derived(pawn.skills?.[wc.id] ?? 0);

  type TraitMod = { name: string; axis: string; pct: number };
  let traitMods = $derived.by(() => {
    const out: TraitMod[] = [];
    const axes: Array<['workSpeed' | 'workYield' | 'workQuality', string]> = [
      ['workSpeed', 'speed'],
      ['workYield', 'yield'],
      ['workQuality', 'quality']
    ];
    for (const trait of pawn.traits ?? []) {
      for (const [key, axis] of axes) {
        const map = trait.effects?.[key] as Record<string, number> | undefined;
        const v = map?.[wc.id] ?? map?.['all'];
        if (v !== undefined && v !== 1) out.push({ name: trait.name, axis, pct: (v - 1) * 100 });
      }
    }
    return out;
  });

  let toolMod = $derived.by(() => {
    const t = pawnStatService.heldToolFor(pawn, wc.id);
    if (!t) return null;
    return {
      name: itemService.getItemById(t.itemId)?.name ?? t.itemId,
      speed: t.speed,
      yield: t.yield
    };
  });

  let condMods = $derived.by(() => {
    const out: { name: string; pct: number }[] = [];
    for (const v of getActiveConditionViews(pawn)) {
      const we = v.modifiers.workEfficiency;
      if (we == null || we === 1) continue;
      const name = v.stageLabel ? `${v.name} (${v.stageLabel})` : v.name;
      out.push({ name, pct: (we - 1) * 100 });
    }
    return out;
  });
</script>

<HoverTip {x} {y} {pinned}>
  <h5>
    {name ?? wc.name}
    {#if !nonSkill}
      <span class="tip-eff" style="color:{getEfficiencyColor(eff)}">{Math.round(eff * 100)}%</span>
    {/if}
  </h5>

  {#if rank.best >= 0}
    <div class="tip-rank" style="color:{STAR_COLORS[rank.best]}">★ {STAR_TIERS[rank.best]}</div>
  {:else if rank.worst >= 0}
    <div class="tip-rank" style="color:{WORST_COLORS[rank.worst]}">▾ {WORST_TIERS[rank.worst]}</div>
  {/if}

  {#if nonSkill}
    <div class="tip-note">
      {wc.id === 'hunting'
        ? 'Combat task — resolves as a normal fight, then the carcass is hauled.'
        : 'Carrying task — driven by carry capacity and movement, not a learned skill.'}
    </div>
    {#each relevantStats as s}
      <div class="kv">
        <em>{s.label}</em>
        <span>{s.text}</span>
      </div>
    {/each}
    <div class="kv">
      <em>Assigned</em>
      <span style="color:{LABOR_COLORS[level]}">{LVL_NAMES[level]}</span>
    </div>
  {:else}
    <div class="kv">
      <em>Speed</em>
      <span style="color:{getEfficiencyColor(mods.speed)}">{mult(mods.speed)}</span>
    </div>
    {#if mods.yield !== null}
      <div class="kv">
        <em>Yield</em>
        <span style="color:{getEfficiencyColor(mods.yield)}">{mult(mods.yield)}</span>
      </div>
    {/if}
    {#if mods.quality !== null}
      <div class="kv">
        <em>Quality</em>
        <span style="color:{getEfficiencyColor(mods.quality)}">{mult(mods.quality)}</span>
      </div>
    {/if}

    <div class="kv">
      <em>Assigned</em>
      <span style="color:{LABOR_COLORS[level]}">{LVL_NAMES[level]}</span>
    </div>
    {#each stats as s}
      <div class="kv">
        <em>{s.label}</em>
        <span>{s.val}</span>
      </div>
    {/each}
    <div class="kv">
      <em>Skill</em>
      <span>{skill}</span>
    </div>
  {/if}

  {#if !nonSkill && (toolMod || traitMods.length > 0 || condMods.length > 0)}
    <div class="tip-sep">MODIFIERS</div>
    {#if toolMod}
      <div class="tip-mod">
        <span class="tip-mod-name" style="color:#ca8">{toolMod.name} (tool)</span>
        <span class="tip-mod-val"
          >+{toolMod.speed.toFixed(2)} spd{#if toolMod.yield > 0}, +{toolMod.yield.toFixed(2)} yld{/if}</span
        >
      </div>
    {/if}
    {#each traitMods as m}
      <div class="tip-mod">
        <span class="tip-mod-name" style="color:{m.pct >= 0 ? 'var(--pos)' : 'var(--neg)'}"
          >{m.name}</span
        >
        <span class="tip-mod-val">{m.pct >= 0 ? '+' : ''}{Math.round(m.pct)}% {m.axis}</span>
      </div>
    {/each}
    {#each condMods as m}
      <div class="tip-mod">
        <span class="tip-mod-name" style="color:{m.pct >= 0 ? 'var(--pos)' : 'var(--neg)'}"
          >{m.name}</span
        >
        <span class="tip-mod-val">{m.pct >= 0 ? '+' : ''}{Math.round(m.pct)}% speed</span>
      </div>
    {/each}
  {/if}
</HoverTip>

<style>
  .tip-rank {
    margin-bottom: 3px;
  }
  .tip-note {
    margin-bottom: 3px;
    line-height: 16px;
    color: var(--text-muted);
  }
</style>
