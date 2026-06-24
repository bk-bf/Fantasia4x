<!--
  AudioController — headless reactive driver for the audio engine (no DOM). Mounted once in
  +page.svelte. It watches the existing game stores and translates state into engine calls; all
  playback lives in audioService (Howler). Purely renderer-side and event-driven: it adds NO per-tick
  sim cost and NO snapshot field (see .docs/.tasks/open/ENGINE-PERFORMANCE.md) — it only reads stores
  that already update at ~15 Hz, plus a 1 s timer for combat-hold / dusk transitions.

  Music scene priority:  menu (title screen, isMenu) → combat (recent attack OR any drafted pawn) →
                         night / day (day/night ambient light, with hysteresis at dusk).
  Ambient nature beds:   resolved from live weather + day/night (manifest.resolveAmbient).
  Volumes:               master/music/sfx prefs pushed live to the engine.
  Autoplay:              browsers block audio until a user gesture, so unlock() is armed on the first
                         pointerdown/keydown.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { gameState, currentWeather } from '$lib/stores/gameState';
  import { masterVolume, musicVolume, sfxVolume } from '$lib/stores/uiPrefs';
  import { cameraViewport, cameraTileSize } from '$lib/stores/cameraView';
  import { environmentService, getAmbientLight } from '$lib/game/services/EnvironmentService';
  import { getCreatureById } from '$lib/game/core/Creatures';
  import { jobService } from '$lib/game/services/JobService';
  import { audioService } from '$lib/audio/AudioService';
  import {
    resolveAmbient,
    creatureClips,
    CREATURE_SOUND_LABELS,
    workClipsFor,
    WORK_SOUND_LABELS,
    UI_SFX,
    type MusicScene,
    type AmbientBed,
    type AmbientLayers
  } from '$lib/audio/manifest';

  let { isMenu = false }: { isMenu?: boolean } = $props();

  const COMBAT_HOLD_MS = 6000; // keep combat music briefly after the last blow
  const NIGHT_LIGHT = 0.4; // ambient-light threshold for "night"
  const NIGHT_HYST = 0.06; // hysteresis band so dusk doesn't flip-flop the track

  // ── Spatial creature SFX tuning ──
  const CREATURE_TICK_MS = 400; // how often audibility is recomputed + triggers roll
  // Zoom scaling (px per tile): barely audible zoomed out, full when zoomed in onto them. The
  // Entities-menu "jump to" snaps to ~24 px/tile (GameCanvas), so the ramp peaks around there.
  const ZOOM_OUT_FLOOR = 0.2; // zoom contribution when fully zoomed out
  const ZOOM_REF_LOW = 12; // px/tile where the zoom ramp begins
  const ZOOM_REF_HIGH = 28; // px/tile where zoom contribution maxes out (≥ Entities-menu jump)
  // Distance from the NEAREST pawn: the colony hears what's near it; far wildlife is very silent. This
  // is what stops a zoomed-out view (whole map on screen) from triggering a cacophony — almost every
  // creature is far from your pawns, so almost all are near-silent.
  const PAWN_NEAR_TILES = 8; // within this of a pawn → full
  const PAWN_FAR_TILES = 40; // by this far → floor
  const PAWN_FAR_FLOOR = 0.1; // "very silent" for distant creatures (e.g. caught in a corner zoomed out)
  const OFFSCREEN_MAX = 0.12; // ceiling for just-off-screen creatures ("barely hear them")
  const OFFSCREEN_MARGIN = 0.6; // how far beyond the viewport (× its size) a creature is still faint
  const CALL_FAST_MS = 6000; // avg gap between calls for a fully-audible archetype
  const CALL_SLOW_MS = 36000; // avg gap for a barely-audible one
  const CREATURE_GAIN = 0.21; // master trim so wildlife sits quietly under the music
  const MAX_CONCURRENT_ARCHETYPES = 3; // only the 3 loudest archetypes may call (no swarm of sounds)
  const LEVEL_EPS = 0.02; // below this, treat as silent

  // ── Work SFX tuning (medieval labour: chop/mine/hammer…). Shares the zoom/viewport model; no
  // pawn-distance gate (the worker IS a pawn). A touch louder + more rhythmic than wildlife. ──
  const WORK_GAIN = 0.4;
  const WORK_CALL_FAST_MS = 2000; // avg gap between strikes for a fully-audible work site
  const WORK_CALL_SLOW_MS = 8000;

  // ── Fire SFX (continuous campfire-crackle loop for lit fire buildings). zoom × viewport, like work. ──
  const FIRE_GAIN = 0.45;

  // ── UI feedback (subtle hover/click on buttons), via global delegated listeners ──
  // Gains are pre-bus (× SFX × Master), so keep them high enough to read over the music: a click at
  // 0.9 × sfx(0.8) × master(0.7) ≈ 0.5 effective, comparable to a music track. Hover stays subtler.
  const UI_HOVER_GAIN = 0.5;
  const UI_CLICK_GAIN = 0.9;
  const UI_HOVER_THROTTLE_MS = 45; // smooth a fast sweep across a toolbar (no machine-gun)

  // ── Ambient zoom balance ──
  // "Detail" beds (local critters/foliage) fade out as you zoom OUT; "weather" beds (wind/rain) stay
  // and get a little louder — so the fully zoomed-out world is just wind & rain, and zooming in brings
  // back birdsong / crickets / forest. Ramp reuses the ZOOM_REF band: detail = 0 at/below ZOOM_REF_LOW.
  const WEATHER_BEDS = new Set<AmbientBed>(['wind', 'rain', 'rain-heavy']);
  const WEATHER_ZOOM_BOOST = 0.3; // weather beds ×(1 + this) when fully zoomed out
  let baseAmbient: AmbientLayers = {}; // weather/time mix (pre zoom-balance), set by the music effect

  let lastCombatAt = 0;
  let wasNight = false;
  let nowTick = $state(0); // bumped every 1 s to re-evaluate combat-hold + dusk
  const lastFired = new Map<string, number>(); // creature archetype id → last one-shot time
  const lastFiredWork = new Map<string, number>(); // work category id → last one-shot time

  // Volume buses → engine, live as sliders move.
  $effect(() => {
    audioService.setVolumes({
      master: $masterVolume / 100,
      music: $musicVolume / 100,
      sfx: $sfxVolume / 100
    });
  });

  // Music scene + ambient bed mix. Re-runs on turn/weather/screen change and the 1 s tick.
  $effect(() => {
    nowTick; // dependency
    const gs = $gameState;
    const wx = $currentWeather;

    const light = getAmbientLight(environmentService.ambientTurn(gs ?? { turn: 0 }));
    const night = wasNight ? light < NIGHT_LIGHT + NIGHT_HYST : light < NIGHT_LIGHT;
    wasNight = night;

    // Combat music triggers ONLY on the PLAYER's pawns fighting: a drafted pawn actively attacking,
    // or a hostile mob actively attacking one of our pawns. Deliberately NOT keyed off the combat-FX
    // stores (attackLunges/combatFeedback) — those also fire for mob-vs-mob fights and fleeing across
    // the map, which spuriously triggered the battle theme. 'Fleeing' mobs never count.
    const pawnFighting =
      (gs?.pawns?.some((p) => p.drafted && p.draftTarget?.type === 'attack') ?? false) ||
      (gs?.mobs?.some((m) => m.state === 'Attacking' && !!m.targetPawnId) ?? false);
    if (pawnFighting) lastCombatAt = Date.now();
    const inCombat = pawnFighting || Date.now() - lastCombatAt < COMBAT_HOLD_MS;

    let scene: MusicScene;
    if (isMenu) scene = 'menu';
    else if (inCombat) scene = 'combat';
    else scene = night ? 'night' : 'day';
    audioService.setScene(scene);

    // Compute the base weather/time bed mix from the live weather. The main menu runs a live weather +
    // day/night preview too, so weather ambience plays on the title screen as well. evalAmbient applies
    // the in-game zoom balance on the fast tick; the menu plays the full mix.
    baseAmbient = resolveAmbient({
      weatherType: wx?.type ?? 'clear',
      isNight: night,
      intensity: wx?.intensity ?? 0
    });
  });

  type Vp = { x: number; y: number; w: number; h: number };

  /** Viewport audibility for a tile: 1 inside, fading to OFFSCREEN_MAX just outside, 0 out of earshot. */
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
    if (dx > mX || dy > mY) return 0; // out of earshot
    return OFFSCREEN_MAX * Math.max(0, Math.min(1 - dx / mX, 1 - dy / mY));
  }

  /** Zoom audibility factor: ZOOM_OUT_FLOOR when zoomed out → 1.0 zoomed in (ramp over the ref band). */
  function zoomGainFor(tile: number): number {
    const n = Math.max(0, Math.min(1, (tile - ZOOM_REF_LOW) / (ZOOM_REF_HIGH - ZOOM_REF_LOW)));
    return ZOOM_OUT_FLOOR + (1 - ZOOM_OUT_FLOOR) * n;
  }

  /**
   * Shared one-shot emitter for a `soundId → product-of-(1−c)` map (audibility = 1 − product). Picks
   * the loudest few ids, rolls an intermittent one-shot per id (volume + rate scale with audibility,
   * jittered), and publishes the levels for the debug panel. Used by both wildlife and work SFX.
   */
  function emitSfx(
    product: Map<string, number>,
    opts: {
      clips: (id: string) => string[];
      label: (id: string) => string;
      gain: number;
      fastMs: number;
      slowMs: number;
      lastFired: Map<string, number>;
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
    // Only the loudest few may call — never a swarm of overlapping sounds.
    entries.sort((a, b) => b.level - a.level);
    const audible = entries.slice(0, MAX_CONCURRENT_ARCHETYPES);
    for (const e of audible) {
      const gap =
        (opts.fastMs + (opts.slowMs - opts.fastMs) * (1 - e.level)) * (0.7 + Math.random() * 0.6);
      if (now - (opts.lastFired.get(e.id) ?? 0) >= gap) {
        const clips = opts.clips(e.id);
        audioService.playSfx(clips[Math.floor(Math.random() * clips.length)], e.level * opts.gain);
        opts.lastFired.set(e.id, now);
      }
    }
    opts.setLevels(audible.map((e) => ({ label: e.label, level: e.level })));
  }

  /**
   * Spatial creature SFX: per archetype, combine every individual's audibility (zoom × viewport
   * proximity × nearest-pawn distance; more individuals = louder via 1−Π(1−c)). On-screen + zoomed in
   * + near the colony = loud & frequent; far from pawns or zoomed out = very silent. Asleep/downed/dead
   * mobs are skipped.
   */
  function evalCreatures(): void {
    if (isMenu) return void audioService.setCreatureLevels([]);
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

      // Nearest-pawn distance: near the colony = full, far = "very silent" (floor).
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
      lastFired,
      setLevels: (l) => audioService.setCreatureLevels(l)
    });
  }

  /**
   * Spatial WORK SFX: medieval labour sounds for pawns currently Working. The sound is the job's
   * `audio` override (jobs.jsonc) or its resolved work category (so a `harvest` job splits into
   * woodcutting/mining/foraging by what's harvested). Scales with zoom + viewport only — the worker IS
   * a pawn, so no pawn-distance gate.
   */
  function evalWork(): void {
    if (isMenu) return void audioService.setWorkLevels([]);
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
      lastFired: lastFiredWork,
      setLevels: (l) => audioService.setWorkLevels(l)
    });
  }

  /**
   * Apply the zoom balance to the base ambient mix and push it to the engine. Zoomed out → local
   * "detail" beds (birds/crickets/forest) fade to silence and the weather beds (wind/rain) swell, so
   * the whole-map view is just weather; zooming in restores the full soundscape.
   */
  function evalAmbient(): void {
    // Menu: play the full weather/time mix as a cinematic backdrop (no zoom balance — the title screen
    // has no player camera to scale against). In-game applies the detail/weather zoom balance below.
    if (isMenu) return void audioService.setAmbient(baseAmbient);
    const tile = get(cameraTileSize);
    const detail = Math.max(0, Math.min(1, (tile - ZOOM_REF_LOW) / (ZOOM_REF_HIGH - ZOOM_REF_LOW)));
    const weatherMul = 1 + (1 - detail) * WEATHER_ZOOM_BOOST;
    const out: AmbientLayers = {};
    for (const key of Object.keys(baseAmbient) as AmbientBed[]) {
      const g = (baseAmbient[key] ?? 0) * (WEATHER_BEDS.has(key) ? weatherMul : detail);
      if (g > 0.001) out[key] = g;
    }
    audioService.setAmbient(out);
  }

  /**
   * Fire SFX: a single looping campfire crackle whose volume scales with the loudest lit fire building
   * in earshot (any complete, burning fuel building — campfire/hearth/furnace/…). zoom × viewport,
   * aggregated across fires via 1−Π(1−c); no pawn-distance (fires sit in the colony).
   */
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

  // Subtle UI feedback via DELEGATED listeners (no per-button wiring): a soft tick on hovering a
  // button and a click on pressing one. Capture phase so a handler's stopPropagation can't swallow it.
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
    if (btn === lastHoverBtn) return; // still on the same button (moved over a child) → no repeat
    lastHoverBtn = btn;
    const now = Date.now();
    if (now - lastHoverAt < UI_HOVER_THROTTLE_MS) return; // smooth fast toolbar sweeps
    lastHoverAt = now;
    audioService.playUi(UI_SFX.hover, UI_HOVER_GAIN);
  }
  function onUiClick(e: MouseEvent) {
    if (uiButton(e.target)) audioService.playUi(UI_SFX.click, UI_CLICK_GAIN);
  }

  onMount(() => {
    const unlock = () => {
      audioService.unlock();
      nowTick = Date.now(); // kick an immediate re-evaluation once audio is unlocked
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerover', onUiOver, true);
    window.addEventListener('click', onUiClick, true);

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
      clearInterval(iv);
      clearInterval(sfxIv);
      audioService.dispose();
    };
  });
</script>
