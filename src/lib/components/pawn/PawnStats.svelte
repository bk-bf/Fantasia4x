<script lang="ts">
  import type { Pawn, GameState, BodyPartState } from '$lib/game/core/types';
  import { modifierSystem } from '$lib/game/systems/ModifierSystem';
  import type {
    WorkEfficiencyResult,
    ModifierResult,
    ModifierSource
  } from '$lib/game/systems/ModifierSystem';
  import {
    getEfficiencyColor,
    getEfficiencyDescription,
    formatAbilityName,
    formatWorkName,
    formatEffectValue
  } from '$lib/utils/pawnUtils';
  import statsData from '$lib/game/database/stats.jsonc';
  import { WORK_CATEGORIES } from '$lib/game/core/Work';

  export let pawn: Pawn;
  export let gameState: GameState;

  // ── Stat definitions loaded from DB ────────────────────────────────────
  type StatDef = {
    id: string;
    category: string;
    primaryStat: string;
    description: string;
    formula?: string; // e.g. "1.0 + (STR − 10) × 0.01"
  };
  const STATS: StatDef[] = statsData as unknown as StatDef[];
  const STAT_MAP: Record<string, StatDef> = {};
  STATS.forEach((st) => {
    STAT_MAP[st.id] = st;
  });

  // State for breakdown toggles
  let showBreakdown: Record<string, boolean> = {};

  // Calculate all modifier results using ModifierSystem
  $: allModifierResults = calculateAllModifierResults(pawn, gameState);

  function calculateAllModifierResults(pawn: Pawn, gameState: GameState) {
    const results: {
      workEfficiency: Record<string, any>;
      combatEfficiency: Record<string, any>;
      survivalEfficiency: Record<string, any>;
      physicalBonus: Record<string, any>;
      mentalBonus: Record<string, any>;
      specialEffects: Record<string, any>;
      resistanceBonus: Record<string, any>;
      capacityBonus: Record<string, any>;
    } = {
      workEfficiency: {},
      combatEfficiency: {},
      survivalEfficiency: {},
      physicalBonus: {},
      mentalBonus: {},
      specialEffects: {},
      resistanceBonus: {},
      capacityBonus: {}
    };

    // ── Phase 1: Pre-compute body capacities (0–1 multipliers from limb health) ──
    const capacities: Record<string, number> = {};
    const capacityStats = STATS.filter((st) => st.category === 'capacity');
    capacityStats.forEach((st) => {
      const cap = calculateCapacity(pawn, st.id);
      capacities[st.id] = cap.totalValue;
      results.capacityBonus[st.id] = cap;
    });

    // ── Phase 2: Work efficiency — compute via ModifierSystem, then apply capacity multipliers ──
    WORK_CATEGORIES.forEach((wc) => {
      const baseEff = modifierSystem.calculateWorkEfficiency(pawn.id, wc.id, gameState);
      // Work speed is driven by manipulation (physical interaction) and sight (precision)
      const workMult = (capacities.manipulation ?? 1) * (capacities.sight ?? 1);
      const adjusted: typeof baseEff = {
        ...baseEff,
        totalValue: baseEff.totalValue * workMult,
        multiplier: baseEff.multiplier * workMult,
        sources: [
          ...baseEff.sources,
          {
            id: 'manipulation',
            name: 'Manipulation',
            type: 'stat',
            value: capacities.manipulation ?? 1,
            description: `Manipulation capacity × ${(capacities.manipulation ?? 1).toFixed(2)}`
          },
          {
            id: 'sight',
            name: 'Sight',
            type: 'stat',
            value: capacities.sight ?? 1,
            description: `Sight capacity × ${(capacities.sight ?? 1).toFixed(2)}`
          }
        ]
      };
      results.workEfficiency[wc.id] = adjusted;
    });

    // ── Phase 3: All other stat categories — driven by stats.jsonc formulas + capacities ──
    const resultBuckets: Record<string, Record<string, any>> = {
      combat: results.combatEfficiency,
      survival: results.survivalEfficiency,
      physical: results.physicalBonus,
      mental: results.mentalBonus,
      special: results.specialEffects,
      resistance: results.resistanceBonus
    };
    STATS.forEach((st) => {
      const bucket = resultBuckets[st.category];
      if (bucket) {
        bucket[st.id] = calculateEfficiency(pawn, st.id, capacities);
      }
    });

    return results;
  }

  // ── Formula evaluator: substitutes stat tokens + weight/height + capacities ──
  // Safe: expression is from project JSONC (not user input); sanitised to arithmetic chars only.
  function evaluateFormula(
    formula: string | undefined,
    p: Pawn,
    capacities: Record<string, number> = {}
  ): number {
    if (!formula) return 1.0;
    let expr = formula
      .replace(/×/g, '*')
      .replace(/−/g, '-')
      .replace(/\bSTR\b/g, String(p.stats.strength))
      .replace(/\bDEX\b/g, String(p.stats.dexterity))
      .replace(/\bCON\b/g, String(p.stats.constitution))
      .replace(/\bPER\b/g, String(p.stats.perception))
      .replace(/\bINT\b/g, String(p.stats.intelligence))
      .replace(/\bCHA\b/g, String(p.stats.charisma))
      .replace(/\bweight\b/g, String(p.physicalTraits?.weight ?? 70))
      .replace(/\bheight\b/g, String(p.physicalTraits?.height ?? 170))
      .replace(/\bconsciousness\b/g, String(capacities.consciousness ?? 1))
      .replace(/\bmanipulation\b/g, String(capacities.manipulation ?? 1))
      .replace(/\bsight\b/g, String(capacities.sight ?? 1))
      .replace(/\bmoving\b/g, String(capacities.moving ?? 1))
      .replace(/\bblood_pumping\b/g, String(capacities.blood_pumping ?? 1))
      .replace(/\bblood_filtration\b/g, String(capacities.blood_filtration ?? 1))
      .replace(/\bbreathing\b/g, String(capacities.breathing ?? 1))
      .replace(/\bdigestion\b/g, String(capacities.digestion ?? 1))
      .replace(/\btalking\b/g, String(capacities.talking ?? 1))
      .replace(/\bhearing\b/g, String(capacities.hearing ?? 1))
      .replace(/\bpain\b/g, String(capacities.pain ?? 0));
    if (!/^[\d\s+\-*/.()]+$/.test(expr)) return 1.0;
    try {
      // eslint-disable-next-line no-new-func
      const v = Function('"use strict"; return (' + expr + ')')() as number;
      return isFinite(v) ? Math.round(v * 1000) / 1000 : 1.0;
    } catch {
      return 1.0;
    }
  }

  function calculateEfficiency(
    pawn: Pawn,
    abilityId: string,
    capacities: Record<string, number> = {}
  ): ModifierResult {
    const def = STAT_MAP[abilityId];
    const value = evaluateFormula(def?.formula, pawn, capacities);
    const statName = def?.primaryStat || 'strength';
    const statValue = (pawn.stats as any)[statName] || 10;
    const sources: ModifierSource[] = [
      {
        id: statName,
        name: statName.charAt(0).toUpperCase() + statName.slice(1),
        type: 'stat',
        value,
        description: `${def?.formula ?? ''}  [${statName} = ${statValue}] = ${value.toFixed(3)}`
      }
    ];
    return createModifierResult(value, value, 1, sources);
  }

  // ── Capacity calculator: derives body capacities from specific organs ──
  // Uses partial-function logic with real organs (heart, lungs, kidneys, eyes…).
  // Paired organs use weighted blend of weaker (bottleneck) and average (compensation).
  function calculateCapacity(pawn: Pawn, capacityId: string): ModifierResult {
    const limbs = pawn.limbs ?? [];
    const limb = (id: string) => limbs.find(l => l.id === id);
    const limbH = (id: string) => limb(id)?.health ?? 100;
    const limbMissing = (id: string) => limb(id)?.isMissing ?? false;

    // Organ lookup: find a specific BodyPartState inside a limb's parts[]
    const organ = (limbId: string, organId: string): BodyPartState | undefined =>
      limb(limbId)?.parts?.find(p => p.id === organId);
    const organH = (limbId: string, organId: string) =>
      organ(limbId, organId)?.health ?? organ(limbId, organId)?.maxHp ?? 100;
    const organMissing = (limbId: string, organId: string) =>
      organ(limbId, organId)?.isMissing ?? false;

    let value = 1.0;
    let description = '';

    // Pre-compute pain since consciousness depends on it
    let injuryPain = 0;
    pawn.injuries?.forEach((inj) => (injuryPain += inj.painContribution));
    let limbPain = 0;
    limbs.forEach((l) => {
      if (!l.isMissing && l.health < 100) {
        limbPain += (100 - l.health) * 0.01;
      }
    });
    let bleedPain = 0;
    limbs.forEach((l) => {
      bleedPain += l.bleedRate * 0.5;
    });
    const painValue = (injuryPain + limbPain + bleedPain) / 100;

    switch (capacityId) {
      case 'consciousness': {
        // Brain is primary (60%); heart (20%) and lungs (15%) supply oxygenated blood.
        // 5% baseline = deep coma / brainstem reflexes only.
        // Pain reduces consciousness: 100% pain → ×0.5, 200% pain → 0 (shock).
        const brain = organMissing('head', 'brain') ? 0.0 : organH('head', 'brain') / 30;
        const heart = organMissing('torso', 'heart') ? 0.0 : organH('torso', 'heart') / 20;
        const leftLung = organMissing('torso', 'leftLung') ? 0.0 : organH('torso', 'leftLung') / 30;
        const rightLung = organMissing('torso', 'rightLung') ? 0.0 : organH('torso', 'rightLung') / 30;
        const avgLung = (leftLung + rightLung) / 2;
        const baseCon = brain * 0.60 + heart * 0.20 + avgLung * 0.15 + 0.05;
        const painMult = Math.max(0, 1 - painValue * 0.5);
        value = baseCon * painMult;
        description = `Brain ${(brain * 100).toFixed(0)}% × 0.6 + Heart ${(heart * 100).toFixed(0)}% × 0.2 + Lungs ${(avgLung * 100).toFixed(0)}% × 0.15 + 0.05 × Pain ${(painMult * 100).toFixed(0)}%`;
        break;
      }
      case 'pain': {
        value = painValue;
        description = `Injuries ${injuryPain.toFixed(1)} + Limbs ${limbPain.toFixed(1)} + Bleed ${bleedPain.toFixed(1)} = ${(painValue * 100).toFixed(0)}%`;
        break;
      }
      case 'manipulation': {
        // Two arms — weaker bottlenecks (×0.3), average matters (×0.7).
        const left = limbMissing('left_arm') ? 0.0 : limbH('left_arm') / 100;
        const right = limbMissing('right_arm') ? 0.0 : limbH('right_arm') / 100;
        const minArm = Math.min(left, right);
        const avgArm = (left + right) / 2;
        value = minArm * 0.30 + avgArm * 0.70;
        description = `Arms: weaker ${(minArm * 100).toFixed(0)}% × 0.3 + avg ${(avgArm * 100).toFixed(0)}% × 0.7`;
        break;
      }
      case 'sight': {
        // Two eyes — weaker bottlenecks (×0.4), average matters (×0.6).
        // 5% baseline = light/dark detection even with destroyed eyes.
        const leftEye = organMissing('head', 'leftEye') ? 0.0 : organH('head', 'leftEye') / 10;
        const rightEye = organMissing('head', 'rightEye') ? 0.0 : organH('head', 'rightEye') / 10;
        const minEye = Math.min(leftEye, rightEye);
        const avgEye = (leftEye + rightEye) / 2;
        value = minEye * 0.40 + avgEye * 0.60 + 0.05;
        description = `Eyes: weaker ${(minEye * 100).toFixed(0)}% × 0.4 + avg ${(avgEye * 100).toFixed(0)}% × 0.6 + 0.05`;
        break;
      }
      case 'moving': {
        // Two legs — weaker bottlenecks (×0.5), average matters (×0.5).
        const left = limbMissing('left_leg') ? 0.0 : limbH('left_leg') / 100;
        const right = limbMissing('right_leg') ? 0.0 : limbH('right_leg') / 100;
        const minLeg = Math.min(left, right);
        const avgLeg = (left + right) / 2;
        value = minLeg * 0.50 + avgLeg * 0.50;
        description = `Legs: weaker ${(minLeg * 100).toFixed(0)}% × 0.5 + avg ${(avgLeg * 100).toFixed(0)}% × 0.5`;
        break;
      }
      case 'blood_pumping': {
        // Heart is the pump. 10% baseline = agonal fibrillation / external CPR.
        const heart = organMissing('torso', 'heart') ? 0.0 : organH('torso', 'heart') / 20;
        value = heart * 0.90 + 0.10;
        description = `Heart ${(heart * 100).toFixed(0)}% × 0.90 + 0.10 baseline`;
        break;
      }
      case 'blood_filtration': {
        // Two kidneys — weaker bottlenecks (×0.4), average matters (×0.6).
        // One kidney can sustain life at ~60% capacity.
        const leftK = organMissing('torso', 'leftKidney') ? 0.0 : organH('torso', 'leftKidney') / 15;
        const rightK = organMissing('torso', 'rightKidney') ? 0.0 : organH('torso', 'rightKidney') / 15;
        const minK = Math.min(leftK, rightK);
        const avgK = (leftK + rightK) / 2;
        value = minK * 0.40 + avgK * 0.60;
        description = `Kidneys: weaker ${(minK * 100).toFixed(0)}% × 0.4 + avg ${(avgK * 100).toFixed(0)}% × 0.6`;
        break;
      }
      case 'breathing': {
        // Two lungs — weaker bottlenecks (×0.5), average matters (×0.5).
        // 5% baseline = diaphragm-only / gasping.
        const leftL = organMissing('torso', 'leftLung') ? 0.0 : organH('torso', 'leftLung') / 30;
        const rightL = organMissing('torso', 'rightLung') ? 0.0 : organH('torso', 'rightLung') / 30;
        const minL = Math.min(leftL, rightL);
        const avgL = (leftL + rightL) / 2;
        value = minL * 0.50 + avgL * 0.50 + 0.05;
        description = `Lungs: weaker ${(minL * 100).toFixed(0)}% × 0.5 + avg ${(avgL * 100).toFixed(0)}% × 0.5 + 0.05`;
        break;
      }
      case 'digestion': {
        // Stomach (60%) + liver (40%). Both needed; liver failure is fatal long-term.
        const stomach = organMissing('torso', 'stomach') ? 0.0 : organH('torso', 'stomach') / 20;
        const liver = organMissing('torso', 'liver') ? 0.0 : organH('torso', 'liver') / 25;
        value = stomach * 0.60 + liver * 0.40;
        description = `Stomach ${(stomach * 100).toFixed(0)}% × 0.6 + Liver ${(liver * 100).toFixed(0)}% × 0.4`;
        break;
      }
      case 'talking': {
        // Jaw is the organ. 10% baseline = can groan / whisper without a jaw.
        const jaw = organMissing('head', 'jaw') ? 0.0 : organH('head', 'jaw') / 25;
        value = jaw * 0.90 + 0.10;
        description = `Jaw ${(jaw * 100).toFixed(0)}% × 0.90 + 0.10 baseline`;
        break;
      }
      case 'hearing': {
        // Two ears — weaker bottlenecks (×0.3), average matters (×0.7).
        // 15% baseline = bone conduction / vibration sense.
        const leftE = organMissing('head', 'leftEar') ? 0.0 : organH('head', 'leftEar') / 10;
        const rightE = organMissing('head', 'rightEar') ? 0.0 : organH('head', 'rightEar') / 10;
        const minE = Math.min(leftE, rightE);
        const avgE = (leftE + rightE) / 2;
        value = minE * 0.30 + avgE * 0.70 + 0.15;
        description = `Ears: weaker ${(minE * 100).toFixed(0)}% × 0.3 + avg ${(avgE * 100).toFixed(0)}% × 0.7 + 0.15`;
        break;
      }
      default:
        value = 1.0;
        description = 'Unknown capacity';
    }

    const sources: ModifierSource[] = [
      {
        id: capacityId,
        name: capacityId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        type: 'stat',
        value,
        description
      }
    ];
    return createModifierResult(value, value, 1, sources);
  }

  // Format a computed stat value for display (multiplier, pool, or resistance).
  function formatAbilityValue(abilityId: string, value: number): string {
    const def = STAT_MAP[abilityId];
    if (def?.category === 'resistance') return `${(value * 100).toFixed(1)}%`;
    if (value > 5) return Math.round(value).toString();
    return `${value.toFixed(2)}x`;
  }

  // ── Unified description helpers ──────────────────────────────────────────────
  function getAbilityDescription(id: string, efficiency: number): string {
    const base =
      efficiency >= 2.0
        ? 'Excellent'
        : efficiency >= 1.5
          ? 'Good'
          : efficiency >= 1.0
            ? 'Average'
            : 'Poor';
    return `${base} ${STAT_MAP[id]?.description || 'stat'}`;
  }

  // Helper
  function createModifierResult(
    baseValue: number,
    totalValue: number,
    multiplier: number,
    sources: ModifierSource[]
  ): ModifierResult {
    return {
      baseValue,
      totalValue,
      multiplier,
      sources,
      breakdown: {
        base: baseValue,
        additiveBonus: 0,
        multiplicativeBonus: multiplier - 1,
        final: totalValue
      }
    };
  }

  function toggleBreakdown(type: string) {
    showBreakdown[type] = !showBreakdown[type];
    showBreakdown = { ...showBreakdown };
  }
