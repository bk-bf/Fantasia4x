import loreData from '../../database/social/culture-lore.json';
import type { Size } from '../rules/body/size';

export interface Archetype {
  name: string;
  statFocus: string[];
  statDump: string[];
  sizeBias: Size[];
  traits: string[];
  epithets: string[];
  origins: string[];
  homelands: string[];
  temperaments: string[];
  beliefs: string[];
}

export const CULTURE_LORE = loreData as unknown as {
  archetypes: Archetype[];
  phrases: {
    size: Record<string, string[]>;
    build: Record<string, string[]>;
    gait: Record<string, string[]>;
    comparative: Record<string, string[]>;
    mind: Record<string, string[]>;
    perception: { high: string[]; low: string[] };
    charisma: { high: string[]; low: string[] };
    vocation: Record<string, string[]>;
    quirkLeads: string[];
    colouring: {
      skin: Record<string, string>;
      hair: Record<string, string>;
      eyes: Record<string, string>;
      strong: number;
      loose: number;
      lines: { both: string; strong: string; loose: string; none: string };
    };
  };
};
