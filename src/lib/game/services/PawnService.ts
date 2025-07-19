import type { GameState, Pawn, PawnNeeds, PawnState } from '../core/types';
import { calculatePawnAbilities, categorizeAbilities, getAbilityDescription } from '../entities/Pawns';
import { WORK_CATEGORIES } from '../core/Work';

/**
 * PawnService - Clean interface for pawn behavior and need management
 * Handles ONLY pawn-specific business logic, delegates to other systems for calculations
 */
export interface PawnService {
	// Need Management (PawnService responsibility)
	updatePawnNeeds(pawnId: string, gameState: GameState): GameState;
	processNeedsAutomatically(pawnId: string, gameState: GameState): GameState;

	// State Management (PawnService responsibility)
	updatePawnState(pawnId: string, gameState: GameState): GameState;
	updateMorale(pawnId: string, gameState: GameState): GameState;

	// Activity Management (PawnService responsibility)
	getPawnActivities(pawnId: string, gameState: GameState): string[];
	setPawnActivity(pawnId: string, activity: string, gameState: GameState): GameState;

	// Ability Calculations (DELEGATED to existing Pawns.ts functions)
	calculatePawnAbilities(pawnId: string, gameState: GameState): Record<string, { value: number; sources: string[] }>;
	categorizeAbilities(abilities: Record<string, { value: number; sources: string[] }>): Record<string, string[]>;
	getAbilityDescription(abilityName: string, abilityData: { value: number; sources: string[] }): string;

	// Turn Processing (PawnService coordination)
	processPawnTurn(gameState: GameState): GameState;

	// Automatic Eating Logic (extracted from GameEngine)
	processAutomaticEating(gameState: GameState): GameState;

	// Automatic Sleeping Logic (extracted from GameEngine)  
	processAutomaticSleeping(gameState: GameState): GameState;
	shouldPawnSleep(pawn: Pawn): boolean;

	// Pawn Needs Coordination (extracted from GameEngine)
	processAutomaticNeeds(gameState: GameState): GameState;
	clearTemporaryPawnStates(gameState: GameState): GameState;

	// Need Calculations (PawnService internal logic)
	calculateNeedDecay(pawnId: string, gameState: GameState): { hunger: number; rest: number };
	getPawnNeedStatus(pawnId: string, gameState: GameState): { critical: string[]; warning: string[]; normal: string[] };
}

/**
 * PawnService Implementation - Focused on pawn behavior and needs only
 */
export class PawnServiceImpl implements PawnService {

	// ===== RECOVERY CONFIGURATION =====
	private RECOVERY_CONFIG = {
		EATING: {
			BASE_HUNGER_REDUCTION: 8,         // Low base recovery per eating turn
			BASE_MOOD_BOOST: 2,
			DURATION_TURNS: 2,
			MAX_RECOVERY_PER_TURN: 15         // Prevents massive overflow
		},
		SLEEPING: {
			BASE_REST_REDUCTION: 12,          // Single rest recovery (replaces fatigue + sleep)
			BASE_MOOD_BOOST: 1,
			DURATION_TURNS: 3,
			MAX_RECOVERY_PER_TURN: 20,        // Prevents massive overflow
			MIN_RECOVERY_THRESHOLD: 30        // Must be 30+ to benefit from sleep
		},
		RESTING: {
			BASE_REST_REDUCTION: 3,           // Light rest for just resting (not sleeping)
			DURATION_TURNS: 1,
			MAX_RECOVERY_PER_TURN: 8
		}
	};

	// ===== NEED MANAGEMENT =====

	updatePawnNeeds(pawnId: string, gameState: GameState): GameState {
		const pawn = gameState.pawns.find(p => p.id === pawnId);
		if (!pawn) return gameState;

		const updatedPawn = this.calculateNeedsUpdate(pawn, gameState.turn);

		return {
			...gameState,
			pawns: gameState.pawns.map(p => p.id === pawnId ? updatedPawn : p)
		};
	}

	processNeedsAutomatically(pawnId: string, gameState: GameState): GameState {
		const pawn = gameState.pawns.find(p => p.id === pawnId);
		if (!pawn) return gameState;

		let updatedPawn = { ...pawn };

		// Critical hunger - try to eat automatically
		if (pawn.needs.hunger > 90) {
			updatedPawn = this.tryEating(updatedPawn, gameState);
		}

		// Critical sleep - force sleep (now based on fatigue/rest only)
		if (pawn.needs.fatigue > 95) {
			updatedPawn = this.forceSleep(updatedPawn, gameState);
		}

		// Medium fatigue - force light rest
		else if (pawn.needs.fatigue > 90) {
			updatedPawn = this.forceRest(updatedPawn);
		}

		return {
			...gameState,
			pawns: gameState.pawns.map(p => p.id === pawnId ? updatedPawn : p)
		};
	}

	calculateNeedDecay(pawnId: string, gameState: GameState): { hunger: number; rest: number } {
		const pawn = gameState.pawns.find(p => p.id === pawnId);
		if (!pawn) return { hunger: 0, rest: 0 };

		return {
			hunger: this.getHungerIncreasePerTurn(pawn),
			rest: this.getRestIncreasePerTurn(pawn)
		};
	}

