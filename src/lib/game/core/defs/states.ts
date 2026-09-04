import statesData from '../../database/pawns/states.json';

export type StateKind = 'idle' | 'travel' | 'work' | 'combat' | 'uncontrollable';
export type StateSource = 'auto' | 'job' | 'need' | 'combat' | 'condition' | 'player';

export interface StateDef {
  label: string;
  kind: StateKind;
  source: StateSource;
  uncontrollable?: boolean;
  rollable?: boolean;
  condition?: string;
}

const STATES = statesData as unknown as Record<string, StateDef>;

export const STATE_DEFS: Readonly<Record<string, StateDef>> = STATES;

export function stateDef(id: string | undefined): StateDef | undefined {
  return id ? STATES[id] : undefined;
}

export function stateLabel(id: string | undefined): string {
  return stateDef(id)?.label ?? id ?? 'Idle';
}

export const UNCONTROLLABLE_STATES: ReadonlySet<string> = new Set(
  Object.entries(STATES)
    .filter(([, d]) => d.uncontrollable)
    .map(([id]) => id)
);

export function isUncontrollable(state: string | undefined): boolean {
  return state != null && UNCONTROLLABLE_STATES.has(state);
}

export function isTravelState(state: string | undefined): boolean {
  return stateDef(state)?.kind === 'travel';
}
