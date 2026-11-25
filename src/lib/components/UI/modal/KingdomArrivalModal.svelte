<script lang="ts">
  import type { KingdomArrivalEvent } from '$lib/game/core/types';
  import { kingdoms } from '$lib/stores/gameState';
  import ChromeButton from '$lib/components/UI/widget/ChromeButton.svelte';
  import ModalWindow from '$lib/components/UI/window/ModalWindow.svelte';

  let { event, onResolve }: { event: KingdomArrivalEvent; onResolve: () => void } = $props();

  const kingdom = $derived($kingdoms.find((k) => k.id === event.kingdomId));
  const isCaravan = $derived(event.partyKind === 'caravan');
  const from = $derived(kingdom?.name ?? 'a distant land');
</script>

<ModalWindow
  id="event"
  title={isCaravan ? 'A caravan arrives' : 'Visitors arrive'}
  width={420}
  onclose={onResolve}
>
  <p class="lore">
    {#if isCaravan}
      A trade caravan from <span class="name">{from}</span> has crossed into your lands — laden beasts,
      watchful guards, and a trader at their head.
    {:else}
      A small party from <span class="name">{from}</span> approaches your colony — come to see it, and
      to be seen.
    {/if}
  </p>
  {#if kingdom}
    <p class="it">{kingdom.name} — {kingdom.lore.epithet}.</p>
  {/if}
  <p class="lore">
    {isCaravan
      ? 'The trader will linger a day or two, ready to bargain with whoever seeks them out.'
      : 'They will linger a while. What they learn of you, their kingdom learns too.'}
  </p>
  <div class="foot">
    <ChromeButton kind="verb" onclick={onResolve}>Receive them</ChromeButton>
  </div>
</ModalWindow>

<style>
  p {
    margin: 0 0 6px;
    line-height: 17px;
  }
  .lore {
    color: var(--text-dim);
  }
  .name {
    color: var(--accent-hi);
  }
  .it {
    color: var(--text-muted);
  }
  .foot {
    display: flex;
    justify-content: flex-end;
    margin-top: 4px;
  }
</style>