	getPawnNeedStatus(pawnId: string, gameState: GameState): { critical: string[]; warning: string[]; normal: string[] } {
		const pawn = gameState.pawns.find(p => p.id === pawnId);
		if (!pawn) return { critical: [], warning: [], normal: [] };

		const critical = [];
		const warning = [];
		const normal = [];

		// Categorize needs by severity
		if (pawn.needs.hunger > 90) critical.push('hunger');
		else if (pawn.needs.hunger > 70) warning.push('hunger');
		else normal.push('hunger');

		// Use fatigue as "rest" need (single rest system)
		if (pawn.needs.fatigue > 95) critical.push('rest');
		else if (pawn.needs.fatigue > 80) warning.push('rest');
		else normal.push('rest');

		return { critical, warning, normal };
	}

	// ===== STATE MANAGEMENT =====

	updatePawnState(pawnId: string, gameState: GameState): GameState {
		const pawn = gameState.pawns.find(p => p.id === pawnId);
		if (!pawn) return gameState;

		const updatedState = this.calculateStateUpdate(pawn.state, pawn.needs, gameState.turn);
		const updatedPawn = { ...pawn, state: updatedState };

		return {
			...gameState,
			pawns: gameState.pawns.map(p => p.id === pawnId ? updatedPawn : p)
		};
	}

	updateMorale(pawnId: string, gameState: GameState): GameState {
		const pawn = gameState.pawns.find(p => p.id === pawnId);
		if (!pawn) return gameState;

		const newMorale = this.calculateMorale(pawn, gameState);
		const updatedPawn = {
			...pawn,
			state: { ...pawn.state, mood: newMorale }
		};

		return {
			...gameState,
			pawns: gameState.pawns.map(p => p.id === pawnId ? updatedPawn : p)
		};
	}

	// ===== ACTIVITY MANAGEMENT =====

	getPawnActivities(pawnId: string, gameState: GameState): string[] {
		const pawn = gameState.pawns.find(p => p.id === pawnId);
		if (!pawn) return [];

		const activities = [];

		// Current activities based on state
		if (pawn.state.isWorking) {
			const workAssignment = gameState.workAssignments?.[pawnId];
			if (workAssignment?.currentWork) {
				// FIXED: Get proper work category name instead of just the ID
				const workCategory = WORK_CATEGORIES.find(w => w.id === workAssignment.currentWork);
				const workName = workCategory?.name || workAssignment.currentWork;
				const location = workAssignment.activeLocation || 'unknown location';
				activities.push(`Working: ${workName} at ${location}`);
			} else {
				activities.push('Working (unassigned)');
			}
		}

		if (pawn.state.isSleeping) activities.push('Sleeping');
		if (pawn.state.isEating) activities.push('Eating');

		// Idle state
		if (activities.length === 0) {
			// Check if they have work assignment but aren't marked as working
			const workAssignment = gameState.workAssignments?.[pawnId];
			if (workAssignment?.currentWork) {
				const workCategory = WORK_CATEGORIES.find(w => w.id === workAssignment.currentWork);
				const workName = workCategory?.name || workAssignment.currentWork;
				activities.push(`Idle (assigned to ${workName})`);
			} else {
				activities.push('Idle (no work assigned)');
			}
		}

		// Add need-based activities
		const needStatus = this.getPawnNeedStatus(pawnId, gameState);
		if (needStatus.critical.length > 0) {
			activities.push(`Critical needs: ${needStatus.critical.join(', ')}`);
		}

		return activities;
	}

	setPawnActivity(pawnId: string, activity: string, gameState: GameState): GameState {
		const pawn = gameState.pawns.find(p => p.id === pawnId);
		if (!pawn) return gameState;

		const updatedState = { ...pawn.state };

		// Reset all activities
		updatedState.isWorking = false;
		updatedState.isSleeping = false;
		updatedState.isEating = false;

		// Set new activity
		switch (activity.toLowerCase()) {
			case 'working':
				updatedState.isWorking = true;
				break;
			case 'sleeping':
				updatedState.isSleeping = true;
				break;
			case 'eating':
				updatedState.isEating = true;
				break;
			case 'idle':
				// All activities already set to false
				break;
		}

		const updatedPawn = { ...pawn, state: updatedState };

		return {
			...gameState,
			pawns: gameState.pawns.map(p => p.id === pawnId ? updatedPawn : p)
		};
	}

	// ===== ABILITY CALCULATIONS (DELEGATED) =====

	calculatePawnAbilities(pawnId: string, gameState: GameState): Record<string, { value: number; sources: string[] }> {
		const pawn = gameState.pawns.find(p => p.id === pawnId);
		if (!pawn) return {};

		// DELEGATE to existing Pawns.ts function (which uses ModifierSystem)
		return calculatePawnAbilities(pawn, gameState);
	}

