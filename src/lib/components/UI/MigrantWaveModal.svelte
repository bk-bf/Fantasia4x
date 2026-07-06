<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import type { MigrantWaveEvent } from '$lib/game/core/types';
  import { describePawnAbilities } from '$lib/utils/pawnBlurb';

  let { event, onResolve }: { event: MigrantWaveEvent; onResolve: (ids: string[]) => void } =
    $props();

  // Per-candidate accept toggle — each hopeful starts accepted; the player turns away the ones they
  // don't want, then commits. Nothing joins until Confirm (selection is not commitment). `overrides`
  // holds only the flipped ids; `isAccepted` defaults the rest to true.
  let overrides = $state<Record<string, boolean>>({});
  const isAccepted = (id: string) => overrides[id] ?? true;
  const acceptedCount = $derived(event.candidates.filter((c) => isAccepted(c.id)).length);

  function toggle(id: string) {
    overrides[id] = !isAccepted(id);
  }
  function confirm() {
    onResolve(event.candidates.filter((c) => isAccepted(c.id)).map((c) => c.id));
  }
</script>

<div class="event-overlay" transition:fade={{ duration: 120 }}>
  <div class="backdrop"></div>
  <div
    class="event-panel"
    role="dialog"
    aria-modal="true"
    aria-label="Migrants arrive"
    tabindex="-1"
    transition:scale={{ duration: 140, start: 0.96 }}
  >
    <div class="hdr">
      <h2 class="title">MIGRANTS ARRIVE</h2>
    </div>
    <p class="intro">
      {event.candidates.length === 1
        ? 'A wanderer has reached your colony, hoping to join.'
        : `${event.candidates.length} wanderers have reached your colony, hoping to join.`}
      Choose who to welcome.
    </p>

    <div class="cards">
      {#each event.candidates as c (c.id)}
        {@const blurb = describePawnAbilities(c)}
        <div class="card" class:rejected={!isAccepted(c.id)}>
          <div class="card-head">
            <div class="who">
              <span class="name">{c.name}</span>
              <span class="race">{c.raceName}</span>
            </div>
            <button class="toggle" class:on={isAccepted(c.id)} onclick={() => toggle(c.id)}>
              {isAccepted(c.id) ? '✓ Welcome' : '✕ Turn away'}
            </button>
          </div>
          <div class="traits">
            {#each blurb.strengths as s}
              <span class="chip good">{s}</span>
            {/each}
            {#each blurb.weaknesses as w}
              <span class="chip bad">{w}</span>
            {/each}
            {#if blurb.strengths.length === 0 && blurb.weaknesses.length === 0}
              <span class="chip plain">of unremarkable ability</span>
            {/if}
          </div>
        </div>
      {/each}
    </div>

    <button class="done" onclick={confirm}>
      {acceptedCount === 0
        ? 'Turn them all away'
        : acceptedCount === 1
          ? 'Welcome 1 migrant'
          : `Welcome ${acceptedCount} migrants`}
    </button>
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
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.5;
    margin: 0 0 12px;
  }
  .cards {
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    min-height: 0;
  }
  .card {
    border: 1px solid var(--border);
    padding: 8px 10px;
    transition: opacity 0.12s;
  }
  .card.rejected {
    opacity: 0.42;
  }
  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .who {
    display: flex;
    flex-direction: column;
  }
  .name {
    color: var(--text);
    font-size: 14px;
    font-weight: 600;
  }
  .race {
    color: var(--text-muted);
    font-size: 11px;
    letter-spacing: 0.06em;
  }
  .toggle {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 11px;
    padding: 3px 8px;
    cursor: pointer;
    white-space: nowrap;
  }
  .toggle.on {
    color: var(--accent-hi);
    border-color: var(--border-hi);
  }
  .traits {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 6px;
  }
  .chip {
    font-size: 11px;
    padding: 1px 6px;
    border: 1px solid var(--border);
  }
  .chip.good {
    color: var(--accent-hi);
  }
  .chip.bad {
    color: var(--text-muted);
    font-style: italic;
  }
  .chip.plain {
    color: var(--text-muted);
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
