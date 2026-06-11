import type { GameState, Job, Pawn } from '$lib/game/core/types';

const FORAGING_RESOURCES = new Set([
  'branch',
  'flint_shard',
  'plant_fiber',
  'bark',
  'granite',
  'limestone',
  'sandstone',
  'marble',
  'slate',
  'clay_lump',
  'wild_sage',
  'berries',
  'mushrooms',
  'fiber'
]);

const MINING_RESOURCES = new Set(['stone', 'iron_ore', 'flint']);

export interface PawnTaskSummary {
  currentState: string;
  currentTask: string;
  nextTask: string;
  workAssignment: string;
}

function getWorkKeyForJob(job: Job): string {
  switch (job.type) {
    case 'harvest': {
      const resourceId = job.resourceId ?? '';
      if (FORAGING_RESOURCES.has(resourceId)) return 'foraging';
      if (MINING_RESOURCES.has(resourceId)) return 'mining';
      return 'woodcutting';
    }
    case 'construct':
      return 'construction';
    case 'craft':
      return 'crafting';
    case 'haul':
      return 'hauling';
    case 'eat':
      return 'eat';
    case 'sleep':
      return 'sleep';
    case 'light':
    case 'refuel':
      return 'construction';
    default:
      return job.type;
  }
}

function describeJob(job: Job): string {
  switch (job.type) {
    case 'harvest':
      return `harvest ${job.resourceId ?? 'resource'} @ (${job.targetX},${job.targetY})`;
    case 'construct':
      return `build @ (${job.targetX},${job.targetY})`;
    case 'haul':
      return `haul ${job.resourceId ?? 'goods'} @ (${job.targetX},${job.targetY})`;
    case 'craft':
      return 'craft item';
    case 'eat':
      return 'eat';
    case 'sleep':
      return 'rest';
    case 'light':
      return `light ${job.buildingId ?? 'campfire'}`;
    case 'refuel':
      return `refuel ${job.buildingId ?? 'campfire'}`;
    default:
      return job.type;
  }
}

function describeActiveJob(job: Pawn['activeJob']): string {
  if (!job) return 'idle';

  switch (job.type) {
    case 'harvest':
      return `harvest ${job.resourceId ?? 'resource'} @ (${job.targetX},${job.targetY})`;
    case 'construct':
      return `build @ (${job.targetX},${job.targetY})`;
    case 'craft':
      return 'craft item';
    case 'haul':
      return `haul ${job.resourceId ?? 'goods'} @ (${job.targetX},${job.targetY})`;
    case 'need':
      return job.targetState === 'Sleeping' ? 'rest' : 'eat';
    default:
      return job.type;
  }
}

function describeCurrentTask(pawn: Pawn): string {
  const state = (pawn.currentState ?? 'Idle').toLowerCase();
  if (!pawn.activeJob) return state;

  if (state.includes('moving')) {
    return `moving to ${describeActiveJob(pawn.activeJob)}`;
  }

  if (state === 'working') {
    return `working on ${describeActiveJob(pawn.activeJob)}`;
  }

  if (state === 'hauling') {
    return `hauling ${pawn.activeJob.resourceId ?? 'goods'}`;
  }

  if (state === 'eating' || state === 'sleeping') {
    return state;
  }

  return `${state}: ${describeActiveJob(pawn.activeJob)}`;
}

function getNextAvailableJob(pawn: Pawn, gameState: GameState): Job | null {
  if (!pawn.position) return null;

  const assignment = gameState.workAssignments?.[pawn.id];
  const laborSettings = assignment?.laborSettings ?? {};
  const legacyPriorities = assignment?.workPriorities ?? {};
  const jobs = (gameState.jobs ?? [])
    .filter((job) => job.claimedBy === null || job.claimedBy === pawn.id)
    .filter((job) => job.id !== pawn.activeJob?.jobId)
    .filter((job) => {
      const workKey = getWorkKeyForJob(job);
      const priority =
        workKey in laborSettings
          ? (laborSettings[workKey] ?? 2)
          : workKey in legacyPriorities
            ? legacyPriorities[workKey]
            : 2;
      return priority > 0;
    });

  jobs.sort((a, b) => {
    const workKeyA = getWorkKeyForJob(a);
    const workKeyB = getWorkKeyForJob(b);
    const priorityA = laborSettings[workKeyA] ?? legacyPriorities[workKeyA] ?? 2;
    const priorityB = laborSettings[workKeyB] ?? legacyPriorities[workKeyB] ?? 2;
    if (priorityB !== priorityA) return priorityB - priorityA;
    const dA = Math.abs(a.targetX - pawn.position!.x) + Math.abs(a.targetY - pawn.position!.y);
    const dB = Math.abs(b.targetX - pawn.position!.x) + Math.abs(b.targetY - pawn.position!.y);
    return dA - dB;
  });

  return jobs[0] ?? null;
}

