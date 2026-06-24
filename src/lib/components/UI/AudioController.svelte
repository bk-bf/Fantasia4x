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
  import { gameState, currentWeather } from '$lib/stores/gameState';
  import { attackLunges } from '$lib/stores/attackLunges';
  import { combatFeedback } from '$lib/stores/combatFeedback';
  import { masterVolume, musicVolume, sfxVolume } from '$lib/stores/uiPrefs';
  import { environmentService, getAmbientLight } from '$lib/game/services/EnvironmentService';
  import { audioService } from '$lib/audio/AudioService';
  import { resolveAmbient, type MusicScene } from '$lib/audio/manifest';

  let { isMenu = false }: { isMenu?: boolean } = $props();

  const COMBAT_HOLD_MS = 6000; // keep combat music briefly after the last blow
  const NIGHT_LIGHT = 0.4; // ambient-light threshold for "night"
  const NIGHT_HYST = 0.06; // hysteresis band so dusk doesn't flip-flop the track

  let lastCombatAt = 0;
  let wasNight = false;
  let nowTick = $state(0); // bumped every 1 s to re-evaluate combat-hold + dusk

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

    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      stampLunge();
      stampFloat();
      clearInterval(iv);
      audioService.dispose();
    };
  });
</script>
