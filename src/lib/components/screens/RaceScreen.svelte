<script lang="ts">
  import { currentRace } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { workAxisLabel } from '$lib/utils/pawnUtils';
  import { onMount } from 'svelte';
  import { onDestroy } from 'svelte';

  let race: any = null;
  let raceScreenElement: HTMLElement;

  const unsubscribe = currentRace.subscribe((value) => {
    race = value;
  });

  onMount(() => {
    if (raceScreenElement) {
      raceScreenElement.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  function scrollToSection(sectionId: string) {
    console.log('Scrolling to:', sectionId);
    const element = document.getElementById(sectionId);
    if (element && raceScreenElement) {
      const elementTop = element.offsetTop;
      raceScreenElement.scrollTo({
        top: elementTop - 20,
        behavior: 'smooth'
      });
    }
  }

  onDestroy(() => {
    unsubscribe();
  });

  function getStatRangeColor(range: [number, number]): string {
    const avgStat = (range[0] + range[1]) / 2;
    if (avgStat >= 15) return '#4CAF50'; // Green for high stats
    if (avgStat >= 12) return '#FFA726'; // Orange for medium stats
    return '#9E9E9E'; // Gray for low stats
  }

  function getStatRangeDescription(statName: string, range: [number, number]): string {
    const avgStat = (range[0] + range[1]) / 2;
    const descriptions: Record<string, Record<string, string>> = {
      strength: {
        high: 'Mighty warriors capable of incredible feats of strength',
        medium: 'Strong and capable fighters with above-average power',
        low: 'Of average physical strength, relying on skill over brute force'
      },
      dexterity: {
        high: 'Lightning-quick reflexes and supernatural agility',
        medium: 'Nimble and graceful with excellent coordination',
        low: 'Steady hands but not particularly agile'
      },
      intelligence: {
        high: 'Brilliant minds that grasp complex concepts instantly',
        medium: 'Quick learners with sharp analytical skills',
        low: 'Practical wisdom over book learning'
      },
      perception: {
        high: 'Keen senses attuned to every detail of their environment',
        medium: 'Perceptive and alert, rarely caught off guard',
        low: 'Relies on logic over raw sensory awareness'
      },
      charisma: {
        high: 'Natural leaders who inspire devotion in others',
        medium: 'Charming speakers with persuasive personalities',
        low: 'Prefer actions over words, quiet but reliable'
      },
      constitution: {
        high: 'Iron constitutions that can endure any hardship',
        medium: 'Hardy and resilient with good endurance',
        low: 'Delicate but compensate with other strengths'
      }
    };

    const level = avgStat >= 15 ? 'high' : avgStat >= 12 ? 'medium' : 'low';
    return descriptions[statName]?.[level] || 'Unknown trait';
  }

  function getSizeDescription(size: string): string {
    const descriptions: Record<string, string> = {
      tiny: 'Diminutive beings who make up for their small stature with cleverness',
      small: 'Compact and agile, perfectly suited for swift movement',
      medium: 'Of average humanoid proportions, well-balanced in all aspects',
      large: 'Imposing figures whose presence commands respect',
      huge: 'Massive beings whose very footsteps shake the earth'
    };
    return descriptions[size] || 'Unknown size';
  }

  function getPhysicalDescription(race: any): string {
    if (!race?.physicalTraits) return '';

    const { heightRange, weightRange, size } = race.physicalTraits;
    const avgHeight = Math.round((heightRange[0] + heightRange[1]) / 2);
    const avgWeight = Math.round((weightRange[0] + weightRange[1]) / 2);

    return `Standing ${avgHeight}cm tall and weighing around ${avgWeight}kg, ${getSizeDescription(size).toLowerCase()}. Their forms vary from ${heightRange[0]}cm to ${heightRange[1]}cm in height, with builds ranging from ${weightRange[0]}kg to ${weightRange[1]}kg.`;
  }

  function formatEffectValue(effectName: string, effectValue: any): string {
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

  function getImplicationDescription(category: string, implication: string | null): string {
    const descriptions: Record<string, string> = {
      knowledge: `📚 Their pursuit of wisdom`,
      food: `🍖 Their sustenance traditions`,
      combat: `⚔️ Their warfare customs`,
      diplomacy: `🤝 Their social interactions`
    };

    if (implication) {
      return `${descriptions[category]}: ${implication}`;
    } else {
      return descriptions[category] || category;
    }
  }
</script>

<div class="race-screen" bind:this={raceScreenElement}>
  <div class="screen-hdr">| RACE — {race?.name?.toUpperCase() || 'UNKNOWN'}</div>

  {#if race}
    <!-- Quick nav -->
    <div class="nav-row">
      <button class="nav-btn" on:click={() => scrollToSection('overview')}>OVERVIEW</button>
      <button class="nav-btn" on:click={() => scrollToSection('physical')}>PHYSICAL</button>
      <button class="nav-btn" on:click={() => scrollToSection('stats')}>STATS</button>
      <button class="nav-btn" on:click={() => scrollToSection('traits')}>TRAITS</button>
    </div>

    <!-- Overview -->
    <div id="overview">
      <div class="section-hdr">| OVERVIEW</div>
      <div class="row">
        <span class="lbl">POPULATION</span><span class="val">{race.population}</span>
      </div>
      <div class="row">
        <span class="lbl">SIZE</span><span class="val"
          >{race.physicalTraits?.size || 'unknown'}</span
        >
      </div>
      <div class="row">
        <span class="lbl">TRAITS</span><span class="val">{race.racialTraits?.length || 0}</span>
      </div>
    </div>

    <!-- Physical -->
    <div id="physical">
      <div class="section-hdr">| PHYSICAL</div>
      <div class="row">
        <span class="lbl">HEIGHT</span><span class="val"
          >{race.physicalTraits?.heightRange?.[0]}–{race.physicalTraits?.heightRange?.[1]}cm</span
        >
      </div>
      <div class="row">
        <span class="lbl">WEIGHT</span><span class="val"
          >{race.physicalTraits?.weightRange?.[0]}–{race.physicalTraits?.weightRange?.[1]}kg</span
        >
      </div>
      <div class="row">
        <span class="lbl">BUILD</span><span class="val"
          >{getSizeDescription(race.physicalTraits?.size || '')}</span
        >
      </div>
    </div>

    <!-- Stat Ranges -->
    <div id="stats">
      <div class="section-hdr">| STAT RANGES</div>
      {#each Object.entries(race.statRanges || {}) as [statName, statRangeRaw]}
        {#if Array.isArray(statRangeRaw) && statRangeRaw.length === 2}
          {@const statRange = statRangeRaw as [number, number]}
          <div class="stat-row">
            <span class="stat-name">{statName.toUpperCase()}</span>
            <div class="bar">
              <div
                class="fill"
                style="width: {(statRange[1] / 20) * 100}%; background: {getStatRangeColor(
                  statRange
                )}"
              ></div>
            </div>
            <span class="stat-val" style="color: {getStatRangeColor(statRange)}"
              >{statRange[0]}–{statRange[1]}</span
            >
          </div>
        {/if}
      {/each}
    </div>

    <!-- Traits -->
    <div id="traits">
      <div class="section-hdr">| TRAITS ({race.racialTraits?.length || 0})</div>
      {#if race.racialTraits && race.racialTraits.length > 0}
        {#each race.racialTraits as trait}
          <div class="trait-name">{trait.name.toUpperCase()}</div>
          <div class="desc-row">{trait.description}</div>
          {#each Object.entries(trait.effects || {}) as [effectName, effectValue]}
            <div class="row">
              <span class="lbl">EFFECT</span>
              <span class="val">
                {#if effectName.includes('Bonus')}
                  <span class="pos"
                    >+{effectValue} {effectName.replace('Bonus', '').toLowerCase()}</span
                  >
                {:else if effectName.includes('Penalty')}
                  <span class="neg"
                    >{effectValue} {effectName.replace('Penalty', '').toLowerCase()}</span
                  >
                {:else if effectValue && typeof effectValue === 'object'}
                  {#each Object.entries(effectValue as Record<string, number>) as [workType, multiplier]}
                    <span class={multiplier >= 1 ? 'pos' : 'neg'}
                      >{multiplier >= 1 ? '+' : ''}{Math.round((multiplier - 1) * 100)}% {workType}
                      {workAxisLabel(effectName)}</span
                    >
                  {/each}
                {:else}
                  {effectName.replace(/([A-Z])/g, ' $1').trim()}: {formatEffectValue(
                    effectName,
                    effectValue
                  )}
                {/if}
              </span>
            </div>
          {/each}
        {/each}
      {:else}
        <div class="row"><span class="muted">no racial traits</span></div>
      {/if}
    </div>
  {:else}
    <div class="row"><span class="muted">loading race information...</span></div>
  {/if}
</div>

<style>
  .race-screen {
    height: 100%;
    overflow-y: auto;
    background: var(--bg);
    color: var(--text);
    font-family: 'Courier New', monospace;
    font-size: 11px;
    display: flex;
    flex-direction: column;
  }

  .screen-hdr {
    padding: 5px 10px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 11px;
    letter-spacing: 0.08em;
    border-bottom: 1px solid var(--border-hi);
    flex-shrink: 0;
  }

  .nav-row {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .nav-btn {
    padding: 4px 10px;
    background: transparent;
    border: none;
    border-right: 1px solid var(--border);
    color: var(--text-dim);
    cursor: pointer;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    letter-spacing: 0.04em;
  }
  .nav-btn:hover {
    color: var(--accent-hi);
    background: var(--bg-hover);
  }

  .section-hdr {
    padding: 4px 8px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 11px;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
    border-top: 1px solid var(--border);
    margin-top: 1px;
  }

  .row {
    display: flex;
    padding: 2px 8px;
    align-items: baseline;
    gap: 6px;
  }
  .row:hover {
    background: var(--bg-hover);
  }

  .lbl {
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 11px;
    width: 100px;
    flex-shrink: 0;
  }

  .val {
    color: var(--text);
    font-size: 11px;
    margin-left: auto;
    text-align: right;
  }

  .stat-row {
    display: flex;
    align-items: center;
    padding: 3px 8px;
    gap: 8px;
  }
  .stat-row:hover {
    background: var(--bg-hover);
  }

  .stat-name {
    color: var(--text-dim);
    font-size: 11px;
    letter-spacing: 0.04em;
    width: 100px;
    flex-shrink: 0;
  }

  .bar {
    flex: 1;
    height: 4px;
    background: var(--bg-active);
  }
  .fill {
    height: 100%;
  }

  .stat-val {
    font-size: 11px;
    font-weight: bold;
    width: 40px;
    text-align: right;
    flex-shrink: 0;
  }

  .trait-name {
    padding: 3px 8px;
    color: var(--accent-hi);
    font-size: 11px;
    letter-spacing: 0.04em;
    border-bottom: 1px solid var(--border);
    margin-top: 2px;
  }

  .desc-row {
    padding: 2px 8px 3px 16px;
    color: var(--text-muted);
    font-size: 11px;
    font-style: italic;
    border-bottom: 1px solid var(--border);
  }

  .pos {
    color: var(--pos);
  }
  .neg {
    color: var(--neg);
  }
  .muted {
    color: var(--text-muted);
    font-style: italic;
    font-size: 11px;
    padding: 4px 8px;
  }
</style>
