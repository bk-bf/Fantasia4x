<!--
  DebugGodmode — HEADLESS-SIM (ADR-033) godmode sub-panel of the DEBUG tab: scenario presets,
  per-need accrual freezes, per-pawn stat/skill/growth/equip grants, and instant research. Extracted
  from DebugMenu (200-line component rule); dispatches the same worker-safe `dev*` commands the
  /api/sim driver uses, so the browser and curl steer the sim through one registry.
  Styling mirrors DebugMenu (BuildingFuelPanel visual language).
-->
<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { SCENARIO_PRESETS } from '$lib/game/headless/scenarios/presets';
  import type { DisableableNeed, StatKey } from '$lib/game/core/types';
  import itemsData from '$lib/game/database/items/items.jsonc';

  type NamedDef = { id: string; name?: string; category?: string };
  const ITEMS = (itemsData as unknown as NamedDef[]).filter((i) => i.category !== 'natural_weapon');

  const NEEDS: Array<{ key: DisableableNeed; label: string }> = [
    { key: 'hunger', label: 'Hunger' },
    { key: 'fatigue', label: 'Fatigue' },
    { key: 'thirst', label: 'Thirst' },
    { key: 'hygiene', label: 'Hygiene' },
    { key: 'wetness', label: 'Wetness' },
    { key: 'relaxation', label: 'Relaxation' },
    { key: 'mobHunger', label: 'Creature hunger' }
  ];
  const STAT_KEYS: StatKey[] = [
    'strength',
    'dexterity',
    'intelligence',
    'perception',
    'charisma',
    'constitution'
  ];

  let presetId = $state(SCENARIO_PRESETS[0]?.id ?? '');
  let pawnId = $state('');
  let statKey = $state<StatKey>('strength');
  let statValue = $state(15);
  let skillLevel = $state(20);
  let equipItemId = $state(ITEMS[0]?.id ?? '');
  let toolTier = $state(3);

  const pawns = $derived($gameState.pawns.filter((p) => p.isAlive !== false));
  const needsOff = $derived($gameState._needsDisabled ?? {});
  const preset = $derived(SCENARIO_PRESETS.find((p) => p.id === presetId));

  const cmd = (type: string, payload: Record<string, unknown> = {}) =>
    gameState.command({ type, payload, save: true });

  function toggleNeed(key: DisableableNeed, e: Event) {
    cmd('devToggleNeed', { need: key, off: (e.target as HTMLInputElement).checked });
  }
  function setStat() {
    if (pawnId) cmd('devSetPawnStats', { pawnId, stats: { [statKey]: statValue } });
  }
  function setAllSkills() {
    if (!pawnId) return;
    const pawn = pawns.find((p) => p.id === pawnId);
    if (!pawn) return;
    const skills: Record<string, number> = {};
    for (const k of Object.keys(pawn.skills ?? {})) skills[k] = skillLevel;
    cmd('devSetPawnSkills', { pawnId, skills });
  }
</script>

<section>
  <h4>Scenario <span class="hint">(swap the live game — own save slot)</span></h4>
  <select bind:value={presetId}>
    {#each SCENARIO_PRESETS as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
  </select>
  {#if preset}<div class="hint">{preset.description}</div>{/if}
  <button onclick={() => gameState.loadScenarioPreset(presetId)}>Load scenario</button>
</section>

<section>
  <h4>Needs <span class="hint">(freeze a meter where it is)</span></h4>
  {#each NEEDS as n (n.key)}
    <label class="check-row">
      <input type="checkbox" checked={!!needsOff[n.key]} onchange={(e) => toggleNeed(n.key, e)} />
      {n.label} frozen
    </label>
  {/each}
</section>

<section>
  <h4>Pawn godmode</h4>
  <select bind:value={pawnId}>
    <option value="">— pick a pawn —</option>
    {#each pawns as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
  </select>
  <div class="row">
    <select bind:value={statKey}>
      {#each STAT_KEYS as k (k)}<option value={k}>{k}</option>{/each}
    </select>
    <input type="number" min="1" max="40" bind:value={statValue} title="value" />
    <button disabled={!pawnId} onclick={setStat}>Set stat</button>
  </div>
  <div class="row">
    <input type="number" min="1" max="50" bind:value={skillLevel} title="level" />
    <button disabled={!pawnId} onclick={setAllSkills}>Set all skills</button>
    <button disabled={!pawnId} onclick={() => cmd('devGrantGrowth', { pawnId })}
      >Grant growth</button
    >
  </div>
  <div class="row">
    <select bind:value={equipItemId}>
      {#each ITEMS as it (it.id)}<option value={it.id}>{it.name ?? it.id}</option>{/each}
    </select>
    <button disabled={!pawnId} onclick={() => cmd('equipPawnItem', { pawnId, itemId: equipItemId })}
      >Equip</button
    >
  </div>
</section>

<section>
  <h4>Research</h4>
  <div class="row">
    <button onclick={() => cmd('devUnlockResearch', { all: true })}>Unlock all research</button>
  </div>
  <div class="row">
    <input type="number" min="0" max="6" bind:value={toolTier} title="tool tier" />
    <button onclick={() => cmd('devSetToolTier', { tier: toolTier })}>Set tool tier</button>
  </div>
</section>

<style>
  /* Mirrors DebugMenu's section styling (shared DEBUG-tab visual language). */
  section {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 5px;
    padding-top: 5px;
    border-top: 1px solid rgba(122, 94, 40, 0.6);
  }
  h4 {
    margin: 0;
    font-size: 10px;
    color: #c8a048;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .hint {
    color: #9a7c40;
    text-transform: none;
    font-weight: normal;
  }
  .row {
    display: flex;
    gap: 4px;
  }
  .check-row {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }
  .check-row input {
    width: auto;
  }
  select,
  input {
    background: #140e04;
    color: #e0b868;
    border: 1px solid #6a4e20;
    font-family: var(--font-mono);
    font-size: 10px;
    padding: 2px 4px;
    min-width: 0;
  }
  select:focus,
  input:focus {
    outline: none;
    border-color: #c88a30;
    background: #1c1407;
    color: #f0c878;
  }
  select {
    flex: 1;
  }
  input[type='number'] {
    width: 3.5em;
    appearance: textfield;
  }
  button {
    background: #160f06;
    border: 1px solid #6b4f22;
    color: #d0a858;
    font-family: var(--font-mono);
    font-size: 10px;
    padding: 2px 6px;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  button:hover:not(:disabled) {
    border-color: #c88a30;
    background: #1c1407;
    color: #f0c878;
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
  }
</style>
