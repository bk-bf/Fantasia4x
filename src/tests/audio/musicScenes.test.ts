import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { get } from 'svelte/store';
import { installAudioFakes, dispatchDoc, advance, htmlNodes, resetRecords } from './audioFakes';

type Service = (typeof import('$lib/audio/AudioService'))['audioService'];
type NowPlayingStore = (typeof import('$lib/audio/AudioService'))['nowPlaying'];

let audioService: Service;
let nowPlaying: NowPlayingStore;

const playingVolume = (folder: string): number =>
  Math.max(0, ...htmlNodes.filter((n) => n.src.includes(folder) && !n.paused).map((n) => n.volume));

const endPlaying = (folder: string): void => {
  const node = htmlNodes.find((n) => n.src.includes(folder) && !n.paused);
  expect(node).toBeDefined();
  node!.end();
};

beforeAll(async () => {
  vi.useFakeTimers();
  installAudioFakes({ fetchMs: 20, decodeMs: 50, canplayMs: 80, sfxDurS: 0.1, sampleRate: 44100 });
  ({ audioService, nowPlaying } = await import('$lib/audio/AudioService'));
  audioService.unlock();
  dispatchDoc('click');
});

beforeEach(() => {
  audioService.dispose();
  audioService.unlock();
  resetRecords();
});

afterAll(() => {
  vi.useRealTimers();
});

describe('music scene changes', () => {
  it('switches from the menu track to the day playlist when the game starts', async () => {
    audioService.setScene('menu', 'summer');
    await advance(3000);
    expect(get(nowPlaying).track).toMatch(/\/menu\//);
    audioService.setScene('day', 'summer');
    await advance(100);
    expect(get(nowPlaying).scene).toBe('day');
    expect(get(nowPlaying).track).toMatch(/\/day\//);
  });

  it('switches back to the menu playlist when the game returns to the menu', async () => {
    audioService.setScene('day', 'summer');
    await advance(3000);
    audioService.setScene('menu', 'summer');
    await advance(100);
    expect(get(nowPlaying).track).toMatch(/\/menu\//);
  });

  it('still waits for the track to end before moving from day to night', async () => {
    audioService.setScene('day', 'summer');
    await advance(3000);
    audioService.setScene('night', 'summer');
    await advance(100);
    expect(get(nowPlaying).scene).toBe('day');
  });

  it('never lets a track that was still loading play under the scene that replaced it', async () => {
    audioService.setScene('menu', 'summer');
    await advance(20);
    audioService.setScene('combat', 'summer');
    let menuPeak = 0;
    for (let i = 0; i < 80; i++) {
      await advance(50);
      menuPeak = Math.max(menuPeak, playingVolume('/menu/'));
    }
    expect(menuPeak).toBe(0);
    expect(playingVolume('/combat/')).toBeGreaterThan(0.4);
  });

  it('crossfades a playing track out over the full fade when combat interrupts it', async () => {
    audioService.setScene('day', 'summer');
    await advance(3000);
    const dayBefore = playingVolume('/day/');
    audioService.setScene('combat', 'summer');
    await advance(1100);
    const dayMid = playingVolume('/day/');
    expect(dayBefore).toBeGreaterThan(0.4);
    expect(dayMid).toBeGreaterThan(0.1);
    expect(dayMid).toBeLessThan(dayBefore);
    await advance(1500);
    expect(playingVolume('/day/')).toBe(0);
  });

  it('starts the first scene straight away when nothing is playing', async () => {
    audioService.setScene('day', 'summer');
    await advance(100);
    expect(get(nowPlaying).scene).toBe('day');
    expect(get(nowPlaying).track).toMatch(/\/day\//);
  });

  it('moves on to the next track of the playlist when one ends', async () => {
    audioService.setScene('day', 'summer');
    await advance(3000);
    const first = get(nowPlaying).track;
    endPlaying('/day/');
    await advance(500);
    expect(get(nowPlaying).scene).toBe('day');
    expect(get(nowPlaying).track).not.toBe(first);
  });

  it('ignores the end of a track that combat has already replaced', async () => {
    audioService.setScene('day', 'summer');
    await advance(3000);
    audioService.setScene('combat', 'summer');
    await advance(200);
    const combatTrack = get(nowPlaying).track;
    expect(combatTrack).toMatch(/\/combat\//);
    endPlaying('/day/');
    await advance(500);
    expect(get(nowPlaying).track).toBe(combatTrack);
  });
});
