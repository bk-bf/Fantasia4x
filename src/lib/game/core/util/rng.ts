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

export function makeSeededRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0x100000000;
  };
}

const DEFAULT_SEED = 0x5eed_1234;

export class SeededRng {
  private next: () => number;
  private _seed: number;

  constructor(seed: number = DEFAULT_SEED) {
    this._seed = seed >>> 0;
    this.next = mulberry32(this._seed);
  }

  reseed(seed: number): void {
    this._seed = seed >>> 0;
    this.next = mulberry32(this._seed);
  }

  get seed(): number {
    return this._seed;
  }

  random(): number {
    return this.next();
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  pickWeighted<T>(items: readonly T[], weightOf: (item: T) => number): T | undefined {
    if (items.length === 0) return undefined;
    const total = items.reduce((s, it) => s + Math.max(0, weightOf(it)), 0);
    if (total <= 0) return items[this.int(0, items.length - 1)];
    let roll = this.random() * total;
    for (const it of items) {
      roll -= Math.max(0, weightOf(it));
      if (roll < 0) return it;
    }
    return items[items.length - 1];
  }

  gaussian(mean = 0, sd = 1): number {
    const u1 = 1 - this.next();
    const u2 = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

export const rng = new SeededRng();

export function freshSeed(): number {
  return (Date.now() ^ (Math.random() * 0x100000000)) >>> 0;
}
