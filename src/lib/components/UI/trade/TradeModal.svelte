<!--
  TradeModal.svelte — the barter screen (KINGDOMS-TRADE §4). Item-to-item barter with a running
  balance: assemble an offer from the caravan's wares and the colony's stock, then press TRADE.
  Nothing moves until the button — selection is not commitment. Prices are shifted by the
  negotiating pawn's `trade` stat and kingdom relations; gold bars anchor at face value.
-->
<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { gameState } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { kingdomService } from '$lib/game/services/KingdomService';
  import { pawnStatService } from '$lib/game/services/PawnStatService';
  import { availableAggregateFromDrops } from '$lib/game/core/GameState';
  import { itemDefById } from '$lib/game/core/itemDefs';
  import TradeColumn from './TradeColumn.svelte';
  import type { TradeRow } from './TradeColumn.svelte';

  const session = $derived($uiState.tradeSession);
  const party = $derived(
    $gameState.kingdomParties?.find((p) => p.id === session?.partyId) ?? null
  );
  const pawn = $derived($gameState.pawns.find((p) => p.id === session?.pawnId) ?? null);
  const kingdom = $derived($gameState.kingdoms?.find((k) => k.id === party?.kingdomId) ?? null);

  // The caravan may pack up (or be lost) while the screen is open — close with it.
  $effect(() => {
    if (session && (!party || !pawn)) uiState.closeTrade();
  });

  const tradeStat = $derived(pawn ? pawnStatService.evaluateStat('trade', pawn) : 1);

  // Offer assembly — cleared on commit/close. Maps itemId → quantity offered.
  let receiveOffer = $state<Record<string, number>>({});
  let giveOffer = $state<Record<string, number>>({});

  const priceOf = (itemId: string, side: 'receive' | 'give') =>
    party
      ? kingdomService.effectiveTradePrice($gameState, party.kingdomId, { itemId, qty: 1 }, side, tradeStat)
      : 0;

  const caravanRows = $derived<TradeRow[]>(
    (party?.stock ?? [])
      .filter((g) => g.qty > 0)
      .map((g) => ({
        itemId: g.itemId,
        name: itemDefById(g.itemId)?.name ?? g.itemId,
        have: g.qty,
        price: priceOf(g.itemId, 'receive'),
        offered: receiveOffer[g.itemId] ?? 0
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  );

  const colonyRows = $derived<TradeRow[]>(
    Object.entries(availableAggregateFromDrops($gameState.droppedItems ?? []))
      .filter(([id, qty]) => qty > 0 && itemDefById(id) && !itemDefById(id)!.hidden)
      .map(([id, qty]) => ({
        itemId: id,
        name: itemDefById(id)!.name,
        have: qty,
        price: priceOf(id, 'give'),
        offered: giveOffer[id] ?? 0
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  );

  const receiveTotal = $derived(
    caravanRows.reduce((sum, r) => sum + r.price * r.offered, 0)
  );
  const giveTotal = $derived(colonyRows.reduce((sum, r) => sum + r.price * r.offered, 0));
  const balance = $derived(giveTotal - receiveTotal);
  const anythingOffered = $derived(receiveTotal > 0 || giveTotal > 0);
  const dealAcceptable = $derived(anythingOffered && balance >= 0);

  function adjust(map: Record<string, number>, itemId: string, delta: number, max: number) {
    const next = Math.max(0, Math.min(max, (map[itemId] ?? 0) + delta));
    if (next === 0) delete map[itemId];
    else map[itemId] = next;
  }

  function commit() {
    if (!party || !pawn || !dealAcceptable) return;
    gameState.command({
      type: 'executeTrade',
      payload: {
        partyId: party.id,
        pawnId: pawn.id,
        give: Object.entries(giveOffer).map(([itemId, qty]) => ({ itemId, qty })),
        receive: Object.entries(receiveOffer).map(([itemId, qty]) => ({ itemId, qty }))
      },
      save: true
    });
    receiveOffer = {};
    giveOffer = {};
  }
</script>

{#if session && party && pawn}
  <div class="trade-overlay" transition:fade={{ duration: 120 }}>
    <div
      class="trade-panel"
      role="dialog"
      aria-modal="true"
      aria-label="Trade"
      tabindex="-1"
      transition:scale={{ duration: 140, start: 0.97 }}
    >
      <div class="hdr">
        <span class="title">| TRADE — {kingdom?.name ?? 'CARAVAN'}</span>
        <span class="negotiator">{pawn.name} negotiates</span>
        <button class="close" onclick={() => uiState.closeTrade()}>✕</button>
      </div>

      <div class="cols">
        <TradeColumn
          title="THEIR WARES"
          rows={caravanRows}
          onAdjust={(id, d) =>
            adjust(receiveOffer, id, d, caravanRows.find((r) => r.itemId === id)?.have ?? 0)}
        />
        <TradeColumn
          title="YOUR STOCK"
          rows={colonyRows}
          onAdjust={(id, d) =>
            adjust(giveOffer, id, d, colonyRows.find((r) => r.itemId === id)?.have ?? 0)}
        />
      </div>

      <div class="footer">
        <span class="bal-part">you receive {receiveTotal}</span>
        <span class="bal-part">you give {giveTotal}</span>
        <span
          class="bal"
          class:pos={anythingOffered && balance >= 0}
          class:neg={anythingOffered && balance < 0}
        >
          {#if !anythingOffered}
            assemble an offer
          {:else if balance >= 0}
            they accept
          {:else}
            they want {-balance} more
          {/if}
        </span>
        <button class="trade-btn" disabled={!dealAcceptable} onclick={commit}>TRADE</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .trade-overlay {
    position: fixed;
    inset: 0;
    z-index: 1350;
    background: rgba(6, 4, 2, 0.66);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono);
  }
  .trade-panel {
    display: flex;
    flex-direction: column;
    width: min(720px, 94vw);
    height: min(480px, 84vh);
    background: var(--bg-panel);
    border: 1px solid var(--border-hi);
    box-shadow: 0 0 28px rgba(0, 0, 0, 0.6);
    filter: url(#ambient-tint);
  }
  .hdr {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border-hi);
    flex-shrink: 0;
  }
  .title {
    color: var(--accent-hi);
    letter-spacing: 0.08em;
    font-size: 13px;
  }
  .negotiator {
    color: var(--text-muted);
    font-size: 11px;
    flex: 1;
  }
  .close {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-family: var(--font-mono);
    cursor: pointer;
    padding: 1px 7px;
  }
  .close:hover {
    color: var(--accent-hi);
    border-color: var(--border-hi);
  }
  .cols {
    display: flex;
    gap: 8px;
    padding: 8px;
    flex: 1;
    min-height: 0;
  }
  .footer {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 8px 10px;
    border-top: 1px solid var(--border-hi);
    flex-shrink: 0;
    font-size: 12px;
  }
  .bal-part {
    color: var(--text-dim);
  }
  .bal {
    flex: 1;
    text-align: right;
    color: var(--text-muted);
    font-style: italic;
  }
  .bal.pos {
    color: var(--pos);
    font-style: normal;
  }
  .bal.neg {
    color: var(--neg);
    font-style: normal;
  }
  .trade-btn {
    background: var(--bg-panel);
    border: 1px solid var(--border-hi);
    color: var(--accent-hi);
    font-family: var(--font-mono);
    font-size: 13px;
    letter-spacing: 0.12em;
    padding: 6px 22px;
    cursor: pointer;
  }
  .trade-btn:hover:enabled {
    background: var(--border);
  }
  .trade-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
