import type {
	GameState,
	Pawn,
	PawnNeeds,
	PawnState,
	Race,
	RaceStats,
	RacialTrait
} from '../core/types';
import {
	createPawnInventory,
	createPawnEquipment,
	getEquipmentBonuses
} from '../core/PawnEquipment';
import { modifierSystem } from '../systems/ModifierSystem';

// Update generatePawns function
export function generatePawns(race: Race, count?: number): Pawn[] {
	const pawns: Pawn[] = [];
	const pawnCount = count || 3;

	for (let i = 0; i < pawnCount; i++) {
		const baseStats = rollStatsFromRanges(race.statRanges);
		const finalStats = applyRacialTraitBonuses(baseStats, race.racialTraits);

		const pawn: Pawn = {
			id: `pawn-${i}`,
			name: generatePawnName(),
			stats: finalStats,
			physicalTraits: rollPhysicalTraits(race.physicalTraits),
			racialTraits: race.racialTraits,
			inventory: createPawnInventory(10), // 10 base inventory slots
			equipment: createPawnEquipment(),
			needs: {
				hunger: 0,
				fatigue: 0,
				sleep: 0,
				lastSleep: 0,
				lastMeal: 0
			},
			state: {
				mood: 50,
				health: 100,
				isWorking: false,
				isSleeping: false,
				isEating: false
			},
			skills: {}
		};

		pawns.push(pawn);
	}

	return pawns;
}

// UPDATED: Use ModifierSystem for complex calculations
export function calculatePawnAbilities(
	pawn: Pawn,
	gameState?: GameState
): Record<string, { value: number; sources: string[] }> {
	const abilities: Record<string, { value: number; sources: string[] }> = {};

	// If we have gameState, use ModifierSystem for work efficiencies and equipment
	if (gameState) {
		// Use ModifierSystem for work efficiencies
		const workResults = modifierSystem.calculateAllWorkEfficiencies(pawn.id, gameState);
		Object.entries(workResults).forEach(([workType, result]) => {
			abilities[`${workType}Efficiency`] = {
				value: result.totalValue,
				sources: result.sources.map(s => s.description)
			};
		});

		// Use ModifierSystem for equipment bonuses
		const equipmentResults = modifierSystem.calculateEquipmentBonuses(pawn);
		Object.entries(equipmentResults).forEach(([effectName, result]) => {
			abilities[effectName] = {
				value: result.totalValue,
				sources: result.sources.map(s => s.description)
			};
		});

		// Use ModifierSystem for trait effects
		const traitResults = modifierSystem.calculateAllTraitEffects(pawn);
		Object.entries(traitResults).forEach(([effectName, result]) => {
			abilities[effectName] = {
				value: result.totalValue,
				sources: result.sources.map(s => s.description)
			};
		});
	}

	// Calculate base stats for simple derived abilities
	const baseStats = getBaseStats(pawn);
	const totalStats = getTotalStats(baseStats, {}, {}); // Simplified since ModifierSystem handles bonuses

	// Add skills (not handled by ModifierSystem)
	addSkillAbilities(abilities, pawn);

	// Keep only basic derived abilities that don't conflict with ModifierSystem
	addBasicPhysicalAbilities(abilities, totalStats);
	addBasicMentalAbilities(abilities, totalStats);
	addBasicSurvivalAbilities(abilities, totalStats);

	return abilities;
}

// --- Helper functions ---

function getBaseStats(pawn: Pawn) {
	return {
		strength: pawn.stats.strength || 0,
		dexterity: pawn.stats.dexterity || 0,
		intelligence: pawn.stats.intelligence || 0,
		wisdom: pawn.stats.wisdom || 0,
		charisma: pawn.stats.charisma || 0,
		constitution: pawn.stats.constitution || 0
	};
}

function addSkillAbilities(
	abilities: Record<string, { value: number; sources: string[] }>,
	pawn: Pawn
) {
	Object.entries(pawn.skills || {}).forEach(([skillName, skillLevel]) => {
		addAbility(abilities, `skill_${skillName}`, skillLevel, 'Experience');
	});
}

function getTotalStats(
	base: { [k: string]: number },
	trait: { [k: string]: number },
	equip: { [k: string]: number }
) {
	return {
		strength: base.strength + (trait.strength || 0) + (equip.strength || 0),
		dexterity: base.dexterity + (trait.dexterity || 0) + (equip.dexterity || 0),
		intelligence: base.intelligence + (trait.intelligence || 0),
		wisdom: base.wisdom + (trait.wisdom || 0),
		charisma: base.charisma + (trait.charisma || 0),
		constitution: base.constitution + (trait.constitution || 0)
	};
}

