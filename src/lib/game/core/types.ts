// Barrel for the game's core type definitions.
//
// P-4: the former 1,478-line monolith was split into domain modules under `core/types/`. This file
// re-exports them so the hundreds of existing `from '../core/types'` imports are unchanged. Add new
// types to the relevant domain module, not here. `export *` re-exports both types and the few value
// exports (LABOR_LEVEL, CRITICAL_LIMBS).

export * from './types/world';
export * from './types/environment';
export * from './types/race';
export * from './types/health';
export * from './types/items';
export * from './types/buildings';
export * from './types/jobs';
export * from './types/entities';
export * from './types/research';
export * from './types/events';
export * from './types/gamestate';
