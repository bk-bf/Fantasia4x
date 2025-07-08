import type {GameState, Pawn, PawnNeeds ,PawnState, Race, RaceStats, RacialTrait } from './types';
import { createPawnInventory, createPawnEquipment, getEquipmentBonuses } from './PawnEquipment';


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


export function calculatePawnAbilities(pawn: Pawn): Record<string, { value: number, sources: string[] }> {
	const abilities: Record<string, { value: number, sources: string[] }> = {};

	// Collect base stats and bonuses
	const baseStats = getBaseStats(pawn);
	const traitBonuses = getTraitBonuses(pawn);
	const equipmentBonuses = getEquipmentBonusesMap(pawn);

	// Add trait and equipment non-stat bonuses
	addTraitAbilities(abilities, pawn);
	addEquipmentAbilities(abilities, pawn);

	// Add skills
	addSkillAbilities(abilities, pawn);

	// Calculate total stats
	const totalStats = getTotalStats(baseStats, traitBonuses, equipmentBonuses);

	// Derived abilities
	addCombatAbilities(abilities, totalStats, traitBonuses, equipmentBonuses);
	addWorkEfficiencies(abilities, pawn, totalStats, traitBonuses, equipmentBonuses);
	addSurvivalAbilities(abilities, totalStats);
	addPhysicalAbilities(abilities, totalStats);
	addMentalAbilities(abilities, totalStats);

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

function getTraitBonuses(pawn: Pawn) {
	let bonuses = {
		strength: 0, dexterity: 0, intelligence: 0, wisdom: 0, charisma: 0, constitution: 0, combatPower: 0
	};
	pawn.racialTraits.forEach(trait => {
		Object.entries(trait.effects || {}).forEach(([effectName, effectValue]) => {
			if (typeof effectValue === 'number') {
				if (effectName === 'strengthBonus') bonuses.strength += effectValue;
				else if (effectName === 'dexterityBonus') bonuses.dexterity += effectValue;
				else if (effectName === 'intelligenceBonus') bonuses.intelligence += effectValue;
				else if (effectName === 'wisdomBonus') bonuses.wisdom += effectValue;
				else if (effectName === 'charismaBonus') bonuses.charisma += effectValue;
				else if (effectName === 'constitutionBonus') bonuses.constitution += effectValue;
				else if (effectName === 'combatPower') bonuses.combatPower += effectValue;
			}
		});
	});
	return bonuses;
}

function getEquipmentBonusesMap(pawn: Pawn) {
	const bonuses = getEquipmentBonuses(pawn);
	return {
		strength: bonuses.strengthBonus || 0,
		dexterity: bonuses.dexterityBonus || 0,
		combatPower: bonuses.combatPower || 0
	};
}

function addTraitAbilities(
	abilities: Record<string, { value: number, sources: string[] }>,
	pawn: Pawn
) {
	pawn.racialTraits.forEach(trait => {
		Object.entries(trait.effects || {}).forEach(([effectName, effectValue]) => {
			if (typeof effectValue === 'number') {
				if (!effectName.endsWith('Bonus') && effectName !== 'combatPower') {
					addAbility(abilities, effectName, effectValue, `Trait: ${trait.name}`);
				}
			} else if (typeof effectValue === 'object' && effectValue !== null) {
				Object.entries(effectValue).forEach(([subEffect, subValue]) => {
					if (typeof subValue === 'number') {
						addAbility(abilities, `${effectName}_${subEffect}`, subValue, `Trait: ${trait.name}`);
					}
				});
			}
		});
	});
}

function addEquipmentAbilities(
	abilities: Record<string, { value: number, sources: string[] }>,
	pawn: Pawn
) {
	const equipmentBonuses = getEquipmentBonuses(pawn);
	Object.entries(equipmentBonuses).forEach(([bonusName, bonusValue]) => {
		if (
			bonusName !== 'strengthBonus' &&
			bonusName !== 'dexterityBonus' &&
			bonusName !== 'combatPower'
		) {
			const equipmentSource = Object.entries(pawn.equipment)
				.filter(([slot, equipped]) => equipped?.bonuses?.[bonusName])
				.map(([slot, equipped]) => `${slot}: ${equipped?.itemId}`)
				.join(', ');
			addAbility(abilities, bonusName, bonusValue, `Equipment: ${equipmentSource}`);
		}
	});
}

function addSkillAbilities(
	abilities: Record<string, { value: number, sources: string[] }>,
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
		strength: base.strength + trait.strength + (equip.strength || 0),
		dexterity: base.dexterity + trait.dexterity + (equip.dexterity || 0),
		intelligence: base.intelligence + trait.intelligence,
		wisdom: base.wisdom + trait.wisdom,
		charisma: base.charisma + trait.charisma,
		constitution: base.constitution + trait.constitution
	};
}