// SIMPLIFIED: Only basic derived stats, not work efficiencies
function addBasicPhysicalAbilities(
	abilities: Record<string, { value: number; sources: string[] }>,
	totalStats: { [k: string]: number }
) {
	// Only basic derived stats that don't conflict with ModifierSystem
	const carryCapacity = 50 + totalStats.strength * 2;
	addAbility(
		abilities,
		'carryCapacity',
		carryCapacity,
		`Base (50) + Strength (${totalStats.strength} × 2)`
	);

	const movementSpeed = 1.0 + (totalStats.dexterity - 10) * 0.02;
	addAbility(
		abilities,
		'movementSpeed',
		movementSpeed,
		`Base (1.0) + Dexterity modifier (${totalStats.dexterity - 10} × 0.02)`
	);

	const baseSwimmingSpeed = movementSpeed * 0.5;
	addAbility(
		abilities,
		'swimmingSpeed',
		baseSwimmingSpeed,
		`50% of movement speed (${movementSpeed.toFixed(2)} × 0.5)`
	);

	// Basic vision range
	addAbility(abilities, 'visionRange', 10, 'Base vision range (10 meters)');
}

function addBasicMentalAbilities(
	abilities: Record<string, { value: number; sources: string[] }>,
	totalStats: { [k: string]: number }
) {
	// Only basic derived stats
	const learningSpeed = 1.0 + (totalStats.intelligence - 10) * 0.05;
	addAbility(
		abilities,
		'learningSpeed',
		learningSpeed,
		`Base (1.0) + Intelligence modifier (${totalStats.intelligence - 10} × 0.05)`
	);

	const socialInfluence = 1.0 + (totalStats.charisma - 10) * 0.05;
	addAbility(
		abilities,
		'socialInfluence',
		socialInfluence,
		`Base (1.0) + Charisma modifier (${totalStats.charisma - 10} × 0.05)`
	);

	const intuition = 1.0 + (totalStats.wisdom - 10) * 0.05;
	addAbility(
		abilities,
		'intuition',
		intuition,
		`Base (1.0) + Wisdom modifier (${totalStats.wisdom - 10} × 0.05)`
	);

	const knowledgeStorage = totalStats.intelligence * 10;
	addAbility(
		abilities,
		'knowledgeStorage',
		knowledgeStorage,
		`Intelligence × 10 (${totalStats.intelligence} × 10)`
	);

	const experienceGain = 1.0 + (totalStats.wisdom - 10) * 0.02;
	addAbility(
		abilities,
		'experienceGain',
		experienceGain,
		`Base (1.0) + Wisdom modifier (${totalStats.wisdom - 10} × 0.02)`
	);
}

function addBasicSurvivalAbilities(
	abilities: Record<string, { value: number; sources: string[] }>,
	totalStats: { [k: string]: number }
) {
	// Only basic derived stats
	const healthRegenRate = 0.5 + (totalStats.constitution - 10) * 0.1;
	addAbility(
		abilities,
		'healthRegenRate',
		healthRegenRate,
		`Base (0.5) + Constitution modifier (${totalStats.constitution - 10} × 0.1)`
	);

	const diseaseResistance = Math.max(0, (totalStats.constitution - 10) * 0.05);
	addAbility(
		abilities,
		'diseaseResistance',
		diseaseResistance,
		`Constitution modifier (${totalStats.constitution - 10} × 0.05, min 0)`
	);

	const vitality = totalStats.constitution;
	addAbility(
		abilities,
		'vitality',
		vitality,
		`Constitution score (${totalStats.constitution})`
	);
}

function addAbility(
	abilities: Record<string, { value: number; sources: string[] }>,
	abilityName: string,
	value: number,
	source: string
) {
	if (!abilities[abilityName]) {
		abilities[abilityName] = { value: 0, sources: [] };
	}
	abilities[abilityName].value += value;
	abilities[abilityName].sources.push(source);
}

