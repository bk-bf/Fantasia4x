// AudioService.ts — the playback engine (the "how", separate from manifest.ts's "what"). A thin
// Howler.js wrapper exposing two logical channels and three volume buses; the reactive decisions
// ("play the night track", "fade in rain") are made by AudioController.svelte and pushed in here.
//
// Channels:
//   • MUSIC   — one active track at a time; setScene() switches scene. Normal scene changes wait for
//               the current track to FINISH (no mid-song cut); only combat interrupts mid-song. Plays
//               through the scene's shuffled playlist, advancing on track end. Streamed (html5).
//   • AMBIENT — a pool of looping nature beds; setAmbient() crossfades each bed's gain toward a
//               target (0 = fade out + pause). Web-Audio (html5:false) so the loops are gapless.
//
// Buses (0–1): master scales everything; music scales the MUSIC channel; sfx scales the AMBIENT
// channel (nature ambience reads as sound-effects, so the SFX slider governs it). Effective volume =
// per-element bus × per-element gain, with `master` applied globally via Howler.volume().
//
// Singleton: import { audioService }. Never construct AudioServiceImpl directly. All methods are
// no-ops until the browser unlocks audio (autoplay policy) — call unlock() from a user gesture.
import { Howl, Howler } from 'howler';
import { writable } from 'svelte/store';
import {
  MUSIC,
  AMBIENT_FILES,
  FIRE_LOOP,
  type MusicScene,
  type AmbientBed,
  type AmbientLayers
} from './manifest';

const MUSIC_FADE_MS = 2200;
const AMBIENT_FADE_MS = 1600;
const MAX_CONCURRENT_SFX = 3; // hard ceiling on simultaneously-playing creature one-shots

// Scenes that replace the current track MID-SONG (fade out + swap). Everything else waits for the
// playing track to finish before switching, so day↔night↔menu never cut a piece off — only the
// emergency combat transition (into OR out of a fight) interrupts.
const EMERGENCY_SCENES: ReadonlySet<MusicScene> = new Set<MusicScene>(['combat']);

interface Bus {
  master: number;
  music: number;
  sfx: number;
  /** Looping environment beds — weather/nature ambience (rain/wind/birds/…) + fire. Separate from
   *  `sfx` (discrete one-shots: creatures/work/combat/UI) so rain can be quieted on its own. */
  ambient: number;
}

/** Live playback snapshot for the debug "Now playing" panel. */
export interface NowPlaying {
  unlocked: boolean;
  scene: MusicScene | null;
  track: string | null; // current music file url (null = silence)
  ambient: { bed: AmbientBed; gain: number }[]; // active beds with their target gain (0–1)
  creatures: { label: string; level: number }[]; // audible creature archetypes + their 0–1 audibility
  work: { label: string; level: number }[]; // audible work activities + their 0–1 audibility
  fire: number; // campfire-crackle loop audibility 0–1 (lit fire buildings in earshot)
  volumes: Bus;
}

/** Reactive playback state — subscribed by AudioNowPlaying.svelte. */
export const nowPlaying = writable<NowPlaying>({
  unlocked: false,
  scene: null,
  track: null,
  ambient: [],
  creatures: [],
  work: [],
  fire: 0,
  volumes: { master: 0.7, music: 0.7, sfx: 0.8, ambient: 0.7 }
});

interface BedState {
  howl: Howl;
  target: number; // 0–1 bed gain (pre-sfx-bus)
  playing: boolean;
}

class AudioServiceImpl {
  private bus: Bus = { master: 0.7, music: 0.7, sfx: 0.8, ambient: 0.7 };
  private unlocked = false;

  // ── Music channel ──
  private scene: MusicScene | null = null; // scene currently playing
  private desiredScene: MusicScene | null = null; // scene we want next (applied at track end)
  private musicHowl: Howl | null = null;
  private currentTrack: string | null = null;
  private playlist: string[] = [];
  private playIdx = 0;

  // ── Ambient channel ──
  private beds = new Map<AmbientBed, BedState>();
  private fireBed: BedState | null = null; // looping campfire crackle (lit fire buildings)

  // ── Creature SFX (intermittent one-shots) ──
  private sfxHowls = new Map<string, Howl>(); // cached per clip url
  private uiHowls = new Map<string, Howl>(); // cached per UI clip url (hover/click)
  private activeSfx = 0; // currently-sounding one-shots (hard concurrency cap)
  private creatureLevels: { label: string; level: number }[] = []; // for the debug panel only
  private workLevels: { label: string; level: number }[] = []; // for the debug panel only

