import { describe, it, expect } from 'vitest';
import {
  EntityMotion,
  HIT_MS,
  STOP_HOLD_MS,
  mobBody,
  mobGait,
  pawnRest,
  type Pose
} from '$lib/components/UI/canvas/entityMotion';

const FRAME = 16;
const ART = 0.5;

function walker(motion: EntityMotion, id: string, from: number, to: number, frames: number) {
  const poses: Pose[] = [];
  for (let f = 0; f <= frames; f++) {
    const t = f * FRAME;
    motion.begin(t, t);
    poses.push({ ...motion.pawn(id, from + ((to - from) * f) / frames, 5, 'Idle', 0) });
    motion.end();
  }
  return poses;
}

describe('facing', () => {
  it('turns to face horizontal travel and keeps the facing when stopped', () => {
    const m = new EntityMotion();
    const left = walker(m, 'a', 10, 7, 60);
    expect(left.at(-1)!.flip).toBe(true);
    const right = walker(m, 'a', 7, 9, 60);
    expect(right.at(-1)!.flip).toBe(false);
  });

  it('never flips on sub-pixel jitter around a standing spot', () => {
    const m = new EntityMotion();
    for (let f = 0; f < 200; f++) {
      m.begin(f * FRAME, f * FRAME);
      const pose = m.pawn('a', 5 + Math.sin(f) * 0.05, 5, 'Idle', 0);
      expect(pose.flip).toBe(false);
      m.end();
    }
  });

  it('keeps the last facing while travelling straight up or down', () => {
    const m = new EntityMotion();
    walker(m, 'a', 10, 7, 60);
    for (let f = 0; f < 60; f++) {
      m.begin(2000 + f * FRAME, 2000 + f * FRAME);
      expect(m.pawn('a', 7, 5 + f * 0.05, 'Idle', 0).flip).toBe(true);
      m.end();
    }
  });

  it('turns an attacker toward its lunge', () => {
    const m = new EntityMotion();
    m.begin(0, 0);
    expect(m.pawn('a', 5, 5, 'Fighting', -3).flip).toBe(true);
    m.begin(16, 16);
    expect(m.pawn('a', 5, 5, 'Fighting', 3).flip).toBe(false);
  });

  it('moves a flipped figure one art pixel so the anchor column stays put', () => {
    const m = new EntityMotion();
    m.begin(0, 0);
    expect(m.pawn('a', 5, 5, 'Fighting', -3).dx).toBe(ART);
  });
});

describe('step bob and lean', () => {
  it('bobs by whole art pixels locked to distance, not time', () => {
    const slow = walker(new EntityMotion(), 'a', 0, 2, 120);
    const fast = walker(new EntityMotion(), 'a', 0, 2, 40);
    const bobsOf = (ps: Pose[]) => ps.filter((p, i) => i > 0 && p.dy !== ps[i - 1].dy).length;
    for (const p of slow) expect([0, -ART]).toContain(p.dy);
    expect(Math.abs(bobsOf(slow) - bobsOf(fast))).toBeLessThanOrEqual(2);
    expect(bobsOf(slow)).toBeGreaterThan(4);
  });

  it('leans a walking pawn one art pixel and a fleeing pawn two', () => {
    const m = new EntityMotion();
    m.begin(0, 0);
    m.pawn('a', 0, 0, 'Idle', 0);
    m.begin(16, 16);
    expect(m.pawn('a', 0.1, 0, 'Idle', 0).lean).toBe(1);
    m.begin(32, 32);
    expect(m.pawn('a', 0.2, 0, 'Fleeing', 0).lean).toBe(2);
  });

  it('stops bobbing and leaning once the figure has stood still', () => {
    const m = new EntityMotion();
    walker(m, 'a', 0, 1.03, 30);
    let p: Pose | null = null;
    for (let t = 0; t < STOP_HOLD_MS + 100; t += FRAME) {
      m.begin(1000 + t, 1000 + t);
      p = m.pawn('a', 1.03, 5, 'Idle', 0);
    }
    expect(p!.dy).toBe(0);
    expect(p!.lean).toBe(0);
  });

  it('hops a rabbit higher than a beast steps, and never leans a beast', () => {
    const hop = new EntityMotion();
    const beast = new EntityMotion();
    let hopTop = 0;
    let beastTop = 0;
    for (let f = 0; f <= 60; f++) {
      hop.begin(f * FRAME, f * FRAME);
      beast.begin(f * FRAME, f * FRAME);
      const h = hop.mob('r', f * 0.05, 0, 'Wander', 'hop', 0);
      hopTop = Math.min(hopTop, h.dy);
      const b = beast.mob('w', f * 0.05, 0, 'Wander', undefined, 0);
      beastTop = Math.min(beastTop, b.dy);
      expect(b.lean).toBe(0);
    }
    expect(hopTop).toBe(-6 * ART);
    expect(beastTop).toBe(-1 * ART);
  });
});

