import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { installAudioFakes, dispatchDoc, advance, counters } from './audioFakes';

type Service = (typeof import('$lib/audio/AudioService'))['audioService'];

let audioService: Service;
let clearDay: import('$lib/audio/manifest').AmbientLayers;

beforeAll(async () => {
  vi.useFakeTimers();
  installAudioFakes({ fetchMs: 20, decodeMs: 50, canplayMs: 50, sfxDurS: 0.1, sampleRate: 44100 });
  ({ audioService } = await import('$lib/audio/AudioService'));
  const { resolveAmbient } = await import('$lib/audio/manifest');
  clearDay = resolveAmbient({ weatherType: 'clear', isNight: false, intensity: 0 });
  audioService.unlock();
  dispatchDoc('click');
  for (let i = 0; i < 15; i++) {
    audioService.setAmbient(clearDay);
    await advance(400);
  }
});

afterAll(() => {
  vi.useRealTimers();
});

describe('ambient smoothing once the beds have settled', () => {
  it('stops running per-frame callbacks and gain writes while the 400 ms ticks repeat the same targets', async () => {
    const frames = counters.rafFrames;
    const gainSets = counters.gainSets;
    for (let i = 0; i < 5; i++) {
      audioService.setAmbient(clearDay);
      await advance(400);
    }
    expect(counters.rafFrames - frames).toBeLessThanOrEqual(5);
    expect(counters.gainSets - gainSets).toBeLessThanOrEqual(10);
  });

  it('publishes now-playing once per ambient update', async () => {
    const { nowPlaying } = await import('$lib/audio/AudioService');
    let sets = 0;
    const stop = nowPlaying.subscribe(() => sets++);
    sets = 0;
    audioService.setAmbient(clearDay);
    stop();
    expect(sets).toBe(1);
  });
});