export function getPawnTaskSummary(pawn: Pawn, gameState: GameState): PawnTaskSummary {
  const currentState = (pawn.currentState ?? 'Idle').toUpperCase();
  let currentTask = describeCurrentTask(pawn);
  const workAssignment = gameState.workAssignments?.[pawn.id];
  const assignedWork = workAssignment?.currentWork ?? pawn.currentWork ?? null;
  const nextJob = getNextAvailableJob(pawn, gameState);

  // When sleeping near a shelter, show which building the pawn is sleeping at.
  // activeJob.targetX/Y points to the building position (set by handleTired).
  if (pawn.currentState?.toLowerCase() === 'sleeping' && pawn.activeJob) {
    const shelterBuilding = gameState.buildings?.find(
      (b) =>
        b.x === pawn.activeJob?.targetX &&
        b.y === pawn.activeJob?.targetY &&
        b.status === 'complete' &&
        /shelter|bed|hut|tent|spot/i.test(b.type)
    );
    if (shelterBuilding) {
      currentTask = `sleeping (${shelterBuilding.type.replace(/_/g, ' ')})`;
    }
  }

  return {
    currentState,
    currentTask,
    nextTask: nextJob
      ? describeJob(nextJob)
      : assignedWork
        ? `${formatWorkName(assignedWork)} queue empty`
        : 'no work assigned',
    workAssignment: assignedWork ? formatWorkName(assignedWork) : 'unassigned'
  };
}

export function getStatColor(statValue: number): string {
  if (statValue >= 18) return '#4CAF50';
  if (statValue >= 15) return '#8BC34A';
  if (statValue >= 12) return '#FFA726';
  if (statValue >= 9) return '#FF9800';
  return '#9E9E9E';
}

export function getStatDescription(statName: string, statValue: number): string {
  const descriptions: Record<string, Record<string, string>> = {
    strength: {
      exceptional: 'Legendary physical might',
      high: 'Exceptional muscular power',
      good: 'Above-average strength',
      average: 'Decent physical power',
      low: 'Below-average strength'
    },
    dexterity: {
      exceptional: 'Supernatural agility and grace',
      high: 'Exceptional speed and coordination',
      good: 'Quick reflexes and nimble',
      average: 'Adequate coordination',
      low: 'Somewhat clumsy'
    },
    intelligence: {
      exceptional: 'Brilliant genius-level intellect',
      high: 'Highly intelligent and analytical',
      good: 'Quick learner and sharp mind',
      average: 'Average reasoning ability',
      low: 'Slower to grasp concepts'
    },
    perception: {
      exceptional: 'Razor-sharp senses and extraordinary awareness',
      high: 'Excellent perception and detection',
      good: 'Good instincts and alertness',
      average: 'Decent situational awareness',
      low: 'Sometimes misses important details'
    },
    charisma: {
      exceptional: 'Magnetic personality and leadership',
      high: 'Very charming and persuasive',
      good: 'Pleasant and likeable',
      average: 'Unremarkable social skills',
      low: 'Awkward in social situations'
    },
    constitution: {
      exceptional: 'Iron constitution and endurance',
      high: 'Very hardy and resilient',
      good: 'Good health and stamina',
      average: 'Average physical resilience',
      low: 'Somewhat frail'
    }
  };

  const level =
    statValue >= 18
      ? 'exceptional'
      : statValue >= 15
        ? 'high'
        : statValue >= 12
          ? 'good'
          : statValue >= 9
            ? 'average'
            : 'low';
  return descriptions[statName]?.[level] || 'Unknown';
}

