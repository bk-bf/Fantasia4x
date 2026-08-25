// Shared open/closed state for the HEALTH pop-up (NT-U1). Toggling it on any one pawn/mob keeps it
// open for every other selected OR hovered entity, so the player flips it once and it stays. Held as
// an object so the `$state` is mutated (.open) across modules rather than rebound.
export const healthToggle = $state({ open: false });
