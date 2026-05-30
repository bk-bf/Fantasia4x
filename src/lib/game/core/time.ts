// time.ts — Central tick/turn timing constants.
//
// The simulation loop runs at TICKS_PER_TURN ticks per second (60 Hz). One
// "turn" still equals one in-game second and remains the balance + save unit:
// heavy systems (needs, work, research, buildings, events) run once every
// TICKS_PER_TURN ticks, so all existing per-turn magnitudes and stored
// turn-stamps keep their meaning. Only movement runs every tick, draining a
// per-tile cost budget (see PawnService.processMovement).
//
// If continuous per-turn rates are ever migrated to smooth per-tick application,
// divide the per-turn magnitude by TICKS_PER_TURN at the point of application.

/** Simulation ticks per in-game turn (= ticks per real second at 1× speed). */
export const TICKS_PER_TURN = 60;
