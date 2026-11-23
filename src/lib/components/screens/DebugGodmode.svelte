<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import type { StatKey } from '$lib/game/core/types';
  import { CORE_STAT_KEYS } from '$lib/game/core/types';
  import itemsData from '$lib/game/database/items/items.json';
  import ChromeButton from '$lib/components/UI/widget/ChromeButton.svelte';
  import DebugField from './DebugField.svelte';

  type NamedDef = { id: string; name?: string; category?: string };
  const ITEMS = (itemsData as unknown as NamedDef[]).filter((i) => i.category !== 'natural_weapon');

  let pawnId = $state('');
  let statKey = $state<StatKey>('strength');
  let statValue = $state(15);
  let skillLevel = $state(20);
  let equipItemId = $state(ITEMS[0]?.id ?? '');

  const pawns = $derived($gameState.pawns.filter((p) => p.isAlive !== false));
  const cmd = (type: string, payload: Record<string, unknown> = {}) =>
    gameState.command({ type, payload, save: true });

  function setStat() {
    if (pawnId) cmd('devSetPawnStats', { pawnId, stats: { [statKey]: statValue } });
  }
  function setAllSkills() {
    const pawn = pawns.find((p) => p.id === pawnId);
    if (!pawn) return;
    const skills: Record<string, number> = {};
    for (const k of Object.keys(pawn.skills ?? {})) skills[k] = skillLevel;
    cmd('devSetPawnSkills', { pawnId, skills });
  }
</script>

<h5>Godmode</h5>
<DebugField>
  <select bind:value={pawnId} aria-label="Pawn">
    <option value="">pick a pawn</option>
    {#each pawns as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
  </select>
</DebugField>
<div class="minis">
  <DebugField>
    <select bind:value={statKey} aria-label="Stat">
      {#each CORE_STAT_KEYS as k (k)}<option value={k}>{k}</option>{/each}
    </select>
    <input type="number" min="1" max="40" bind:value={statValue} aria-label="Stat value" />
  </DebugField>
  <ChromeButton disabled={!pawnId} onclick={setStat}>Set stat</ChromeButton>
</div>
<div class="minis">
  <DebugField>
    <span class="lab">Skills</span>
    <input type="number" min="1" max="50" bind:value={skillLevel} aria-label="Skill level" />
  </DebugField>
  <ChromeButton disabled={!pawnId} onclick={setAllSkills}>Set all</ChromeButton>
  <ChromeButton disabled={!pawnId} onclick={() => cmd('devGrantGrowth', { pawnId })}
    >Growth</ChromeButton
  >
</div>
<div class="minis">
  <DebugField>
    <select bind:value={equipItemId} aria-label="Gear">
      {#each ITEMS as it (it.id)}<option value={it.id}>{it.name ?? it.id}</option>{/each}
    </select>
  </DebugField>
  <ChromeButton
    disabled={!pawnId}
    onclick={() => cmd('equipPawnItem', { pawnId, itemId: equipItemId })}>Equip</ChromeButton
  >
</div>

<style>
  .lab {
    flex: 1;
    color: var(--text);
  }
</style>
