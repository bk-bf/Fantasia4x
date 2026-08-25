import moodData from '../../database/pawns/mood.jsonc';

export interface MoodEffect {
  label: string;
  value?: number;
  negatedBy?: string;
}

const MOOD = moodData as unknown as {
  base: number;
  effects: Record<string, MoodEffect>;
};

export const MOOD_BASE = MOOD.base;

export function moodEffect(id: string | undefined): MoodEffect | undefined {
  return id ? MOOD.effects[id] : undefined;
}
