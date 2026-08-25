// time.ts — Central simulation timing.
//
// The sim is a uniform fixed-timestep loop: there is ONE timestep, the tick.
// `processGameTurn()` IS the tick step and runs TICKS_PER_SECOND times per real
// second (at 1× speed). `gameState.turn` counts ticks, so it advances
// TICKS_PER_SECOND per second.
//
// All balance values are authored in human-readable SECONDS (the old "turn").
// TICKS_PER_SECOND is the single tunable knob that converts them to tick space —
// change it to 50 or 100 to experiment with the tick rate without touching any
// balance value:
//   • DURATIONS / thresholds (seconds you wait): multiply  → ticksFromSeconds(s)
//   • RATES (amount accrued per second):         divide    → perTick(perSecond)
//
// Continuous bars (movement, needs, research) and discrete completions (work,
// buildings, events, mood, day/night, regrowth) all run on the same tick, so a
// task authored as N seconds always takes N seconds of real time regardless of
// the tick rate.

/** Simulation ticks per in-game second (= ticks per real second at 1× speed).
 *  The master time knob — retune the whole sim's granularity from here. */
export const TICKS_PER_SECOND = 60;

/** Seconds advanced per tick (the fixed timestep dt). Multiply per-second RATES
 *  by this to get the per-tick amount. */
export const SECONDS_PER_TICK = 1 / TICKS_PER_SECOND;

/** Convert an authored duration in seconds (legacy "turns") to ticks. Use for
 *  task durations, cooldowns, day length, and any threshold compared against
 *  the tick-counting `gameState.turn`. */
export const ticksFromSeconds = (seconds: number): number => seconds * TICKS_PER_SECOND;

/** Convert a per-second RATE to the amount applied on a single tick. Use for
 *  any accumulator stepped every tick (needs, research, fuel, regen…). */
export const perTick = (perSecond: number): number => perSecond * SECONDS_PER_TICK;