export function getMoodColor(mood: number): string {
  if (mood >= 80) return '#4CAF50';
  if (mood >= 60) return '#8BC34A';
  if (mood >= 40) return '#FFA726';
  if (mood >= 20) return '#FF5722';
  return '#D32F2F';
}

export function getMoodDescription(mood: number): string {
  if (mood >= 80) return 'Ecstatic and joyful';
  if (mood >= 60) return 'Content and happy';
  if (mood >= 40) return 'Neutral mood';
  if (mood >= 20) return 'Somewhat sad';
  return 'Deeply depressed';
}

export function getHealthColor(health: number): string {
  if (health >= 90) return '#4CAF50';
  if (health >= 70) return '#8BC34A';
  if (health >= 50) return '#FFA726';
  if (health >= 25) return '#FF5722';
  return '#D32F2F';
}

export function getHealthDescription(health: number): string {
  if (health >= 90) return 'Perfect health';
  if (health >= 70) return 'Good condition';
  if (health >= 50) return 'Some injuries';
  if (health >= 25) return 'Badly wounded';
  return 'Critical condition';
}

export function getNeedColor(needValue: number): string {
  if (needValue <= 20) return '#4CAF50';
  if (needValue <= 40) return '#8BC34A';
  if (needValue <= 60) return '#FFA726';
  if (needValue <= 80) return '#FF5722';
  return '#D32F2F';
}

export function getNeedDescription(needType: string, needValue: number): string {
  const descriptions: Record<string, Record<string, string>> = {
    hunger: {
      satisfied: 'Well fed',
      content: 'Slightly hungry',
      moderate: 'Hungry',
      high: 'Very hungry',
      critical: 'Starving'
    },
    fatigue: {
      satisfied: 'Well rested',
      content: 'Slightly tired',
      moderate: 'Tired',
      high: 'Very tired',
      critical: 'Exhausted'
    },
    sleep: {
      satisfied: 'Alert and awake',
      content: 'Slightly sleepy',
      moderate: 'Sleepy',
      high: 'Very sleepy',
      critical: 'Must sleep soon'
    }
  };

  const level =
    needValue <= 20
      ? 'satisfied'
      : needValue <= 40
        ? 'content'
        : needValue <= 60
          ? 'moderate'
          : needValue <= 80
            ? 'high'
            : 'critical';
  return descriptions[needType]?.[level] || 'Unknown';
}

export function getEfficiencyColor(efficiency: number): string {
  if (efficiency >= 3.0) return '#4CAF50';
  if (efficiency >= 2.0) return '#8BC34A';
  if (efficiency >= 1.5) return '#FFA726';
  if (efficiency >= 1.0) return '#FF9800';
  return '#9E9E9E';
}

export function getEfficiencyDescription(efficiency: number): string {
  if (efficiency >= 3.0) return 'Highly efficient';
  if (efficiency >= 2.0) return 'Very efficient';
  if (efficiency >= 1.5) return 'Efficient';
  if (efficiency >= 1.0) return 'Standard efficiency';
  return 'Below average';
}

export function formatAbilityName(abilityName: string): string {
  return abilityName
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .replace(/_/g, ' ')
    .trim();
}

export function formatWorkName(workId: string): string {
  return workId.charAt(0).toUpperCase() + workId.slice(1).replace(/([A-Z])/g, ' $1');
}

export function formatEffectValue(
  effectName: string,
  effectValue: number | string | Record<string, number>
): string {
  if (typeof effectValue === 'number') {
    if (effectName.includes('Bonus') || effectName.includes('Penalty')) {
      return effectValue > 0 ? `+${effectValue}` : `${effectValue}`;
    } else if (
      effectName.includes('Rate') ||
      effectName.includes('Resistance') ||
      effectName.includes('Efficiency')
    ) {
      if (effectValue > 1) {
        return `+${Math.round((effectValue - 1) * 100)}%`;
      } else if (effectValue < 1) {
        return `-${Math.round((1 - effectValue) * 100)}%`;
      }
      return `${Math.round(effectValue * 100)}%`;
    }
    return `${effectValue}`;
  }
  return String(effectValue);
}
