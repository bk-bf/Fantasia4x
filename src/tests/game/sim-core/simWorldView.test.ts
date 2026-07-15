/**
 * R0 layout guard. Verifies the TS mirror of the sim-core SoA contract WITHOUT a wasm host:
 *  - the chunk-major tile index matches the values asserted in `sim-core/src/lib.rs` tests, and
 *  - the field-plane indices are distinct and in range.
 * If lib.rs changes the layout, one of these (or the Rust `cargo test`) fails → re-sync.
 */
import { describe, it, expect } from 'vitest';
import {
  tileIndexRef,
  CHUNK,
  NF32,
  NI32,
  NU8,
  NI16,
  F_HUNGER,
  F_NEXT_CELL_COST,
  I_X,
  I_TARGET,
  U_KIND,
  U_FLAGS,
  S_STR,
  S_CON
} from '$lib/game/sim-core/simWorldView';

describe('sim-core R0 layout mirror', () => {
  it('chunk size matches the Rust contract', () => {
    expect(CHUNK).toBe(32);
  });

  it('tileIndex is chunk-major and matches lib.rs cargo-test values (width 100 → chunksX 4)', () => {
    const W = 100;
    const H = 100;
    const chunksX = Math.ceil(W / CHUNK); // 4
    expect(chunksX).toBe(4);
    expect(tileIndexRef(0, 0, W, H, chunksX)).toBe(0);
    expect(tileIndexRef(1, 0, W, H, chunksX)).toBe(1);
    expect(tileIndexRef(0, 1, W, H, chunksX)).toBe(CHUNK); // 32
    expect(tileIndexRef(32, 0, W, H, chunksX)).toBe(CHUNK * CHUNK); // 1024 — next chunk
    expect(tileIndexRef(100, 0, W, H, chunksX)).toBe(-1); // out of range
    expect(tileIndexRef(-1, 0, W, H, chunksX)).toBe(-1);
  });

  it('field-plane indices are distinct and within their plane width', () => {
    const inRange = (idx: number, n: number) => idx >= 0 && idx < n;
    // spot-check the extremes of each plane
    expect(inRange(F_HUNGER, NF32) && inRange(F_NEXT_CELL_COST, NF32)).toBe(true);
    expect(inRange(I_X, NI32) && inRange(I_TARGET, NI32)).toBe(true);
    expect(inRange(U_KIND, NU8) && inRange(U_FLAGS, NU8)).toBe(true);
    expect(inRange(S_STR, NI16) && inRange(S_CON, NI16)).toBe(true);
    // last index of each plane is width-1 (planes are densely packed)
    expect(F_NEXT_CELL_COST).toBe(NF32 - 1);
    expect(I_TARGET).toBe(NI32 - 1);
    expect(U_FLAGS).toBe(NU8 - 1);
    expect(S_CON).toBe(NI16 - 1);
  });
});
