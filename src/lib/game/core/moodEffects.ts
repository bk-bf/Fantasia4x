// moodEffects — the loader for mood.jsonc, the registry of every named mood effect (MOOD-REWORK).
// Leaf module (no service deps) so both PawnService (weather/need/health/trait/condition/amenity) and
// SocialService (dialog thoughts) can resolve an effect id → { label, value } from one place. Sources
// reference effects by string id (weather.jsonc `mood`, conditions.jsonc `mood`, traits.jsonc `mood`,
// dialog.jsonc `moodGood`/`moodBad`, needs.jsonc bands, mood.jsonc healthBands).
import moodData from '../database/mood.jsonc';

/** A resolved mood effect. `value` is absent when the source computes it live (amenity). */
export interface MoodEffect {
  label: string;
  value?: number;
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
