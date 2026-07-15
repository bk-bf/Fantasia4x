// moodEffects — the loader for mood.jsonc, the registry of every named mood effect (MOOD-REWORK).
// Leaf module (no service deps) so both PawnService (weather/need/health/trait/condition/amenity) and
// SocialService (dialog thoughts) can resolve an effect id → { label, value } from one place. Sources
// reference effects by string id (weather.jsonc `mood`, conditions.jsonc `mood`, traits.jsonc `mood`,
// dialog.jsonc `moodGood`/`moodBad`, needs.jsonc bands, mood.jsonc healthBands).
import moodData from '../database/pawns/mood.jsonc';

/** A resolved mood effect. `value` is absent when the source computes it live (amenity). `negatedBy`
 *  names a condition id that CANCELS the effect while the pawn has it (e.g. a full moon isn't visible
 *  when `sheltered` under a roof). */
export interface MoodEffect {
  label: string;
  value?: number;
  negatedBy?: string;
}

const MOOD = moodData as unknown as {
  base: number;
  effects: Record<string, MoodEffect>;
};

/** Where a pawn's mood sits with nothing acting on them (and eases back toward). */
export const MOOD_BASE = MOOD.base;

/** Resolve a mood-effect id → { label, value }. Returns undefined for an unknown id (caller skips). */
export function moodEffect(id: string | undefined): MoodEffect | undefined {
  return id ? MOOD.effects[id] : undefined;
}
