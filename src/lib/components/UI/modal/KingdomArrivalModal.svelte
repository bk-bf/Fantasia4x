<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import type { KingdomArrivalEvent } from '$lib/game/core/types';
  import { kingdoms } from '$lib/stores/gameState';

  let { event, onResolve }: { event: KingdomArrivalEvent; onResolve: () => void } = $props();

  const kingdom = $derived($kingdoms.find((k) => k.id === event.kingdomId));
  const isCaravan = $derived(event.partyKind === 'caravan');
</script>

<div class="event-overlay" transition:fade={{ duration: 120 }}>
  <div class="backdrop"></div>
  <div
    class="event-panel"
    role="dialog"
    aria-modal="true"
    aria-label={isCaravan ? 'A caravan arrives' : 'Visitors arrive'}
    tabindex="-1"
    transition:scale={{ duration: 140, start: 0.96 }}
  >
    <div class="hdr">
      <h2 class="title">{isCaravan ? 'A CARAVAN ARRIVES' : 'VISITORS ARRIVE'}</h2>
    </div>
    <p class="intro">
      {#if isCaravan}
        A trade caravan from <span class="kingdom-name">{kingdom?.name ?? 'a distant land'}</span>
        has crossed into your lands — laden beasts, watchful guards, and a trader at their head.
      {:else}
        A small party from <span class="kingdom-name">{kingdom?.name ?? 'a distant land'}</span>
        approaches your colony — come to see it, and to be seen.
      {/if}
    </p>
    {#if kingdom}
      <p class="epithet">{kingdom.name} — {kingdom.lore.epithet}.</p>
    {/if}
    {#if isCaravan}
      <p class="hint">
        Seek out the trader while they linger — a highlighted colonist can strike a bargain.
      </p>
    {:else}
      <p class="hint">
        They will linger a while. What they learn of you, their kingdom learns too.
      </p>
    {/if}

    <button class="done" onclick={onResolve}>RECEIVE THEM</button>
  </div>
</div>

<style>
  .event-overlay {
    position: fixed;
    inset: 0;
    z-index: 1400;
    background: rgba(6, 4, 2, 0.72);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono);
  }
  .backdrop {
    position: absolute;
    inset: 0;
  }
  .event-panel {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    width: min(420px, 90vw);
    max-height: 86vh;
    padding: 16px 18px 14px;
    background: var(--bg-panel);
    border: 1px solid var(--border-hi);
    box-shadow: 0 0 28px rgba(0, 0, 0, 0.6);
    filter: url(#ambient-tint);
  }
  .hdr {
    margin-bottom: 6px;
  }
  .title {
    color: var(--accent-hi);
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 0.4em;
    text-indent: 0.4em;
    margin: 0;
  }
  .intro {
    color: var(--text-dim);
    font-size: 12px;
    line-height: 1.5;
    margin: 0 0 8px;
  }
  .kingdom-name {
    color: var(--accent-hi);
  }
  .epithet {
    color: var(--text-muted);
    font-size: 11px;
    font-style: italic;
    line-height: 1.5;
    margin: 0 0 8px;
  }
  .hint {
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.5;
    margin: 0;
  }
  .done {
    margin-top: 14px;
    background: var(--bg-panel);
    border: 1px solid var(--border-hi);
    color: var(--accent-hi);
    font-family: var(--font-mono);
    font-size: 13px;
    letter-spacing: 0.1em;
    padding: 8px;
    cursor: pointer;
  }
  .done:hover {
    background: var(--border);
  }
</style>
