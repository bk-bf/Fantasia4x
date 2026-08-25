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
  DRINKING: 'Drinking',
  WASHING: 'Washing',
  SOCIALISING: 'Socialising',
  LOUNGING: 'Lounging',
  FIGHTING: 'Fighting',
  FLEEING: 'Fleeing',
  HUNTING: 'Hunting',
  COLLAPSED: 'Collapsed',
  RESCUING: 'Rescuing',
  BLOOD_HUNT: 'BloodHunt',
  CRYING: 'Crying',
  HIDING: 'Hiding',
  PANICKING: 'Panicking'
} as const;

export type PawnStateName = (typeof PAWN_STATE)[keyof typeof PAWN_STATE];