	categorizeAbilities(abilities: Record<string, { value: number; sources: string[] }>): Record<string, string[]> {
		// DELEGATE to existing Pawns.ts function
		return categorizeAbilities(abilities);
	}

	getAbilityDescription(abilityName: string, abilityData: { value: number; sources: string[] }): string {
		// DELEGATE to existing Pawns.ts function
		return getAbilityDescription(abilityName, abilityData);
	}

	// ===== TURN PROCESSING =====

	processPawnTurn(gameState: GameState): GameState {
		let newState = { ...gameState };

		// Process each pawn's needs and state
		gameState.pawns.forEach(pawn => {
			newState = this.updatePawnNeeds(pawn.id, newState);
			newState = this.updatePawnState(pawn.id, newState);
			newState = this.processNeedsAutomatically(pawn.id, newState);
			newState = this.updateMorale(pawn.id, newState);
		});

		return newState;
	}

	// ===== AUTOMATIC EATING LOGIC (EXTRACTED FROM GAMEENGINE) =====

	processAutomaticEating(gameState: GameState): GameState {
		console.log('[PawnService] Processing automatic eating for all pawns');

		let updatedGameState = { ...gameState };

		// Process each pawn for automatic eating
		gameState.pawns.forEach((pawn, index) => {
			console.log(`[PawnService] Checking ${pawn.name}: hunger=${pawn.needs.hunger}, sleeping=${pawn.state.isSleeping}`);

			// PRIORITY 1: Critical hunger (must eat immediately, even while sleeping)
			if (pawn.needs.hunger >= 80) {
				console.log(`[PawnService] ${pawn.name} critically hungry (${pawn.needs.hunger}), must eat now`);

				const fedPawn = this.tryAutomaticEating(pawn, updatedGameState);
				if (fedPawn !== pawn) {
					updatedGameState.pawns[index] = fedPawn;
					console.log(`[PawnService] ${pawn.name} ate due to critical hunger, hunger now: ${fedPawn.needs.hunger}`);
				}
			}
			// PRIORITY 2: Moderate hunger (eat when not sleeping) - LOWERED THRESHOLD
			else if (pawn.needs.hunger >= 50 && !pawn.state.isSleeping) {
				console.log(`[PawnService] ${pawn.name} moderately hungry (${pawn.needs.hunger}), attempting to eat`);

				const fedPawn = this.tryAutomaticEating(pawn, updatedGameState);
				if (fedPawn !== pawn) {
					updatedGameState.pawns[index] = fedPawn;
					console.log(`[PawnService] ${pawn.name} ate due to moderate hunger, hunger now: ${fedPawn.needs.hunger}`);
				}
			}
			// PRIORITY 3: Light hunger (eat when idle and food is plentiful) - NEW
			else if (pawn.needs.hunger >= 30 && !pawn.state.isSleeping && !pawn.state.isWorking) {
				console.log(`[PawnService] ${pawn.name} lightly hungry (${pawn.needs.hunger}), attempting to eat while idle`);

				const fedPawn = this.tryAutomaticEating(pawn, updatedGameState);
				if (fedPawn !== pawn) {
					updatedGameState.pawns[index] = fedPawn;
					console.log(`[PawnService] ${pawn.name} ate while idle, hunger now: ${fedPawn.needs.hunger}`);
				}
			}
		});

		return updatedGameState;
	}

	// ===== AUTOMATIC SLEEPING LOGIC (EXTRACTED FROM GAMEENGINE) =====

	processAutomaticSleeping(gameState: GameState): GameState {
		console.log('[PawnService] Processing automatic sleeping for all pawns');

		let updatedGameState = { ...gameState };

		// Process each pawn for automatic sleeping
		gameState.pawns.forEach((pawn, index) => {
			let updatedPawn = { ...pawn };
			let needsUpdate = false;

			// Sleep decision based on hunger/fatigue balance
			if (this.shouldPawnSleep(updatedPawn)) {
				console.log(`[PawnService] ${pawn.name} should sleep (fatigue: ${updatedPawn.needs.fatigue}, hunger: ${updatedPawn.needs.hunger})`);

				const restedPawn = this.tryAutomaticSleeping(updatedPawn, updatedGameState);
				if (restedPawn !== updatedPawn) {
					updatedPawn = restedPawn;
					needsUpdate = true;
					console.log(`[PawnService] ${pawn.name} is sleeping, fatigue now: ${updatedPawn.needs.fatigue}`);
				}
			}

			// Update pawn in gameState if changes were made
			if (needsUpdate) {
				updatedGameState.pawns[index] = updatedPawn;
			}
		});

		return updatedGameState;
	}

	// ===== EXTRACTED SLEEPING METHODS FROM GAMEENGINE =====

