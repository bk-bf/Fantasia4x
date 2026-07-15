import { describe, it, expect } from 'vitest';
import { PAWN_STATE } from '$lib/game/systems/pawn/pawnStates';
import { STATE_DEFS, UNCONTROLLABLE_STATES, stateLabel } from '$lib/game/core/stateDefs';
import { NEED_OWNED_STATES } from '$lib/game/core/needsDefs';

/**
 * The FSM state registry (states.jsonc) and the typed `PAWN_STATE` ids are two halves of one thing:
 * pawnStates.ts owns the string ids + TS literal types, states.jsonc hangs the metadata off the STRUCTURAL
 * ones. The pure need-satisfaction states are deliberately NOT in states.jsonc (they belong to the needs
 * they serve — needs.jsonc is their home); they render via stateLabel's clean-id fallback. These guard
 * the split against drift (a new structural state can't silently skip the registry).
 */
// The satisfy states of a need (Hungry, Eating, Sleeping, Drinking, Washing, Socialising…) are OWNED by
// needs.jsonc — each need declares its `states` there — and derived into NEED_OWNED_STATES. They render
// via stateLabel's id fallback (each already reads as a clean word). MovingToNeed is the shared TRAVEL
// phase, so it stays in states.jsonc with the other move-to-X states, not here.

describe('FSM state registry ↔ PAWN_STATE', () => {
  it('every need-owned state (needs.jsonc `states`) is a real PAWN_STATE — typo guard', () => {
    const enumVals = new Set<string>(Object.values(PAWN_STATE));
    for (const s of NEED_OWNED_STATES)
      expect(enumVals.has(s), `needs.jsonc names a non-existent state '${s}'`).toBe(true);
  });

  it('every STRUCTURAL PAWN_STATE has a states.jsonc entry; need states are owned by needs.jsonc; no orphans', () => {
    const defKeys = new Set(Object.keys(STATE_DEFS));
    for (const v of Object.values(PAWN_STATE)) {
      if (NEED_OWNED_STATES.has(v)) {
        expect(defKeys.has(v), `need state '${v}' should NOT be in states.jsonc (needs.jsonc owns it)`).toBe(false);
      } else {
        expect(defKeys.has(v), `no states.jsonc entry for structural state '${v}'`).toBe(true);
      }
    }
    for (const k of defKeys) expect(new Set<string>(Object.values(PAWN_STATE)).has(k), `orphan states.jsonc entry '${k}'`).toBe(true);
  });

  it('every entry has a non-empty label and a valid kind/source', () => {
    const kinds = new Set(['idle', 'travel', 'work', 'combat', 'uncontrollable']);
    const sources = new Set(['auto', 'job', 'need', 'combat', 'condition', 'player']);
    for (const [id, def] of Object.entries(STATE_DEFS)) {
      expect(def.label?.length, `'${id}' needs a label`).toBeGreaterThan(0);
      expect(kinds.has(def.kind), `'${id}' has bad kind '${def.kind}'`).toBe(true);
      expect(sources.has(def.source), `'${id}' has bad source '${def.source}'`).toBe(true);
      // A forced (uncontrollable) state names the condition that drives it.
      if (def.uncontrollable) expect(def.condition, `'${id}' should name its condition`).toBeTruthy();
    }
  });

  it('UNCONTROLLABLE_STATES is derived from the flag and refuses the draft (collapse/blood-hunt/break)', () => {
    expect(UNCONTROLLABLE_STATES.has(PAWN_STATE.COLLAPSED)).toBe(true);
    expect(UNCONTROLLABLE_STATES.has(PAWN_STATE.BREAKDOWN)).toBe(true);
    expect(UNCONTROLLABLE_STATES.has(PAWN_STATE.BLOOD_HUNT)).toBe(true);
    expect(UNCONTROLLABLE_STATES.has(PAWN_STATE.IDLE)).toBe(false);
  });

  it('stateLabel never leaks a raw camelCase id to the UI', () => {
    expect(stateLabel(PAWN_STATE.MOVING_TO_RESOURCE)).toBe('Traveling');
    expect(stateLabel(PAWN_STATE.BREAKDOWN)).toBe('Breaking Down');
    // Need states aren't in states.jsonc — they fall back to their id, which already reads clean.
    expect(stateLabel(PAWN_STATE.EATING)).toBe('Eating');
    expect(stateLabel(PAWN_STATE.SLEEPING)).toBe('Sleeping');
    // Unknown ids (e.g. the 'Dead' pseudo-state) fall back to the id rather than blank.
    expect(stateLabel('Dead')).toBe('Dead');
  });
});
