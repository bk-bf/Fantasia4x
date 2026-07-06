/**
 * Seeded, deterministic RNG for the simulation (P0-2).
 *
 * Reproducibility is a prerequisite for the golden/invariant tests and for debugging
 * "pawn did something weird at tick 48,210" reports. All non-cryptographic randomness
 * under `src/lib/game/` must go through here instead of `Math.random()` (enforced by
 * ESLint `no-restricted-properties`).
 *
 * There are two independent streams so that world generation and the live simulation
 * don't perturb each other's sequences:
 *   - The world-gen stream is seeded explicitly by the caller (see WorldGenerator).
 *   - The sim stream is the module singleton `rng`, reseeded from `GameState.seed`
 *     at game init / load (see stores/gameState.ts) so a loaded save replays identically.
 */

/** mulberry32 — fast 32-bit seeded PRNG. Returns a function yielding values in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * xorshift32 — a seeded PRNG yielding floats in [0, 1). DISTINCT from mulberry32: this is the exact
 * algorithm world + resource generation have always used, so it must stay byte-identical (changing it
 * would reshuffle every generated world for a given seed). Consolidated here from the two private
 * `makeRng` copies that lived in WorldGenerator and ResourceGeneratorService.
 */
export function makeSeededRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0x100000000;
  };
}

/**
 * A reseedable random stream with the convenience helpers the codebase needs.
 * Holds its current 32-bit state so it can be snapshotted/reseeded for tests.
 */
export class SeededRng {
  private next: () => number;
  private _seed: number;

  constructor(seed: number = (Date.now() ^ (Math.random() * 0x100000000)) >>> 0) {
    this._seed = seed >>> 0;
    this.next = mulberry32(this._seed);
  }

  /** Reseed the stream — subsequent draws replay deterministically from `seed`. */
  reseed(seed: number): void {
    this._seed = seed >>> 0;
    this.next = mulberry32(this._seed);
  }

  /** The seed this stream was last (re)seeded with. */
  get seed(): number {
    return this._seed;
  }

  /** Float in [0, 1) — drop-in replacement for Math.random(). */
  random(): number {
    return this.next();
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** True with probability `p` (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Uniformly pick one element of a non-empty array. */
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** A normally-distributed sample (Box–Muller) with the given mean + standard deviation. Deterministic
   *  on the seeded stream. Used for bell-curve counts like a pawn's number of negative traits. */
  gaussian(mean = 0, sd = 1): number {
    // Guard u1 away from 0 (log(0) = -Infinity); u1 ∈ (0,1].
    const u1 = 1 - this.next();
    const u2 = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

/**
 * The simulation RNG singleton. Reseeded from `GameState.seed` at game init so the
 * whole sim is reproducible. Import this and call `rng.random()` etc. instead of
 * `Math.random()` anywhere under `src/lib/game/`.
 */
export const rng = new SeededRng();

/** Generate a fresh random 32-bit seed (used when starting a brand-new game). */
export function freshSeed(): number {
  return (Date.now() ^ (Math.random() * 0x100000000)) >>> 0;
}