	shouldPawnSleep(pawn: Pawn): boolean {
		const fatigue = pawn.needs.fatigue;
		const hunger = pawn.needs.hunger;

		// Don't sleep if already sleeping
		if (pawn.state.isSleeping) {
			// Continue sleeping if still tired, unless getting very hungry
			const shouldContinueSleeping = fatigue > 15 && hunger < 80; // LOWERED: Wake at 15 fatigue (was 30)
			console.log(`[PawnService] ${pawn.name} sleeping: fatigue=${fatigue}, hunger=${hunger}, continue=${shouldContinueSleeping}`);
			return shouldContinueSleeping;
		}

		// Start sleeping based on hunger/fatigue balance
		if (hunger < 30) {
			// Well fed: sleep until almost fully rested (fatigue < 15)
			return fatigue >= 40; // LOWERED: Start at 40 fatigue (was 50)
		} else if (hunger < 60) {
			// Moderately fed: sleep until moderately rested (fatigue < 20)
			return fatigue >= 60; // LOWERED: Start at 60 fatigue (was 70)
		} else if (hunger < 80) {
			// Getting hungry: only sleep when very tired (fatigue < 30)
			return fatigue >= 80; // LOWERED: Start at 80 fatigue (was 85)
		} else {
			// Very hungry: don't sleep, eat instead
			return false;
		}
	}

	private tryAutomaticSleeping(pawn: Pawn, gameState: GameState): Pawn {
		// Calculate rest recovery
		const recovery = this.calculateRestRecovery(pawn);

		// Update pawn
		const updatedPawn = { ...pawn };
		updatedPawn.needs = {
			...pawn.needs,
			fatigue: Math.max(0, pawn.needs.fatigue - recovery),
			lastSleep: gameState.turn
		};
		updatedPawn.state = {
			...pawn.state,
			isSleeping: true,
			isWorking: false, // Stop working to sleep
			isEating: false
		};

		console.log(`[PawnService] ${pawn.name} sleeping: fatigue ${pawn.needs.fatigue} → ${updatedPawn.needs.fatigue} (recovery: ${recovery})`);
		return updatedPawn;
	}

	private calculateRestRecovery(pawn: Pawn): number {
		return 5; // Simple fixed rest recovery
	}

	// ===== EXTRACTED EATING METHODS FROM GAMEENGINE =====

	private tryAutomaticEating(pawn: Pawn, gameState: GameState): Pawn {
		// Find available food in gameState
		const availableFood = this.findAvailableFood(gameState);

		if (availableFood.length === 0) {
			console.log(`[PawnService] No food available for ${pawn.name}`);
			return pawn; // No food available
		}

		// Sort foods by nutrition value (highest first) for priority eating
		const sortedFood = availableFood.sort((a, b) => (b.nutrition || 0) - (a.nutrition || 0));

		console.log(`[PawnService] ${pawn.name} available foods sorted by nutrition:`,
			sortedFood.map(f => `${f.name}(${f.nutrition})`));

		// CALCULATE HOW MUCH HUNGER TO SATISFY
		const currentHunger = pawn.needs.hunger;
		const targetHunger = Math.max(10, currentHunger * 0.3); // Reduce hunger to 30% of current, minimum 10
		let hungerToReduce = currentHunger - targetHunger;

		console.log(`[PawnService] ${pawn.name} eating session: hunger ${currentHunger} → target ${targetHunger} (need to reduce ${hungerToReduce.toFixed(1)})`);

		let totalHungerReduction = 0;
		const foodsEaten = [];
		let maxFoodTypes = 3; // Limit to eating 3 different food types per session

		// EAT MULTIPLE FOOD TYPES, STARTING WITH HIGHEST NUTRITION
		for (const food of sortedFood) {
			if (hungerToReduce <= 0 || maxFoodTypes <= 0) {
				break; // Satisfied or reached variety limit
			}

			// Calculate nutrition per unit of this food
			const nutritionPerUnit = this.calculateFoodRecovery(pawn, food);

			// Calculate how many units of this food we should eat
			const unitsNeeded = Math.ceil(hungerToReduce / nutritionPerUnit);
			const unitsToEat = Math.min(food.amount, unitsNeeded, 25); // Max 25 units of any single food type

			if (unitsToEat <= 0) continue;

			// Consume the food from inventory
			this.consumeFoodFromInventory(gameState, food.id, unitsToEat);

			// Calculate actual hunger reduction from this food
			const hungerReductionFromThisFood = nutritionPerUnit * unitsToEat;
			totalHungerReduction += hungerReductionFromThisFood;
			hungerToReduce -= hungerReductionFromThisFood;

			// Track what was eaten
			foodsEaten.push({ name: food.name, amount: unitsToEat, nutrition: hungerReductionFromThisFood });
			maxFoodTypes--;

			console.log(`[PawnService] ${pawn.name} ate ${unitsToEat}x ${food.name} (nutrition: ${nutritionPerUnit.toFixed(1)} each, total: ${hungerReductionFromThisFood.toFixed(1)})`);
		}

		if (totalHungerReduction <= 0) {
			console.log(`[PawnService] ${pawn.name} couldn't eat any food effectively`);
			return pawn;
		}

		// Update pawn's hunger - don't go below 0
		const newHunger = Math.max(0, currentHunger - totalHungerReduction);
		const actualReduction = currentHunger - newHunger;

		const updatedPawn = {
			...pawn,
			needs: {
				...pawn.needs,
				hunger: newHunger,
				lastMeal: gameState.turn
			},
			state: {
				...pawn.state,
				isEating: true, // Mark as eating this turn
				isWorking: false, // Stop working to eat
				isSleeping: false,
				mood: Math.min(100, pawn.state.mood + Math.floor(actualReduction * 0.15)) // Mood boost scales with satisfaction
			}
		};

		// Log the complete eating session
		const foodSummary = foodsEaten.map(f => `${f.amount}x ${f.name}`).join(', ');
		console.log(`[PawnService] ${pawn.name} eating session complete: ate ${foodSummary}`);
		console.log(`[PawnService] ${pawn.name} hunger reduced: ${currentHunger} → ${newHunger} (total reduction: ${actualReduction.toFixed(1)})`);

		return updatedPawn;
	}

