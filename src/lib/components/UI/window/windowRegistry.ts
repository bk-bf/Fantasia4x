import type { Component } from 'svelte';
import type { WindowId } from '$lib/stores/uiState';
import PawnScreen from '$lib/components/screens/PawnScreen.svelte';
import WorkScreen from '$lib/components/screens/WorkScreen.svelte';
import BuildingMenu from '$lib/components/screens/BuildingMenu.svelte';
import CraftingScreen from '$lib/components/screens/CraftingScreen.svelte';
import ExplorationScreen from '$lib/components/screens/ExplorationScreen.svelte';
import CultureScreen from '$lib/components/screens/CultureScreen.svelte';
import KingdomScreen from '$lib/components/screens/KingdomScreen.svelte';
import ResearchScreen from '$lib/components/screens/ResearchScreen.svelte';
import EntityScreen from '$lib/components/screens/EntityScreen.svelte';
import DebugScreen from '$lib/components/screens/DebugScreen.svelte';
import PauseMenu from '$lib/components/UI/menu/PauseMenu.svelte';
import HealthWindow from '$lib/components/pawn/HealthWindow.svelte';
import FuelWindow from '$lib/components/UI/canvas/FuelWindow.svelte';
import MoodWindow from '$lib/components/pawn/MoodWindow.svelte';
import FoodWindow from '$lib/components/UI/canvas/FoodWindow.svelte';
import RepairWindow from '$lib/components/UI/canvas/RepairWindow.svelte';
import StoresWindow from '$lib/components/UI/canvas/StoresWindow.svelte';

export interface WindowSpec {
  title: string;
  component: Component;
  width: 'big' | number;
  height?: number;
  modal?: boolean;
  fit?: boolean;
}

export const WINDOWS: Record<WindowId, WindowSpec> = {
  pawns: { title: 'Pawns', component: PawnScreen, width: 'big', fit: true },
  work: { title: 'Work', component: WorkScreen, width: 'big', fit: true },
  building: { title: 'Construction', component: BuildingMenu, width: 'big', height: 274 },
  crafting: { title: 'Crafting', component: CraftingScreen, width: 'big', fit: true },
  exploration: { title: 'Exploration', component: ExplorationScreen, width: 560, height: 384 },
  culture: { title: 'Cultures', component: CultureScreen, width: 900 },
  kingdoms: { title: 'Kingdoms', component: KingdomScreen, width: 900 },
  research: { title: 'Research', component: ResearchScreen, width: 'big' },
  entities: { title: 'Entities', component: EntityScreen, width: 900, height: 362 },
  debug: { title: 'Debug', component: DebugScreen, width: 'big' },
  pause: { title: 'Paused', component: PauseMenu, width: 280, modal: true },
  health: { title: 'Health', component: HealthWindow, width: 356, fit: true },
  fuel: { title: 'Fuel', component: FuelWindow, width: 300, fit: true },
  mood: { title: 'Mood', component: MoodWindow, width: 320, height: 224 },
  food: { title: 'Food', component: FoodWindow, width: 320, height: 231 },
  repair: { title: 'Repair', component: RepairWindow, width: 320, fit: true },
  stores: { title: 'Stores', component: StoresWindow, width: 380, height: 380 }
};

export const BIG_WIDTH_MAX = 1180;
export const BIG_WIDTH_MIN = 900;
export const WINDOW_HEIGHT_MAX = 600;