describe('breathing', () => {
  it('lifts the upper body one art pixel for part of the idle cycle', () => {
    const m = new EntityMotion();
    const seen = new Set<number>();
    for (let t = 0; t < 3000; t += 50) {
      m.begin(t, t);
      seen.add(m.pawn('a', 5, 5, 'Idle', 0).squash);
    }
    expect([...seen].sort()).toEqual([-1, 0]);
  });

  it('breathes crowds out of step', () => {
    const m = new EntityMotion();
    m.begin(1000, 1000);
    const squashes = Array.from({ length: 12 }, (_, i) => m.pawn(`p${i}`, i, 0, 'Idle', 0).squash);
    expect(new Set(squashes).size).toBe(2);
  });

  it('keeps a collapsed pawn still and lets a sleeper breathe', () => {
    const m = new EntityMotion();
    const down = new Set<number>();
    const asleep = new Set<number>();
    for (let t = 0; t < 4000; t += 50) {
      m.begin(t, t);
      down.add(m.pawn('d', 1, 1, 'Collapsed', 0).squash);
      asleep.add(m.pawn('s', 3, 1, 'Sleeping', 0).squash);
    }
    expect([...down]).toEqual([0]);
    expect([...asleep].sort()).toEqual([-1, 0]);
  });
});

describe('hit shake', () => {
  it('shakes sideways after a landed blow and settles once it is over', () => {
    const m = new EntityMotion();
    m.begin(0, 0);
    m.pawn('a', 5, 5, 'Idle', 0);
    m.noteHits([{ id: 1, kind: 'damage', entityId: 'a', spawnTime: 0 }]);
    const dx = new Set<number>();
    for (let t = 0; t < HIT_MS; t += 10) {
      m.begin(t, t);
      const p = m.pawn('a', 5, 5, 'Idle', 0);
      dx.add(p.dx);
    }
    expect(dx.has(2 * ART)).toBe(true);
    expect(dx.has(-2 * ART)).toBe(true);
    m.begin(HIT_MS + 20, HIT_MS + 20);
    expect(m.pawn('a', 5, 5, 'Idle', 0).dx).toBe(0);
  });

  it('ignores misses, other entities and events it has already seen', () => {
    const m = new EntityMotion();
    m.begin(0, 0);
    m.pawn('a', 5, 5, 'Idle', 0);
    m.noteHits([
      { id: 1, kind: 'dodge', entityId: 'a', spawnTime: 0 },
      { id: 2, kind: 'damage', entityId: 'b', spawnTime: 0 }
    ]);
    m.begin(50, 50);
    expect(m.pawn('a', 5, 5, 'Idle', 0).dx).toBe(0);
    m.noteHits([{ id: 2, kind: 'damage', entityId: 'a', spawnTime: 50 }]);
    m.begin(60, 60);
    expect(m.pawn('a', 5, 5, 'Idle', 0).dx).toBe(0);
  });
});

describe('bookkeeping', () => {
  it('forgets entities that are no longer drawn', () => {
    const m = new EntityMotion();
    m.begin(0, 0);
    m.pawn('a', 0, 0, 'Idle', 0);
    m.pawn('b', 1, 0, 'Idle', 0);
    m.end();
    expect(m.size).toBe(2);
    m.begin(16, 16);
    m.pawn('a', 0, 0, 'Idle', 0);
    m.end();
    expect(m.size).toBe(1);
  });

  it('returns one reused pose object, so a frame allocates no poses', () => {
    const m = new EntityMotion();
    m.begin(0, 0);
    const first = m.pawn('a', 0, 0, 'Idle', 0);
    expect(m.mob('b', 1, 0, 'Wander', undefined, 0)).toBe(first);
  });

  it('maps sim states and data to gaits', () => {
    expect(mobGait('Fleeing')).toBe('fast');
    expect(mobGait('Hunting')).toBe('trot');
    expect(mobGait('Wander')).toBe('walk');
    expect(mobBody('hop')).toBe('hopper');
    expect(pawnRest('Sleeping')).toBe('sleep');
  });
});
