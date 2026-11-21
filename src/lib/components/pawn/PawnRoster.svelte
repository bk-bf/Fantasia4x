<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { stateLabel } from '$lib/game/core/defs/states';
  import { chrome } from '$lib/pixelArt/chrome';
  import PawnSprite from '$lib/components/UI/widget/PawnSprite.svelte';

  let {
    pawns,
    selected,
    onSelect
  }: { pawns: Pawn[]; selected: Pawn | null; onSelect: (p: Pawn) => void } = $props();

  const first = (name: string) => name.split(' ')[0];
</script>

<div class="roster">
  {#each pawns as p (p.id)}
    {@const on = selected?.id === p.id}
    <button
      class="chip"
      class:on
      title={p.name}
      onclick={() => onSelect(p)}
      {@attach chrome(on ? 'cellOn' : 'cell')}
    >
      <PawnSprite id={p.id} cultureId={p.cultureId} height={40} />
      <span class="who"><b>{first(p.name)}</b><em>{stateLabel(p.currentState)}</em></span>
    </button>
  {/each}
</div>

<style>
  .roster {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }
  .chip {
    flex: 1 1 0;
    min-width: 96px;
    max-width: 190px;
    height: 44px;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 2px 8px 2px 5px;
    border: 0;
    background: none;
    color: var(--text);
    font: 16px/18px var(--font-pixel);
    text-align: left;
    cursor: pointer;
  }
  .who {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  b,
  em {
    font-weight: normal;
    font-style: normal;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  em {
    color: var(--text-muted);
  }
  .on b,
  .on em {
    color: var(--ember);
  }
</style>