// UPDATED: Simplified categorization focused on basic abilities
export function categorizeAbilities(
	abilities: Record<string, { value: number; sources: string[] }>
): Record<string, string[]> {
	const categories: Record<string, string[]> = {
		'Basic Physical': [],
		'Basic Mental': [],
		'Basic Survival': [],
		'Skills': [],
		'Special': []
	};

	Object.keys(abilities).forEach((abilityName) => {
		const lowerName = abilityName.toLowerCase();

		// Skills
		if (lowerName.startsWith('skill_')) {
			categories['Skills'].push(abilityName);
		}
		// Basic Physical abilities
		else if (
			lowerName.includes('carry') ||
			lowerName.includes('movement') ||
			lowerName.includes('swimming') ||
			lowerName.includes('vision')
		) {
			categories['Basic Physical'].push(abilityName);
		}
		// Basic Mental abilities
		else if (
			lowerName.includes('learning') ||
			lowerName.includes('social') ||
			lowerName.includes('intuition') ||
			lowerName.includes('knowledge') ||
			lowerName.includes('experience')
		) {
			categories['Basic Mental'].push(abilityName);
		}
		// Basic Survival abilities
		else if (
			lowerName.includes('health') ||
			lowerName.includes('disease') ||
			lowerName.includes('vitality')
		) {
			categories['Basic Survival'].push(abilityName);
		}
		// Everything else goes to Special (ModifierSystem handled abilities)
		else {
			categories['Special'].push(abilityName);
		}
	});

	// Remove empty categories
	Object.keys(categories).forEach((category) => {
		if (categories[category].length === 0) {
			delete categories[category];
		}
	});

	return categories;
}

// SIMPLIFIED: Basic ability descriptions only
export function getAbilityDescription(
	abilityName: string,
	abilityData: { value: number; sources: string[] }
): string {
	const descriptions: Record<string, string> = {
		// Basic Physical
		carryCapacity: 'Maximum weight that can be carried (kg)',
		movementSpeed: 'Movement points per turn',
		swimmingSpeed: 'Movement speed in water',
		visionRange: 'Maximum sight distance (meters)',

		// Basic Mental
		learningSpeed: 'Multiplier for skill development',
		socialInfluence: 'Effectiveness in diplomacy and trade',
		intuition: 'Ability to detect danger and opportunities',
		knowledgeStorage: 'Capacity to store information',
		experienceGain: 'Rate of learning from practical activities',

		// Basic Survival
		healthRegenRate: 'Health points recovered per turn',
		diseaseResistance: 'Resistance to illness and poison',
		vitality: 'Overall health and constitution',

		// Skills
		skill_mining: 'Experience in mineral extraction',
		skill_woodcutting: 'Experience in wood harvesting',
		skill_crafting: 'Experience in item creation',
		skill_hunting: 'Experience in hunting animals',
		skill_fishing: 'Experience in catching fish',
		skill_foraging: 'Experience in gathering resources',
		skill_research: 'Experience in knowledge discovery',
		skill_construction: 'Experience in building structures'
	};

	// Handle generic skill descriptions
	if (abilityName.startsWith('skill_')) {
		const skillName = abilityName.replace('skill_', '');
		return descriptions[abilityName] || `Experience in ${skillName}`;
	}

	return descriptions[abilityName] || 'Special ability with unique effects';
}

// --- Existing utility functions (unchanged) ---

function rollStatsFromRanges(statRanges: Record<string, [number, number]>): RaceStats {
	const stats: any = {};

	Object.entries(statRanges).forEach(([statName, [min, max]]) => {
		stats[statName] = min + Math.floor(Math.random() * (max - min + 1));
	});

	return stats as RaceStats;
}

function applyRacialTraitBonuses(baseStats: RaceStats, traits: RacialTrait[]): RaceStats {
	const modifiedStats = { ...baseStats };

	traits.forEach((trait) => {
		Object.entries(trait.effects).forEach(([effectName, effectValue]) => {
			if (effectName.endsWith('Bonus') && typeof effectValue === 'number') {
				const statName = effectName.replace('Bonus', '').toLowerCase() as keyof RaceStats;
				if (modifiedStats[statName] !== undefined) {
					modifiedStats[statName] += effectValue;
				}
			} else if (effectName.endsWith('Penalty') && typeof effectValue === 'number') {
				const statName = effectName.replace('Penalty', '').toLowerCase() as keyof RaceStats;
				if (modifiedStats[statName] !== undefined) {
					modifiedStats[statName] = Math.max(1, modifiedStats[statName] + effectValue);
				}
			}
		});
	});

	return modifiedStats;
}

function rollPhysicalTraits(racePhysicalTraits: any): any {
	const { heightRange, weightRange, size } = racePhysicalTraits;

	return {
		height: heightRange[0] + Math.floor(Math.random() * (heightRange[1] - heightRange[0] + 1)),
		weight: weightRange[0] + Math.floor(Math.random() * (weightRange[1] - weightRange[0] + 1)),
		size: size
	};
}

