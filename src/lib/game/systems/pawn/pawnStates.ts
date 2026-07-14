/** pawnStates — the PAWN_STATE enum + PawnStateName, extracted from PawnStateMachine (hotspot
 *  step 2). Leaf module: no imports, so handlers/helpers/dispatcher can all depend on it. */
// ===== STATE NAME CONSTANTS =====
export const PAWN_STATE = {
  IDLE: 'Idle',
  MOVING_TO_RESOURCE: 'MovingToResource',
  WORKING: 'Working',
  HUNGRY: 'Hungry',
  TIRED: 'Tired',
  MOVING_TO_NEED: 'MovingToNeed',
  EATING: 'Eating',
  SLEEPING: 'Sleeping',
  HAULING: 'Hauling',
  MOVING_TO_DEPOSIT: 'MovingToDeposit',
  // §D water needs: route to a drink/wash zone (or well), then drink/wash.
  DRINKING: 'Drinking',
  WASHING: 'Washing',
  // SOCIAL: route to a gathering place (campfire/hearth) and socialise to recover `fun`.
  SOCIALISING: 'Socialising',
  // Combat states (COMBAT-SYSTEM): auto-engagement when a hostile enters aggro range.
  FIGHTING: 'Fighting',
  FLEEING: 'Fleeing',
  // Hunting (work-driven): chase a player-marked huntable mob and fight it to the kill.
  HUNTING: 'Hunting',
  // Downed by cumulative pain — out of the fight until pain subsides.
  COLLAPSED: 'Collapsed',
  // Carrying a downed colonist to shelter (player rescue order). See handlers/rescue.ts.
  RESCUING: 'Rescuing',
  // LINEAGES-II: bloodthirst has the body — an UNCONTROLLABLE hunt (draft refused, like Collapsed)
  // that chases and devours/drains the nearest living thing until fed. See handlers/combat.ts.
  BLOOD_HUNT: 'BloodHunt',
  // MOOD: worn down past a mood breakpoint and lost control — an UNCONTROLLABLE state (draft refused,
  // like Collapsed) that plays out as crying / hiding / fleeing until it passes. See handlers/breakdown.ts.
  BREAKDOWN: 'Breakdown'
} as const;

export type PawnStateName = (typeof PAWN_STATE)[keyof typeof PAWN_STATE];

/** States in which the pawn cannot be commanded — a draft/move/attack order is refused and the FSM
 *  force-undrafts the pawn each tick (it's out of the player's hands until it recovers). Collapse and a
 *  mental breakdown both qualify; BloodHunt enforces its own refusal inside the combat handler. */
export const UNCONTROLLABLE_STATES: ReadonlySet<string> = new Set([
  PAWN_STATE.COLLAPSED,
  PAWN_STATE.BREAKDOWN
]);

/** True while the pawn is in an uncontrollable state (see UNCONTROLLABLE_STATES) — the single check the
 *  draft commands gate on, instead of hardcoding `!== 'Collapsed'` at each call site. */
export function isUncontrollable(state: string | undefined): boolean {
  return state != null && UNCONTROLLABLE_STATES.has(state);
}
