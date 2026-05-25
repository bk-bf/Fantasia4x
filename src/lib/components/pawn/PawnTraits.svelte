<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { formatEffectValue } from '$lib/utils/pawnUtils';

  export let pawn: Pawn;
</script>

<div class="traits-section">
  <div class="section-hdr">| TRAITS ({pawn.racialTraits?.length || 0})</div>
  {#if pawn.racialTraits && pawn.racialTraits.length > 0}
    {#each pawn.racialTraits as trait}
      <div class="trait-name">{trait.name.toUpperCase()}</div>
      <div class="desc-row">{trait.description}</div>
      {#each Object.entries(trait.effects || {}) as [effectName, effectValue]}
        <div class="row">
          <span class="lbl">EFFECT</span>
          <span class="val">
            {#if effectName.includes('Bonus')}
              <span class="pos">+{effectValue} {effectName.replace('Bonus', '').toLowerCase()}</span>
            {:else if effectName.includes('Penalty')}
              <span class="neg">{effectValue} {effectName.replace('Penalty', '').toLowerCase()}</span>
            {:else if effectName === 'workEfficiency'}
              {#each Object.entries(effectValue as Record<string, number>) as [workType, multiplier]}
                <span class="pos">+{Math.round((multiplier - 1) * 100)}% {workType} eff</span>
              {/each}
            {:else}
              {effectName.replace(/([A-Z])/g, ' $1').trim()}: {formatEffectValue(effectName, effectValue)}
            {/if}
          </span>
        </div>
      {/each}
    {/each}
  {:else}
    <div class="row"><span class="muted">no racial traits</span></div>
  {/if}
</div>

<style>
  .traits-section {
    border-bottom: 1px solid var(--border);
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

  .row {
    display: flex;
    padding: 2px 8px;
    align-items: baseline;
    gap: 6px;
  }
  .row:hover { background: var(--bg-hover); }

  .lbl {
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 11px;
    width: 70px;
    flex-shrink: 0;
  }

  .val {
    color: var(--text);
    font-size: 11px;
    margin-left: auto;
  }

  .pos { color: var(--pos); }
  .neg { color: var(--neg); }
  .muted { color: var(--text-muted); font-style: italic; font-size: 11px; }
</style>
