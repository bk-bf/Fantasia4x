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
  // SOCIAL: route to a gathering place (campfire/hearth) and socialise to recover `relaxation`.
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
  // MOOD: worn down past a mood breakpoint and lost control — UNCONTROLLABLE states (draft refused, like
  // Collapsed), driven by the `mental_breakdown` condition. The pawn enters ONE of these directly at onset
  // and the panel shows it; "Breaking Down" is now just the parent condition. See handlers/breakdown.ts.
  CRYING: 'Crying',
  HIDING: 'Hiding',
  PANICKING: 'Panicking'
} as const;

export type PawnStateName = (typeof PAWN_STATE)[keyof typeof PAWN_STATE];

// State METADATA — the player-facing label, bucket, trigger source, and the uncontrollable flag +
// `isUncontrollable()` — lives in the data-driven registry (database/pawns/states.jsonc via core/stateDefs.ts),
// kept in lockstep with the ids above by stateRegistry.test.ts. This module stays a pure leaf (the typed
// id source of truth) so every handler/helper can depend on it without pulling in the data layer.
