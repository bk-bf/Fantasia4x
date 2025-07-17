<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { getTraitIcon } from '$lib/game/core/Race';
  import { formatEffectValue } from '$lib/utils/pawnUtils';

  export let pawn: Pawn;
</script>

<div class="traits-section" id="traits">
  <h3>✨ Racial Traits ({pawn.racialTraits?.length || 0})</h3>
  {#if pawn.racialTraits && pawn.racialTraits.length > 0}
    <div class="traits-grid">
      {#each pawn.racialTraits as trait}
        <div class="trait-card">
          <div class="trait-card-header">
            <span class="trait-icon">{trait.icon || getTraitIcon(trait.name)}</span>
            <div class="trait-title">
              <h4>{trait.name}</h4>
              <div class="trait-meta">
                <span class="trait-category">Inherited Trait</span>
              </div>
            </div>
          </div>

          <p class="trait-description">{trait.description}</p>

          <!-- Trait Effects -->
          <div class="trait-effects">
            <h5>Effects on {pawn.name}:</h5>
            <div class="effects-list">
              {#each Object.entries(trait.effects || {}) as [effectName, effectValue]}
                <div class="effect-item">
                  {#if effectName.includes('Bonus')}
                    +{effectValue} {effectName.replace('Bonus', '').toLowerCase()}
                  {:else if effectName.includes('Penalty')}
                    {effectValue} {effectName.replace('Penalty', '').toLowerCase()}
                  {:else if effectName === 'workEfficiency'}
                    {#each Object.entries(effectValue) as [workType, multiplier]}
                      +{Math.round((multiplier - 1) * 100)}% {workType} efficiency
                    {/each}
                  {:else}
                    {effectName.replace(/([A-Z])/g, ' $1').trim()}: {formatEffectValue(
                      effectName,
                      effectValue
                    )}
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="no-traits">
      <p>This pawn has no racial traits.</p>
    </div>
  {/if}
</div>

<style>
  .traits-section {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 25px;
    margin-bottom: 30px;
    border-left: 4px solid #9c27b0;
  }

  .traits-section h3 {
    color: #9c27b0;
    margin: 0 0 25px 0;
    font-size: 1.4em;
    text-shadow: 0 0 10px rgba(156, 39, 176, 0.3);
  }

  .traits-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
    gap: 20px;
  }

  .trait-card {
    background: #000000;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 20px;
    transition: all 0.3s ease;
  }

  .trait-card:hover {
    border-color: #9c27b0;
    box-shadow: 0 0 15px rgba(156, 39, 176, 0.2);
  }

  .trait-card-header {
    display: flex;
    align-items: center;
    gap: 15px;
    margin-bottom: 15px;
  }

  .trait-icon {
    font-size: 2em;
    flex-shrink: 0;
  }

  .trait-title h4 {
    color: #9c27b0;
    margin: 0 0 5px 0;
    font-size: 1.2em;
  }

  .trait-meta {
    display: flex;
    gap: 10px;
  }

  .trait-category {
    background: rgba(156, 39, 176, 0.2);
    color: #9c27b0;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.75em;
    font-weight: bold;
  }

  .trait-description {
    color: #ccc;
    margin: 0 0 20px 0;
    line-height: 1.5;
  }

  .trait-effects h5 {
    color: #9c27b0;
    margin: 0 0 10px 0;
    font-size: 1em;
  }

  .effects-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .effect-item {
    background: rgba(156, 39, 176, 0.1);
    padding: 8px 12px;
    border-radius: 4px;
    color: #e0e0e0;
    font-size: 0.9em;
    border-left: 3px solid #9c27b0;
  }

  .no-traits {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 40px;
    text-align: center;
    color: #888;
    border: 2px dashed #333;
  }

  @media (max-width: 768px) {
    .traits-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
