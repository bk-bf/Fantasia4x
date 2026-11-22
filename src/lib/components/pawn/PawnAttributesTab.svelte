<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import Well from '$lib/components/UI/widget/Well.svelte';
  import ScrollArea from '$lib/components/UI/widget/ScrollArea.svelte';
  import PawnSkillBanner from './PawnSkillBanner.svelte';
  import PawnAttributes from './PawnAttributes.svelte';
  import TraitCards from './TraitCards.svelte';

  let { pawn }: { pawn: Pawn } = $props();
</script>

<div class="attrtab">
  <Well title="Skills" class="skillband"><PawnSkillBanner {pawn} /></Well>
  <ScrollArea class="dcats">
    <PawnAttributes
      {pawn}
      showBanner={false}
      categories={['physical', 'capacity', 'combat', 'resistance', 'social']}
    />
  </ScrollArea>
  <Well title="Traits" class="traits" scroll>
    {#if pawn.traits?.length}
      <TraitCards traits={pawn.traits} {pawn} list />
    {:else}
      <p class="none">Nothing sets them apart yet.</p>
    {/if}
  </Well>
</div>

<style>
  .attrtab {
    display: grid;
    grid-template-columns: 1fr 260px;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 6px;
    align-items: start;
    height: 414px;
  }
  .attrtab :global(.skillband) {
    grid-column: 1;
  }
  .attrtab :global(.dcats) {
    grid-column: 1;
    align-self: stretch;
  }
  .attrtab :global(.traits) {
    grid-column: 2;
    grid-row: 1 / span 2;
    align-self: stretch;
  }
  .none {
    margin: 0;
    color: var(--text-muted);
  }
</style>
