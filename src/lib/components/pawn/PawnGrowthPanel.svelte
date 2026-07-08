<!--
  PawnGrowthPanel — the Battle-Brothers-style "growth" pick-two (PAWN-GROWTH). Shown in the Status tab
  when a pawn has a banked growth offer (survived a season, or its birthday — a birthday offer's rolls
  are DOUBLED). Every stat shows its rolled gain; the player keeps TWO. Applying raises those stats
  (capped at each stat's growth ceiling) and reveals the next offer if more are queued.
-->
<script lang="ts">
  import type { Pawn, StatKey } from '$lib/game/core/types';
  import { gameState } from '$lib/stores/gameState';

  let { pawn }: { pawn: Pawn } = $props();

  const ROWS: [StatKey, string][] = [
    ['strength', 'STR'],
    ['dexterity', 'DEX'],
    ['constitution', 'CON'],
    ['intelligence', 'INT'],
    ['perception', 'PER'],
    ['charisma', 'CHA']
  ];

  const offer = $derived(pawn.pendingGrowth?.[0]);
  const queued = $derived(pawn.pendingGrowth?.length ?? 0);
  const isFav = (k: StatKey) => pawn.favStats?.includes(k) ?? false;
  const gainOf = (k: StatKey) => offer?.rolls[k] ?? 0;
  const capOf = (k: StatKey) => pawn.maxStats?.[k] ?? Infinity;
  const projected = (k: StatKey) => Math.min(capOf(k), pawn.stats[k] + gainOf(k));

  // Selection resets whenever the offer identity changes (a new one surfaced after applying).
  let selected = $state<StatKey[]>([]);
  $effect(() => {
    void offer;
    selected = [];
  });

  function toggle(k: StatKey) {
    if (gainOf(k) <= 0) return;
    if (selected.includes(k)) selected = selected.filter((s) => s !== k);
    else if (selected.length < 2) selected = [...selected, k];
  }

  function apply() {
    if (selected.length === 0) return;
    gameState.command({
      type: 'applyPawnGrowth',
      payload: { pawnId: pawn.id, stats: selected },
      save: true
    });
  }
</script>

{#if offer}
  <div class="growth">
    <div class="growth-hdr">
      <span>★ GROWTH{queued > 1 ? ` (${queued})` : ''}</span>
      <span class="growth-kind">
        {offer.kind === 'birthday' ? 'a birthday — gains doubled' : 'a season endured'}
      </span>
    </div>
    <div class="growth-sub">keep two</div>
    {#each ROWS as [key, lbl] (key)}
      {@const gain = gainOf(key)}
      <button
        type="button"
        class="g-row"
        class:sel={selected.includes(key)}
        class:zero={gain <= 0}
        disabled={gain <= 0}
        onclick={() => toggle(key)}
      >
        <span class="g-lbl">{lbl}{isFav(key) ? ' ★' : ''}</span>
        <span class="g-proj">{pawn.stats[key]}{gain > 0 ? ` → ${projected(key)}` : ''}</span>
        <span class="g-gain" class:pos={gain > 0}>{gain > 0 ? `+${gain}` : '—'}</span>
      </button>
    {/each}
    <button class="g-apply" disabled={selected.length === 0} onclick={apply}>
      APPLY {selected.length}/2
    </button>
  </div>
{/if}

<style>
  .growth {
    margin: 6px 8px;
    border: 1px solid var(--accent-hi, #f0c060);
    background: var(--bg-panel);
  }
  .growth-hdr {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 4px 8px;
    color: var(--accent-hi, #f0c060);
    font-size: 12px;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
  }
  .growth-kind {
    color: var(--text-dim);
    font-size: 10px;
    letter-spacing: 0.03em;
  }
  .growth-sub {
    padding: 2px 8px;
    color: var(--text-dim);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .g-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    width: 100%;
    padding: 3px 8px;
    background: transparent;
    border: none;
    border-top: 1px solid var(--border);
    color: var(--text);
    font-family: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }
  .g-row:hover:not(:disabled) {
    background: var(--bg-hover);
  }
  .g-row.sel {
    background: color-mix(in srgb, var(--accent-hi, #f0c060) 22%, transparent);
  }
  .g-row.zero {
    opacity: 0.4;
    cursor: default;
  }
  .g-lbl {
    min-width: 46px;
    color: var(--text-dim);
    letter-spacing: 0.04em;
  }
  .g-row.sel .g-lbl {
    color: var(--accent-hi, #f0c060);
  }
  .g-proj {
    margin-left: auto;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  .g-gain {
    min-width: 26px;
    text-align: right;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
  .g-gain.pos {
    color: var(--pos, #4caf50);
  }
  .g-apply {
    width: 100%;
    padding: 4px;
    background: var(--accent-hi, #f0c060);
    color: #1a1206;
    border: none;
    font-family: inherit;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    cursor: pointer;
  }
  .g-apply:disabled {
    background: var(--bg-hover);
    color: var(--text-dim);
    cursor: default;
  }
</style>