</script>

<div class="abilities-section" id="abilities">
  <h3>| SKILLS &amp; ABILITIES</h3>

  <!-- Work Efficiency Section -->
  {#if Object.keys(allModifierResults.workEfficiency).length > 0}
    <div class="ability-category">
      <h4 class="category-title">
        WORK EFFICIENCY ({Object.keys(allModifierResults.workEfficiency).length})
      </h4>

      <div class="abilities-grid">
        {#each Object.entries(allModifierResults.workEfficiency) as [workType, result]}
          {@const workDesc = WORK_CATEGORIES.find((w) => w.id === workType)?.description}
          <div class="ability-card" data-category="work-efficiency">
            <div class="ability-header">
              <span class="ability-name">
                {formatWorkName(workType)}
              </span>
              <span
                class="ability-value"
                class:positive={result.totalValue > 1.0}
                class:negative={result.totalValue < 1.0}
                class:neutral={result.totalValue === 1.0}
                style="color: {getEfficiencyColor(result.totalValue)}"
              >
                {result.totalValue.toFixed(2)}x
              </span>
            </div>

            <p class="ability-description">
              {getEfficiencyDescription(result.totalValue)} - {workDesc || 'Work activity'}
            </p>

            <div class="ability-calculation">
              <div class="calculation-header">
                <span>Modifiers ({result.sources.length})</span>
                <button
                  class="toggle-breakdown"
                  on:click={() => toggleBreakdown(`work_${workType}`)}
                >
                  {showBreakdown[`work_${workType}`] ? '▼' : '▶'}
                </button>
              </div>

              {#if showBreakdown[`work_${workType}`]}
                <div class="breakdown-details">
                  <div class="calculation-step base">
                    Base: {result.baseValue.toFixed(2)}x
                  </div>
                  <div class="calculation-step formula">
                    Total Multiplier: {result.multiplier.toFixed(2)}x
                  </div>
                  <div class="calculation-step formula">
                    Final: {result.baseValue.toFixed(2)} × {result.multiplier.toFixed(2)} = {result.totalValue.toFixed(
                      2
                    )}x
                  </div>

                  {#each result.sources as source}
                    <div
                      class="calculation-step"
                      class:stat={source.type === 'stat'}
                      class:trait={source.type === 'trait'}
                      class:equipment={source.type === 'item'}
                      class:building={source.type === 'building'}
                    >
                      <span class="source-label">{source.name}: {source.value.toFixed(2)}x</span>
                      <div class="source-description">{source.description}</div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Combat Effectiveness Section -->
  {#if Object.keys(allModifierResults.combatEfficiency).length > 0}
    <div class="ability-category">
      <h4 class="category-title">
        COMBAT EFFECTIVENESS ({Object.keys(allModifierResults.combatEfficiency).length})
      </h4>

      <div class="abilities-grid">
        {#each Object.entries(allModifierResults.combatEfficiency) as [combatType, result]}
          <div class="ability-card" data-category="combat">
            <div class="ability-header">
              <span class="ability-name">
                {formatAbilityName(combatType)}
              </span>
              <span
                class="ability-value"
                class:positive={result.totalValue > 1.0}
                class:negative={result.totalValue < 1.0}
                class:neutral={result.totalValue === 1.0}
                style="color: {getEfficiencyColor(result.totalValue)}"
              >
                {result.totalValue.toFixed(2)}x
              </span>
            </div>

            <p class="ability-description">
              {getAbilityDescription(combatType, result.totalValue)}
            </p>

            <div class="ability-calculation">
              <div class="calculation-header">
                <span>Modifiers ({result.sources.length})</span>
                <button
                  class="toggle-breakdown"
                  on:click={() => toggleBreakdown(`combat_${combatType}`)}
                >
                  {showBreakdown[`combat_${combatType}`] ? '▼' : '▶'}
                </button>
              </div>

              {#if showBreakdown[`combat_${combatType}`]}
                <div class="breakdown-details">
                  <div class="calculation-step base">
                    Base: {result.baseValue.toFixed(2)}x
                  </div>
                  <div class="calculation-step formula">
                    Total Multiplier: {result.multiplier.toFixed(2)}x
                  </div>
                  <div class="calculation-step formula">
                    Final: {result.baseValue.toFixed(2)} × {result.multiplier.toFixed(2)} = {result.totalValue.toFixed(
                      2
                    )}x
                  </div>

                  {#each result.sources as source}
                    <div
                      class="calculation-step"
                      class:stat={source.type === 'stat'}
                      class:trait={source.type === 'trait'}
                      class:equipment={source.type === 'item'}
                      class:building={source.type === 'building'}
                    >
                      <span class="source-label">{source.name}: {source.value.toFixed(2)}x</span>
                      <div class="source-description">{source.description}</div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Survival Abilities Section -->
  {#if Object.keys(allModifierResults.survivalEfficiency).length > 0}
    <div class="ability-category">
      <h4 class="category-title">
        SURVIVAL ABILITIES ({Object.keys(allModifierResults.survivalEfficiency).length})
      </h4>

      <div class="abilities-grid">
        {#each Object.entries(allModifierResults.survivalEfficiency) as [survivalType, result]}
          <div class="ability-card" data-category="survival">
            <div class="ability-header">
              <span class="ability-name">
                {formatAbilityName(survivalType)}
              </span>
              <span
                class="ability-value"
                class:positive={result.totalValue > 1.0}
                class:negative={result.totalValue < 1.0}
                class:neutral={result.totalValue === 1.0}
                style="color: {getEfficiencyColor(result.totalValue)}"
              >
                {result.totalValue.toFixed(2)}x
              </span>
            </div>

            <p class="ability-description">
              {getAbilityDescription(survivalType, result.totalValue)}
            </p>

            <div class="ability-calculation">
              <div class="calculation-header">
                <span>Modifiers ({result.sources.length})</span>
                <button
                  class="toggle-breakdown"
                  on:click={() => toggleBreakdown(`survival_${survivalType}`)}
                >
                  {showBreakdown[`survival_${survivalType}`] ? '▼' : '▶'}
                </button>
              </div>

              {#if showBreakdown[`survival_${survivalType}`]}
                <div class="breakdown-details">
                  <div class="calculation-step base">
                    Base: {result.baseValue.toFixed(2)}x
                  </div>
                  <div class="calculation-step formula">
                    Total Multiplier: {result.multiplier.toFixed(2)}x
                  </div>
                  <div class="calculation-step formula">
                    Final: {result.baseValue.toFixed(2)} × {result.multiplier.toFixed(2)} = {result.totalValue.toFixed(
                      2
                    )}x
                  </div>

                  {#each result.sources as source}
                    <div
                      class="calculation-step"
                      class:stat={source.type === 'stat'}
                      class:trait={source.type === 'trait'}
                      class:equipment={source.type === 'item'}
                      class:building={source.type === 'building'}
                    >
                      <span class="source-label">{source.name}: {source.value.toFixed(2)}x</span>
                      <div class="source-description">{source.description}</div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Physical Bonuses Section -->
  {#if Object.keys(allModifierResults.physicalBonus).length > 0}
    <div class="ability-category">
      <h4 class="category-title">
        PHYSICAL BONUSES ({Object.keys(allModifierResults.physicalBonus).length})
      </h4>

      <div class="abilities-grid">
        {#each Object.entries(allModifierResults.physicalBonus) as [physicalType, result]}
          <div class="ability-card" data-category="physical">
            <div class="ability-header">
              <span class="ability-name">
                {formatAbilityName(physicalType)}
              </span>
              <span
                class="ability-value"
                class:positive={result.totalValue > 1.0}
                class:negative={result.totalValue < 1.0}
                class:neutral={result.totalValue === 1.0}
                style="color: {getEfficiencyColor(result.totalValue)}"
              >
                {formatAbilityValue(physicalType, result.totalValue)}
              </span>
            </div>

            <p class="ability-description">
              {getAbilityDescription(physicalType, result.totalValue)}
            </p>

            <div class="ability-calculation">
              <div class="calculation-header">
                <span>Modifiers ({result.sources.length})</span>
                <button
                  class="toggle-breakdown"
                  on:click={() => toggleBreakdown(`physical_${physicalType}`)}
                >
                  {showBreakdown[`physical_${physicalType}`] ? '▼' : '▶'}
                </button>
              </div>

              {#if showBreakdown[`physical_${physicalType}`]}
                <div class="breakdown-details">
                  <div class="calculation-step base">
                    Base: {result.baseValue.toFixed(2)}x
                  </div>
                  <div class="calculation-step formula">
                    Total Multiplier: {result.multiplier.toFixed(2)}x
                  </div>
                  <div class="calculation-step formula">
                    Final: {result.baseValue.toFixed(2)} × {result.multiplier.toFixed(2)} = {result.totalValue.toFixed(
                      2
                    )}x
                  </div>

                  {#each result.sources as source}
                    <div
                      class="calculation-step"
                      class:stat={source.type === 'stat'}
                      class:trait={source.type === 'trait'}
                      class:equipment={source.type === 'item'}
                      class:building={source.type === 'building'}
                    >
                      <span class="source-label">{source.name}: {source.value.toFixed(2)}x</span>
                      <div class="source-description">{source.description}</div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Mental Bonuses Section -->
  {#if Object.keys(allModifierResults.mentalBonus).length > 0}
    <div class="ability-category">
      <h4 class="category-title">
        MENTAL BONUSES ({Object.keys(allModifierResults.mentalBonus).length})
      </h4>

      <div class="abilities-grid">
        {#each Object.entries(allModifierResults.mentalBonus) as [mentalType, result]}
          <div class="ability-card" data-category="mental">
            <div class="ability-header">
              <span class="ability-name">
                {formatAbilityName(mentalType)}
              </span>
              <span
                class="ability-value"
                class:positive={result.totalValue > 1.0}
                class:negative={result.totalValue < 1.0}
                class:neutral={result.totalValue === 1.0}
                style="color: {getEfficiencyColor(result.totalValue)}"
              >
                {result.totalValue.toFixed(2)}x
              </span>
            </div>

            <p class="ability-description">
              {getAbilityDescription(mentalType, result.totalValue)}
            </p>

            <div class="ability-calculation">
              <div class="calculation-header">
                <span>Modifiers ({result.sources.length})</span>
                <button
                  class="toggle-breakdown"
                  on:click={() => toggleBreakdown(`mental_${mentalType}`)}
                >
                  {showBreakdown[`mental_${mentalType}`] ? '▼' : '▶'}
                </button>
              </div>

              {#if showBreakdown[`mental_${mentalType}`]}
                <div class="breakdown-details">
                  <div class="calculation-step base">
                    Base: {result.baseValue.toFixed(2)}x
                  </div>
                  <div class="calculation-step formula">
                    Total Multiplier: {result.multiplier.toFixed(2)}x
                  </div>
                  <div class="calculation-step formula">
                    Final: {result.baseValue.toFixed(2)} × {result.multiplier.toFixed(2)} = {result.totalValue.toFixed(
                      2
                    )}x
                  </div>

                  {#each result.sources as source}
                    <div
                      class="calculation-step"
                      class:stat={source.type === 'stat'}
                      class:trait={source.type === 'trait'}
                      class:equipment={source.type === 'item'}
                      class:building={source.type === 'building'}
                    >
                      <span class="source-label">{source.name}: {source.value.toFixed(2)}x</span>
                      <div class="source-description">{source.description}</div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Special Effects Section -->
  {#if Object.keys(allModifierResults.specialEffects).length > 0}
    <div class="ability-category">
      <h4 class="category-title">
        ✨ Special Effects ({Object.keys(allModifierResults.specialEffects).length})
      </h4>

      <div class="abilities-grid">
        {#each Object.entries(allModifierResults.specialEffects) as [specialType, result]}
          <div class="ability-card" data-category="special">
            <div class="ability-header">
              <span class="ability-name">
                {formatAbilityName(specialType)}
              </span>
              <span
                class="ability-value"
                class:positive={result.totalValue > 1.0}
                class:negative={result.totalValue < 1.0}
                class:neutral={result.totalValue === 1.0}
                style="color: {getEfficiencyColor(result.totalValue)}"
              >
                {result.totalValue.toFixed(2)}x
              </span>
            </div>

            <p class="ability-description">
              {getAbilityDescription(specialType, result.totalValue)}
            </p>

            <div class="ability-calculation">
              <div class="calculation-header">
                <span>Modifiers ({result.sources.length})</span>
                <button
                  class="toggle-breakdown"
                  on:click={() => toggleBreakdown(`special_${specialType}`)}
                >
                  {showBreakdown[`special_${specialType}`] ? '▼' : '▶'}
                </button>
              </div>

              {#if showBreakdown[`special_${specialType}`]}
                <div class="breakdown-details">
                  <div class="calculation-step base">
                    Base: {result.baseValue.toFixed(2)}x
                  </div>
                  <div class="calculation-step formula">
                    Total Multiplier: {result.multiplier.toFixed(2)}x
                  </div>
                  <div class="calculation-step formula">
                    Final: {result.baseValue.toFixed(2)} × {result.multiplier.toFixed(2)} = {result.totalValue.toFixed(
                      2
                    )}x
                  </div>

                  {#each result.sources as source}
                    <div
                      class="calculation-step"
                      class:stat={source.type === 'stat'}
                      class:trait={source.type === 'trait'}
                      class:equipment={source.type === 'item'}
                      class:building={source.type === 'building'}
                    >
                      <span class="source-label">{source.name}: {source.value.toFixed(2)}x</span>
                      <div class="source-description">{source.description}</div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Resistance Section -->
  {#if Object.keys(allModifierResults.resistanceBonus).length > 0}
    <div class="ability-category">
      <h4 class="category-title">
        RESISTANCES ({Object.keys(allModifierResults.resistanceBonus).length})
      </h4>

      <div class="abilities-grid">
        {#each Object.entries(allModifierResults.resistanceBonus) as [resType, result]}
          <div class="ability-card" data-category="resistance">
            <div class="ability-header">
              <span class="ability-name">
                {formatAbilityName(resType)}
              </span>
              <span
                class="ability-value"
                class:positive={result.totalValue > 0}
                class:neutral={result.totalValue === 0}
                style="color: {result.totalValue > 0 ? 'var(--positive)' : 'var(--text-dim)'}"
              >
                {formatAbilityValue(resType, result.totalValue)}
              </span>
            </div>

            <p class="ability-description">
              {getAbilityDescription(resType, result.totalValue)}
            </p>

            <div class="ability-calculation">
              <div class="calculation-header">
                <span>Modifiers ({result.sources.length})</span>
                <button
                  class="toggle-breakdown"
                  on:click={() => toggleBreakdown(`res_${resType}`)}
                >
                  {showBreakdown[`res_${resType}`] ? '▼' : '▶'}
                </button>
              </div>

              {#if showBreakdown[`res_${resType}`]}
                <div class="breakdown-details">
                  {#each result.sources as source}
                    <div
                      class="calculation-step"
                      class:stat={source.type === 'stat'}
                      class:trait={source.type === 'trait'}
                    >
                      <span class="source-label">{source.name}: {(source.value * 100).toFixed(1)}%</span>
                      <div class="source-description">{source.description}</div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Body Capacities Section -->
  {#if Object.keys(allModifierResults.capacityBonus).length > 0}
    <div class="ability-category">
      <h4 class="category-title">
        BODY CAPACITIES ({Object.keys(allModifierResults.capacityBonus).length})
      </h4>

      <div class="abilities-grid">
        {#each Object.entries(allModifierResults.capacityBonus) as [capType, result]}
          <div class="ability-card" data-category="capacity">
            <div class="ability-header">
              <span class="ability-name">
                {formatAbilityName(capType)}
              </span>
              <span
                class="ability-value"
                class:positive={result.totalValue >= 0.8}
                class:negative={result.totalValue < 0.5}
                class:neutral={result.totalValue >= 0.5 && result.totalValue < 0.8}
                style="color: {result.totalValue >= 0.8 ? 'var(--positive)' : result.totalValue < 0.5 ? 'var(--negative)' : 'var(--text-dim)'}"
              >
                {(result.totalValue * 100).toFixed(1)}%
              </span>
            </div>

            <p class="ability-description">
              {getAbilityDescription(capType, result.totalValue)}
            </p>

            <div class="ability-calculation">
              <div class="calculation-header">
                <span>Body Parts</span>
                <button
                  class="toggle-breakdown"
                  on:click={() => toggleBreakdown(`cap_${capType}`)}
                >
                  {showBreakdown[`cap_${capType}`] ? '▼' : '▶'}
                </button>
              </div>

              {#if showBreakdown[`cap_${capType}`]}
                <div class="breakdown-details">
                  {#each result.sources as source}
                    <div class="calculation-step stat">
                      <span class="source-label">{source.name}: {(source.value * 100).toFixed(1)}%</span>
                      <div class="source-description">{source.description}</div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .abilities-section {
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    padding: 0;
    margin-bottom: 0;
  }

  .abilities-section h3 {
    padding: 4px 8px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 11px;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
    border-top: 1px solid var(--border);
    margin: 1px 0 0 0;
    font-weight: normal;
  }

  .ability-category {
    margin-bottom: 0;
  }

  .category-title {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-dim);
    margin: 0;
    font-size: 11px;
    padding: 3px 8px;
    border-bottom: 1px solid var(--border);
    font-weight: normal;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    background: var(--bg);
  }

  .abilities-grid {
    display: flex;
    flex-direction: column;
  }

  .ability-card {
    background: var(--bg);
    border: none;
    border-bottom: 1px solid var(--border);
    padding: 3px 8px;
    transition: background 0.1s;
  }

  .ability-card:hover {
    background: var(--bg-hover);
  }

  .ability-card:hover .ability-name,
  .ability-card:hover .calculation-header {
    color: var(--accent-hi);
  }

  .ability-card[data-category='work-efficiency'],
  .ability-card[data-category='combat'],
  .ability-card[data-category='survival'],
  .ability-card[data-category='physical'],
  .ability-card[data-category='mental'],
  .ability-card[data-category='special'],
  .ability-card[data-category='resistance'],
  .ability-card[data-category='capacity'] {
    border-left: none;
  }

  .ability-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 6px;
  }

  .ability-name {
    color: var(--text-dim);
    font-weight: normal;
    font-size: 11px;
    flex: 1;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .ability-value {
    font-family: 'Courier New', monospace;
    font-weight: bold;
    font-size: 11px;
    padding: 0;
    background: none;
  }

  .ability-value.positive {
    color: var(--pos);
  }
  .ability-value.negative {
    color: var(--neg);
  }
  .ability-value.neutral {
    color: var(--text-muted);
  }

  .ability-description {
    color: var(--text-muted);
    font-size: 11px;
    margin: 0;
    line-height: 1.3;
    font-style: italic;
  }

  .ability-calculation {
    padding-top: 4px;
    margin-top: 2px;
    border-top: 1px solid var(--border);
  }

  .calculation-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
    color: var(--text-dim);
    font-weight: normal;
    font-size: 11px;
  }

  .toggle-breakdown {
    background: var(--bg-hover);
    border: 1px solid var(--border-hi);
    color: var(--text);
    padding: 1px 5px;
    cursor: pointer;
    font-family: 'Courier New', monospace;
    font-size: 10px;
  }
  .toggle-breakdown:hover {
    color: var(--accent-hi);
  }

  .breakdown-details {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 4px;
  }

  .calculation-step {
    margin: 0;
    padding: 2px 6px;
    border-left: 2px solid var(--border);
    background: var(--bg-panel);
    font-size: 10px;
    font-family: 'Courier New', monospace;
    line-height: 1.3;
    color: var(--text-muted);
  }

  .calculation-step.base {
    border-left-color: var(--text-muted);
  }
  .calculation-step.formula {
    border-left-color: var(--accent-hi);
  }
  .calculation-step.stat {
    border-left-color: var(--text);
  }
  .calculation-step.trait {
    border-left-color: var(--border-hi);
  }
  .calculation-step.equipment {
    border-left-color: var(--accent-hi);
  }
  .calculation-step.building {
    border-left-color: var(--pos);
  }

  .source-label {
    color: var(--text);
    font-weight: bold;
    font-size: 10px;
  }

  .source-description {
    color: var(--text-muted);
    font-size: 10px;
    margin-top: 1px;
    line-height: 1.3;
  }
</style>