function addWorkEfficiencies(
	abilities: Record<string, { value: number, sources: string[] }>,
	pawn: Pawn,
	totalStats: { [k: string]: number },
	traitBonuses: { [k: string]: number },
	equipmentBonuses: { [k: string]: number }
) {
	const workTypes = [
		'mining',
		'woodcutting',
		'crafting',
		'hunting',
		'fishing',
		'foraging',
		'research',
		'construction'
	];
	workTypes.forEach(workType => {
		let efficiency = 1.0;
		let calculation = 'Base (1.0)';
		const relevantStat = getRelevantStatForWork(workType);
		const statValue = totalStats[relevantStat] || 0;
		const statModifier = (statValue - 10) * 0.05;
		efficiency += statModifier;
		calculation += ` + ${relevantStat} modifier (${statValue - 10} × 0.05)`;

		// Trait bonuses
		const traitBonus =
			abilities[`workEfficiency_${workType}`]?.value ||
			abilities[`workEfficiency_all`]?.value;
		if (traitBonus) {
			efficiency *= traitBonus;
			calculation += ` × trait bonus (${traitBonus})`;
		}

		// Tool/equipment bonuses
		const toolBonus =
			abilities[`${workType}Bonus`]?.value || abilities.toolEfficiency?.value;
		if (toolBonus) {
			efficiency *= 1 + toolBonus;
			calculation += ` × tool bonus (1 + ${toolBonus})`;
		}

		addAbility(
			abilities,
			`${workType}Efficiency`,
			Math.round(efficiency * 100) / 100,
			calculation
		);
	});
}

// Revert addSurvivalAbilities to show ALL abilities with base values:
function addSurvivalAbilities(
    abilities: Record<string, { value: number, sources: string[] }>,
    totalStats: { [k: string]: number }
) {
    // Basic survival abilities
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

    // ALL resistance abilities (base values - traits/equipment will add to these)
    addAbility(abilities, 'fireResistance', 0, 'Base resistance (0%)');
    addAbility(abilities, 'coldResistance', 0, 'Base resistance (0%)');
    addAbility(abilities, 'poisonResistance', 0, 'Base resistance (0%)');
    addAbility(abilities, 'magicResistance', 0, 'Base resistance (0%)');
    addAbility(abilities, 'mentalResistance', 0, 'Base resistance (0%)');
    addAbility(abilities, 'crushResistance', 0, 'Base resistance (0%)');
    addAbility(abilities, 'slashResistance', 0, 'Base resistance (0%)');
    
    // Rate modifiers (base values)
    addAbility(abilities, 'hungerRate', 1.0, 'Base hunger rate (100%)');
    addAbility(abilities, 'fatigueRate', 1.0, 'Base fatigue rate (100%)');
    addAbility(abilities, 'healingRate', 1.0, 'Base healing rate (100%)');
    
    // Damage reduction abilities
    addAbility(abilities, 'fallDamageReduction', 0, 'Base fall protection (0%)');
    addAbility(abilities, 'damageReduction', 0, 'Base damage reduction (0%)');
    
    // Special survival abilities (base values)
    addAbility(abilities, 'sleepEfficiency', 1.0, 'Base sleep quality (100%)');
    addAbility(abilities, 'weatherProtection', 0, 'Base weather protection (0%)');
    addAbility(abilities, 'nutritionValue', 1.0, 'Base nutrition absorption (100%)');
    addAbility(abilities, 'vitality', totalStats.constitution, `Constitution score (${totalStats.constitution})`);
    
    // Environmental abilities
    addAbility(abilities, 'coldImmunity', 0, 'Base cold immunity (0%)');
    addAbility(abilities, 'heatSensitivity', 0, 'Base heat sensitivity (0%)');
    addAbility(abilities, 'waterBreathing', 0, 'Base water breathing (0%)');
    addAbility(abilities, 'sunlightDependency', 0, 'Base sunlight dependency (0%)');
}