  /** Resume the AudioContext on a user gesture and apply the current master volume. Idempotent. */
  unlock(): void {
    if (this.unlocked || typeof window === 'undefined') return;
    this.unlocked = true;
    Howler.volume(this.bus.master);
    // Howler creates/locks the context lazily; nudging it here resumes a suspended context.
    const ctx = Howler.ctx;
    if (ctx && ctx.state === 'suspended') void ctx.resume();
    this.publish();
  }

  /** Push the volume buses. master is global; music/sfx re-scale their live channels. */
  setVolumes(v: Partial<Bus>): void {
    this.bus = { ...this.bus, ...v };
    if (this.unlocked) Howler.volume(this.bus.master);
    // Re-apply per-channel gains immediately (no fade — slider drags should track live).
    if (this.musicHowl) this.musicHowl.volume(this.bus.music);
    for (const bed of this.beds.values()) {
      if (bed.playing) bed.howl.volume(bed.target * this.bus.ambient);
    }
    if (this.fireBed?.playing) this.fireBed.howl.volume(this.fireBed.target * this.bus.ambient);
    this.publish();
  }

  /**
   * Request a music scene. Normal scenes (day/night/menu) are deferred until the current track
   * finishes — they never cut a piece off mid-play. Combat (an EMERGENCY scene) replaces the track
   * mid-song, both when a fight starts and when it ends (so the battle theme doesn't linger). With
   * nothing playing, the requested scene starts at once.
   */
  setScene(scene: MusicScene): void {
    if (!this.unlocked || scene === this.desiredScene) return;
    this.desiredScene = scene;
    const idle = !this.musicHowl;
    const emergency =
      EMERGENCY_SCENES.has(scene) || (this.scene != null && EMERGENCY_SCENES.has(this.scene));
    if ((idle || emergency) && scene !== this.scene) this.switchTo(scene);
  }

  /** Begin playing `scene` now (shuffled playlist), crossfading from any current track. */
  private switchTo(scene: MusicScene): void {
    this.scene = scene;
    this.playlist = shuffle(MUSIC[scene] ?? []);
    this.playIdx = 0;
    this.startTrack(this.playlist[0]);
  }

  /**
   * Fire a creature vocalisation one-shot at `volume` (0–1, before the sfx bus). Cheap and
   * overlap-safe (Howler allocates a fresh node per play), so several creatures can call at once.
   */
  playSfx(url: string, volume: number): void {
    if (!this.unlocked || volume <= 0) return;
    if (this.activeSfx >= MAX_CONCURRENT_SFX) return; // never more than N creature sounds at once
    let howl = this.sfxHowls.get(url);
    if (!howl) {
      howl = new Howl({ src: [url], volume: 1, preload: true });
      this.sfxHowls.set(url, howl);
    }
    const id = howl.play();
    howl.volume(Math.max(0, Math.min(1, volume)) * this.bus.sfx, id);
    this.activeSfx++;
    const release = () => (this.activeSfx = Math.max(0, this.activeSfx - 1));
    howl.once('end', release, id);
    howl.once('stop', release, id);
    howl.once('playerror', release, id);
  }

  /**
   * Fire a UI feedback one-shot (button hover/click) at `volume` (0–1, before the sfx bus). Cached per
   * clip; NOT subject to the creature-SFX concurrency cap so a click always responds, even mid-ambient.
   */
  playUi(url: string, volume: number): void {
    if (!this.unlocked || volume <= 0) return;
    let howl = this.uiHowls.get(url);
    if (!howl) {
      howl = new Howl({ src: [url], volume: 1, preload: true });
      this.uiHowls.set(url, howl);
    }
    const id = howl.play();
    howl.volume(Math.max(0, Math.min(1, volume)) * this.bus.sfx, id);
  }

  /** Publish the current creature audibility levels (debug panel only — playback is via playSfx). */
  setCreatureLevels(levels: { label: string; level: number }[]): void {
    this.creatureLevels = levels;
    if (this.unlocked) this.publish();
  }

  /** Publish the current work-activity audibility levels (debug panel only — playback is via playSfx). */
  setWorkLevels(levels: { label: string; level: number }[]): void {
    this.workLevels = levels;
    if (this.unlocked) this.publish();
  }

  /** Crossfade the ambient bed mix toward the given target gains. Beds omitted fade to silence. */
  setAmbient(layers: AmbientLayers): void {
    if (!this.unlocked) return;
    // Fade out beds no longer wanted.
    for (const [id, bed] of this.beds) {
      if (!(id in layers) || (layers[id] ?? 0) <= 0) this.fadeBed(bed, 0);
    }
    // Fade in / adjust wanted beds.
    for (const id of Object.keys(layers) as AmbientBed[]) {
      const target = Math.max(0, Math.min(1, layers[id] ?? 0));
      if (target <= 0) continue;
      this.fadeBed(this.ensureBed(id), target);
    }
  }

