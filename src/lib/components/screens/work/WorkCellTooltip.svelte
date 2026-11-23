<script lang="ts">
  import HoverTip from '$lib/components/UI/tooltip/HoverTip.svelte';
  import KvRow from '$lib/components/UI/widget/KvRow.svelte';
  import type { Pawn, WorkCategory } from '$lib/game/core/types';
  import { getActiveConditionViews } from '$lib/components/util/conditionInfo';
  import { pawnStatService } from '$lib/game/services/PawnStatService';
  import { itemService } from '$lib/game/services/ItemService';
  import {
    LVL_NAMES,
    STAR_TIERS,
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

  let standing = $derived(
    rank.best >= 0
      ? STAR_TIERS[rank.best].toLowerCase()
      : rank.worst >= 0
        ? WORST_TIERS[rank.worst].toLowerCase()
        : ''
  );
  const signed = (n: number) => `${n >= 0 ? '+' : ''}${Math.round(n)}%`;

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
  <h5>{pawn.name.split(' ')[0]} · {name ?? wc.name}</h5>
  {#if nonSkill}
    <p>
      {wc.id === 'hunting'
        ? 'Tracked and fought like any foe, then the carcass is carried home.'
        : 'Strong backs and quick feet, not a learned craft.'}
    </p>
    {#if standing}<KvRow label="Standing">{standing}</KvRow>{/if}
    <KvRow label="Priority">{LVL_NAMES[level].toLowerCase()}</KvRow>
    {#each relevantStats as s (s.label)}
      <KvRow label={s.label}>{s.text}</KvRow>
    {/each}
  {:else}
    <KvRow label="Skill"
      >{skill}{#if standing}&nbsp;· {standing}{/if}</KvRow
    >
    <KvRow label="Priority">{LVL_NAMES[level].toLowerCase()}</KvRow>
    <KvRow label="Overall">{Math.round(eff * 100)}%</KvRow>
    <KvRow label="Speed">{mult(mods.speed)}</KvRow>
    {#if mods.yield !== null}<KvRow label="Yield">{mult(mods.yield)}</KvRow>{/if}
    {#if mods.quality !== null}<KvRow label="Quality">{mult(mods.quality)}</KvRow>{/if}
    {#each stats as s (s.label)}
      <KvRow label={s.label}>{s.val}</KvRow>
    {/each}
    {#if toolMod || traitMods.length > 0 || condMods.length > 0}
      <div class="tip-sep">Modifiers</div>
      {#if toolMod}
        <KvRow label={toolMod.name}
          >+{toolMod.speed.toFixed(2)} spd{#if toolMod.yield > 0}, +{toolMod.yield.toFixed(2)} yld{/if}</KvRow
        >
      {/if}
      {#each traitMods as m, i (m.name + i)}
        <KvRow label={m.name}>{signed(m.pct)} {m.axis}</KvRow>
      {/each}
      {#each condMods as m, i (m.name + i)}
        <KvRow label={m.name}>{signed(m.pct)} speed</KvRow>
      {/each}
    {/if}
  {/if}
</HoverTip>
