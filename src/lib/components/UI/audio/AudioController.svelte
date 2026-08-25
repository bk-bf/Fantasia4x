<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { gameState, currentWeather } from '$lib/stores/gameState';
  import { combatSounds } from '$lib/stores/fx/combatSounds';
  import { threatPulse, alertPulse } from '$lib/stores/uiState';
  import { masterVolume, musicVolume, sfxVolume, ambientVolume } from '$lib/stores/uiPrefs';
  import { cameraViewport, cameraTileSize, cameraZoomRange } from '$lib/stores/cameraView';
  import { environmentService, getAmbientLight } from '$lib/game/services/EnvironmentService';
  import { getCreatureById } from '$lib/game/core/defs/creatures';
  import { jobService } from '$lib/game/services/JobService';
  import { audioService } from '$lib/audio/AudioService';
  import {
    resolveAmbient,
    creatureClips,
    CREATURE_SOUND_LABELS,
    workClipsFor,
    WORK_SOUND_LABELS,
    combatClipsFor,
    UI_SFX,
    THREAT_ALERT_SFX,
    type MusicScene,
    type AmbientBed,
    type AmbientLayers
  } from '$lib/audio/manifest';

  let { isMenu = false, playing = false }: { isMenu?: boolean; playing?: boolean } = $props();

  const COMBAT_HOLD_MS = 6000;
  const NIGHT_LIGHT = 0.4;
  const NIGHT_HYST = 0.06;

  const CREATURE_TICK_MS = 400;
  const ZOOM_OUT_FLOOR = 0.2;
  const ZOOM_REF_LOW = 12;
  const ZOOM_REF_HIGH = 28;
  const PAWN_NEAR_TILES = 8;
  const PAWN_FAR_TILES = 40;
  const PAWN_FAR_FLOOR = 0.1;
  const OFFSCREEN_MAX = 0.12;
  const OFFSCREEN_MARGIN = 0.6;
  const CALL_FAST_MS = 6000;
  const CALL_SLOW_MS = 36000;
  const CALL_MIN_GAP_MS = 3000;
  const CALL_RARITY: Partial<Record<string, number>> = { goat: 2.5 };
  const CREATURE_GAIN = 0.21;
  const MAX_CONCURRENT_ARCHETYPES = 3;
  const LEVEL_EPS = 0.02;

  const WORK_GAIN = 0.4;
  const WORK_CALL_FAST_MS = 2000;
  const WORK_CALL_SLOW_MS = 8000;
  const WORK_MIN_GAP_MS = 1200;

  const FIRE_GAIN = 0.45;

  const COMBAT_GAIN = 0.6;

  const UI_HOVER_GAIN = 0.5;
  const UI_CLICK_GAIN = 0.9;
  const UI_HOVER_THROTTLE_MS = 45;

  const THREAT_ALERT_GAIN = 0.85;

  const WEATHER_BEDS = new Set<AmbientBed>(['wind', 'rain', 'rain-heavy']);
  const WEATHER_ZOOM_BOOST = 0.3;
  let baseAmbient: AmbientLayers = {};

  let lastCombatAt = 0;
  let wasNight = false;
  let nowTick = $state(0);
  const nextFire = new Map<string, number>();
  const nextFireWork = new Map<string, number>();

  function pushVolumes(): void {
    audioService.setVolumes({
      master: get(masterVolume) / 100,
      music: get(musicVolume) / 100,
      sfx: get(sfxVolume) / 100,
      ambient: get(ambientVolume) / 100
    });
  }

  $effect(() => {
    nowTick;
    const gs = $gameState;
    const wx = $currentWeather;

    const light = getAmbientLight(environmentService.ambientTurn(gs ?? { turn: 0 }));
    const night = wasNight ? light < NIGHT_LIGHT + NIGHT_HYST : light < NIGHT_LIGHT;
    wasNight = night;

    const pawnFighting =
      (gs?.pawns?.some((p) => p.drafted && p.draftTarget?.type === 'attack') ?? false) ||
      (gs?.mobs?.some((m) => m.state === 'Attacking' && !!m.targetPawnId) ?? false);
    if (pawnFighting) lastCombatAt = Date.now();
    const inCombat = pawnFighting || Date.now() - lastCombatAt < COMBAT_HOLD_MS;

    let scene: MusicScene;
    if (isMenu) scene = 'menu';
    else if (inCombat) scene = 'combat';
    else scene = night ? 'night' : 'day';
    audioService.setScene(scene, gs ? environmentService.effectiveSeason(gs) : undefined);

    baseAmbient = resolveAmbient({
      weatherType: wx?.type ?? 'clear',
      isNight: night,
      intensity: wx?.intensity ?? 0
    });
  });

  type Vp = { x: number; y: number; w: number; h: number };

  function spatialAt(x: number, y: number, vp: Vp): number {
    const x0 = vp.x;
    const y0 = vp.y;
    const x1 = vp.x + vp.w;
    const y1 = vp.y + vp.h;
    if (x >= x0 && x < x1 && y >= y0 && y < y1) return 1;
    const dx = x < x0 ? x0 - x : x >= x1 ? x - x1 : 0;
    const dy = y < y0 ? y0 - y : y >= y1 ? y - y1 : 0;
    const mX = vp.w * OFFSCREEN_MARGIN;
    const mY = vp.h * OFFSCREEN_MARGIN;
    if (dx > mX || dy > mY) return 0;
    return OFFSCREEN_MAX * Math.max(0, Math.min(1 - dx / mX, 1 - dy / mY));
  }

  function zoomGainFor(tile: number): number {
    const n = Math.max(0, Math.min(1, (tile - ZOOM_REF_LOW) / (ZOOM_REF_HIGH - ZOOM_REF_LOW)));
    return ZOOM_OUT_FLOOR + (1 - ZOOM_OUT_FLOOR) * n;
  }

  function emitSfx(
    product: Map<string, number>,
    opts: {
      clips: (id: string) => string[];
      label: (id: string) => string;
      gain: number;
      fastMs: number;
      slowMs: number;
      minGapMs: number;
      rarity?: (id: string) => number;
      nextFire: Map<string, number>;
      setLevels: (l: { label: string; level: number }[]) => void;
    }
  ): void {
    const now = Date.now();
    const entries: { id: string; label: string; level: number }[] = [];
    for (const [id, prod] of product) {
      const level = 1 - prod;
      if (level < LEVEL_EPS) continue;
      entries.push({ id, label: opts.label(id), level });
    }
    entries.sort((a, b) => b.level - a.level);
    const audible = entries.slice(0, MAX_CONCURRENT_ARCHETYPES);
    for (const e of audible) {
      const meanGap =
        (opts.fastMs + (opts.slowMs - opts.fastMs) * (1 - e.level)) * (opts.rarity?.(e.id) ?? 1);
      let due = opts.nextFire.get(e.id);
      if (due === undefined) {
        due = now + opts.minGapMs + Math.random() * opts.fastMs;
        opts.nextFire.set(e.id, due);
      }
      if (now >= due) {
        const clips = opts.clips(e.id);
        audioService.playSfx(clips[Math.floor(Math.random() * clips.length)], e.level * opts.gain);
        const gap = Math.max(opts.minGapMs, -Math.log(1 - Math.random()) * meanGap);
        opts.nextFire.set(e.id, now + gap);
      }
    }
    opts.setLevels(audible.map((e) => ({ label: e.label, level: e.level })));
  }

  function evalCreatures(): void {
    if (!playing) return void audioService.setCreatureLevels([]);
    const mobs = $gameState?.mobs;
    const vp = get(cameraViewport);
    if (!mobs?.length || vp.w <= 0) return void audioService.setCreatureLevels([]);

    const zg = zoomGainFor(get(cameraTileSize));
    const pawns = ($gameState?.pawns ?? [])
      .map((p) => p.position)
      .filter((pos): pos is { x: number; y: number } => !!pos);

    const product = new Map<string, number>();
    for (const m of mobs) {
      if (m.state === 'Sleeping' || m.state === 'Collapsed' || m.state === 'Corpse') continue;
      const sound = getCreatureById(m.creatureId)?.audio;
      if (!sound || creatureClips(sound).length === 0) continue;
      const spatial = spatialAt(m.x, m.y, vp);
      if (spatial <= 0) continue;

      let pawnGain = PAWN_FAR_FLOOR;
      if (pawns.length) {
        let best = Infinity;
        for (const pp of pawns) {
          const d2 = (pp.x - m.x) ** 2 + (pp.y - m.y) ** 2;
          if (d2 < best) best = d2;
        }
        const dist = Math.sqrt(best);
        pawnGain =
          dist <= PAWN_NEAR_TILES
            ? 1
            : Math.max(
                PAWN_FAR_FLOOR,
                1 -
                  ((dist - PAWN_NEAR_TILES) / (PAWN_FAR_TILES - PAWN_NEAR_TILES)) *
                    (1 - PAWN_FAR_FLOOR)
              );
      }

      const c = Math.max(0, Math.min(1, zg * spatial * pawnGain));
      if (c <= 0) continue;
      product.set(sound, (product.get(sound) ?? 1) * (1 - c));
    }

    emitSfx(product, {
      clips: creatureClips,
      label: (id) => CREATURE_SOUND_LABELS[id as keyof typeof CREATURE_SOUND_LABELS] ?? id,
      gain: CREATURE_GAIN,
      fastMs: CALL_FAST_MS,
      slowMs: CALL_SLOW_MS,
      minGapMs: CALL_MIN_GAP_MS,
      rarity: (id) => CALL_RARITY[id] ?? 1,
      nextFire,
      setLevels: (l) => audioService.setCreatureLevels(l)
    });
  }

  function evalWork(): void {
    if (!playing) return void audioService.setWorkLevels([]);
    const gs = $gameState;
    const pawns = gs?.pawns;
    const vp = get(cameraViewport);
    if (!pawns?.length || vp.w <= 0) return void audioService.setWorkLevels([]);

    const zg = zoomGainFor(get(cameraTileSize));
    const product = new Map<string, number>();
    for (const p of pawns) {
      const job = p.activeJob;
      if (p.currentState !== 'Working' || !job || !p.position) continue;
      const soundId = jobService.getJobAudio(job.type) ?? jobService.getJobWorkCategory(job, gs);
      if (workClipsFor(soundId).length === 0) continue;
      const spatial = spatialAt(p.position.x, p.position.y, vp);
      if (spatial <= 0) continue;
      const c = Math.max(0, Math.min(1, zg * spatial));
      if (c <= 0) continue;
      product.set(soundId, (product.get(soundId) ?? 1) * (1 - c));
    }

    emitSfx(product, {
      clips: workClipsFor,
      label: (id) => WORK_SOUND_LABELS[id] ?? id,
      gain: WORK_GAIN,
      fastMs: WORK_CALL_FAST_MS,
      slowMs: WORK_CALL_SLOW_MS,
      minGapMs: WORK_MIN_GAP_MS,
      nextFire: nextFireWork,
      setLevels: (l) => audioService.setWorkLevels(l)
    });
  }

  function zoomDetail(tile: number): number {
    const { min, max } = get(cameraZoomRange);
    const lo = Math.max(1, min);
    if (max <= lo) return 1;
    const t = Math.max(lo, Math.min(max, tile));
    return (Math.log(t) - Math.log(lo)) / (Math.log(max) - Math.log(lo));
  }

  function evalAmbient(): void {
    if (isMenu) return void audioService.setAmbient(baseAmbient);
    const detail = zoomDetail(get(cameraTileSize));
    const weatherMul = 1 + (1 - detail) * WEATHER_ZOOM_BOOST;
    const out: AmbientLayers = {};
    for (const key of Object.keys(baseAmbient) as AmbientBed[]) {
      const g = (baseAmbient[key] ?? 0) * (WEATHER_BEDS.has(key) ? weatherMul : detail);
      if (g > 0.001) out[key] = g;
    }
    audioService.setAmbient(out);
  }

  function evalFire(): void {
    if (isMenu) return void audioService.setFireLevel(0);
    const buildings = $gameState?.buildings;
    const vp = get(cameraViewport);
    if (!buildings?.length || vp.w <= 0) return void audioService.setFireLevel(0);

    const zg = zoomGainFor(get(cameraTileSize));
    let product = 1;
    for (const b of buildings) {
      if (b.status !== 'complete' || !b.lit) continue;
      const spatial = spatialAt(b.x, b.y, vp);
      if (spatial <= 0) continue;
      const c = Math.max(0, Math.min(1, zg * spatial));
      if (c > 0) product *= 1 - c;
    }
    const level = 1 - product;
    audioService.setFireLevel(level < LEVEL_EPS ? 0 : level * FIRE_GAIN);
  }

  const uiButton = (t: EventTarget | null): Element | null =>
    t instanceof Element ? t.closest('button:not([disabled]),[role="button"]') : null;
  let lastHoverBtn: Element | null = null;
  let lastHoverAt = 0;
  function onUiOver(e: PointerEvent) {
    const btn = uiButton(e.target);
    if (!btn) {
      lastHoverBtn = null;
      return;
    }
    if (btn === lastHoverBtn) return;
    lastHoverBtn = btn;
    const now = Date.now();
    if (now - lastHoverAt < UI_HOVER_THROTTLE_MS) return;
    lastHoverAt = now;
    audioService.playUi(UI_SFX.hover, UI_HOVER_GAIN);
  }
  function onUiClick(e: MouseEvent) {
    if (uiButton(e.target)) audioService.playUi(UI_SFX.click, UI_CLICK_GAIN);
  }

  onMount(() => {
    const unlock = () => {
      audioService.unlock();
      nowTick = Date.now();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerover', onUiOver, true);
    window.addEventListener('click', onUiClick, true);

    const volUnsubs = [masterVolume, musicVolume, sfxVolume, ambientVolume].map((s) =>
      s.subscribe(pushVolumes)
    );

    const firedCombat = new Set<string>();
    const stampCombat = combatSounds.subscribe((list) => {
      if (!list.length || !playing) return;
      const vp = get(cameraViewport);
      const tile = get(cameraTileSize);
      const zg = zoomGainFor(tile);
      for (const e of list) {
        if (firedCombat.has(e.id)) continue;
        firedCombat.add(e.id);
        const clips = combatClipsFor(e.sound);
        if (clips.length === 0) continue;
        const aud = (vp.w > 0 ? spatialAt(e.worldX, e.worldY, vp) : 1) * zg;
        if (aud < LEVEL_EPS) continue;
        audioService.playSfx(clips[Math.floor(Math.random() * clips.length)], aud * COMBAT_GAIN);
      }
      if (firedCombat.size > 64) {
        const live = new Set(list.map((e) => e.id));
        for (const id of firedCombat) if (!live.has(id)) firedCombat.delete(id);
      }
    });

    let lastThreat = get(threatPulse);
    const stampThreat = threatPulse.subscribe((v) => {
      if (v === lastThreat) return;
      lastThreat = v;
      if (v > 0) audioService.playUi(THREAT_ALERT_SFX, THREAT_ALERT_GAIN);
    });

    let lastAlert = get(alertPulse);
    const stampAlert = alertPulse.subscribe((v) => {
      if (v === lastAlert) return;
      lastAlert = v;
      if (v > 0) audioService.playUi(THREAT_ALERT_SFX, THREAT_ALERT_GAIN);
    });

    const iv = setInterval(() => (nowTick = Date.now()), 1000);
    const sfxIv = setInterval(() => {
      evalAmbient();
      evalCreatures();
      evalWork();
      evalFire();
    }, CREATURE_TICK_MS);

    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('pointerover', onUiOver, true);
      window.removeEventListener('click', onUiClick, true);
      stampCombat();
      stampThreat();
      stampAlert();
      volUnsubs.forEach((u) => u());
      clearInterval(iv);
      clearInterval(sfxIv);
      audioService.dispose();
    };
  });
</script>