	private consumeFoodFromInventory(gameState: GameState, foodId: string, amount: number): void {
		if (!gameState.item) return;

		const foodIndex = gameState.item.findIndex(item => item.id === foodId);
		if (foodIndex !== -1) {
			gameState.item[foodIndex] = {
				...gameState.item[foodIndex],
				amount: Math.max(0, gameState.item[foodIndex].amount - amount)
			};

			// Remove item if amount reaches 0
			if (gameState.item[foodIndex].amount <= 0) {
				gameState.item.splice(foodIndex, 1);
			}

			console.log(`[PawnService] Consumed ${amount}x ${foodId} from inventory`);
		}
	}

	private calculateFoodRecovery(pawn: Pawn, food: any): number {
		// Get base nutrition value from Items.ts
		const nutritionValue = food.nutrition || 1.0;

		// Apply simplified bonuses (building bonus would require full gameState)
		const buildingBonus = 1.0; // For now, use base value - could be improved later
		const constitutionBonus = Math.max(0, (pawn.stats.constitution - 10) * 0.02); // 2% per point above 10
		const racialMultiplier = this.getRacialEatingMultiplier(pawn);

		// Calculate total recovery per unit
		let recoveryPerUnit = nutritionValue * buildingBonus * (1 + constitutionBonus) * racialMultiplier;

		// Cap at reasonable max to prevent oversatisfaction from super foods
		recoveryPerUnit = Math.min(recoveryPerUnit, 15); // Max 15 hunger reduction per food unit

		return recoveryPerUnit;
	}

	// ===== PRIVATE HELPER METHODS =====

	private calculateNeedsUpdate(pawn: Pawn, currentTurn: number): Pawn {
		const updatedPawn = { ...pawn };

		// Increase needs each turn (only hunger and fatigue/rest)
		updatedPawn.needs = {
			...pawn.needs,
			hunger: Math.min(100, pawn.needs.hunger + this.getHungerIncreasePerTurn(pawn)),
			fatigue: Math.min(100, pawn.needs.fatigue + this.getRestIncreasePerTurn(pawn)),
			// Keep sleep at current value but don't use it for logic
			sleep: pawn.needs.sleep || 0
		};

		return updatedPawn;
	}

	private calculateStateUpdate(state: PawnState, needs: PawnNeeds, currentTurn: number): PawnState {
		const newState = { ...state };

		// Critical needs override current activities
		if (needs.hunger > 90) {
			newState.isWorking = false;
			newState.isSleeping = false;
			newState.isEating = true;
			newState.mood = Math.max(0, newState.mood - 5);
		} else if (needs.fatigue > 95) { // Use fatigue as single rest need
			newState.isWorking = false;
			newState.isEating = false;
			newState.isSleeping = true;
			newState.mood = Math.max(0, newState.mood - 3);
		} else if (needs.fatigue > 90) { // Medium fatigue - stop working but don't force sleep
			newState.isWorking = false;
			newState.mood = Math.max(0, newState.mood - 2);
		}

		// Positive mood from activities
		if (newState.isEating && needs.hunger > 50) {
			newState.mood = Math.min(100, newState.mood + 3);
		} else if (newState.isSleeping && needs.fatigue > 50) { // Use fatigue for sleep benefit
			newState.mood = Math.min(100, newState.mood + 2);
		} else if (newState.isWorking && needs.fatigue < 80) {
			newState.mood = Math.min(100, newState.mood + 1);
		}

		// Health regeneration
		if (newState.health < 100) {
			newState.health = Math.min(100, newState.health + this.getHealthRegenPerTurn(needs));
		}

		return newState;
	}

	private calculateMorale(pawn: Pawn, gameState: GameState): number {
		let morale = pawn.state.mood;

		// Need-based morale modifiers (only hunger and fatigue/rest)
		if (pawn.needs.hunger > 80) morale -= 10;
		if (pawn.needs.fatigue > 80) morale -= 12; // Slightly higher penalty for tiredness

		// Health-based morale
		if (pawn.state.health < 50) morale -= 20;
		else if (pawn.state.health < 80) morale -= 10;

		// Trait-based morale modifiers
		pawn.racialTraits.forEach(trait => {
			// Add other trait-based morale effects here if needed
			// Currently no moraleBonus/moralePenalty properties exist in trait effects
		});

		// Environment-based morale (could be expanded)
		const workAssignment = gameState.workAssignments?.[pawn.id];
		if (workAssignment?.activeLocation) {
			// Different locations could provide morale bonuses/penalties
		}

		return Math.max(0, Math.min(100, morale));
	}

