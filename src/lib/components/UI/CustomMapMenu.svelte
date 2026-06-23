<script lang="ts">
  // Custom Map popup — preview the terrain, then GENERATE to commit.
  //  • SIZE toggles (S/M/L/XL) pick the world dimensions.
  //  • Each biome has ONE "share" slider (0 = none, 100 = only it). Moving one rebalances the
  //    UNLOCKED others proportionally so the shares always partition the elevation axis. A 🔒 per row
  //    pins that slider so it's left untouched when you tweak another.
  //  • WATER is decoupled from biomes (its own field) — one slider for global water coverage.
  // Two distinct actions, deliberately NOT the same thing:
  //  • Rolling the seed / tweaking sliders shows a live PREVIEW of the terrain only — pawns are
  //    stripped off the map and no creatures are seeded, so nothing glitches on shuffled tiles.
  //  • GENERATE commits: it locks the previewed terrain in and ONLY THEN places pawns on valid land
  //    and seeds creatures. That generated map becomes the new baseline.
  //  • CLOSE (✕) discards the preview and reverts to the baseline (the map as it was when the popup
  //    opened, or the last GENERATE) — it does NOT keep the preview.
  import { get } from 'svelte/store';
  import { onDestroy } from 'svelte';
  import { gameState } from '$lib/stores/gameState';
  import { setAutosaveSuspended } from '$lib/stores/saveManager';
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

  // Map-size presets (square). Defaults to M (500×500) — see currentMapSize in gameState. XL is a
  // dev-only stress size: it's hidden in the shipped (--play) build and only offered in --debug.
  const ALL_SIZES = [
    { label: 'S', dim: 250 },
    { label: 'M', dim: 500 },
    { label: 'L', dim: 750 },
    { label: 'XL', dim: 1000 }
  ];
  const isDebug = import.meta.env.VITE_DEBUG_MODE === 'true';
  const SIZES = isDebug ? ALL_SIZES : ALL_SIZES.filter((s) => s.label !== 'XL');
  const L_DIM = 750; // Large — still in dev, can be laggy (disclaimer shown when selected)
  let size = $state<number>(gameState.getMapSize().w);

  // Shown while the (synchronous, main-thread-blocking) worldgen runs so the user isn't staring at a
  // frozen UI with no feedback — see runRegen().
  let generating = $state(false);

  // The map state as it was when the popup opened (or after the last GENERATE). CLOSE reverts to this,
  // discarding any preview. Captured by reference: regenWorld builds a NEW state, so this stays valid.
  let baseline = get(gameState);
  // True once a preview has rewritten the live world — so CLOSE only needs to revert when there's
  // actually something to discard (a no-op open/close doesn't re-init the worker).
  let dirty = false;
  let previewTimer: ReturnType<typeof setTimeout> | undefined;

  // Pause the sim while shaping the map — nothing should advance (no time/weather/growth) during
  // preview, and a running sim just wastes CPU + pushes state behind the popup. Restore on close.
  const wasPaused = get(gameState.isPaused);
  if (!wasPaused) gameState.pauseGame();

  // Suspend autosave while the map is being shaped: a new game (or a dev regen) must NOT write a save
  // until the player commits with GENERATE — otherwise a half-built, never-confirmed map shows up in the
  // save list. GENERATE persists the committed world explicitly; CLOSE/✕ just resumes (nothing written).
  setAutosaveSuspended(true);

  // Yield `n` animation frames, so the browser gets to paint between steps.
  function nextFrames(n: number): Promise<void> {
    return new Promise((resolve) => {
      let i = 0;
      const step = () => (++i >= n ? resolve() : requestAnimationFrame(step));
      requestAnimationFrame(step);
    });
  }

  // Run any (re)generation behind the GENERATING overlay. regenWorld is synchronous and freezes the
  // main thread for a beat (a Medium/Large world is 100k+ tiles), so we flip the overlay on and YIELD
  // two frames first — that guarantees the browser paints it before the blocking work starts. The bar
  // is a transform-based CSS animation (compositor-driven), so it keeps sliding even while frozen.
  // CRUCIALLY: regenWorld only swaps the world STATE — GameCanvas then rebuilds + repaints the terrain
  // (and refits the camera on a size change) REACTIVELY over the next frames. So we hold the overlay a
  // few more frames AFTER fn() too, hiding that resize/redraw — the player only ever sees the finished
  // map, never the jarring mid-redraw.
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

  // PREVIEW (terrain only): pawns stripped off the map, no creatures — so you can shape biomes/water
  // without entities glitching on freshly-shuffled tiles. Debounced so dragging a slider doesn't thrash.
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

  // GENERATE (commit): a real regen that places pawns on valid forest/plains/swamp land and seeds
  // creatures, then adopts the result as the new baseline and auto-closes the popup. dirty is cleared
  // first so the onDestroy revert is a no-op — the committed map stays.
  async function generate() {
    clearTimeout(previewTimer);
    await runRegen(() => {
      gameState.regenWorld(seed);
      baseline = get(gameState);
      dirty = false;
    });
    // Commit point: the map is now real (pawns placed, creatures seeded). Persist it eagerly so the new
    // game appears in the save list immediately — this is the FIRST save, the moment the player committed.
    // (Autosave is resumed by onDestroy when the popup unmounts on the onClose below.)
    setAutosaveSuspended(false);
    await gameState.flushSave();
    onClose();
  }

  // Revert on unmount, whichever way the popup closes — the ✕ button, the CUSTOM MAP toolbar toggle,
  // or navigation. If a preview rewrote the live world (pawns stripped, no creatures) and the player
  // never pressed GENERATE, restore the baseline so we never leave a half-built map behind.
  onDestroy(() => {
    clearTimeout(previewTimer);
    if (dirty) gameState.restoreWorld(baseline);
    if (!wasPaused) gameState.unpauseGame();
    setAutosaveSuspended(false); // resume autosave however the popup closed (GENERATE / ✕ / nav)
  });

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
    <!-- The discard/revert ✕ only makes sense in the debug build (where the popup is a toggleable tool).
         In the normal new-game flow there's no previous map to revert to — GENERATE is the only exit. -->
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

<!-- Worldgen feedback: regenWorld blocks the main thread, so this overlay is painted first (generate()
     yields two frames) and the bar is a transform animation that survives the freeze. -->
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
    font-family: var(--font-mono);
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
    font-family: var(--font-mono);
    font-size: 10px;
    padding: 1px 4px;
  }
  .cm-btn {
    padding: 1px 6px;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-family: var(--font-mono);
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
  /* Dev disclaimer shown only while the Large preset is selected — amber, set off with a left rule. */
  .cm-warn {
    color: #e0a020;
    font-size: 10px;
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

  /* Worldgen feedback overlay — covers the whole screen above the popup (z 1200) while regenWorld
     blocks the main thread. The bar animates on `transform` so the compositor keeps it moving even
     while the main thread is frozen mid-generation. */
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
    font-size: 13px;
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
    font-size: 10px;
  }
</style>
