import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TRACK_LABELS,
  AMBIENT_FILES,
  FIRE_LOOP,
  UI_SFX,
  THREAT_ALERT_SFX,
  CREATURE_SFX,
  WORK_SFX,
  COMBAT_SFX
} from '$lib/audio/manifest';

const onDisk = (url: string): string => join(process.cwd(), 'static', url);

const decodedClips = [
  ...Object.values(AMBIENT_FILES),
  FIRE_LOOP,
  ...Object.values(UI_SFX),
  THREAT_ALERT_SFX,
  ...Object.values(CREATURE_SFX).flat(),
  ...Object.values(WORK_SFX).flat(),
  ...Object.values(COMBAT_SFX).flat()
];

function vorbisSampleRate(path: string): number {
  const head = readFileSync(path).subarray(0, 256);
  const at = head.indexOf(Buffer.from('\x01vorbis', 'latin1'));
  if (at < 0) throw new Error(`${path} has no vorbis identification header`);
  return head.readUInt32LE(at + 12);
}

describe('audio files the manifest names', () => {
  it('has a file under static/ for every url', () => {
    const urls = new Set([...Object.keys(TRACK_LABELS), ...decodedClips]);
    expect([...urls].filter((u) => !existsSync(onDisk(u)))).toEqual([]);
  });

  it('keeps every clip decoded in full at 48 kHz or below', () => {
    const tooHigh = [...new Set(decodedClips)]
      .filter((u) => existsSync(onDisk(u)))
      .map((u) => ({ url: u, rate: vorbisSampleRate(onDisk(u)) }))
      .filter((c) => c.rate > 48000);
    expect(tooHigh).toEqual([]);
  });
});
