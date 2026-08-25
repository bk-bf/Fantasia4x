<script lang="ts">
  import { get } from 'svelte/store';
  import { onDestroy } from 'svelte';
  import { gameState } from '$lib/stores/gameState';
  import { setActiveCommitted, isActiveCommitted } from '$lib/stores/saveManager';
  import {
    getBiomeConfig,
    applyBiomeShares,
    setBiomeField,
    resetBiomeConfig,
    getWaterLevel,
    setWaterLevel,
    type BiomeConfigEntry
  } from '$lib/game/core/defs/terrains';

  let { onClose }: { onClose: () => void } = $props();

  let biomes = $state<BiomeConfigEntry[]>(getBiomeConfig());
  let seed = $state<number>((get(gameState)?.seed ?? Date.now()) >>> 0);
  let locked = $state<Set<string>>(new Set());
  let water = $state<number>(Math.round(getWaterLevel() * 100));

  const ALL_SIZES = [
    { label: 'S', dim: 250 },
    { label: 'M', dim: 500 },
    { label: 'L', dim: 750 },
    { label: 'XL', dim: 1000 }
  ];
  const isDebug = import.meta.env.VITE_DEBUG_MODE === 'true';
  const SIZES = isDebug ? ALL_SIZES : ALL_SIZES.filter((s) => s.label !== 'XL');
  const L_DIM = 750;
  let size = $state<number>(gameState.getMapSize().w);

  let generating = $state(false);

  let baseline = get(gameState);
  let dirty = false;
  let previewTimer: ReturnType<typeof setTimeout> | undefined;

  const wasPaused = get(gameState.isPaused);
  if (!wasPaused) gameState.pauseGame();

  const prevCommitted = isActiveCommitted();
  let generated = false;
  setActiveCommitted(false);

  function nextFrames(n: number): Promise<void> {
    return new Promise((resolve) => {
      let i = 0;
      const step = () => (++i >= n ? resolve() : requestAnimationFrame(step));
      requestAnimationFrame(step);
    });
  }

  async function runRegen(fn: () => void) {
    if (generating) return;
    generating = true;
    await nextFrames(2);
    try {
      fn();
      await nextFrames(4);
    } finally {
      generating = false;
    }
  }

  function previewNow() {
    return runRegen(() => {
      gameState.regenWorld(seed, false, 500, true);
      dirty = true;
    });
  }
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(previewNow, 140);
  }

  async function generate() {
    clearTimeout(previewTimer);
    await runRegen(() => {
      gameState.regenWorld(seed);
      baseline = get(gameState);
      dirty = false;
    });
    generated = true;
    setActiveCommitted(true);
    await gameState.flushSave();
    onClose();
  }

  onDestroy(() => {
    clearTimeout(previewTimer);
    if (dirty) gameState.restoreWorld(baseline);
    if (!wasPaused) gameState.unpauseGame();
    if (!generated) setActiveCommitted(prevCommitted);
  });

  function toggleLock(id: string) {
    const n = new Set(locked);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    locked = n;
  }

  function setShare(id: string, pct: number) {
    const lockedOthers = biomes.filter((b) => b.id !== id && locked.has(b.id));
    const freeOthers = biomes.filter((b) => b.id !== id && !locked.has(b.id));
    const lockedTotal = lockedOthers.reduce((s, b) => s + b.share, 0);
    const newShare = Math.max(0, Math.min(pct / 100, 1 - lockedTotal));
    const freeTotal = freeOthers.reduce((s, b) => s + b.share, 0);
    const remaining = Math.max(0, 1 - lockedTotal - newShare);
    const next: Record<string, number> = { [id]: newShare };
    for (const b of lockedOthers) next[b.id] = b.share;
    if (freeOthers.length === 0) {
      next[id] = newShare + remaining;
    } else if (freeTotal > 1e-6) {
      for (const b of freeOthers) next[b.id] = (b.share / freeTotal) * remaining;
    } else {
      for (const b of freeOthers) next[b.id] = remaining / freeOthers.length;
    }
    applyBiomeShares(next);
    biomes = getBiomeConfig();
    schedulePreview();
  }

  function setWater(pct: number) {
    water = pct;
    setWaterLevel(pct / 100);
    schedulePreview();
  }

  function climate(id: string, field: 'baseTemp' | 'baseMoisture', e: Event) {
    setBiomeField(id, field, Number((e.currentTarget as HTMLInputElement).value));
    biomes = getBiomeConfig();
    schedulePreview();
  }

  function setSize(dim: number) {
    size = dim;
    gameState.setMapSize(dim, dim);
    previewNow();
  }

  function reset() {
    resetBiomeConfig();
    biomes = getBiomeConfig();
    water = Math.round(getWaterLevel() * 100);
    locked = new Set();
    previewNow();
  }
  function rollSeed() {
    seed = Date.now() >>> 0 || 1;
    previewNow();
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
          previewNow();
        }}
      /></label
    >
    <button class="cm-btn" onclick={rollSeed} title="roll a new random seed and preview it"
      >⟳</button
    >
    <button class="cm-btn" onclick={reset} title="restore terrains.jsonc defaults">reset</button>
    <button
      class="cm-btn generate"
      onclick={generate}
      title="lock this terrain in and populate it with pawns & creatures">GENERATE</button
    >

    {#if import.meta.env.VITE_DEBUG_MODE === 'true'}
      <button
        class="cm-btn close"
        onclick={onClose}
        title="discard preview, revert to the previous map">✕</button
      >
    {/if}
  </div>
  <div class="cm-note">
    Roll / tweak sliders to <strong>preview</strong> the terrain. <strong>GENERATE</strong> locks it
    in and places pawns &amp; creatures.{#if import.meta.env.VITE_DEBUG_MODE === 'true'}
      <strong>✕</strong> discards the preview and reverts.{/if}
  </div>
  {#if size === L_DIM}
    <div class="cm-warn">
      ⚠ Large maps are still in development — world generation and play can be laggy.
    </div>
  {/if}

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

{#if generating}
  <div class="gen-overlay" role="status" aria-live="polite">
    <div class="gen-box">
      <div class="gen-title">GENERATING WORLD…</div>
      <div class="gen-bar"><div class="gen-fill"></div></div>
      <div class="gen-sub">{size}×{size} tiles — placing terrain, resources &amp; pawns</div>
    </div>
  </div>
{/if}

<style>
  .custom-map {
    position: fixed;
    bottom: 40px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1200;
    width: min(1100px, 96vw);
    max-height: 46vh;
    overflow-y: auto;
    overflow-x: hidden;
    background: var(--bg-panel);
    border: 1px solid var(--border-hi);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 12px;
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
    font-size: 11px;
  }
  .seed {
    margin-left: auto;
    color: var(--text-muted);
    letter-spacing: 0;
    font-size: 11px;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .seed-in {
    width: 96px;
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 11px;
    padding: 1px 4px;
  }
  .cm-btn {
    padding: 1px 6px;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-family: var(--font-mono);
    font-size: 11px;
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
    font-size: 11px;
    padding: 5px 0;
  }
  .cm-warn {
    color: #e0a020;
    font-size: 11px;
    margin-bottom: 5px;
    padding: 4px 8px;
    border-left: 2px solid #e0a020;
    background: color-mix(in srgb, #e0a020 10%, transparent);
  }
  .cm-grid {
    display: grid;
    grid-template-columns: 18px 90px 1fr 1fr 1fr;
    gap: 5px 16px;
    align-items: center;
  }
  .col-h {
    color: var(--text-muted);
    font-size: 10px;
    letter-spacing: 0.04em;
    border-bottom: 1px solid var(--border);
    padding-bottom: 2px;
  }
  .lock {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 12px;
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
    font-size: 11px;
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
    font-size: 11px;
  }

  .gen-overlay {
    position: fixed;
    inset: 0;
    z-index: 1300;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
    font-family: var(--font-mono);
  }
  .gen-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 22px 32px;
    background: var(--bg-panel);
    border: 1px solid var(--border-hi);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.7);
  }
  .gen-title {
    color: var(--accent-hi);
    letter-spacing: 0.12em;
    font-size: 14px;
    font-weight: bold;
  }
  .gen-bar {
    position: relative;
    width: 260px;
    height: 6px;
    overflow: hidden;
    background: var(--bg);
    border: 1px solid var(--border);
  }
  .gen-fill {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 35%;
    background: var(--accent-hi);
    animation: gen-slide 1s linear infinite;
  }
  @keyframes gen-slide {
    from {
      transform: translateX(-110%);
    }
    to {
      transform: translateX(390%);
    }
  }
  .gen-sub {
    color: var(--text-muted);
    font-size: 11px;
  }
</style>
