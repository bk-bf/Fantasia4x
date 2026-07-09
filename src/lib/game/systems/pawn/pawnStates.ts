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
  BLOOD_HUNT: 'BloodHunt'
} as const;

export type PawnStateName = (typeof PAWN_STATE)[keyof typeof PAWN_STATE];