  /** Crossfade the single campfire-crackle loop toward `target` gain (0 = fade out + pause). */
  setFireLevel(target: number): void {
    if (!this.unlocked) return;
    const t = Math.max(0, Math.min(1, target));
    if (!this.fireBed) {
      if (t <= 0) return; // nothing playing, nothing wanted — don't allocate
      this.fireBed = {
        howl: new Howl({ src: [FIRE_LOOP], html5: false, loop: true, volume: 0 }),
        target: 0,
        playing: false
      };
    }
    this.fadeBed(this.fireBed, t);
  }

  /** Stop everything and release the Howls (e.g. on teardown). */
  dispose(): void {
    this.musicHowl?.unload();
    this.musicHowl = null;
    this.currentTrack = null;
    this.scene = null;
    this.desiredScene = null;
    for (const bed of this.beds.values()) bed.howl.unload();
    this.beds.clear();
    this.fireBed?.howl.unload();
    this.fireBed = null;
    for (const howl of this.sfxHowls.values()) howl.unload();
    this.sfxHowls.clear();
    for (const howl of this.uiHowls.values()) howl.unload();
    this.uiHowls.clear();
    this.activeSfx = 0;
    this.creatureLevels = [];
    this.workLevels = [];
    this.publish();
  }

  // ── internals ──────────────────────────────────────────────────────────────────────────────────

  /** Push the current playback snapshot into the reactive `nowPlaying` store (debug panel). */
  private publish(): void {
    const ambient = [...this.beds.entries()]
      .filter(([, b]) => b.playing && b.target > 0)
      .map(([bed, b]) => ({ bed, gain: b.target }));
    nowPlaying.set({
      unlocked: this.unlocked,
      scene: this.scene,
      track: this.currentTrack,
      ambient,
      creatures: this.creatureLevels,
      work: this.workLevels,
      fire: this.fireBed?.playing ? this.fireBed.target : 0,
      volumes: { ...this.bus }
    });
  }

  private startTrack(url: string | undefined): void {
    const prev = this.musicHowl;
    if (prev) {
      // Crossfade: fade the outgoing track out, then unload it.
      prev.fade(prev.volume(), 0, MUSIC_FADE_MS);
      prev.once('fade', () => prev.unload());
    }
    if (!url) {
      this.musicHowl = null;
      this.currentTrack = null;
      this.publish();
      return;
    }
    const howl = new Howl({ src: [url], html5: true, volume: 0, loop: false });
    howl.once('end', () => this.advanceTrack(howl));
    howl.play();
    howl.fade(0, this.bus.music, MUSIC_FADE_MS);
    this.musicHowl = howl;
    this.currentTrack = url;
    this.publish();
  }

  private advanceTrack(from: Howl): void {
    if (from !== this.musicHowl) return; // a newer track already took over
    // A scene change was deferred while this track played — honour it now that it has finished.
    if (this.desiredScene && this.desiredScene !== this.scene) {
      this.switchTo(this.desiredScene);
      return;
    }
    if (!this.scene) return;
    this.playIdx = (this.playIdx + 1) % this.playlist.length;
    this.startTrack(this.playlist[this.playIdx]);
  }

  private ensureBed(id: AmbientBed): BedState {
    let bed = this.beds.get(id);
    if (!bed) {
      const howl = new Howl({ src: [AMBIENT_FILES[id]], html5: false, loop: true, volume: 0 });
      bed = { howl, target: 0, playing: false };
      this.beds.set(id, bed);
    }
    return bed;
  }

  private fadeBed(bed: BedState, target: number): void {
    bed.target = target;
    const to = target * this.bus.ambient;
    if (target > 0 && !bed.playing) {
      bed.playing = true;
      bed.howl.play();
      bed.howl.fade(0, to, AMBIENT_FADE_MS);
    } else if (target > 0) {
      bed.howl.fade(bed.howl.volume(), to, AMBIENT_FADE_MS);
    } else if (bed.playing) {
      bed.howl.fade(bed.howl.volume(), 0, AMBIENT_FADE_MS);
      bed.howl.once('fade', () => bed.howl.pause());
      bed.playing = false;
    }
    this.publish();
  }
}

/** Fisher–Yates copy so each scene entry plays before any repeat. */
function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const audioService = new AudioServiceImpl();
