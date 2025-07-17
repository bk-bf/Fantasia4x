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
    wisdom: {
      exceptional: 'Profound wisdom and insight',
      high: 'Excellent judgment and perception',
      good: 'Good instincts and awareness',
      average: 'Decent common sense',
      low: 'Sometimes poor judgment'
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