// Generic scalar math helpers shared across layers (was re-implemented per-file: `clamp` lived in
// core/Culture, systems/Combat and services/PawnService independently). Keep these pure + dependency-free
// so any layer can import them.

/** Clamp `v` into the inclusive range [lo, hi]. */
export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