function generatePawnName(): string {
	const names = [
		'Aria', 'Brom', 'Celia', 'Dain', 'Enna', 'Finn', 'Greta', 'Hale',
		'Ivy', 'Jax', 'Kira', 'Lark', 'Mira', 'Nix', 'Opal', 'Pike',
		'Quinn', 'Ren', 'Sage', 'Thea', 'Uma', 'Vale', 'Wren', 'Xara', 'Yuki', 'Zara'
	];
	return names[Math.floor(Math.random() * names.length)];
}

// --- Needs and State Management (unchanged) ---

export function updatePawnNeeds(pawn: Pawn, currentTurn: number): Pawn {
	const updatedPawn = { ...pawn };

	// Increase needs each turn
	updatedPawn.needs = {
		...pawn.needs,
		hunger: Math.min(100, pawn.needs.hunger + getHungerIncreasePerTurn(pawn)),
		fatigue: Math.min(100, pawn.needs.fatigue + getFatigueIncreasePerTurn(pawn)),
		sleep: Math.min(100, pawn.needs.sleep + getSleepIncreasePerTurn(pawn))
	};

	// Update state based on current activity
	updatedPawn.state = updatePawnStatePerTurn(updatedPawn.state, updatedPawn.needs, currentTurn);

	return updatedPawn;
}

function getHungerIncreasePerTurn(pawn: Pawn): number {
	let baseHunger = 2; // Base hunger increase per turn

	// Apply racial trait modifiers
	pawn.racialTraits.forEach((trait) => {
		if (trait.effects.hungerRate) {
			baseHunger *= trait.effects.hungerRate;
		}
	});

	// Constitution affects hunger rate
	const constitutionModifier = (pawn.stats.constitution - 10) * 0.1;
	baseHunger *= 1 - constitutionModifier;

	return Math.max(0.5, baseHunger);
}

function getFatigueIncreasePerTurn(pawn: Pawn): number {
	let baseFatigue = 1.5; // Base fatigue increase per turn

	// Working increases fatigue more
	if (pawn.state.isWorking) {
		baseFatigue *= 2;
	}

	// Racial trait modifiers
	pawn.racialTraits.forEach((trait) => {
		if (trait.effects.fatigueRate) {
			baseFatigue *= trait.effects.fatigueRate;
		}
	});

	return Math.max(0.5, baseFatigue);
}

function getSleepIncreasePerTurn(pawn: Pawn): number {
	let baseSleep = 1; // Base sleep need increase per turn

	// Nocturnal pawns have different sleep patterns
	pawn.racialTraits.forEach((trait) => {
		if (trait.name === 'Nocturnal') {
			// Adjust based on time of day (would need game time tracking)
			baseSleep *= 0.8; // Less sleep need overall
		}
	});

	return baseSleep;
}

function updatePawnStatePerTurn(
	state: PawnState,
	needs: PawnNeeds,
	currentTurn: number
): PawnState {
	const newState = { ...state };

	// Critical needs override everything
	if (needs.hunger > 90) {
		newState.isWorking = false;
		newState.isSleeping = false;
		newState.isEating = true;
		newState.mood = Math.max(0, newState.mood - 5);
	} else if (needs.sleep > 95) {
		newState.isWorking = false;
		newState.isEating = false;
		newState.isSleeping = true;
		newState.mood = Math.max(0, newState.mood - 3);
	}

	// Process current activities
	if (newState.isEating) {
		newState.mood += 2;
	} else if (newState.isSleeping) {
		newState.mood += 1;
	} else if (newState.isWorking && needs.fatigue < 80) {
		newState.mood += 1;
	}

	// Health regeneration
	if (newState.health < 100) {
		newState.health = Math.min(100, newState.health + getHealthRegenPerTurn(needs));
	}

	return newState;
}

function getHealthRegenPerTurn(needs: PawnNeeds): number {
	let regen = 0.5; // Base health regen per turn

	// Well-fed and rested pawns regenerate faster
	if (needs.hunger < 30 && needs.fatigue < 30) {
		regen *= 2;
	}

	return regen;
}

export function processPawnTurn(state: GameState): GameState {
	const updatedPawns = state.pawns.map((pawn) => updatePawnNeeds(pawn, state.turn));

	return {
		...state,
		pawns: updatedPawns
	};
}