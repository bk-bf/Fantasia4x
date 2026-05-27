import type { Item } from './types';
import data from '../database/items.json';

export const ITEMS_DATABASE = data as unknown as Item[];
