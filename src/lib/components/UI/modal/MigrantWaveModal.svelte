<script lang="ts">
  import type { MigrantWaveEvent } from '$lib/game/core/types';
  import { chrome } from '$lib/pixelArt/chrome';
  import { describePawnAbilities } from '$lib/components/util/pawnBlurb';
  import ChromeButton from '$lib/components/UI/widget/ChromeButton.svelte';
  import PawnSprite from '$lib/components/UI/widget/PawnSprite.svelte';
  import ModalWindow from '$lib/components/UI/window/ModalWindow.svelte';

  let { event, onResolve }: { event: MigrantWaveEvent; onResolve: (ids: string[]) => void } =
    $props();

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

<ModalWindow id="event" title="Migrants arrive" width={440} onclose={confirm}>
  <p class="lore">
    {event.candidates.length === 1
      ? 'A wanderer has reached your colony, hoping to join.'
      : `${event.candidates.length} wanderers have reached your colony, hoping to join.`}
  </p>
  <div class="cards">
    {#each event.candidates as c (c.id)}
      {@const blurb = describePawnAbilities(c)}
      {@const yes = isAccepted(c.id)}
      <div class="mig" class:off={!yes} {@attach chrome('cell')}>
        <span class="frame" {@attach chrome('well')}>
          <PawnSprite pawn={c} height={40} />
        </span>
        <div class="who">
          <b>{c.name}</b><em>{c.cultureName}</em>
          <div class="pills">
            {#each blurb.strengths as s (s)}<span class="pill good">{s}</span>{/each}
            {#each blurb.weaknesses as w (w)}<span class="pill warn">{w}</span>{/each}
            {#if blurb.strengths.length === 0 && blurb.weaknesses.length === 0}
              <span class="pill">of unremarkable ability</span>
            {/if}
          </div>
        </div>
        <ChromeButton on={yes} glyph={yes ? undefined : 'x'} onclick={() => toggle(c.id)}>
          {yes ? 'Welcome' : 'Turn away'}
        </ChromeButton>
      </div>
    {/each}
  </div>
  <div class="foot">
    <ChromeButton kind="verb" onclick={confirm}>
      {acceptedCount === 0
        ? 'Turn them all away'
        : acceptedCount === 1
          ? 'Welcome 1 migrant'
          : `Welcome ${acceptedCount} migrants`}
    </ChromeButton>
  </div>
</ModalWindow>

<style>
  .lore {
    margin: 0;
    color: var(--text-dim);
    line-height: 17px;
  }
  .cards {
    max-height: 56vh;
    overflow-y: auto;
  }
  .mig {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-top: 5px;
    padding: 5px 6px;
  }
  .mig.off {
    opacity: 0.55;
  }
  .frame {
    display: grid;
    place-items: end center;
    flex: none;
    width: 46px;
    height: 46px;
  }
  .who {
    flex: 1;
    min-width: 0;
  }
  b {
    margin-right: 8px;
    font-weight: normal;
    color: var(--text);
  }
  em {
    font-style: normal;
    color: var(--text-muted);
  }
  .pills {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    margin-top: 2px;
  }
  .pill {
    padding: 0 5px;
    box-shadow: inset 0 0 0 1px var(--text-muted);
    color: var(--text-dim);
    white-space: nowrap;
  }
  .pill.good {
    color: var(--pos);
  }
  .pill.warn {
    color: var(--accent);
  }
  .mig :global(.cbtn) {
    width: 92px;
    flex: none;
  }
  .foot {
    display: flex;
    justify-content: flex-end;
    margin-top: 10px;
  }
</style>