function addPhysicalAbilities(
    abilities: Record<string, { value: number, sources: string[] }>,
    totalStats: { [k: string]: number }
) {
    // Core physical abilities
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

    // ALL physical abilities (show base values)
    const baseSwimmingSpeed = movementSpeed * 0.5;
    addAbility(abilities, 'swimmingSpeed', baseSwimmingSpeed, `50% of movement speed (${movementSpeed.toFixed(2)} × 0.5)`);
    addAbility(abilities, 'nightVision', 0, 'Base night vision (0 meters)');
    addAbility(abilities, 'dangerSense', 0, 'Base danger detection (0%)');
    addAbility(abilities, 'tremorsense', 0, 'Base tremor detection (0 meters)');
    addAbility(abilities, 'magicDetection', 0, 'Base magic detection (0 meters)');
    addAbility(abilities, 'reach', 1.0, 'Base reach (1 meter)');
    addAbility(abilities, 'mobility', 1.0, 'Base mobility factor (100%)');
    addAbility(abilities, 'vision', 10, 'Base vision range (10 meters)');
    addAbility(abilities, 'size', 1.0, 'Base size modifier (100%)');
    addAbility(abilities, 'elasticity', 0, 'Base elasticity (0%)');
    addAbility(abilities, 'flexibility', 0, 'Base flexibility (0%)');
    addAbility(abilities, 'tensileStrength', 0, 'Base tensile strength (0)');
    addAbility(abilities, 'durability', 0, 'Base durability (0%)');
    addAbility(abilities, 'workability', 1.0, 'Base workability (100%)');
    addAbility(abilities, 'hardness', 0, 'Base hardness (0)');
    addAbility(abilities, 'toughness', 0, 'Base toughness (0)');
    addAbility(abilities, 'lightWeight', 0, 'Base weight reduction (0%)');
    addAbility(abilities, 'concealable', 0, 'Base concealment (0%)');
}

function addMentalAbilities(
    abilities: Record<string, { value: number, sources: string[] }>,
    totalStats: { [k: string]: number }
) {
    // Core mental abilities
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

    const researchSpeed = 1.0 + (totalStats.intelligence - 10) * 0.03;
    addAbility(
        abilities,
        'researchSpeed',
        researchSpeed,
        `Base (1.0) + Intelligence modifier (${totalStats.intelligence - 10} × 0.03)`
    );

    const knowledgeStorage = totalStats.intelligence * 10;
    addAbility(
        abilities,
        'knowledgeStorage',
        knowledgeStorage,
        `Intelligence × 10 (${totalStats.intelligence} × 10)`
    );

    const memoryBonus = (totalStats.intelligence - 10) * 0.05;
    addAbility(
        abilities,
        'memoryBonus',
        memoryBonus,
        `Intelligence modifier (${totalStats.intelligence - 10} × 0.05)`
    );

    const experienceGain = 1.0 + (totalStats.wisdom - 10) * 0.02;
    addAbility(
        abilities,
        'experienceGain',
        experienceGain,
        `Base (1.0) + Wisdom modifier (${totalStats.wisdom - 10} × 0.02)`
    );

    const adaptability = 1.0 + ((totalStats.intelligence + totalStats.wisdom) - 20) * 0.02;
    addAbility(
        abilities,
        'adaptability',
        adaptability,
        `Base (1.0) + Int+Wis modifier (${(totalStats.intelligence + totalStats.wisdom) - 20} × 0.02)`
    );

    // ALL research and knowledge abilities (show base values)
    addAbility(abilities, 'basicResearch', 1.0, 'Base research effectiveness (100%)');
    addAbility(abilities, 'advancedResearch', 0.5, 'Base advanced research (50%)');
    addAbility(abilities, 'experimentalResearch', 0.25, 'Base experimental research (25%)');
    addAbility(abilities, 'scientificMethod', 1.0, 'Base scientific approach (100%)');
    addAbility(abilities, 'knowledgePreservation', 1.0, 'Base knowledge retention (100%)');
    addAbility(abilities, 'writingQuality', 1.0, 'Base writing clarity (100%)');
    addAbility(abilities, 'telepathicRange', 0, 'Base telepathic range (0 meters)');
    addAbility(abilities, 'groupBonus', 0, 'Base group effectiveness bonus (0%)');
    addAbility(abilities, 'isolationPenalty', 0, 'Base isolation penalty (0%)');
    addAbility(abilities, 'groupPenalty', 0, 'Base large group penalty (0%)');
}

