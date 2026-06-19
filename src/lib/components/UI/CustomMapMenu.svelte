<script lang="ts">
  // Custom Map popup — tune world generation, then GENERATE on demand.
  //  • SIZE toggles (S/M/L/XL) pick the world dimensions for the next generate.
  //  • Each biome has ONE "share" slider (0 = none, 100 = only it). Moving one rebalances the
  //    UNLOCKED others proportionally so the shares always partition the elevation axis. A 🔒 per row
  //    pins that slider so it's left untouched when you tweak another.
  //  • WATER is decoupled from biomes (its own field) — one slider for global water coverage.
  // Nothing regenerates until you press GENERATE: tweaking sliders / editing the seed only stages
  // settings, so you can copy the current seed or fiddle freely without the map being rewritten, and
  // closing the popup leaves the existing world untouched.
  import { get } from 'svelte/store';
  import { gameState } from '$lib/stores/gameState';
  import {
    getBiomeConfig,
    applyBiomeShares,
    setBiomeField,
    resetBiomeConfig,
    getWaterLevel,
    setWaterLevel,
    type BiomeConfigEntry
  } from '$lib/game/core/Terrains';

  let { onClose }: { onClose: () => void } = $props();

  let biomes = $state<BiomeConfigEntry[]>(getBiomeConfig());
  let seed = $state<number>((get(gameState)?.seed ?? Date.now()) >>> 0);
  let locked = $state<Set<string>>(new Set());
  let water = $state<number>(Math.round(getWaterLevel() * 100));

  // Map-size presets (square). Default world is 240×160 — none highlighted until you pick one.
  const SIZES = [
    { label: 'S', dim: 250 },
    { label: 'M', dim: 500 },
    { label: 'L', dim: 750 },
    { label: 'XL', dim: 1000 }
  ];
  let size = $state<number>(gameState.getMapSize().w);

  // The only thing that actually rewrites the world. Real (non-preview) regen so pawns + creatures
  // are re-placed on valid forest/plains/swamp land — the popup can stay open to tweak & regenerate.
  function generate() {
    gameState.regenWorld(seed);
  }

  function toggleLock(id: string) {
    const n = new Set(locked);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    locked = n;
  }

  // Set one biome's share to `pct`%, then spread the remaining across the UNLOCKED others in
  // proportion to their current shares. Locked biomes keep their share, so a pinned slider never
  // drifts when you adjust a different one.
  function setShare(id: string, pct: number) {
    const lockedOthers = biomes.filter((b) => b.id !== id && locked.has(b.id));
    const freeOthers = biomes.filter((b) => b.id !== id && !locked.has(b.id));
    const lockedTotal = lockedOthers.reduce((s, b) => s + b.share, 0);
    // Can't claim more than the locked sliders leave free.
    const newShare = Math.max(0, Math.min(pct / 100, 1 - lockedTotal));
    const freeTotal = freeOthers.reduce((s, b) => s + b.share, 0);
    const remaining = Math.max(0, 1 - lockedTotal - newShare);
    const next: Record<string, number> = { [id]: newShare };
    for (const b of lockedOthers) next[b.id] = b.share;
    if (freeOthers.length === 0) {
      // Nothing free to absorb the change — fold the remainder back into the edited slider.
      next[id] = newShare + remaining;
    } else if (freeTotal > 1e-6) {
      for (const b of freeOthers) next[b.id] = (b.share / freeTotal) * remaining;
    } else {
      for (const b of freeOthers) next[b.id] = remaining / freeOthers.length;
    }
    applyBiomeShares(next);
    biomes = getBiomeConfig();
  }

  function setWater(pct: number) {
    water = pct;
    setWaterLevel(pct / 100);
  }

  function climate(id: string, field: 'baseTemp' | 'baseMoisture', e: Event) {
    setBiomeField(id, field, Number((e.currentTarget as HTMLInputElement).value));
    biomes = getBiomeConfig();
  }

  function setSize(dim: number) {
    size = dim;
    gameState.setMapSize(dim, dim);
  }

  function reset() {
    resetBiomeConfig();
    biomes = getBiomeConfig();
    water = Math.round(getWaterLevel() * 100);
    locked = new Set();
  }
  function rollSeed() {
    seed = Date.now() >>> 0 || 1;
  }