	private forceSleep(pawn: Pawn, gameState: GameState): Pawn {
		// Sleep is less effective if fatigue isn't high enough (single rest system)
		const restLevel = pawn.needs.fatigue; // Use fatigue as the single rest need

		if (restLevel < this.RECOVERY_CONFIG.SLEEPING.MIN_RECOVERY_THRESHOLD) {
			console.log(`[PawnService] ${pawn.name} not tired enough for effective sleep`);
			return pawn; // Can't force sleep on well-rested pawns
		}

		// Get building bonuses for sleep quality
		const buildingBonus = this.getSleepBuildingBonus(gameState);

		const constitutionBonus = Math.max(0, (pawn.stats.constitution - 10) * 0.02);
		const racialMultiplier = this.getRacialSleepMultiplier(pawn);

		// Calculate recovery with realistic limits (single rest recovery)
		let restReduction = this.RECOVERY_CONFIG.SLEEPING.BASE_REST_REDUCTION *
			buildingBonus * (1 + constitutionBonus) * racialMultiplier;

		// PREVENT OVERFLOW: Cap recovery per turn and scale by actual need
		const restEfficiency = Math.min(1.0, restLevel / 80); // Less effective if not very tired

		restReduction = Math.min(restReduction * restEfficiency, this.RECOVERY_CONFIG.SLEEPING.MAX_RECOVERY_PER_TURN);

		console.log(`[PawnService] ${pawn.name} sleeping - rest recovery: ${restReduction.toFixed(1)}, building bonus: ${buildingBonus}`);

		const updatedPawn = { ...pawn };
		updatedPawn.state = {
			...pawn.state,
			isWorking: false,
			isEating: false,
			isSleeping: true
		};
		updatedPawn.needs = {
			...pawn.needs,
			fatigue: Math.max(0, pawn.needs.fatigue - restReduction), // Single rest recovery
			// Keep sleep unchanged but don't use it
			sleep: pawn.needs.sleep || 0
		};

		return updatedPawn;
	}

	// NEW: Building bonus calculation methods
	private getCookingBuildingBonus(gameState: GameState): number {
		let bonus = 1.0; // Base multiplier

		// Check for cooking-related buildings
		if (gameState.buildingCounts?.kitchen > 0) {
			bonus += 0.4; // 40% bonus from kitchen
		}
		if (gameState.buildingCounts?.bakery > 0) {
			bonus += 0.3; // 30% bonus from bakery
		}
		if (gameState.buildingCounts?.granary > 0) {
			bonus += 0.2; // 20% bonus from food preservation
		}

		return bonus;
	}

	private getSleepBuildingBonus(gameState: GameState): number {
		let bonus = 1.0; // Base multiplier

		// Check for housing/comfort buildings
		if (gameState.buildingCounts?.stone_hut > 0) {
			bonus += 0.4; // 40% bonus from proper housing
		} else if (gameState.buildingCounts?.woodland_shelter > 0) {
			bonus += 0.25; // 25% bonus from basic shelter
		} else if (gameState.buildingCounts?.lean_to_shelter > 0) {
			bonus += 0.1; // 10% bonus from minimal shelter
		}

		return bonus;
	}

	private getHealthRegenPerTurn(needs: PawnNeeds): number {
		let regen = 0.5; // Base health regen per turn

		// Well-fed and rested pawns regenerate faster
		if (needs.hunger < 30 && needs.fatigue < 30) {
			regen *= 2;
		}

		// Starving or exhausted pawns regenerate slower
		if (needs.hunger > 80 || needs.fatigue > 80) {
			regen *= 0.5;
		}

		return regen;
	}

	// UPDATED: More realistic rest increases based on activity intensity (single rest system)
	private getRestIncreasePerTurn(pawn: Pawn): number {
		let baseRest = 1.2; // Reduced base rest increase

		// Different work types cause different rest needs
		if (pawn.state.isWorking) {
			// Note: We'd need to access gameState to get workAssignment, for now use generic work fatigue
			baseRest *= 1.5; // Default work tiredness
		}

		// Sleeping REDUCES rest need (already handled in forceSleep)
		if (pawn.state.isSleeping) {
			return 0; // No rest need increase while sleeping
		}

		// Combat increases rest need significantly  
		if ((pawn.state as any).inCombat) {
			baseRest *= 2.5; // Combat is extremely tiring
		}

		// Racial trait modifiers
		pawn.racialTraits.forEach((trait) => {
			if ((trait.effects as any).fatigueRate) {
				baseRest *= (trait.effects as any).fatigueRate;
			}
			// Add specific trait effects
			switch (trait.name) {
				case 'Tireless':
					baseRest *= 0.7;
					break;
				case 'Energetic':
					baseRest *= 0.8;
					break;
				case 'Lazy':
					baseRest *= 1.3;
					break;
				case 'Frail':
					baseRest *= 1.4;
					break;
			}
		});

		return Math.max(0.3, baseRest); // Minimum rest increase
	}