function addCombatAbilities(
    abilities: Record<string, { value: number, sources: string[] }>,
    totalStats: { [k: string]: number },
    traitBonuses: { [k: string]: number },
    equipmentBonuses: { [k: string]: number }
) {
    // Your existing combat abilities...
    
    // ALL combat special abilities (show base values)
    addAbility(abilities, 'intimidation', 0, 'Base intimidation (0%)');
    addAbility(abilities, 'combatRage', 0, 'Base combat rage bonus (0%)');
    addAbility(abilities, 'bowBonus', 0, 'Base bow effectiveness (0%)');
    addAbility(abilities, 'armorPiercing', 0, 'Base armor piercing (0%)');
    addAbility(abilities, 'throwingBonus', 0, 'Base throwing bonus (0%)');
    addAbility(abilities, 'stunChance', 0, 'Base stun chance (0%)');
    addAbility(abilities, 'armorCrushing', 0, 'Base armor crushing (0%)');
    addAbility(abilities, 'versatility', 1.0, 'Base combat versatility (100%)');
}

function addAbility(
	abilities: Record<string, { value: number, sources: string[] }>,
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

// --- Existing helpers ---

export function categorizeAbilities(abilities: Record<string, { value: number, sources: string[] }>): Record<string, string[]> {
  const categories: Record<string, string[]> = {
    'Combat': [],
    'Work Skills': [],
    'Survival': [],
    'Physical': [],
    'Mental': [],
    'Special': []
  };
  
  Object.keys(abilities).forEach(abilityName => {
    const lowerName = abilityName.toLowerCase();
    
    // Combat abilities
    if (
      lowerName.includes('attack') || 
      lowerName.includes('armor') || 
      lowerName.includes('hitpoints') || 
      lowerName.includes('combat') ||
      (lowerName.includes('damage') && (lowerName.includes('attack') || lowerName.includes('combat')))
    ) {
      categories['Combat'].push(abilityName);
    }
    // Work Skills
    else if (
      lowerName.includes('efficiency') || 
      lowerName.includes('mining') || 
      lowerName.includes('woodcutting') || 
      lowerName.includes('crafting') || 
      lowerName.includes('hunting') || 
      lowerName.includes('fishing') || 
      lowerName.includes('foraging') || 
      lowerName.includes('construction') ||
      lowerName.startsWith('skill_') ||
      (lowerName.includes('bonus') && (
        lowerName.includes('mining') || 
        lowerName.includes('craft') || 
        lowerName.includes('work') ||
        lowerName.includes('tool') ||
        lowerName.includes('production')
      ))
    ) {
      categories['Work Skills'].push(abilityName);
    }
    // Survival abilities - MUCH more comprehensive
    else if (
      // Resistances and immunities
      lowerName.includes('resistance') ||
      lowerName.includes('immunity') ||
      lowerName.includes('fire') && (lowerName.includes('resist') || lowerName.includes('immun')) ||
      lowerName.includes('cold') && (lowerName.includes('resist') || lowerName.includes('immun') || lowerName.includes('sensitivity')) ||
      lowerName.includes('poison') && lowerName.includes('resist') ||
      lowerName.includes('magic') && lowerName.includes('resist') ||
      lowerName.includes('mental') && lowerName.includes('resist') ||
      lowerName.includes('crush') && lowerName.includes('resist') ||
      lowerName.includes('slash') && lowerName.includes('resist') ||
      // Health and healing
      lowerName.includes('health') && !lowerName.includes('bonus') ||
      lowerName.includes('healing') ||
      lowerName.includes('regenerat') ||
      lowerName.includes('vitality') ||
      lowerName.includes('regen') ||
      // Damage protection
      lowerName.includes('damagereduction') ||
      lowerName.includes('falldamage') ||
      lowerName.includes('protection') ||
      // Environmental and needs
      lowerName.includes('hungerrate') ||
      lowerName.includes('fatiguerate') ||
      lowerName.includes('sleepefficiency') ||
      lowerName.includes('weather') ||
      lowerName.includes('temperature') ||
      lowerName.includes('heat') && lowerName.includes('sensitivity') ||
      lowerName.includes('sunlight') ||
      lowerName.includes('dependency') ||
      // Breathing and special survival
      lowerName.includes('breathing') ||
      lowerName.includes('waterbreathing') ||
      lowerName.includes('daytime') && lowerName.includes('penalty') ||
      // Food and nutrition
      lowerName.includes('nutrition') ||
      lowerName.includes('food') ||
      lowerName.includes('spoilage') ||
      lowerName.includes('preservation') ||
      lowerName.includes('storage') && lowerName.includes('stability') ||
      lowerName.includes('protein') ||
      lowerName.includes('carbohydrate') ||
      lowerName.includes('energy') && lowerName.includes('boost') ||
      lowerName.includes('moral') && lowerName.includes('bonus') ||
      // Disease and general survival
      lowerName.includes('disease')
    ) {
      categories['Survival'].push(abilityName);
    }
    // Physical abilities
    else if (
      // Movement and mobility
      lowerName.includes('movement') || 
      lowerName.includes('speed') && !lowerName.includes('attack') && !lowerName.includes('research') && !lowerName.includes('learning') ||
      lowerName.includes('swimming') ||
      lowerName.includes('mobility') ||
      // Carrying and physical capacity
      lowerName.includes('carry') || 
      lowerName.includes('capacity') ||
      lowerName.includes('weight') && !lowerName.includes('light') ||
      lowerName.includes('lightweight') ||
      // Senses and detection
      lowerName.includes('vision') ||
      lowerName.includes('sense') ||
      lowerName.includes('detection') ||
      lowerName.includes('tremor') ||
      lowerName.includes('night') && lowerName.includes('vision') ||
      lowerName.includes('danger') && lowerName.includes('sense') ||
      // Physical properties
      lowerName.includes('size') ||
      lowerName.includes('reach') ||
      lowerName.includes('elasticity') ||
      lowerName.includes('flexibility') ||
      lowerName.includes('tensile') ||
      lowerName.includes('durability') && !lowerName.includes('equipment') ||
      lowerName.includes('hardness') ||
      lowerName.includes('toughness') ||
      lowerName.includes('workability') ||
      lowerName.includes('concealable')
    ) {
      categories['Physical'].push(abilityName);
    }
    // Mental abilities
    else if (
      // Learning and intelligence
      lowerName.includes('learning') || 
      lowerName.includes('intelligence') && lowerName.includes('bonus') ||
      lowerName.includes('knowledge') ||
      lowerName.includes('research') && !lowerName.includes('efficiency') ||
      lowerName.includes('memory') ||
      lowerName.includes('experience') && lowerName.includes('gain') ||
      lowerName.includes('basic') && lowerName.includes('research') ||
      lowerName.includes('advanced') && lowerName.includes('research') ||
      lowerName.includes('experimental') && lowerName.includes('research') ||
      lowerName.includes('scientific') ||
      lowerName.includes('writing') && lowerName.includes('quality') ||
      // Social abilities
      lowerName.includes('social') || 
      lowerName.includes('charisma') && lowerName.includes('bonus') ||
      lowerName.includes('influence') ||
      lowerName.includes('group') && (lowerName.includes('bonus') || lowerName.includes('penalty')) ||
      lowerName.includes('isolation') && lowerName.includes('penalty') ||
      // Wisdom and perception
      lowerName.includes('intuition') ||
      lowerName.includes('wisdom') && lowerName.includes('bonus') ||
      lowerName.includes('telepathic') ||
      lowerName.includes('adaptability')
    ) {
      categories['Mental'].push(abilityName);
    }
    // Everything else goes to Special
    else {
      categories['Special'].push(abilityName);
    }
  });
  
  // Remove empty categories
  Object.keys(categories).forEach(category => {
    if (categories[category].length === 0) {
      delete categories[category];
    }
  });
  
  return categories;
}

function getRelevantStatForWork(workType: string): string {
	const statMap: Record<string, string> = {
		'mining': 'strength',
		'woodcutting': 'strength',
		'construction': 'strength',
		'hunting': 'dexterity',
		'fishing': 'dexterity',
		'foraging': 'wisdom',
		'crafting': 'dexterity',
		'research': 'intelligence',
		'metalworking': 'strength',
		'leatherworking': 'dexterity'
	};
	return statMap[workType] || 'strength';
}
// Update getAbilityDescription function to include missing descriptions
export function getAbilityDescription(abilityName: string, abilityData: { value: number, sources: string[] }): string {
  const descriptions: Record<string, string> = {
    // Combat (existing)
    'attackDamage': 'Physical damage dealt in combat',
    'attackSpeed': 'How quickly attacks are made (attacks per turn)',
    'attackRange': 'Maximum distance for melee attacks',
    'armorClass': 'Difficulty for enemies to hit you',
    'hitPoints': 'Total health/damage you can take',
    
    // Work efficiencies (existing)
    'miningEfficiency': 'Speed and yield when extracting minerals',
    'woodcuttingEfficiency': 'Speed and yield when harvesting wood',
    'craftingEfficiency': 'Speed and quality when making items',
    'huntingEfficiency': 'Success rate and yield when hunting',
    'fishingEfficiency': 'Success rate and yield when fishing',
    'foragingEfficiency': 'Speed and yield when gathering resources',
    'researchEfficiency': 'Speed of learning new technologies',
    'constructionEfficiency': 'Speed and quality when building',
    
    // Survival (existing + missing)
    'healthRegenRate': 'Health points recovered per turn',
    'diseaseResistance': 'Resistance to illness and poison',
    'fireResistance': 'Resistance to fire damage',
    'coldResistance': 'Resistance to cold damage',
    'poisonResistance': 'Resistance to toxins',
    // MISSING descriptions from Race.ts:
    'coldImmunity': 'Complete immunity to cold effects',
    'heatSensitivity': 'Increased vulnerability to heat damage',
    'magicResistance': 'Resistance to magical effects',
    'mentalResistance': 'Resistance to mental manipulation',
    'crushResistance': 'Resistance to crushing damage',
    'fallDamageReduction': 'Reduced damage from falling',
    'damageReduction': 'General damage reduction from all sources',
    'hungerRate': 'Rate at which hunger increases',
    'fatigueRate': 'Rate at which fatigue accumulates',
    'healingRate': 'Natural healing speed multiplier',
    'regenerative': 'Enhanced natural healing factor',
    'waterBreathing': 'Ability to breathe underwater',
    'sunlightDependency': 'Requires sunlight for optimal health',
    'sleepEfficiency': 'Quality of rest from sleep',
    
    // Physical (existing + missing)
    'carryCapacity': 'Maximum weight that can be carried (kg)',
    'movementSpeed': 'Movement points per turn',
    'nightVision': 'Ability to see in darkness',
    // MISSING descriptions:
    'swimmingSpeed': 'Movement speed in water',
    'dangerSense': 'Ability to detect approaching threats',
    'tremorsense': 'Ability to detect movement through ground vibrations',
    'magicDetection': 'Ability to perceive magical auras',
    'elasticity': 'Material flexibility and spring-back ability',
    'flexibility': 'Physical bendability without breaking',
    'tensileStrength': 'Resistance to being pulled apart',
    'durability': 'Resistance to wear and damage over time',
    'workability': 'Ease of shaping and crafting',
    'hardness': 'Resistance to scratching and denting',
    'lightWeight': 'Reduced weight for easier handling',
    'concealable': 'Ability to hide or disguise',
    'mobility': 'Enhanced movement and agility',
    
    // Mental (existing + missing)
    'learningSpeed': 'Multiplier for skill development',
    'socialInfluence': 'Effectiveness in diplomacy and trade',
    'intuition': 'Ability to detect danger and opportunities',
    // MISSING descriptions:
    'knowledgeStorage': 'Capacity to store information',
    'basicResearch': 'Effectiveness at fundamental research',
    'advancedResearch': 'Effectiveness at complex research',
    'experimentalResearch': 'Ability to conduct experiments',
    'scientificMethod': 'Systematic approach to discovery',
    'knowledgePreservation': 'Ability to maintain information over time',
    'writingQuality': 'Clarity and durability of written works',
    'researchSpeed': 'Rate of knowledge acquisition',
    'experienceGain': 'Rate of learning from practical activities',
    'memoryBonus': 'Enhanced ability to recall information',
    'adaptability': 'Ability to adjust to new situations',
    'telepathicRange': 'Distance of mind reading (meters)',
    'groupBonus': 'Enhanced effectiveness when working with others',
    'isolationPenalty': 'Reduced effectiveness when alone',
    'groupPenalty': 'Reduced effectiveness in large groups',
    
    // Special traits (missing descriptions)
    'intimidation': 'Ability to frighten enemies',
    'workEfficiency': 'General work effectiveness multiplier',
    'combatRage': 'Enhanced combat ability when enraged',
    'productionBonus': 'Increased output from all activities',
    'errorReduction': 'Reduced chance of mistakes in tasks',
    'tradeValue': 'Enhanced value when trading',
    'prestigeBonus': 'Social status enhancement',
    'beauty': 'Aesthetic appeal and artistic value',
    'fineCrafting': 'Enhanced ability for detailed work',
    'bowBonus': 'Special effectiveness with bow weapons',
    'armorPiercing': 'Ability to penetrate armor',
    'throwingBonus': 'Enhanced accuracy and damage when throwing',
    'stunChance': 'Probability of stunning enemies',
    'armorCrushing': 'Ability to damage enemy armor',
    'versatility': 'Effectiveness across multiple combat situations',
    'slashResistance': 'Resistance to cutting attacks',
    'resinContent': 'Natural resin for waterproofing',
    'tanninContent': 'Natural tannins for leather processing',
    'smeltYield': 'Percentage of pure metal from ore',
    'bronzeAlloy': 'Suitability for bronze creation',
    'carbonSteel': 'Suitability for steel creation',
    'plasticity': 'Clay moldability',
    'furnaceBonus': 'Enhanced furnace efficiency',
    'purity': 'Metal purity level',
    'alloyBonus': 'Enhancement when creating alloys',
    'toughness': 'Resistance to fracturing',
    'corrosionResistance': 'Resistance to rust and decay',
    'sharpness': 'Cutting edge effectiveness',
    'fragility': 'Tendency to break under stress',
    'toolQuality': 'Overall tool effectiveness',
    'waterResistance': 'Resistance to water damage',
    'heatValue': 'Energy content when burned',
    'smeltingBonus': 'Enhanced metal smelting',
    'conductivity': 'Electrical and thermal conduction',
    'flavorEnhancement': 'Improvement to food taste',
    'morale': 'Effect on population happiness'
  };
  
  return descriptions[abilityName] || 'Special ability with unique effects';
}
  
// Helper function to get all equipped items
function getAllEquippedItems(pawns: Pawn[]): Set<string> {
  const equippedItems = new Set<string>();
  
  pawns.forEach(pawn => {
    Object.values(pawn.equipment).forEach(equipped => {
      if (equipped) {
        equippedItems.add(equipped.itemId);
      }
    });
  });
  
  return equippedItems;
}
function rollStatsFromRanges(statRanges: Record<string, [number, number]>): RaceStats {
  const stats: any = {};
  
  Object.entries(statRanges).forEach(([statName, [min, max]]) => {
    stats[statName] = min + Math.floor(Math.random() * (max - min + 1));
  });
  
  return stats as RaceStats;
}

function applyRacialTraitBonuses(baseStats: RaceStats, traits: RacialTrait[]): RaceStats {
  const modifiedStats = { ...baseStats };
  
  traits.forEach(trait => {
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

function rollPawnStats(race: Race): RaceStats {
  const stats: RaceStats = {
    strength: rollStatInRange(race.statRanges.strength),
    dexterity: rollStatInRange(race.statRanges.dexterity),
    intelligence: rollStatInRange(race.statRanges.intelligence),
    wisdom: rollStatInRange(race.statRanges.wisdom),
    charisma: rollStatInRange(race.statRanges.charisma),
    constitution: rollStatInRange(race.statRanges.constitution)
  };
  
  // Apply racial trait bonuses
  race.racialTraits.forEach(trait => {
    if (trait.effects.strengthBonus) stats.strength += trait.effects.strengthBonus;
    if (trait.effects.dexterityBonus) stats.dexterity += trait.effects.dexterityBonus;
    if (trait.effects.intelligenceBonus) stats.intelligence += trait.effects.intelligenceBonus;
    if (trait.effects.wisdomBonus) stats.wisdom += trait.effects.wisdomBonus;
    if (trait.effects.charismaBonus) stats.charisma += trait.effects.charismaBonus;
    if (trait.effects.constitutionBonus) stats.constitution += trait.effects.constitutionBonus;
    if (trait.effects.constitutionPenalty) stats.constitution += trait.effects.constitutionPenalty;
  });
  
  return stats;
}

function rollStatInRange(range: [number, number]): number {
  return Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
}

function rollPawnPhysicalTraits(race: Race): {
  height: number,
  weight: number,
  size: string
} {
  return {
    height: rollStatInRange(race.physicalTraits.heightRange),
    weight: rollStatInRange(race.physicalTraits.weightRange),
    size: race.physicalTraits.size
  };
}

function initializePawnNeeds(stats: RaceStats, race: Race): PawnNeeds {
  // Constitution affects starting hunger/fatigue rates
  const constitutionModifier = (stats.constitution - 10) * 0.05; // ±5% per point
  
  // Racial traits can modify base rates
  let hungerRate = 1.0;
  let fatigueRate = 1.0;
  
  race.racialTraits.forEach(trait => {
    if (trait.effects.hungerRate) hungerRate *= trait.effects.hungerRate;
    if (trait.effects.fatigueRate) fatigueRate *= trait.effects.fatigueRate;
  });
  
  return {
    hunger: Math.floor(Math.random() * 20), // Start with 0-20 hunger
    fatigue: Math.floor(Math.random() * 20), // Start with 0-20 fatigue
    sleep: Math.floor(Math.random() * 20),   // Start with 0-20 sleep need
    lastSleep: 0,
    lastMeal: 0
  };
}

function initializePawnState(): PawnState {
  return {
    mood: 75 + Math.floor(Math.random() * 25), // Start with 75-100 mood
    health: 90 + Math.floor(Math.random() * 10), // Start with 90-100 health
    isWorking: false,
    isSleeping: false,
    isEating: false
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
  pawn.racialTraits.forEach(trait => {
    if (trait.effects.hungerRate) {
      baseHunger *= trait.effects.hungerRate;
    }
  });
  
  // Constitution affects hunger rate
  const constitutionModifier = (pawn.stats.constitution - 10) * 0.1;
  baseHunger *= (1 - constitutionModifier);
  
  return Math.max(0.5, baseHunger);
}

function getFatigueIncreasePerTurn(pawn: Pawn): number {
  let baseFatigue = 1.5; // Base fatigue increase per turn
  
  // Working increases fatigue more
  if (pawn.state.isWorking) {
    baseFatigue *= 2;
  }
  
  // Racial trait modifiers
  pawn.racialTraits.forEach(trait => {
    if (trait.effects.fatigueRate) {
      baseFatigue *= trait.effects.fatigueRate;
    }
  });
  
  return Math.max(0.5, baseFatigue);
}

function getSleepIncreasePerTurn(pawn: Pawn): number {
  let baseSleep = 1; // Base sleep need increase per turn
  
  // Nocturnal pawns have different sleep patterns
  pawn.racialTraits.forEach(trait => {
    if (trait.name === 'Nocturnal') {
      // Adjust based on time of day (would need game time tracking)
      baseSleep *= 0.8; // Less sleep need overall
    }
  });
  
  return baseSleep;
}

function updatePawnStatePerTurn(state: PawnState, needs: PawnNeeds, currentTurn: number): PawnState {
  const newState = { ...state };
  
  // Critical needs override everything
  if (needs.hunger > 90) {
    newState.isWorking = false;
    newState.isSleeping = false;
    newState.isEating = true;
    newState.mood = Math.max(0, newState.mood - 5); // Starving makes you miserable
  } else if (needs.sleep > 95) {
    newState.isWorking = false;
    newState.isEating = false;
    newState.isSleeping = true;
    newState.mood = Math.max(0, newState.mood - 3); // Exhaustion affects mood
  }
  
  // Process current activities
  if (newState.isEating) {
    newState.mood += 2; // Eating improves mood
  } else if (newState.isSleeping) {
    newState.mood += 1; // Rest improves mood
  } else if (newState.isWorking && needs.fatigue < 80) {
    newState.mood += 1; // Productive work improves mood (if not too tired)
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

// Add this to your gameState.ts advanceTurn function:
export function processPawnTurn(state: GameState): GameState {
  const updatedPawns = state.pawns.map(pawn => 
    updatePawnNeeds(pawn, state.turn)
  );
  
  return {
    ...state,
    pawns: updatedPawns
  };
}