import type { ResearchProject, LoreItem } from './types';
import researchData from '../database/research.json';
import loreData from '../database/lore.json';

export const RESEARCH_DATABASE = researchData as unknown as ResearchProject[];
export const LORE_DATABASE = loreData as unknown as LoreItem[];
