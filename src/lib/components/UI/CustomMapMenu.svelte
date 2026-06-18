<script lang="ts">
  // Custom Map popup — live-edits the terrains.jsonc biome config (density bands + climate) and
  // regenerates the world as you drag the sliders. `pickBiome` reads BIOMES directly, so
  // `setBiomeField` + `regenWorld(seed)` is all the wiring needed. Density ranges are scanned in
  // order and should stay contiguous (a gap → bare land in that band; that's fine for experimenting).
  import { get } from 'svelte/store';
  import { gameState } from '$lib/stores/gameState';
  import {
    getBiomeConfig,
    setBiomeField,
    resetBiomeConfig,
    type BiomeConfigEntry
  } from '$lib/game/core/Terrains';

  let { onClose }: { onClose: () => void } = $props();

  let biomes = $state<BiomeConfigEntry[]>(getBiomeConfig());
  let seed = $state<number>((get(gameState)?.seed ?? Date.now()) >>> 0);

  // Debounce: regenerating the 240×160 world on every drag tick would thrash, so coalesce to ~120ms.
  let regenTimer: ReturnType<typeof setTimeout> | undefined;
  function scheduleRegen() {
    clearTimeout(regenTimer);
    regenTimer = setTimeout(() => gameState.regenWorld(seed), 120);
  }

  function edit(id: string, field: 'min' | 'max' | 'baseTemp' | 'baseMoisture', e: Event) {
    const value = Number((e.currentTarget as HTMLInputElement).value);
    setBiomeField(id, field, value);
    biomes = getBiomeConfig(); // refresh value labels
    scheduleRegen();
  }
  function reset() {
    resetBiomeConfig();
    biomes = getBiomeConfig();
    scheduleRegen();
  }
  function rollSeed() {
    seed = Date.now() >>> 0 || 1;
    gameState.regenWorld(seed);
  }
</script>

<div class="custom-map">
  <div class="cm-hdr">
    | CUSTOM MAP
    <label class="seed"
      >seed
      <input
        class="seed-in"
        type="number"
        value={seed}
        onchange={(e) => {
          seed = Number((e.currentTarget as HTMLInputElement).value) >>> 0 || 1;
          gameState.regenWorld(seed);
        }}
      /></label
    >
    <button class="cm-btn" onclick={rollSeed} title="new random seed">⟳</button>
    <button class="cm-btn" onclick={reset} title="restore terrains.jsonc defaults">reset</button>
    <button class="cm-btn close" onclick={onClose} title="close">✕</button>
  </div>
  <div class="cm-note">
    Density bands partition the elevation noise (0–1) into biomes — drag to repaint the world live.
  </div>

  <div class="cm-grid">
    <span class="col-h">BIOME</span>
    <span class="col-h">density min</span>
    <span class="col-h">density max</span>
    <span class="col-h">temp °C</span>
    <span class="col-h">moisture</span>
    {#each biomes as b (b.id)}
      <span class="bname">{b.displayName}</span>
      <label class="cell">
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={b.densityRange[0]}
          oninput={(e) => edit(b.id, 'min', e)}
        />
        <span class="val">{b.densityRange[0].toFixed(2)}</span>
      </label>
      <label class="cell">
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={b.densityRange[1]}
          oninput={(e) => edit(b.id, 'max', e)}
        />
        <span class="val">{b.densityRange[1].toFixed(2)}</span>
      </label>
      <label class="cell">
        <input
          type="range"
          min="-20"
          max="40"
          step="1"
          value={b.baseTemp}
          oninput={(e) => edit(b.id, 'baseTemp', e)}
        />
        <span class="val">{b.baseTemp}</span>
      </label>
      <label class="cell">
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={b.baseMoisture}
          oninput={(e) => edit(b.id, 'baseMoisture', e)}
        />
        <span class="val">{b.baseMoisture}</span>
      </label>
    {/each}
  </div>
</div>

<style>
  .custom-map {
    position: fixed;
    top: 44px;
    left: 8px;
    z-index: 1200; /* above the WebGL canvas overlays (which reach z-index 999) */
    width: 420px;
    max-height: calc(100vh - 56px);
    overflow-y: auto;
    background: var(--bg-panel);
    border: 1px solid var(--border-hi);
    color: var(--text);
    font-family: 'Courier New', monospace;
    font-size: 11px;
    padding: 6px 8px 10px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
  }
  .cm-hdr {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--accent-hi);
    letter-spacing: 0.08em;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--border);
  }
  .seed {
    margin-left: auto;
    color: var(--text-muted);
    letter-spacing: 0;
    font-size: 10px;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .seed-in {
    width: 92px;
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    font-family: 'Courier New', monospace;
    font-size: 10px;
    padding: 1px 4px;
  }
  .cm-btn {
    padding: 1px 6px;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-family: 'Courier New', monospace;
    font-size: 10px;
    cursor: pointer;
  }
  .cm-btn:hover {
    color: var(--text);
    border-color: var(--border-hi);
  }
  .cm-btn.close {
    color: var(--neg);
  }
  .cm-note {
    color: var(--text-muted);
    font-size: 10px;
    padding: 5px 0;
  }
  .cm-grid {
    display: grid;
    grid-template-columns: 1.1fr 1.4fr 1.4fr 1.2fr 1.2fr;
    gap: 3px 6px;
    align-items: center;
  }
  .col-h {
    color: var(--text-muted);
    font-size: 9px;
    letter-spacing: 0.04em;
    border-bottom: 1px solid var(--border);
    padding-bottom: 2px;
  }
  .bname {
    color: var(--text);
  }
  .cell {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .cell input {
    flex: 1;
    min-width: 0;
    accent-color: var(--accent-hi);
  }
  .val {
    width: 30px;
    text-align: right;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
    font-size: 10px;
  }
</style>
