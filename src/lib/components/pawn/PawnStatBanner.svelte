<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { conditionStatMultipliers } from '$lib/game/core/rules/body/conditions';
  export let pawn: Pawn;

  $: sm = conditionStatMultipliers(pawn);
  $: cells = [
    ['STR', pawn.stats.strength, sm.strength, 'strength'],
    ['DEX', pawn.stats.dexterity, sm.dexterity, 'dexterity'],
    ['CON', pawn.stats.constitution, sm.constitution, 'constitution'],
    ['INT', pawn.stats.intelligence, sm.intelligence, 'intelligence'],
    ['PER', pawn.stats.perception, sm.perception, 'perception'],
    ['CHA', pawn.stats.charisma, 1, 'charisma']
  ] as const;
  const isFav = (key: string) => pawn.favStats?.includes(key as keyof typeof pawn.stats) ?? false;
  const capOf = (key: string) =>
    pawn.maxStats?.[key as keyof typeof pawn.maxStats] as number | undefined;

  const eff = (base: number, mult: number) => Math.round(base * mult);
  const pct = (mult: number) => `${mult < 1 ? '−' : '+'}${Math.abs(Math.round((mult - 1) * 100))}%`;

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
      const net = e?.[`${key}Bonus`] ?? 0;
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
  .stat-val-row {
    display: flex;
    align-items: baseline;
    gap: 3px;
  }
  .stat-cap {
    font-size: 9px;
    line-height: 1;
    color: var(--text-dim);
    opacity: 0.7;
  }
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