	private getHungerIncreasePerTurn(pawn: Pawn): number {
		let baseHunger = 1.5; // Base hunger increase per turn

		// Working increases hunger
		if (pawn.state.isWorking) {
			baseHunger *= 1.4;
		}

		// Eating REDUCES hunger (handled in tryEating)
		if (pawn.state.isEating) {
			return 0; // No hunger increase while eating
		}

		// Racial trait modifiers
		pawn.racialTraits.forEach((trait) => {
			switch (trait.name) {
				case 'Efficient Metabolism':
					baseHunger *= 0.7; // Needs less food
					break;
				case 'Large Appetite':
					baseHunger *= 1.4; // Needs more food
					break;
				case 'Hardy':
					baseHunger *= 0.9;
					break;
			}
		});

		return Math.max(0.2, baseHunger);
	}

	private forceRest(pawn: Pawn): Pawn {
		const restLevel = pawn.needs.fatigue; // Use fatigue as rest level

		if (restLevel < this.RECOVERY_CONFIG.RESTING.BASE_REST_REDUCTION) {
			return pawn; // Not tired enough to benefit from rest
		}

		const constitutionBonus = Math.max(0, (pawn.stats.constitution - 10) * 0.02);
		const racialMultiplier = this.getRacialSleepMultiplier(pawn);

		let restReduction = this.RECOVERY_CONFIG.RESTING.BASE_REST_REDUCTION *
			(1 + constitutionBonus) * racialMultiplier;

		// Cap recovery and scale by need
		const restEfficiency = Math.min(1.0, restLevel / 60);
		restReduction = Math.min(restReduction * restEfficiency, this.RECOVERY_CONFIG.RESTING.MAX_RECOVERY_PER_TURN);

		console.log(`[PawnService] ${pawn.name} resting - rest recovery: ${restReduction.toFixed(1)}`);

		const updatedPawn = { ...pawn };
		updatedPawn.state = {
			...pawn.state,
			isWorking: false
		};
		updatedPawn.needs = {
			...pawn.needs,
			fatigue: Math.max(0, pawn.needs.fatigue - restReduction)
		};

		return updatedPawn;
	}

	// UPDATED: Find food with nutrition values from Items.ts
	private findAvailableFood(gameState: GameState): any[] {
		// FIXED: Check gameState.item exists and filter properly
		if (!gameState.item || gameState.item.length === 0) {
			console.log('[PawnService] No items available in gameState');
			return [];
		}

		const availableFood = gameState.item.filter(item => {
			// FIXED: Check if item has nutritional value AND sufficient amount
			const hasNutrition = item.nutrition && item.nutrition > 0;
			const hasAmount = item.amount && item.amount > 0;

			console.log(`[PawnService] Checking item ${item.name}: nutrition=${item.nutrition}, amount=${item.amount}, hasNutrition=${hasNutrition}, hasAmount=${hasAmount}`);

			return hasNutrition && hasAmount;
		});

		console.log(`[PawnService] Found ${availableFood.length} available food items:`,
			availableFood.map(f => `${f.name}(${f.amount})`));

		return availableFood;
	}

	private selectBestFood(availableFood: any[]): any {
		if (availableFood.length === 0) {
			console.log('[PawnService] No food available for selection');
			return null;
		}

		// Select highest nutrition value food available
		const bestFood = availableFood.reduce((best, current) => {
			const currentNutrition = current.nutrition || 0;
			const bestNutrition = best.nutrition || 0;
			return currentNutrition > bestNutrition ? current : best;
		});

		console.log(`[PawnService] Selected best food: ${bestFood.name} (nutrition: ${bestFood.nutrition})`);
		return bestFood;
	}

