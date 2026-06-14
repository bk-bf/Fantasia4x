<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { formatEffectValue, workAxisLabel } from '$lib/utils/pawnUtils';

  export let pawn: Pawn;

  function getEffectTags(
    trait: Pawn['racialTraits'][number]
  ): { text: string; type: 'pos' | 'neg' | 'neutral' }[] {
    const tags: { text: string; type: 'pos' | 'neg' | 'neutral' }[] = [];
    for (const [effectName, effectValue] of Object.entries(trait.effects || {})) {
      if (effectName.includes('Bonus')) {
        tags.push({
          text: `+${effectValue} ${effectName.replace('Bonus', '').toLowerCase()}`,
          type: 'pos'
        });
      } else if (effectName.includes('Penalty')) {
        tags.push({
          text: `${effectValue} ${effectName.replace('Penalty', '').toLowerCase()}`,
          type: 'neg'
        });
      } else if (effectValue && typeof effectValue === 'object') {
        // Any work-modifier map (workSpeed/workYield/workQuality, or legacy workEfficiency).
        const axis = workAxisLabel(effectName);
        for (const [workType, multiplier] of Object.entries(
          effectValue as Record<string, number>
        )) {
          const pct = Math.round((multiplier - 1) * 100);
          tags.push({
            text: `${pct >= 0 ? '+' : ''}${pct}% ${workType} ${axis}`,
            type: pct >= 0 ? 'pos' : 'neg'
          });
        }
      } else {
        tags.push({
          text: `${effectName.replace(/([A-Z])/g, ' $1').trim()}: ${formatEffectValue(effectName, effectValue)}`,
          type: 'neutral'
        });
      }
    }
    return tags;
  }
</script>

<div class="traits-section">
  <div class="section-hdr">| TRAITS ({pawn.racialTraits?.length || 0})</div>
  {#if pawn.racialTraits && pawn.racialTraits.length > 0}
    <div class="cards-grid">
      {#each pawn.racialTraits as trait}
        {@const tags = getEffectTags(trait)}
        <div class="trait-card">
          <div class="card-accent"></div>
          <div class="card-body">
            <div class="card-header">{trait.name.toUpperCase()}</div>
            <div class="card-desc">{trait.description}</div>
            {#if tags.length > 0}
              <div class="card-tags">
                {#each tags as tag}
                  <span
                    class="tag"
                    class:pos={tag.type === 'pos'}
                    class:neg={tag.type === 'neg'}
                    class:neutral={tag.type === 'neutral'}
                  >
                    {tag.text}
                  </span>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="empty-row"><span class="muted">no racial traits</span></div>
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

  .cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 6px;
    padding: 6px 8px;
  }

  .trait-card {
    display: flex;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 2px;
    overflow: hidden;
    transition: border-color 0.15s ease;
  }
  .trait-card:hover {
    border-color: var(--border-hi);
  }

  .card-accent {
    width: 3px;
    flex-shrink: 0;
    background: var(--accent);
  }

  .card-body {
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }

  .card-header {
    color: var(--accent-hi);
    font-size: 11px;
    letter-spacing: 0.04em;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card-desc {
    color: var(--text-muted);
    font-size: 10px;
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    margin-top: 2px;
  }

  .tag {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 2px;
    background: var(--bg-active);
    border: 1px solid var(--border);
    white-space: nowrap;
  }

  .tag.pos {
    color: var(--pos);
    border-color: rgba(104, 176, 48, 0.35);
  }

  .tag.neg {
    color: var(--neg);
    border-color: rgba(200, 48, 24, 0.35);
  }

  .tag.neutral {
    color: var(--text-dim);
    border-color: var(--border);
  }

  .empty-row {
    padding: 6px 8px;
  }

  .muted {
    color: var(--text-muted);
    font-style: italic;
    font-size: 11px;
  }
</style>
