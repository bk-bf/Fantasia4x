// stateDefs — the loader for states.jsonc, the pawn FSM state registry. Leaf module (imports only the
// data file) so any layer can resolve a state id → its label / bucket / uncontrollable flag from one
// place. The state STRING ids + their TS literal types stay in systems/pawn/pawnStates.ts (`PAWN_STATE`);
// this hangs the metadata off them. stateRegistry.test.ts keeps the two in lockstep.
import statesData from '../database/pawns/states.jsonc';

/** Primary bucket a structural state sits in. (Pure need-satisfaction states aren't in this registry —
 *  they're owned by needs.jsonc — so there's no `need` kind here.) */
export type StateKind = 'idle' | 'travel' | 'work' | 'combat' | 'uncontrollable';
/** What puts a pawn INTO a state. `job` = a colony-job phase (jobs.jsonc-triggered). */
export type StateSource = 'auto' | 'job' | 'need' | 'combat' | 'condition' | 'player';

export interface StateDef {
  label: string;
  kind: StateKind;
  source: StateSource;
  /** While in it the pawn refuses the draft (the FSM force-undrafts each tick). */
  uncontrollable?: boolean;
  /** Entered by a probabilistic check rather than a decision (the mood breakdown roll). */
  rollable?: boolean;
  /** The conditions.jsonc id whose `fsmState` forces this state (forced states only). */
  condition?: string;
}

const STATES = statesData as unknown as Record<string, StateDef>;

/** Every state def keyed by its FSM state id (= the `PAWN_STATE` string values). */
export const STATE_DEFS: Readonly<Record<string, StateDef>> = STATES;

/** The def for a state id (undefined for an unknown id, e.g. the pseudo-state 'Dead'). */
export function stateDef(id: string | undefined): StateDef | undefined {
  return id ? STATES[id] : undefined;
}

/** Player-facing label for a state — the single chokepoint so a raw camelCase id never reaches the UI.
 *  Falls back to the id itself for anything without a def (keeps 'Dead' etc. from rendering blank). */
export function stateLabel(id: string | undefined): string {
  return stateDef(id)?.label ?? id ?? 'Idle';
}

/** States a pawn can't be commanded out of — derived from the `uncontrollable` flag in states.jsonc
 *  (Collapsed / BloodHunt / Breakdown). The draft commands gate on this. */
export const UNCONTROLLABLE_STATES: ReadonlySet<string> = new Set(
  Object.entries(STATES)
    .filter(([, d]) => d.uncontrollable)
    .map(([id]) => id)
);

/** True while the pawn is in an uncontrollable state — the single check the draft commands gate on. */
export function isUncontrollable(state: string | undefined): boolean {
  return state != null && UNCONTROLLABLE_STATES.has(state);
}

/** True for a travel/"move to X" phase (a job or need walking to its target). */
export function isTravelState(state: string | undefined): boolean {
  return stateDef(state)?.kind === 'travel';
}
