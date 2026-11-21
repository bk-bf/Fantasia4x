<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import Well from '$lib/components/UI/widget/Well.svelte';
  import PawnSkillBanner from './PawnSkillBanner.svelte';
  import PawnAttributes from './PawnAttributes.svelte';
  import TraitCards from './TraitCards.svelte';

  let { pawn }: { pawn: Pawn } = $props();
</script>

<div class="attrtab">
  <Well title="Skills" class="skillband"><PawnSkillBanner {pawn} /></Well>
  <div class="dcats">
    <PawnAttributes
      {pawn}
      showBanner={false}
      categories={['physical', 'capacity', 'combat', 'resistance', 'social']}
    />
  </div>
  <Well title="Traits" class="traits">
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
    gap: 6px;
    align-items: start;
  }
  .attrtab :global(.skillband) {
    grid-column: 1;
  }
  .dcats {
    grid-column: 1;
  }
  .attrtab :global(.traits) {
    grid-column: 2;
    grid-row: 1 / span 2;
  }
  .none {
    margin: 0;
    color: var(--text-muted);
  }
</style>
