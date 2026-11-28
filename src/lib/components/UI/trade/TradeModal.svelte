<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { kingdomService } from '$lib/game/services/KingdomService';
  import { pawnStatService } from '$lib/game/services/PawnStatService';
  import { availableAggregateFromDrops } from '$lib/game/core/state/stockpile';
  import { itemDefById } from '$lib/game/core/defs/items';
  import ChromeButton from '$lib/components/UI/widget/ChromeButton.svelte';
  import ModalWindow from '$lib/components/UI/window/ModalWindow.svelte';
  import TradeColumn from './TradeColumn.svelte';
  import type { TradeRow } from './TradeColumn.svelte';

  const session = $derived($uiState.tradeSession);
  const party = $derived($gameState.kingdomParties?.find((p) => p.id === session?.partyId) ?? null);
  const pawn = $derived($gameState.pawns.find((p) => p.id === session?.pawnId) ?? null);
  const kingdom = $derived($gameState.kingdoms?.find((k) => k.id === party?.kingdomId) ?? null);

  $effect(() => {
    if (session && (!party || !pawn)) uiState.closeTrade();
  });

  const tradeStat = $derived(pawn ? pawnStatService.evaluateStat('trade', pawn) : 1);

  let receiveOffer = $state<Record<string, number>>({});
  let giveOffer = $state<Record<string, number>>({});

  const priceOf = (itemId: string, side: 'receive' | 'give') =>
    party
      ? kingdomService.effectiveTradePrice(
          $gameState,
          party.kingdomId,
          { itemId, qty: 1 },
          side,
          tradeStat
        )
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

  const receiveTotal = $derived(caravanRows.reduce((sum, r) => sum + r.price * r.offered, 0));
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
  <ModalWindow
    id="trade"
    title={kingdom?.name ?? 'A caravan'}
    width={760}
    onclose={() => uiState.closeTrade()}
  >
    <p class="sub">{pawn.name} bargains</p>
    <div class="wells">
      <TradeColumn
        title="Their wares"
        rows={caravanRows}
        onAdjust={(id, d) =>
          adjust(receiveOffer, id, d, caravanRows.find((r) => r.itemId === id)?.have ?? 0)}
      />
      <TradeColumn
        title="Your stock"
        rows={colonyRows}
        onAdjust={(id, d) =>
          adjust(giveOffer, id, d, colonyRows.find((r) => r.itemId === id)?.have ?? 0)}
      />
    </div>
    <footer>
      <span>You receive <b>{receiveTotal}</b></span>
      <span>You give <b>{giveTotal}</b></span>
      <span
        class="bal"
        class:pos={anythingOffered && balance >= 0}
        class:neg={anythingOffered && balance < 0}
      >
        {#if !anythingOffered}
          nothing yet on the cloth
        {:else if balance >= 0}
          they accept
        {:else}
          they want {-balance} more
        {/if}
      </span>
      <ChromeButton kind="verb" disabled={!dealAcceptable} onclick={commit}>Trade</ChromeButton>
    </footer>
  </ModalWindow>
{/if}

<style>
  .sub {
    margin: -4px 0 5px;
    color: var(--text-dim);
  }
  .wells {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    height: min(330px, 56vh);
  }
  footer {
    display: flex;
    align-items: center;
    gap: 22px;
    margin-top: 8px;
    padding: 0 4px;
    color: var(--text-dim);
  }
  b {
    font-weight: normal;
    color: var(--text);
  }
  .bal {
    color: var(--text-muted);
  }
  .bal.pos {
    color: var(--pos);
  }
  .bal.neg {
    color: var(--neg);
  }
  footer :global(.cbtn) {
    margin-left: auto;
  }
</style>
