<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { CREATURES } from '$lib/game/core/defs/creatures';
  import itemsData from '$lib/game/database/items/items.json';
  import ChromeButton from '$lib/components/UI/widget/ChromeButton.svelte';
  import DebugField from './DebugField.svelte';

  type NamedDef = { id: string; name?: string; category?: string };
  const ITEMS = (itemsData as unknown as NamedDef[]).filter((i) => i.category !== 'natural_weapon');

  let itemId = $state(ITEMS[0]?.id ?? '');
  let itemAmount = $state(50);
  let pawnCount = $state(1);
  let creatureId = $state('');
  let entityCount = $state(5);

  const cmd = (type: string, payload: Record<string, unknown> = {}) =>
    gameState.command({ type, payload, save: true });
</script>

<DebugField>
  <select bind:value={itemId} aria-label="Item">
    {#each ITEMS as it (it.id)}<option value={it.id}>{it.name ?? it.id}</option>{/each}
  </select>
  ×<input type="number" min="1" bind:value={itemAmount} aria-label="Amount" />
</DebugField>
<div class="minis">
  <ChromeButton onclick={() => cmd('devSpawnItem', { itemId, amount: itemAmount })}
    >Item</ChromeButton
  >
  <ChromeButton onclick={() => cmd('devSpawnAllItems')}>All items</ChromeButton>
  <ChromeButton onclick={() => cmd('devClearAllItems')}>Clear</ChromeButton>
</div>
<DebugField>
  <span class="lab">Pawns</span>
  ×<input type="number" min="1" bind:value={pawnCount} aria-label="Pawn count" />
</DebugField>
<div class="minis">
  <ChromeButton onclick={() => cmd('devSpawnPawns', { count: pawnCount })}>Pawns</ChromeButton>
</div>
<DebugField>
  <select bind:value={creatureId} aria-label="Creature">
    <option value="">random</option>
    {#each CREATURES as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
  </select>
  ×<input type="number" min="1" bind:value={entityCount} aria-label="Creature count" />
</DebugField>
<div class="minis">
  <ChromeButton
    onclick={() =>
      cmd('devSpawnEntities', { count: entityCount, creatureId: creatureId || undefined })}
    >Creatures</ChromeButton
  >
</div>

<style>
  .lab {
    flex: 1;
    color: var(--text);
  }
</style>
