// AudioService.ts — the playback engine (the "how", separate from manifest.ts's "what"). A thin
// Howler.js wrapper exposing two logical channels and three volume buses; the reactive decisions
// ("play the night track", "fade in rain") are made by AudioController.svelte and pushed in here.
//
// Channels:
//   • MUSIC   — one active track at a time; setScene() crossfades to a track from that scene and
//               advances the scene's playlist on track end. Streamed (html5) to keep memory low.
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
import { MUSIC, AMBIENT_FILES, type MusicScene, type AmbientBed, type AmbientLayers } from './manifest';

const MUSIC_FADE_MS = 2200;
const AMBIENT_FADE_MS = 1600;

interface Bus {
  master: number;
  music: number;
  sfx: number;
}

interface BedState {
  howl: Howl;
  target: number; // 0–1 bed gain (pre-sfx-bus)
  playing: boolean;
}

class AudioServiceImpl {
  private bus: Bus = { master: 0.7, music: 0.7, sfx: 0.8 };
  private unlocked = false;

  // ── Music channel ──
  private scene: MusicScene | null = null;
  private musicHowl: Howl | null = null;
  private playlist: string[] = [];
  private playIdx = 0;

  // ── Ambient channel ──
  private beds = new Map<AmbientBed, BedState>();

  /** Resume the AudioContext on a user gesture and apply the current master volume. Idempotent. */
  unlock(): void {
    if (this.unlocked || typeof window === 'undefined') return;
    this.unlocked = true;
    Howler.volume(this.bus.master);
    // Howler creates/locks the context lazily; nudging it here resumes a suspended context.
    const ctx = Howler.ctx;
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }

  /** Push the volume buses. master is global; music/sfx re-scale their live channels. */
  setVolumes(v: Partial<Bus>): void {
    this.bus = { ...this.bus, ...v };
    if (this.unlocked) Howler.volume(this.bus.master);
    // Re-apply per-channel gains immediately (no fade — slider drags should track live).
    if (this.musicHowl) this.musicHowl.volume(this.bus.music);
    for (const bed of this.beds.values()) {
      if (bed.playing) bed.howl.volume(bed.target * this.bus.sfx);
    }
  }

  /** Switch the music scene, crossfading from the current track. No-op if already on that scene. */
  setScene(scene: MusicScene): void {
    if (!this.unlocked || scene === this.scene) return;
    this.scene = scene;
    this.playlist = shuffle(MUSIC[scene] ?? []);
    this.playIdx = 0;
    this.startTrack(this.playlist[0]);
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

  /** Stop everything and release the Howls (e.g. on teardown). */
  dispose(): void {
    this.musicHowl?.unload();
    this.musicHowl = null;
    this.scene = null;
    for (const bed of this.beds.values()) bed.howl.unload();
    this.beds.clear();
  }

  // ── internals ──────────────────────────────────────────────────────────────────────────────────

  private startTrack(url: string | undefined): void {
    const prev = this.musicHowl;
    if (prev) {
      // Crossfade: fade the outgoing track out, then unload it.
      prev.fade(prev.volume(), 0, MUSIC_FADE_MS);
      prev.once('fade', () => prev.unload());
    }
    if (!url) {
      this.musicHowl = null;
      return;
    }
    const howl = new Howl({ src: [url], html5: true, volume: 0, loop: false });
    howl.once('end', () => this.advanceTrack(howl));
    howl.play();
    howl.fade(0, this.bus.music, MUSIC_FADE_MS);
    this.musicHowl = howl;
  }

  private advanceTrack(from: Howl): void {
    if (from !== this.musicHowl || !this.scene) return; // scene changed underneath us
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
    const to = target * this.bus.sfx;
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