</script>

<div class="custom-map">
  <div class="cm-hdr">
    | CUSTOM MAP
    <span class="size-group">
      <span class="size-lbl">size</span>
      {#each SIZES as s (s.dim)}
        <button
          class="cm-btn"
          class:active={size === s.dim}
          onclick={() => setSize(s.dim)}
          title={`${s.dim}×${s.dim}`}>{s.label}</button
        >
      {/each}
    </span>
    <label class="seed"
      >seed
      <input
        class="seed-in"
        type="number"
        value={seed}
        onchange={(e) => {
          seed = Number((e.currentTarget as HTMLInputElement).value) >>> 0 || 1;
        }}
      /></label
    >
    <button class="cm-btn" onclick={rollSeed} title="stage a new random seed (press GENERATE to apply)"
      >⟳</button
    >
    <button class="cm-btn" onclick={reset} title="restore terrains.jsonc defaults">reset</button>
    <button class="cm-btn generate" onclick={generate} title="regenerate the world with these settings"
      >GENERATE</button
    >
    <button class="cm-btn close" onclick={onClose} title="close (keeps current map)">✕</button>
  </div>
  <div class="cm-note">
    Biome share — 0 removes it, 100 fills the map; unlocked ones rebalance. 🔒 pins a slider. Water
    is independent of biome. Settings only apply when you press <strong>GENERATE</strong>.
  </div>

  <div class="cm-grid">
    <span class="col-h"></span>
    <span class="col-h">BIOME</span>
    <span class="col-h">SHARE %</span>
    <span class="col-h">TEMP °C</span>
    <span class="col-h">MOISTURE</span>
    {#each biomes as b (b.id)}
      <button
        class="lock"
        class:on={locked.has(b.id)}
        onclick={() => toggleLock(b.id)}
        title={locked.has(b.id) ? 'unlock' : 'lock share'}>{locked.has(b.id) ? '🔒' : '🔓'}</button
      >
      <span class="bname">{b.displayName}</span>
      <label class="cell">
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          disabled={locked.has(b.id)}
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
    <!-- Water row: a single decoupled slider, independent of the biome bands above. -->
    <span class="col-h water-sep"></span>
    <span class="bname water-name">Water</span>
    <label class="cell">
      <input
        type="range"
        min="0"
        max="80"
        step="1"
        value={water}
        oninput={(e) => setWater(Number((e.currentTarget as HTMLInputElement).value))}
      />
      <span class="val">{water}</span>
    </label>
    <span class="cell muted">lakes & seas in any lowland</span>
  </div>
</div>

<style>
  .custom-map {
    position: fixed;
    bottom: 40px; /* clear the 30px bottom nav bar + a small gap */
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
  .size-group {
    display: flex;
    align-items: center;
    gap: 3px;
    margin-left: 14px;
  }
  .size-lbl {
    color: var(--text-muted);
    letter-spacing: 0;
    font-size: 10px;
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
  .cm-btn.active {
    color: #fff;
    border-color: var(--accent-hi);
    background: var(--tab-active);
  }
  .cm-btn.generate {
    color: #fff;
    border-color: var(--accent-hi);
    background: var(--tab-active);
    letter-spacing: 0.06em;
    font-weight: bold;
  }
  .cm-btn.generate:hover {
    border-color: var(--accent-hi);
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
    grid-template-columns: 18px 90px 1fr 1fr 1fr;
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
  .lock {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 11px;
    padding: 0;
    line-height: 1;
    opacity: 0.55;
  }
  .lock.on {
    opacity: 1;
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
  .cell input:disabled {
    opacity: 0.4;
  }
  .val {
    width: 30px;
    text-align: right;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
    font-size: 10px;
  }
  .water-sep {
    border-top: 1px solid var(--border);
    margin-top: 4px;
    padding-top: 0;
    border-bottom: none;
  }
  .water-name {
    color: #61cce8;
  }
  .muted {
    color: var(--text-muted);
    font-size: 10px;
  }
</style>
