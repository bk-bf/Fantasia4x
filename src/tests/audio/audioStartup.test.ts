import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  installAudioFakes,
  dispatchDoc,
  advance,
  now,
  timeline,
  sourceStarts,
  htmlNodes,
  resetRecords
} from './audioFakes';

const CLEAR_DAY_BEDS = ['/audio/ambient/birds-day.ogg', '/audio/ambient/forest.ogg'];
const MUSIC_TARGET = 0.7 * 0.7;

let ticker: ReturnType<typeof setInterval> | undefined;
let clickAt = 0;
let musicPlayAt = 0;
const musicSamples: { t: number; v: number }[] = [];

beforeAll(async () => {
  vi.useFakeTimers();
  installAudioFakes({
    fetchMs: 50,
    decodeMs: 2000,
    canplayMs: 80,
    sfxDurS: 0.1,
    sampleRate: 48000
  });
  const { audioService } = await import('$lib/audio/AudioService');
  const { resolveAmbient } = await import('$lib/audio/manifest');
  resetRecords();

  const menuAmbient = resolveAmbient({ weatherType: 'clear', isNight: false, intensity: 0 });
  for (let i = 0; i < 4; i++)
    audioService.setVolumes({ master: 0.7, music: 0.7, sfx: 0.8, ambient: 0.7 });
  audioService.preload();
  ticker = setInterval(() => audioService.setAmbient(menuAmbient), 400);
  await advance(3000);

  clickAt = now();
  audioService.unlock();
  await Promise.resolve();
  audioService.setScene('menu');
  await advance(60);
  dispatchDoc('click');
  for (let i = 0; i < 60; i++) {
    await advance(50);
    const music = htmlNodes.find((n) => n.src.includes('/music/') && !n.paused);
    if (music) musicSamples.push({ t: now(), v: music.volume });
  }
  musicPlayAt = timeline.find((e) => e.what.startsWith('html5 play /audio/music/'))?.t ?? NaN;
});

afterAll(() => {
  clearInterval(ticker);
  vi.useRealTimers();
});

describe('first gesture with the controller preloading at mount', () => {
  it('starts the ambient beds within 50 ms of the first click', () => {
    for (const url of CLEAR_DAY_BEDS) {
      const start = sourceStarts.find((s) => s.url === url);
      expect(start, url).toBeDefined();
      expect(start!.t - clickAt, url).toBeLessThanOrEqual(50);
    }
  });

  it('neither creates nor closes an AudioContext during the first click on a 48 kHz device', () => {
    const contextEvents = timeline.filter((e) => e.t >= clickAt && e.what.startsWith('context '));
    expect(contextEvents).toEqual([]);
  });

  it('brings the first music track to its volume within 400 ms of it starting', () => {
    expect(Number.isFinite(musicPlayAt)).toBe(true);
    const at400 = musicSamples.find((s) => s.t >= musicPlayAt + 400);
    expect(at400).toBeDefined();
    expect(at400!.v).toBeGreaterThanOrEqual(MUSIC_TARGET * 0.95);
  });
});
