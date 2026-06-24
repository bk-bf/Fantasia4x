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
  import { attackLunges } from '$lib/stores/attackLunges';
  import { combatFeedback } from '$lib/stores/combatFeedback';
  import { masterVolume, musicVolume, sfxVolume } from '$lib/stores/uiPrefs';
  import { cameraViewport, cameraTileSize } from '$lib/stores/cameraView';
  import { environmentService, getAmbientLight } from '$lib/game/services/EnvironmentService';
  import { getCreatureById } from '$lib/game/core/Creatures';
  import { audioService } from '$lib/audio/AudioService';
  import {
    resolveAmbient,
    creatureClips,
    CREATURE_SOUND_LABELS,
    type MusicScene
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
  const CALL_FAST_MS = 3000; // avg gap between calls for a fully-audible archetype
  const CALL_SLOW_MS = 18000; // avg gap for a barely-audible one
  const CREATURE_GAIN = 0.21; // master trim so wildlife sits quietly under the music
  const MAX_CONCURRENT_ARCHETYPES = 3; // only the 3 loudest archetypes may call (no swarm of sounds)
  const LEVEL_EPS = 0.02; // below this, treat as silent

  let lastCombatAt = 0;
  let wasNight = false;
  let nowTick = $state(0); // bumped every 1 s to re-evaluate combat-hold + dusk
  const lastFired = new Map<string, number>(); // archetype id → last one-shot time

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

    const inCombat =
      Date.now() - lastCombatAt < COMBAT_HOLD_MS || (gs?.pawns?.some((p) => p.drafted) ?? false);

    let scene: MusicScene;
    if (isMenu) scene = 'menu';
    else if (inCombat) scene = 'combat';
    else scene = night ? 'night' : 'day';
    audioService.setScene(scene);

    // No world on the title screen → no nature beds.
    if (isMenu) {
      audioService.setAmbient({});
    } else {
      audioService.setAmbient(
        resolveAmbient({
          weatherType: wx?.type ?? 'clear',
          isNight: night,
          intensity: wx?.intensity ?? 0
        })
      );
    }
  });

  /**
   * Spatial creature SFX: per archetype, combine every individual's audibility (zoom × viewport
   * proximity, more individuals = louder via 1−Π(1−c)), publish the levels for the debug panel, and
   * roll an intermittent one-shot whose volume + frequency scale with that audibility. On-screen +
   * zoomed in = loud & frequent; just off-screen = rare & faint; far away or zoomed out = quiet/none.
   */
  function evalCreatures(): void {
    if (isMenu) {
      audioService.setCreatureLevels([]);
      return;
    }
    const mobs = $gameState?.mobs;
    const vp = get(cameraViewport);
    const tile = get(cameraTileSize);
    if (!mobs?.length || vp.w <= 0) {
      audioService.setCreatureLevels([]);
      return;
    }

    const zoomNorm = Math.max(
      0,
      Math.min(1, (tile - ZOOM_REF_LOW) / (ZOOM_REF_HIGH - ZOOM_REF_LOW))
    );
    const zoomGain = ZOOM_OUT_FLOOR + (1 - ZOOM_OUT_FLOOR) * zoomNorm;

    // Pawn positions for the nearest-pawn distance attenuation.
    const pawns = ($gameState?.pawns ?? [])
      .map((p) => p.position)
      .filter((pos): pos is { x: number; y: number } => !!pos);

    const x0 = vp.x;
    const y0 = vp.y;
    const x1 = vp.x + vp.w;
    const y1 = vp.y + vp.h;
    const marginX = vp.w * OFFSCREEN_MARGIN;
    const marginY = vp.h * OFFSCREEN_MARGIN;

    // product of (1 − contribution) per archetype; audibility = 1 − product.
    const product = new Map<string, number>();
    for (const m of mobs) {
      const def = getCreatureById(m.creatureId);
      const sound = def?.audio;
      if (!sound || creatureClips(sound).length === 0) continue;

      let spatial: number;
      const inside = m.x >= x0 && m.x < x1 && m.y >= y0 && m.y < y1;
      if (inside) {
        spatial = 1;
      } else {
        const dx = m.x < x0 ? x0 - m.x : m.x >= x1 ? m.x - x1 : 0;
        const dy = m.y < y0 ? y0 - m.y : m.y >= y1 ? m.y - y1 : 0;
        if (dx > marginX || dy > marginY) continue; // out of earshot
        const fall = Math.min(1 - dx / marginX, 1 - dy / marginY);
        spatial = OFFSCREEN_MAX * Math.max(0, fall);
      }

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

      const c = Math.max(0, Math.min(1, zoomGain * spatial * pawnGain));
      if (c <= 0) continue;
      product.set(sound, (product.get(sound) ?? 1) * (1 - c));
    }

    const now = Date.now();
    const entries: { sound: string; label: string; level: number }[] = [];
    for (const [sound, prod] of product) {
      const level = 1 - prod;
      if (level < LEVEL_EPS) continue;
      entries.push({
        sound,
        label: CREATURE_SOUND_LABELS[sound as keyof typeof CREATURE_SOUND_LABELS] ?? sound,
        level
      });
    }
    // Only the loudest few archetypes may call — never a swarm of overlapping sounds.
    entries.sort((a, b) => b.level - a.level);
    const audible = entries.slice(0, MAX_CONCURRENT_ARCHETYPES);

    for (const e of audible) {
      // Intermittent one-shot: louder archetypes call more often, with jitter.
      const gap =
        (CALL_FAST_MS + (CALL_SLOW_MS - CALL_FAST_MS) * (1 - e.level)) *
        (0.7 + Math.random() * 0.6);
      if (now - (lastFired.get(e.sound) ?? 0) >= gap) {
        const clips = creatureClips(e.sound);
        audioService.playSfx(
          clips[Math.floor(Math.random() * clips.length)],
          e.level * CREATURE_GAIN
        );
        lastFired.set(e.sound, now);
      }
    }
    audioService.setCreatureLevels(audible.map((e) => ({ label: e.label, level: e.level })));
  }

  onMount(() => {
    const unlock = () => {
      audioService.unlock();
      nowTick = Date.now(); // kick an immediate re-evaluation once audio is unlocked
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    const stampLunge = attackLunges.subscribe((l) => l.length && (lastCombatAt = Date.now()));
    const stampFloat = combatFeedback.subscribe((l) => l.length && (lastCombatAt = Date.now()));
    const iv = setInterval(() => (nowTick = Date.now()), 1000);
    const creatureIv = setInterval(evalCreatures, CREATURE_TICK_MS);

    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      stampLunge();
      stampFloat();
      clearInterval(iv);
      clearInterval(creatureIv);
      audioService.dispose();
    };
  });
</script>
