<script lang="ts">
  import { get } from 'svelte/store';
  import { onDestroy } from 'svelte';
  import { gameState } from '$lib/stores/gameState';
  import { debugMode } from '$lib/stores/uiPrefs';
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
  import ChromeButton from '$lib/components/UI/widget/ChromeButton.svelte';
  import ModalWindow from '$lib/components/UI/window/ModalWindow.svelte';
  import MapTopRow from './MapTopRow.svelte';
  import MapLands from './MapLands.svelte';
  import MapGenOverlay from './MapGenOverlay.svelte';
  import { mapSizes, rebalanceShares } from './customMap';

  let { onClose }: { onClose: () => void } = $props();

  let biomes = $state<BiomeConfigEntry[]>(getBiomeConfig());
  let seed = $state<number>((get(gameState)?.seed ?? Date.now()) >>> 0);
  let locked = $state<Set<string>>(new Set());
  let water = $state<number>(Math.round(getWaterLevel() * 100));

  const SIZES = mapSizes(import.meta.env.VITE_DEBUG_MODE === 'true');
  const L_DIM = 750;
  if (!get(debugMode)) gameState.setMapSize(L_DIM, L_DIM);
  let size = $state<number>(gameState.getMapSize().w);

  let generating = $state(false);
  let busy = $state(false);

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

  async function back() {
    if (prevCommitted) return onClose();
    if (busy) return;
    busy = true;
    await gameState.goToMainMenu();
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
    applyBiomeShares(rebalanceShares(biomes, locked, id, pct));
    biomes = getBiomeConfig();
    schedulePreview();
  }

  function setWater(pct: number) {
    water = pct;
    setWaterLevel(pct / 100);
    schedulePreview();
  }

  function climate(id: string, field: 'baseTemp' | 'baseMoisture', v: number) {
    setBiomeField(id, field, v);
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
  function typeSeed(v: number) {
    seed = v >>> 0 || 1;
    previewNow();
  }
</script>

<ModalWindow id="newgame" title="A new land" width={760} onclose={back}>
  <MapTopRow
    sizes={$debugMode ? SIZES : []}
    {size}
    {seed}
    onsize={setSize}
    onseed={typeSeed}
    onroll={rollSeed}
    onreset={reset}
  />
  {#if size >= L_DIM}
    <p class="warn">vast lands are still rough, and may run slow</p>
  {/if}
  <MapLands
    {biomes}
    {locked}
    {water}
    onlock={toggleLock}
    onshare={setShare}
    onclimate={climate}
    onwater={setWater}
  />
  <div class="foot">
    <ChromeButton onclick={back} disabled={busy}>Back</ChromeButton>
    <ChromeButton kind="verb" onclick={generate} disabled={generating || busy}>
      Found the colony
    </ChromeButton>
  </div>
</ModalWindow>

{#if generating}
  <MapGenOverlay {size} />
{/if}

<style>
  .warn {
    margin: -4px 0 6px;
    color: var(--accent-hi);
  }
  .foot {
    display: flex;
    justify-content: flex-end;
    gap: 4px;
    margin-top: 10px;
  }
</style>
