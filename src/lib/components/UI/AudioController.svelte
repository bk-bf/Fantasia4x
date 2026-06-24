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
  import { cameraViewport, cameraTileSize, cameraZoomRange } from '$lib/stores/cameraView';
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
  const ZOOM_FLOOR = 0.35; // in-view audibility when fully zoomed OUT (1.0 when fully zoomed in)
  const OFFSCREEN_MAX = 0.12; // ceiling for just-off-screen creatures ("barely hear them")
  const OFFSCREEN_MARGIN = 0.6; // how far beyond the viewport (× its size) a creature is still faint
  const CALL_FAST_MS = 1500; // avg gap between calls for a fully-audible archetype
  const CALL_SLOW_MS = 9000; // avg gap for a barely-audible one
  const CREATURE_GAIN = 0.85; // master trim so wildlife sits under the music
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
    if (!mobs?.length || vp.w <= 0) {
      audioService.setCreatureLevels([]);
      return;
    }

    const tile = get(cameraTileSize);
    const range = get(cameraZoomRange);
    const zoomNorm = range.max > range.min ? (tile - range.min) / (range.max - range.min) : 1;
    const zoomGain = ZOOM_FLOOR + (1 - ZOOM_FLOOR) * Math.max(0, Math.min(1, zoomNorm));

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
      const c = Math.max(0, Math.min(1, zoomGain * spatial));
      if (c <= 0) continue;
      product.set(sound, (product.get(sound) ?? 1) * (1 - c));
    }

    const now = Date.now();
    const levels: { label: string; level: number }[] = [];
    for (const [sound, prod] of product) {
      const level = 1 - prod;
      if (level < LEVEL_EPS) continue;
      levels.push({
        label: CREATURE_SOUND_LABELS[sound as keyof typeof CREATURE_SOUND_LABELS] ?? sound,
        level
      });

      // Trigger an intermittent one-shot: louder archetypes call more often, with jitter.
      const gap =
        (CALL_FAST_MS + (CALL_SLOW_MS - CALL_FAST_MS) * (1 - level)) * (0.7 + Math.random() * 0.6);
      if (now - (lastFired.get(sound) ?? 0) >= gap) {
        const clips = creatureClips(sound);
        audioService.playSfx(
          clips[Math.floor(Math.random() * clips.length)],
          level * CREATURE_GAIN
        );
        lastFired.set(sound, now);
      }
    }
    levels.sort((a, b) => b.level - a.level);
    audioService.setCreatureLevels(levels);
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