	// UPDATED: Realistic recovery with building/item bonuses
	private tryEating(pawn: Pawn, gameState: GameState): Pawn {
		if (pawn.needs.hunger < 70) return pawn; // Only eat when moderately hungry

		// Find best available food and calculate its nutritional value
		const availableFood = this.findAvailableFood(gameState);
		if (availableFood.length === 0) {
			console.log(`[PawnService] ${pawn.name} wants to eat but no food available`);
			return pawn;
		}

		const selectedFood = this.selectBestFood(availableFood);
		if (!selectedFood) {
			console.log(`[PawnService] ${pawn.name} could not select food`);
			return pawn;
		}

		// CONSUME THE FOOD - This was missing!
		const foodConsumed = Math.min(1, selectedFood.amount); // Consume 1 unit of food
		selectedFood.amount -= foodConsumed;

		// Get nutrition value from Items.ts nutrition property
		const nutritionValue = selectedFood.nutrition || 1.0;

		// Get building bonuses for cooking/food preparation
		const buildingBonus = this.getCookingBuildingBonus(gameState);

		// Calculate recovery with realistic limits
		const baseRecovery = this.RECOVERY_CONFIG.EATING.BASE_HUNGER_REDUCTION;
		const foodMultiplier = nutritionValue; // From Items.ts nutrition property
		const constitutionBonus = Math.max(0, (pawn.stats.constitution - 10) * 0.02); // 2% per point above 10
		const racialMultiplier = this.getRacialEatingMultiplier(pawn);

		let hungerReduction = baseRecovery * foodMultiplier * buildingBonus * (1 + constitutionBonus) * racialMultiplier;

		// PREVENT OVERFLOW: Cap recovery per turn
		hungerReduction = Math.min(hungerReduction, this.RECOVERY_CONFIG.EATING.MAX_RECOVERY_PER_TURN);

		console.log(`[PawnService] ${pawn.name} eating ${selectedFood.name} - recovery: ${hungerReduction.toFixed(1)} (nutrition: ${nutritionValue}, building: ${buildingBonus})`);

		const updatedPawn = { ...pawn };
		updatedPawn.needs = {
			...pawn.needs,
			hunger: Math.max(0, pawn.needs.hunger - hungerReduction),
			lastMeal: gameState.turn
		};
		updatedPawn.state = {
			...pawn.state,
			isEating: true,
			mood: Math.min(100, pawn.state.mood + this.RECOVERY_CONFIG.EATING.BASE_MOOD_BOOST)
		};

		return updatedPawn;
	}

	// Racial trait multipliers for eating
	private getRacialEatingMultiplier(pawn: Pawn): number {
		let multiplier = 1.0;

		pawn.racialTraits.forEach(trait => {
			switch (trait.name) {
				case 'Efficient Metabolism':
					multiplier *= 1.3; // Better food processing
					break;
				case 'Large Appetite':
					multiplier *= 0.8; // Needs more food to satisfy
					break;
				case 'Herbivore':
					multiplier *= 1.2; // Better at processing plants
					break;
				case 'Carnivore':
					multiplier *= 1.1; // Better at processing meat
					break;
			}
		});

		return multiplier;
	}

	private getRacialSleepMultiplier(pawn: Pawn): number {
		let multiplier = 1.0;

		pawn.racialTraits.forEach(trait => {
			switch (trait.name) {
				case 'Light Sleeper':
					multiplier *= 1.2; // Recovers faster but needs more sleep
					break;
				case 'Deep Sleeper':
					multiplier *= 0.9; // Recovers slower but more completely
					break;
				case 'Nocturnal':
					multiplier *= 1.1; // Better sleep recovery
					break;
				case 'Energetic':
					multiplier *= 1.1; // Recovers faster
					break;
			}
		});

		return multiplier;
	}

	// ===== PAWN NEEDS COORDINATION (EXTRACTED FROM GAMEENGINE) =====

	/**
	 * Clear temporary eating/sleeping states from previous turn
	 * Extracted from GameEngine.clearTemporaryPawnStates()
	 */
	clearTemporaryPawnStates(gameState: GameState): GameState {
		const updatedPawns = gameState.pawns.map((pawn, index) => {
			let shouldClearStates = false;

			// Clear eating state after one turn (eating is always one turn)
			if (pawn.state.isEating) {
				shouldClearStates = true;
				console.log(`[PawnService] Clearing eating state for ${pawn.name}`);
			}

			// Only clear sleeping state if pawn should wake up
			if (pawn.state.isSleeping) {
				const shouldWakeUp = !this.shouldPawnSleep(pawn);
				if (shouldWakeUp) {
					shouldClearStates = true;
					console.log(`[PawnService] Waking up ${pawn.name} (fatigue: ${pawn.needs.fatigue}, hunger: ${pawn.needs.hunger})`);
				} else {
					console.log(`[PawnService] ${pawn.name} continues sleeping (fatigue: ${pawn.needs.fatigue}, hunger: ${pawn.needs.hunger})`);
				}
			}

			if (shouldClearStates) {
				return {
					...pawn,
					state: {
						...pawn.state,
						isEating: false,
						isSleeping: pawn.state.isSleeping && !shouldClearStates // Only clear sleeping if should wake up
					}
				};
			}

			return pawn;
		});

		return {
			...gameState,
			pawns: updatedPawns
		};
	}

	/**
	 * Process automatic pawn needs (eating and sleeping)
	 * Extracted from GameEngine.processAutomaticPawnNeeds()
	 */
	processAutomaticNeeds(gameState: GameState): GameState {
		console.log('[PawnService] Processing automatic pawn needs through service coordination');

		let updatedGameState = gameState;

		// Process automatic eating through PawnService
		updatedGameState = this.processAutomaticEating(updatedGameState);

		// Process automatic sleeping through PawnService
		updatedGameState = this.processAutomaticSleeping(updatedGameState);

		return updatedGameState;
	}
}

// Export singleton instance
export const pawnService = new PawnServiceImpl();