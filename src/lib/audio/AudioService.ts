import { Howl, Howler } from 'howler';
import { writable } from 'svelte/store';
import {
  playlistFor,
  AMBIENT_FILES,
  FIRE_LOOP,
  type MusicScene,
  type AmbientBed,
  type AmbientLayers
} from './manifest';
import type { Season } from '$lib/game/core/types';

const MUSIC_FADE_MS = 2200;
const AMBIENT_SMOOTH_TAU_MS = 320;
const MAX_CONCURRENT_SFX = 3;

const EMERGENCY_SCENES: ReadonlySet<MusicScene> = new Set<MusicScene>(['combat']);

interface Bus {
  master: number;
  music: number;
  sfx: number;
  ambient: number;
}

export interface NowPlaying {
  unlocked: boolean;
  scene: MusicScene | null;
  track: string | null;
  ambient: { bed: AmbientBed; gain: number }[];
  creatures: { label: string; level: number }[];
  work: { label: string; level: number }[];
  fire: number;
  volumes: Bus;
}

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
  target: number;
  vol: number;
  playing: boolean;
}

class AudioServiceImpl {
  private bus: Bus = { master: 0.7, music: 0.7, sfx: 0.8, ambient: 0.7 };
  private unlocked = false;

  private scene: MusicScene | null = null;
  private desiredScene: MusicScene | null = null;
  private season: Season | undefined;
  private musicHowl: Howl | null = null;
  private currentTrack: string | null = null;
  private playlist: string[] = [];
  private playIdx = 0;

  private beds = new Map<AmbientBed, BedState>();
  private fireBed: BedState | null = null;
  private rafId: number | null = null;
  private lastRafTs = 0;

  private sfxHowls = new Map<string, Howl>();
  private uiHowls = new Map<string, Howl>();
  private activeSfx = 0;
  private creatureLevels: { label: string; level: number }[] = [];
  private workLevels: { label: string; level: number }[] = [];

  unlock(): void {
    if (this.unlocked || typeof window === 'undefined') return;
    this.unlocked = true;
    Howler.volume(this.bus.master);
    const ctx = Howler.ctx;
    if (ctx && ctx.state === 'suspended') void ctx.resume();
    this.publish();
  }

  setVolumes(v: Partial<Bus>): void {
    this.bus = { ...this.bus, ...v };
    if (this.unlocked) Howler.volume(this.bus.master);
    if (this.musicHowl) this.musicHowl.volume(this.bus.music);
    for (const bed of this.beds.values()) {
      if (bed.playing) bed.howl.volume(Math.min(1, bed.vol) * this.bus.ambient);
    }
    if (this.fireBed?.playing)
      this.fireBed.howl.volume(Math.min(1, this.fireBed.vol) * this.bus.ambient);
    this.publish();
  }

  setScene(scene: MusicScene, season?: Season): void {
    this.season = season;
    if (!this.unlocked || scene === this.desiredScene) return;
    this.desiredScene = scene;
    const idle = !this.musicHowl;
    const emergency =
      EMERGENCY_SCENES.has(scene) || (this.scene != null && EMERGENCY_SCENES.has(this.scene));
    if ((idle || emergency) && scene !== this.scene) this.switchTo(scene);
  }

  private switchTo(scene: MusicScene): void {
    this.scene = scene;
    this.playlist = shuffle(playlistFor(scene, this.season));
    this.playIdx = 0;
    this.startTrack(this.playlist[0]);
  }

  playSfx(url: string, volume: number): void {
    if (!this.unlocked || volume <= 0) return;
    if (this.activeSfx >= MAX_CONCURRENT_SFX) return;
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

  setCreatureLevels(levels: { label: string; level: number }[]): void {
    this.creatureLevels = levels;
    if (this.unlocked) this.publish();
  }

  setWorkLevels(levels: { label: string; level: number }[]): void {
    this.workLevels = levels;
    if (this.unlocked) this.publish();
  }

  setAmbient(layers: AmbientLayers): void {
    if (!this.unlocked) return;
    for (const [id, bed] of this.beds) {
      if (!(id in layers) || (layers[id] ?? 0) <= 0) this.fadeBed(bed, 0);
    }
    for (const id of Object.keys(layers) as AmbientBed[]) {
      const target = Math.max(0, Math.min(1, layers[id] ?? 0));
      if (target <= 0) continue;
      this.fadeBed(this.ensureBed(id), target);
    }
  }

  setFireLevel(target: number): void {
    if (!this.unlocked) return;
    const t = Math.max(0, Math.min(1, target));
    if (!this.fireBed) {
      if (t <= 0) return;
      this.fireBed = {
        howl: new Howl({ src: [FIRE_LOOP], html5: false, loop: true, volume: 0 }),
        target: 0,
        vol: 0,
        playing: false
      };
    }
    this.fadeBed(this.fireBed, t);
  }

  dispose(): void {
    if (this.rafId != null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = null;
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
    if (from !== this.musicHowl) return;
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
      bed = { howl, target: 0, vol: 0, playing: false };
      this.beds.set(id, bed);
    }
    return bed;
  }

  private fadeBed(bed: BedState, target: number): void {
    target = Math.max(0, Math.min(1, target));
    bed.target = target;
    if (target > 0 && !bed.playing) {
      bed.playing = true;
      bed.vol = 0;
      bed.howl.volume(0);
      bed.howl.play();
    }
    this.ensureSmoothing();
    this.publish();
  }

  private ensureSmoothing(): void {
    if (this.rafId != null || typeof requestAnimationFrame === 'undefined') return;
    this.lastRafTs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const step = (ts: number) => {
      const dt = Math.min(100, Math.max(0, ts - this.lastRafTs));
      this.lastRafTs = ts;
      const k = 1 - Math.exp(-dt / AMBIENT_SMOOTH_TAU_MS);
      let active = false;
      const glide = (bed: BedState) => {
        if (!bed.playing) return;
        bed.vol += (bed.target - bed.vol) * k;
        if (bed.target <= 0 && bed.vol <= 1e-3) {
          bed.vol = 0;
          bed.playing = false;
          bed.howl.pause();
          return;
        }
        bed.howl.volume(Math.min(1, bed.vol) * this.bus.ambient);
        active = true;
      };
      for (const bed of this.beds.values()) glide(bed);
      if (this.fireBed) glide(this.fireBed);
      this.rafId = active ? requestAnimationFrame(step) : null;
    };
    this.rafId = requestAnimationFrame(step);
  }
}

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const audioService = new AudioServiceImpl();
