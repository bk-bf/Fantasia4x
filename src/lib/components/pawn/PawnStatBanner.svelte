<script lang="ts">
  import type { Pawn, StatKey } from '$lib/game/core/types';
  import { CORE_STATS } from '$lib/game/core/types';
  import { conditionStatMultipliers } from '$lib/game/core/rules/body/conditions';
  import { chrome } from '$lib/pixelArt/chrome';
  export let pawn: Pawn;

  $: sm = conditionStatMultipliers(pawn);
  $: cells = CORE_STATS.map(
    ({ id, abbr }) => [abbr, pawn.stats[id], id === 'charisma' ? 1 : sm[id], id] as const
  );
  const isFav = (key: string) => pawn.favStats?.includes(key as keyof typeof pawn.stats) ?? false;
  const capOf = (key: string) =>
    pawn.maxStats?.[key as keyof typeof pawn.maxStats] as number | undefined;

  const eff = (base: number, mult: number) => Math.round(base * mult);

  function traitParts(key: StatKey): string {
    const parts: string[] = [];
    for (const t of pawn.traits ?? []) {
      const e = t.effects as Record<string, number> | undefined;
      const net = e?.[`${key}Bonus`] ?? 0;
      if (net) parts.push(`${net > 0 ? '+' : '−'}${Math.abs(net)} ${t.name}`);
    }
    return parts.join(', ');
  }
  function statTitle(lbl: string, key: StatKey, base: number, mult: number): string {
    const tp = traitParts(key);
    let s = `${lbl} ${base}`;
    if (tp) s += `  (traits: ${tp})`;
    if (mult !== 1) s += `  × ${mult.toFixed(2)} conditions = ${eff(base, mult)}`;
    return tp || mult !== 1 ? s : '';
  }
</script>

<div class="attrs">
  {#each cells as [lbl, base, mult, key]}
    <div
      class="attr"
      class:fav={isFav(key)}
      title={statTitle(lbl, key, base, mult)}
      {@attach chrome('well')}
    >
      <em
        >{lbl}{#if isFav(key)}<span
            class="fav-star"
            title="a natural talent — grows faster and further">★</span
          >{/if}</em
      >
      <b class:penalized={mult < 1} class:boosted={mult > 1}>{eff(base, mult)}</b>
      {#if capOf(key) != null}
        <span class="cap" title={`grows toward a cap of ${capOf(key)}`}>/{capOf(key)}</span>
      {/if}
    </div>
  {/each}
</div>

<style>
  .attrs {
    flex: none;
    display: flex;
    gap: 3px;
  }
  .attr {
    width: 50px;
    height: 44px;
    display: grid;
    grid-template: 'k k' 16px 'v p' 1fr / auto auto;
    justify-content: center;
    align-items: baseline;
    column-gap: 2px;
    padding-top: 4px;
    font: 16px/18px var(--font-pixel);
  }
  em {
    grid-area: k;
    text-align: center;
    font-style: normal;
    color: var(--text-muted);
  }
  .fav em {
    color: var(--accent-hi);
  }
  .fav-star {
    font-size: 10px;
    vertical-align: 4px;
  }
  b {
    grid-area: v;
    font: 20px/20px var(--font-head);
    font-weight: normal;
    color: var(--text);
  }
  b.penalized {
    color: var(--neg);
  }
  b.boosted {
    color: var(--pos);
  }
  .cap {
    grid-area: p;
    color: var(--text-muted);
  }
</style>
