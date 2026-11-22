import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { installAudioFakes, dispatchDoc, advance, sourceStarts, resetRecords } from './audioFakes';

type Service = (typeof import('$lib/audio/AudioService'))['audioService'];
type HowlListeners = { _onend: unknown[]; _onstop: unknown[]; _onplayerror: unknown[] };

let audioService: Service;

const sfxHowl = (url: string): HowlListeners | undefined =>
  (audioService as unknown as { sfxHowls: Map<string, HowlListeners> }).sfxHowls.get(url);

beforeAll(async () => {
  vi.useFakeTimers();
  installAudioFakes({ fetchMs: 20, decodeMs: 20, canplayMs: 50, sfxDurS: 0.03, sampleRate: 44100 });
  ({ audioService } = await import('$lib/audio/AudioService'));
  audioService.unlock();
  dispatchDoc('click');
  await advance(10);
});

beforeEach(() => {
  audioService.dispose();
  audioService.unlock();
  resetRecords();
});

afterAll(() => {
  vi.useRealTimers();
});

describe('sfx slots', () => {
  it('frees every slot taken by a clip that fails to load, so later sounds still play', async () => {
    for (let i = 0; i < 3; i++) audioService.playSfx('/audio/combat/no-such-clip/1.ogg', 1);
    await advance(200);
    audioService.playSfx('/audio/combat/slash/1.ogg', 1);
    audioService.playSfx('/audio/creatures/canine/1.ogg', 1);
    audioService.playSfx('/audio/work/mining/1.ogg', 1);
    await advance(200);
    expect(sourceStarts.map((s) => s.url).sort()).toEqual([
      '/audio/combat/slash/1.ogg',
      '/audio/creatures/canine/1.ogg',
      '/audio/work/mining/1.ogg'
    ]);
  });

  it('drops a clip that failed to load instead of queueing later plays on it', async () => {
    audioService.playSfx('/audio/combat/no-such-clip/1.ogg', 1);
    await advance(200);
    expect(sfxHowl('/audio/combat/no-such-clip/1.ogg')).toBeUndefined();
  });

  it('leaves no per-play listeners behind after 200 plays of one clip', async () => {
    const url = '/audio/combat/slash/1.ogg';
    for (let i = 0; i < 200; i++) {
      audioService.playSfx(url, 1);
      await advance(45);
    }
    await advance(200);
    const howl = sfxHowl(url)!;
    const listeners = howl._onend.length + howl._onstop.length + howl._onplayerror.length;
    expect(listeners).toBeLessThan(10);
  });

  it('plays at most three clips at once', async () => {
    audioService.playSfx('/audio/combat/slash/1.ogg', 1);
    audioService.playSfx('/audio/combat/slash/2.ogg', 1);
    audioService.playSfx('/audio/creatures/canine/1.ogg', 1);
    audioService.playSfx('/audio/work/mining/1.ogg', 1);
    await advance(200);
    expect(sourceStarts).toHaveLength(3);
  });

  it('gives a slot back when a clip ends, so the next sound plays', async () => {
    audioService.playSfx('/audio/combat/slash/1.ogg', 1);
    audioService.playSfx('/audio/combat/slash/2.ogg', 1);
    audioService.playSfx('/audio/creatures/canine/1.ogg', 1);
    await advance(300);
    audioService.playSfx('/audio/work/mining/1.ogg', 1);
    await advance(200);
    expect(sourceStarts.map((s) => s.url)).toContain('/audio/work/mining/1.ogg');
  });
});
