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
  import { combatSounds } from '$lib/stores/combatSounds';
  import { masterVolume, musicVolume, sfxVolume, ambientVolume } from '$lib/stores/uiPrefs';
  import { cameraViewport, cameraTileSize, cameraZoomRange } from '$lib/stores/cameraView';
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
    combatClipsFor,
    UI_SFX,
    type MusicScene,
    type AmbientBed,
    type AmbientLayers
  } from '$lib/audio/manifest';

  // `isMenu`: title screen — drives the music scene AND the continuous ambient/fire BEDS, which keep
  // playing over the loading screen and the map-gen preview (where they zoom-balance against the live
  // camera). `playing`: the game is actually being PLAYED — not the menu, past the loading screen, and
  // not the map-gen preview (uiState.customMapOpen). The discrete one-shot SFX (creatures, work, combat)
  // gate on `playing`, so no boar squeaks over the loader or while tweaking the map-gen sliders.
  let { isMenu = false, playing = false }: { isMenu?: boolean; playing?: boolean } = $props();

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
  const CALL_FAST_MS = 6000; // MEAN gap between calls for a fully-audible archetype (Poisson; see emitSfx)
  const CALL_SLOW_MS = 36000; // mean gap for a barely-audible one
  const CALL_MIN_GAP_MS = 3000; // refractory floor — a creature never re-calls sooner than this
  // Per-sound multipliers on the mean call gap. Some one-shots grate on repeat: the mountain goat has a
  // single bleat clip with no variation, so on a routine cadence it became a "loop in your head" — call
  // it far less often. (Keyed by CreatureSoundId; 1 = default rate.)
  const CALL_RARITY: Partial<Record<string, number>> = { goat: 2.5 };
  const CREATURE_GAIN = 0.21; // master trim so wildlife sits quietly under the music
  const MAX_CONCURRENT_ARCHETYPES = 3; // only the 3 loudest archetypes may call (no swarm of sounds)
  const LEVEL_EPS = 0.02; // below this, treat as silent

  // ── Work SFX tuning (medieval labour: chop/mine/hammer…). Shares the zoom/viewport model; no
  // pawn-distance gate (the worker IS a pawn). A touch louder + more rhythmic than wildlife. ──
  const WORK_GAIN = 0.4;
  const WORK_CALL_FAST_MS = 2000; // mean gap between strikes for a fully-audible work site
  const WORK_CALL_SLOW_MS = 8000;
  const WORK_MIN_GAP_MS = 1200; // refractory floor for work strikes

  // ── Fire SFX (continuous campfire-crackle loop for lit fire buildings). zoom × viewport, like work. ──
  const FIRE_GAIN = 0.45;

  // ── Combat SFX (weapon swings + condition onsets), via the combatSounds cue store ──
  const COMBAT_GAIN = 0.6; // pre-bus; combat should read clearly when it's on-screen

  // ── UI feedback (subtle hover/click on buttons), via global delegated listeners ──
  // Gains are pre-bus (× SFX × Master), so keep them high enough to read over the music: a click at
  // 0.9 × sfx(0.8) × master(0.7) ≈ 0.5 effective, comparable to a music track. Hover stays subtler.
  const UI_HOVER_GAIN = 0.5;
  const UI_CLICK_GAIN = 0.9;
  const UI_HOVER_THROTTLE_MS = 45; // smooth a fast sweep across a toolbar (no machine-gun)

  // ── Ambient zoom balance ──
  // "Detail" beds (local critters/foliage) fade out as you zoom OUT; "weather" beds (wind/rain) stay
  // and get a little louder — so the fully zoomed-out world is just wind & rain, and zooming in brings
  // back birdsong / crickets / forest. The balance follows zoomDetail() — a log ramp across the full
  // live zoom range — so the mix glides the whole way instead of only shifting near full zoom-out.
  const WEATHER_BEDS = new Set<AmbientBed>(['wind', 'rain', 'rain-heavy']);
  const WEATHER_ZOOM_BOOST = 0.3; // weather beds ×(1 + this) when fully zoomed out
  let baseAmbient: AmbientLayers = {}; // weather/time mix (pre zoom-balance), set by the music effect

  let lastCombatAt = 0;
  let wasNight = false;
  let nowTick = $state(0); // bumped every 1 s to re-evaluate combat-hold + dusk
  const nextFire = new Map<string, number>(); // creature sound id → scheduled time of its NEXT one-shot
  const nextFireWork = new Map<string, number>(); // work category id → scheduled time of its NEXT one-shot

  // Volume buses → engine, pushed live as the Settings sliders move. Done via explicit store
  // subscriptions (in onMount) rather than an $effect, so a slider change ALWAYS re-applies — incl.
  // on the title screen where the menu ambience plays.
  function pushVolumes(): void {
    audioService.setVolumes({
      master: get(masterVolume) / 100,
      music: get(musicVolume) / 100,
      sfx: get(sfxVolume) / 100,
      ambient: get(ambientVolume) / 100
    });
  }

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
   * the loudest few ids and fires an intermittent one-shot per id (volume + rate scale with audibility).
   * Used by both wildlife and work SFX.
   *
   * Scheduling is a MEMORYLESS (Poisson) process: when an id fires, the NEXT gap is drawn ONCE from an
   * exponential distribution with the given mean, floored by a refractory minimum. This is the fix for
   * the "loop in your head" rhythm — the old code re-rolled a uniformly-jittered gap every 400 ms tick
   * and fired the instant elapsed-time beat the smallest roll, which statistically collapsed the gaps to
   * a near-constant interval. Exponential inter-arrivals have no perceptible period.
   */
  function emitSfx(
    product: Map<string, number>,
    opts: {
      clips: (id: string) => string[];
      label: (id: string) => string;
      gain: number;
      fastMs: number;
      slowMs: number;
      minGapMs: number;
      rarity?: (id: string) => number; // multiplier on the mean gap (default 1)
      nextFire: Map<string, number>; // id → scheduled time of its next one-shot
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
      const meanGap =
        (opts.fastMs + (opts.slowMs - opts.fastMs) * (1 - e.level)) * (opts.rarity?.(e.id) ?? 1);
      let due = opts.nextFire.get(e.id);
      if (due === undefined) {
        // First time we hear this id: seed a SHORT randomized delay (independent of rarity) so it's
        // actually heard soon after coming into earshot — rarity only governs the gaps AFTER that.
        due = now + opts.minGapMs + Math.random() * opts.fastMs;
        opts.nextFire.set(e.id, due);
      }
      if (now >= due) {
        const clips = opts.clips(e.id);
        audioService.playSfx(clips[Math.floor(Math.random() * clips.length)], e.level * opts.gain);
        // Exponential (memoryless) inter-arrival with the right mean, floored so it never machine-guns.
        const gap = Math.max(opts.minGapMs, -Math.log(1 - Math.random()) * meanGap);
        opts.nextFire.set(e.id, now + gap);
      }
    }
    // NB: schedules PERSIST even while an id is out of earshot (we never delete them). An intermittently
    // audible creature like the mountain goat keeps accruing its wait and fires when next heard, rather
    // than resetting its timer every time it drops out of the audible top-N (which silenced it entirely).
    opts.setLevels(audible.map((e) => ({ label: e.label, level: e.level })));
  }

  /**
   * Spatial creature SFX: per archetype, combine every individual's audibility (zoom × viewport
   * proximity × nearest-pawn distance; more individuals = louder via 1−Π(1−c)). On-screen + zoomed in
   * + near the colony = loud & frequent; far from pawns or zoomed out = very silent. Asleep/downed/dead
   * mobs are skipped.
   */
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
      minGapMs: CALL_MIN_GAP_MS,
      rarity: (id) => CALL_RARITY[id] ?? 1,
      nextFire,
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

  /**
   * Ambient "closeness" 0..1 across the FULL live zoom range — 1 = fully zoomed in (local detail loud),
   * 0 = whole map on screen (only weather). Normalised against cameraZoomRange (min = whole-map fit,
   * max = MAX_TILE_W) so it adapts to map size, and LOGARITHMIC because tile-size is perceptually log
   * (1→2 px is a far bigger zoom step than 39→40 px). The old curve hard-coded a 12–28 px band that sat
   * in the zoomed-OUT sliver of the range, so the mix stayed flat through most of the wheel and only the
   * forest/birds dropped at the very end; this glides the detail/weather balance evenly the whole way.
   */
  function zoomDetail(tile: number): number {
    const { min, max } = get(cameraZoomRange);
    const lo = Math.max(1, min);
    if (max <= lo) return 1;
    const t = Math.max(lo, Math.min(max, tile));
    return (Math.log(t) - Math.log(lo)) / (Math.log(max) - Math.log(lo));
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
    const detail = zoomDetail(get(cameraTileSize));
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

    // Apply the volume buses now and on every slider change (fires immediately on subscribe too).
    const volUnsubs = [masterVolume, musicVolume, sfxVolume, ambientVolume].map((s) =>
      s.subscribe(pushVolumes)
    );

    // Combat sound cues — play each new cue once at a zoom/viewport-scaled volume (distant brawls stay
    // quiet). Tracks fired ids; pruned to the live list so it stays bounded.
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
      volUnsubs.forEach((u) => u());
      clearInterval(iv);
      clearInterval(sfxIv);
      audioService.dispose();
    };
  });
</script>
