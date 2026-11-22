<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { pawnService } from '$lib/game/services/PawnService';
  import SkinBar from '$lib/components/UI/widget/SkinBar.svelte';
  import ScrollArea from '$lib/components/UI/widget/ScrollArea.svelte';

  const pawn = $derived(($gameState.pawns ?? []).find((p) => p.id === $uiState.selectedPawnId));
  const mood = $derived(pawn ? pawnService.getMoodBreakdown(pawn, $gameState) : undefined);
  const rows = $derived.by(() => {
    const merged = new Map<string, number>();
    for (const c of mood?.contributions ?? [])
      merged.set(c.label, (merged.get(c.label) ?? 0) + c.value);
    return [...merged]
      .map(([label, value]) => ({ label, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);
  });
  const now = $derived(mood?.mood ?? 50);
  const target = $derived(mood?.target ?? now);
  const gap = $derived(target - now);
  const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
</script>

<div class="mood">
  {#if pawn && mood}
    <div class="meter">
      <em>Mood</em>
      <SkinBar value={now / 100} ramp={now < 35 ? 'ember' : 'honey'} />
      <span>{now}</span>
    </div>
    <p class="trend" class:good={gap > 0.5} class:neg={gap < -0.5}>
      {#if gap > 0.5}▲ rising toward {target}{:else if gap < -0.5}▼ falling toward {target}{:else}◦
        settled at {target}{/if}
    </p>
    <h5>What weighs on {pawn.name.split(' ')[0]}</h5>
    <ScrollArea class="rows">
      {#each rows as r (r.label)}
        <div class="kv">
          <em>{r.label}</em>
          <span class:good={r.value > 0} class:neg={r.value < 0}>{signed(r.value)}</span>
        </div>
      {:else}
        <p class="none">Nothing weighs on them; an even 50.</p>
      {/each}
    </ScrollArea>
  {:else}
    <p class="none">Choose someone to look over.</p>
  {/if}
</div>

<style>
  .mood {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    font: 16px/18px var(--font-pixel);
    color: var(--text);
  }
  .meter {
    flex: none;
    display: flex;
    align-items: center;
    gap: 7px;
    height: 18px;
  }
  .meter em {
    flex: none;
    width: 58px;
    font-style: normal;
  }
  .meter span {
    flex: none;
    width: 64px;
    text-align: right;
    color: var(--text-dim);
  }
  .trend {
    flex: none;
    margin: 2px 0 6px;
    color: var(--text-dim);
  }
  h5 {
    flex: none;
    margin: 0 0 1px;
    font: inherit;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1.6px;
  }
  .mood :global(.rows) {
    flex: 1;
    min-height: 0;
  }
  .kv {
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }
  .kv em {
    font-style: normal;
  }
  .good {
    color: var(--pos);
  }
  .neg {
    color: var(--neg);
  }
  .none {
    margin: 0;
    color: var(--text-muted);
  }
</style>
