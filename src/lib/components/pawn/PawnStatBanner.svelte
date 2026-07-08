<!-- PawnStatBanner.svelte — the six base-stat chips (STR DEX CON INT PER CHA), showing the
     condition-adjusted (effective) value with a signed delta. The single source of truth for the
     stat grid: rendered by the Attributes tab (PawnAttributes) and the Status tab (via PawnStatsBar,
     which adds the name header), plus anywhere else the core attributes are shown. -->
<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { conditionStatMultipliers } from '$lib/game/core/needs';
  export let pawn: Pawn;

  // Active conditions (shock, malnutrition, hypothermia…) scale the RAW attributes. Show the
  // EFFECTIVE value so the banner matches the crippled body the sim actually uses, with a signed
  // delta + a tooltip naming the base × multiplier — that's the "stat loss" surfaced on the pawn tab.
  $: sm = conditionStatMultipliers(pawn);
  // PAWN-GROWTH: 4th tuple field is the stat key — drives the ★ (favoured) marker + growth cap lookup.
  $: cells = [
    ['STR', pawn.stats.strength, sm.strength, 'strength'],
    ['DEX', pawn.stats.dexterity, sm.dexterity, 'dexterity'],
    ['CON', pawn.stats.constitution, sm.constitution, 'constitution'],
    ['INT', pawn.stats.intelligence, sm.intelligence, 'intelligence'],
    ['PER', pawn.stats.perception, sm.perception, 'perception'],
    ['CHA', pawn.stats.charisma, 1, 'charisma']
  ] as const;
  const isFav = (key: string) => pawn.favStats?.[0] === key || pawn.favStats?.[1] === key;
  const capOf = (key: string) =>
    pawn.maxStats?.[key as keyof typeof pawn.maxStats] as number | undefined;

  const eff = (base: number, mult: number) => Math.round(base * mult);
  const pct = (mult: number) => `${mult < 1 ? '−' : '+'}${Math.abs(Math.round((mult - 1) * 100))}%`;

  // Trait contributions to a core stat (baked into pawn.stats at generation, so surfaced here for the
  // hover breakdown — "+2 Sturdy, −1 Stocky"). ADR-023.
  const STAT_KEY: Record<string, string> = {
    STR: 'strength',
    DEX: 'dexterity',
    CON: 'constitution',
    INT: 'intelligence',
    PER: 'perception',
    CHA: 'charisma'
  };
  function traitParts(lbl: string): string {
    const key = STAT_KEY[lbl];
    const parts: string[] = [];
    for (const t of pawn.traits ?? []) {
      const e = t.effects as Record<string, number> | undefined;
      const net = (e?.[`${key}Bonus`] ?? 0) - (e?.[`${key}Penalty`] ?? 0);
      if (net) parts.push(`${net > 0 ? '+' : '−'}${Math.abs(net)} ${t.name}`);
    }
    return parts.join(', ');
  }
  function statTitle(lbl: string, base: number, mult: number): string {
    const tp = traitParts(lbl);
    let s = `${lbl} ${base}`;
    if (tp) s += `  (traits: ${tp})`;
    if (mult !== 1) s += `  × ${mult.toFixed(2)} conditions = ${eff(base, mult)}`;
    return tp || mult !== 1 ? s : '';
  }
</script>

<div class="stats-grid">
  {#each cells as [lbl, base, mult, key]}
    <div class="stat-cell" class:fav={isFav(key)} title={statTitle(lbl, base, mult)}>
      <span class="stat-lbl">{lbl}</span>
      <span class="stat-val-row">
        <span class="stat-val" class:penalized={mult < 1} class:boosted={mult > 1}>
          {eff(base, mult)}
        </span>
        {#if isFav(key)}
          <span class="fav-star" title="a natural talent — grows faster and further">★</span>
        {/if}
        {#if capOf(key) != null}
          <span class="stat-cap" title={`grows toward a cap of ${capOf(key)}`}>/{capOf(key)}</span>
        {/if}
      </span>
      {#if mult !== 1}
        <span class="stat-delta" class:neg={mult < 1}>{pct(mult)}</span>
      {/if}
    </div>
  {/each}
</div>

<style>
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 4px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--border);
  }
  .stat-cell {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    padding: 2px 0;
  }
  /* PAWN-GROWTH: value, ★, and growth cap sit on one baseline-aligned row ("18 ★ /72"). */
  .stat-val-row {
    display: flex;
    align-items: baseline;
    gap: 3px;
  }
  /* Dim growth ceiling to the right of the live value. */
  .stat-cap {
    font-size: 9px;
    line-height: 1;
    color: var(--text-dim);
    opacity: 0.7;
  }
  /* Favoured ("talent") stat: a small star right next to the value. */
  .fav-star {
    font-size: 9px;
    line-height: 1;
    color: var(--accent-hi, #f0c060);
  }
  .stat-cell.fav .stat-lbl {
    color: var(--accent-hi, #f0c060);
  }
  .stat-lbl {
    color: var(--text-dim);
    font-size: 11px;
    letter-spacing: 0.04em;
  }
  .stat-val {
    color: var(--accent-hi);
    font-size: 13px;
    font-weight: 600;
  }
  .stat-val.penalized {
    color: var(--neg, #ff5252);
  }
  .stat-val.boosted {
    color: var(--pos, #4caf50);
  }
  .stat-delta {
    font-size: 9px;
    line-height: 1;
    color: var(--pos, #4caf50);
  }
  .stat-delta.neg {
    color: var(--neg, #ff5252);
  }
</style>
