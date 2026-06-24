<!--
  DebugMenu — left pane of the DEBUG tab (menu | log). Dev-only buttons that dispatch the
  worker-safe `dev*` commands in sim/commands.ts: spawn items / pawns / entities, change weather &
  season, and arm map click-brushes (regrow / spawn building / spawn resource). The click-brushes
  drop you onto the map; clicking a tile applies the brush until you stop it.
-->
<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { resourceObjectService } from '$lib/game/services/ResourceObjectService';
  import { CREATURES } from '$lib/game/core/Creatures';
  import {
    WEATHER_IDS,
    WEATHER_LABELS,
    SEASON_IDS,
    SEASON_LABELS
  } from '$lib/game/services/EnvironmentService';
  import type { Season } from '$lib/game/core/types';
  import itemsData from '$lib/game/database/items.jsonc';
  import buildingsData from '$lib/game/database/buildings.jsonc';
  import AudioNowPlaying from '$lib/components/UI/AudioNowPlaying.svelte';

  type NamedDef = { id: string; name?: string; category?: string };
  const ITEMS = (itemsData as unknown as NamedDef[]).filter((i) => i.category !== 'natural_weapon');
  const BUILDINGS = buildingsData as unknown as NamedDef[];
  const RESOURCES = resourceObjectService.getAll();
  const label = (d: { name?: string; displayName?: string; id: string }) =>
    d.name ?? d.displayName ?? d.id;

  // Selections
  let itemId = $state(ITEMS[0]?.id ?? '');
  let itemAmount = $state(50);
  let pawnCount = $state(1);
  let creatureId = $state(''); // '' = random
  let entityCount = $state(5);
  let buildingId = $state(BUILDINGS[0]?.id ?? '');
  let resourceId = $state(RESOURCES[0]?.id ?? '');
  let snowValue = $state(0);

  const brush = $derived($uiState.debugBrush);
  const cmd = (type: string, payload: Record<string, unknown> = {}) =>
    gameState.command({ type, payload, save: true });

  function setWeather(e: Event) {
    cmd('setWeather', { type: (e.target as HTMLSelectElement).value });
  }
  function setSeason(e: Event) {
    const v = (e.target as HTMLSelectElement).value;
    cmd('setSeason', { season: v === '' ? null : (v as Season) });
  }

  // Time-of-day presets (fraction of day; 0=midnight, 0.5=noon) for testing weather at day/night.
  const TIME_OF_DAY: { label: string; value: number }[] = [
    { label: 'Dawn', value: 0.3 },
    { label: 'Day (noon)', value: 0.5 },
    { label: 'Dusk', value: 0.82 },
    { label: 'Night', value: 0.0 }
  ];
  function setTimeOfDay(e: Event) {
    const v = (e.target as HTMLSelectElement).value;
    cmd('setTimeOfDay', { timeOfDay: v === '' ? null : Number(v) });
  }
  function armBrush(kind: 'regrow' | 'building' | 'resource', id: string | null = null) {
    if (brush?.kind === kind) uiState.deactivateDebugBrush();
    else uiState.activateDebugBrush(kind, id);
  }
  function setMapSnow(v: number) {
    snowValue = v;
    cmd('devSetMapSnow', { value: v });
  }
</script>

