<script lang="ts">
  // Custom Map popup — live-tune biome generation and regenerate the world as you drag.
  // Each biome has ONE "share" slider (0 = none of that terrain, 100 = only it). Moving one
  // rebalances the others proportionally so the shares always partition the elevation axis — no
  // raw min/max bands to juggle. `applyBiomeShares` rewrites BIOMES' contiguous density ranges,
  // which `pickBiome` reads on the next `regenWorld`.
  import { get } from 'svelte/store';
  import { gameState } from '$lib/stores/gameState';
  import {
    getBiomeConfig,
    applyBiomeShares,
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

  // Set one biome's share to `pct`% and spread the remaining (100−pct)% across the others in
  // proportion to their current shares — so the sliders counterbalance and always sum to 100%.
  function setShare(id: string, pct: number) {
    const newShare = Math.max(0, Math.min(1, pct / 100));
    const others = biomes.filter((b) => b.id !== id);
    const othersTotal = others.reduce((s, b) => s + b.share, 0);
    const remaining = 1 - newShare;
    const next: Record<string, number> = { [id]: newShare };
    if (othersTotal > 1e-6) for (const b of others) next[b.id] = (b.share / othersTotal) * remaining;
    else for (const b of others) next[b.id] = remaining / others.length;
    applyBiomeShares(next);
    biomes = getBiomeConfig();
    scheduleRegen();
  }

  function climate(id: string, field: 'baseTemp' | 'baseMoisture', e: Event) {
    setBiomeField(id, field, Number((e.currentTarget as HTMLInputElement).value));
    biomes = getBiomeConfig();
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
    Each biome's share of the world — 0 removes it, 100 fills the map; the rest rebalance to match.
  </div>

  <div class="cm-grid">
    <span class="col-h">BIOME</span>
    <span class="col-h">SHARE %</span>
    <span class="col-h">TEMP °C</span>
    <span class="col-h">MOISTURE</span>
    {#each biomes as b (b.id)}
      <span class="bname">{b.displayName}</span>
      <label class="cell">
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={Math.round(b.share * 100)}
          oninput={(e) => setShare(b.id, Number((e.currentTarget as HTMLInputElement).value))}
        />
        <span class="val">{Math.round(b.share * 100)}</span>
      </label>
      <label class="cell">
        <input
          type="range"
          min="-20"
          max="40"
          step="1"
          value={b.baseTemp}
          oninput={(e) => climate(b.id, 'baseTemp', e)}
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
          oninput={(e) => climate(b.id, 'baseMoisture', e)}
        />
        <span class="val">{b.baseMoisture}</span>
      </label>
    {/each}
  </div>
</div>

<style>
  .custom-map {
    position: fixed;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1200; /* above the WebGL canvas overlays (which reach z-index 999) */
    width: min(1100px, 96vw);
    max-height: 46vh;
    overflow-y: auto;
    overflow-x: hidden;
    background: var(--bg-panel);
    border: 1px solid var(--border-hi);
    color: var(--text);
    font-family: 'Courier New', monospace;
    font-size: 11px;
    padding: 6px 12px 10px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.7);
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
    width: 96px;
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
    grid-template-columns: 90px 1fr 1fr 1fr;
    gap: 5px 16px;
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
    white-space: nowrap;
  }
  .cell {
    display: flex;
    align-items: center;
    gap: 8px;
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