<div class="menu">
  <AudioNowPlaying />

  <section>
    <h4>Items</h4>
    <div class="row">
      <select bind:value={itemId}>
        {#each ITEMS as it (it.id)}<option value={it.id}>{label(it)}</option>{/each}
      </select>
      <input type="number" min="1" bind:value={itemAmount} title="amount" />
    </div>
    <div class="row">
      <button onclick={() => cmd('devSpawnItem', { itemId, amount: itemAmount })}>Spawn item</button
      >
      <button onclick={() => cmd('devSpawnAllItems')}>Spawn all</button>
      <button onclick={() => cmd('devClearAllItems')}>Clear all</button>
    </div>
  </section>

  <section>
    <h4>Pawns</h4>
    <div class="row">
      <input type="number" min="1" bind:value={pawnCount} title="count" />
      <button onclick={() => cmd('devSpawnPawns', { count: pawnCount })}>Spawn pawns</button>
    </div>
  </section>

  <section>
    <h4>Entities</h4>
    <div class="row">
      <select bind:value={creatureId}>
        <option value="">random</option>
        {#each CREATURES as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
      </select>
      <input type="number" min="1" bind:value={entityCount} title="count" />
    </div>
    <button
      onclick={() =>
        cmd('devSpawnEntities', { count: entityCount, creatureId: creatureId || undefined })}
      >Spawn entities</button
    >
  </section>

  <section>
    <h4>Weather</h4>
    <select value={$gameState.weather?.type ?? 'clear'} onchange={setWeather}>
      {#each WEATHER_IDS as w (w)}<option value={w}>{w} — {WEATHER_LABELS[w]}</option>{/each}
    </select>
  </section>

  <section>
    <h4>Season</h4>
    <select value={$gameState._debugSeason ?? ''} onchange={setSeason}>
      <option value="">natural (turn)</option>
      {#each SEASON_IDS as s (s)}<option value={s}>{SEASON_LABELS[s]}</option>{/each}
    </select>
  </section>

  <section>
    <h4>Time of day</h4>
    <select value={$gameState._debugTimeOfDay ?? ''} onchange={setTimeOfDay}>
      <option value="">natural (turn)</option>
      {#each TIME_OF_DAY as t (t.label)}<option value={t.value}>{t.label}</option>{/each}
    </select>
  </section>

  <section>
    <h4>Gating <span class="hint">(dev)</span></h4>
    <label class="check-row">
      <input
        type="checkbox"
        checked={!!$gameState._devResearchGateOff}
        onchange={(e) => cmd('setResearchGateOff', { off: (e.target as HTMLInputElement).checked })}
      />
      Research gate off <span class="hint">(show + allow unresearched recipes & buildings)</span>
    </label>
  </section>

  <section>
    <h4>Snow cover <span class="hint">(× tile wetness)</span></h4>
    <div class="row">
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={snowValue}
        oninput={(e) => setMapSnow(Number((e.target as HTMLInputElement).value))}
      />
      <input
        type="number"
        min="0"
        max="100"
        bind:value={snowValue}
        onchange={() => setMapSnow(snowValue)}
      />
    </div>
    <button onclick={() => setMapSnow(0)}>Clear snow</button>
  </section>

  <section>
    <h4>Map brushes <span class="hint">(click tiles)</span></h4>
    <button class:active={brush?.kind === 'regrow'} onclick={() => armBrush('regrow')}>
      {brush?.kind === 'regrow' ? '■ ' : ''}Regrow resource
    </button>
    <div class="row">
      <select bind:value={buildingId}>
        {#each BUILDINGS as b (b.id)}<option value={b.id}>{label(b)}</option>{/each}
      </select>
      <button
        class:active={brush?.kind === 'building'}
        onclick={() => armBrush('building', buildingId)}
      >
        {brush?.kind === 'building' ? '■ ' : ''}Spawn
      </button>
    </div>
    <div class="row">
      <select bind:value={resourceId}>
        {#each RESOURCES as r (r.id)}<option value={r.id}>{label(r)}</option>{/each}
      </select>
      <button
        class:active={brush?.kind === 'resource'}
        onclick={() => armBrush('resource', resourceId)}
      >
        {brush?.kind === 'resource' ? '■ ' : ''}Spawn
      </button>
    </div>
    {#if brush}
      <button class="stop" onclick={() => uiState.deactivateDebugBrush()}>Stop brush</button>
    {/if}
  </section>
</div>

<!--
  Visual language taken from BuildingFuelPanel (the fuel info panel): dark amber/brown terminal
  palette, Courier New, uppercase block labels with top-border separators, and the `fuel-mini-btn`
  button + `fuel-threshold-num` input/select treatment.
-->
<style>
  .menu {
    display: flex;
    flex-direction: column;
    gap: 0;
    overflow-y: auto;
    padding: 6px 8px;
    background: rgba(13, 9, 3, 0.98);
    color: #d4a860;
    font-family: var(--font-mono);
    font-size: 9px;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 5px;
    padding-top: 5px;
    border-top: 1px solid rgba(122, 94, 40, 0.6);
  }
  section:first-child {
    margin-top: 0;
    padding-top: 0;
    border-top: none;
  }
  h4 {
    margin: 0;
    font-size: 9px;
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
    font-size: 9px;
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
  input[type='range'] {
    flex: 1;
    padding: 0;
    accent-color: #c8a048;
    background: transparent;
    border: none;
  }
  button {
    background: #160f06;
    border: 1px solid #6b4f22;
    color: #d0a858;
    font-family: var(--font-mono);
    font-size: 9px;
    padding: 2px 6px;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  button:hover {
    background: #24180a;
    border-color: #b07a28;
    color: #f0c878;
  }
  button.active {
    background: #2a1a08;
    border-color: #e0a848;
    color: #f0c060;
  }
  button.stop {
    color: #d98a6a;
    border-color: #8a4a2a;
  }
  button.stop:hover {
    background: #2a1408;
    border-color: #c0683a;
    color: #f0a878;
  }
</style>
