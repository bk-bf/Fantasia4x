<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { formatEffectValue, workAxisLabel } from '$lib/components/util/pawnUtils';
  import { getTransientConditionDef } from '$lib/game/core/needs';
  import { gameCoordinator } from '$lib/game/systems/GameCoordinator';

  export let pawn: Pawn;

  type TraitT = Pawn['traits'][number];

  // Human labels — never leak slot ids / tier internals into the tooltip.
  const SLOT_LABEL: Record<string, string> = {
    mainHand: 'Main Hand',
    offHand: 'Off Hand',
    gloves: 'Hands',
    headOuter: 'Helm',
    headBase: 'Head',
    bodyOuter: 'Outer',
    bodyMid: 'Mid',
    bodyBase: 'Base',
    boots: 'Feet',
    gorget: 'Neck',
    belt: 'Belt',
    back: 'Back',
    amulet: 'Amulet',
    ring: 'Ring',
    ring2: 'Ring'
  };
  const RARITY_LABEL: Record<string, string> = {
    mundane: 'Common',
    supernatural: 'Supernatural',
    legendary: 'Legendary'
  };

  function condName(t: TraitT): string | null {
    return t.selfCondition ? (getTransientConditionDef(t.selfCondition)?.name ?? null) : null;
  }
  function naturalWeaponNames(t: TraitT): string[] {
    const cond = t.selfCondition ? getTransientConditionDef(t.selfCondition) : undefined;
    return (cond?.grantsNaturalWeapon ?? [])
      .map((id) => gameCoordinator.getItemById(id)?.name)
      .filter((n): n is string => !!n);
  }
  function naturalArmorOf(t: TraitT): number {
    const cond = t.selfCondition ? getTransientConditionDef(t.selfCondition) : undefined;
    return cond?.grantsNaturalArmor ?? 0;
  }
  function blockedLabels(t: TraitT): string[] {
    return (t.blocksSlots ?? []).map((s) => SLOT_LABEL[s] ?? s);
  }

  // Hover tooltip — the card body is line-clamped, so the full description + linked condition /
  // rarity / natural gear / blocked slots are surfaced here on inspection.
  let hovered: { trait: TraitT; x: number; y: number } | null = null;
  function showTip(trait: TraitT, e: MouseEvent) {
    hovered = { trait, x: e.clientX, y: e.clientY };
  }
  function moveTip(e: MouseEvent) {
    if (hovered) hovered = { ...hovered, x: e.clientX, y: e.clientY };
  }
  function hideTip() {
    hovered = null;
  }

  function getEffectTags(
    trait: Pawn['traits'][number]
  ): { text: string; type: 'pos' | 'neg' | 'neutral' }[] {
    const tags: { text: string; type: 'pos' | 'neg' | 'neutral' }[] = [];
    // ADR-023 capabilities — kept id-free (the prose description names the specifics; here we only
    // summarise the mechanic, so no backend id ever leaks into the panel). Natural weapon/armor are
    // resolved through the trait's `selfCondition` DEF — the single source both this panel and the
    // health pill read.
    const cond = trait.selfCondition ? getTransientConditionDef(trait.selfCondition) : undefined;
    if (cond?.grantsNaturalWeapon?.length) tags.push({ text: 'natural weapon', type: 'pos' });
    if (cond?.grantsNaturalArmor)
      tags.push({ text: `+${cond.grantsNaturalArmor} natural armor`, type: 'pos' });
    if (trait.onHitEffect) tags.push({ text: 'on-hit effect', type: 'pos' });
    if (trait.weaponBonus?.damage)
      tags.push({
        text: `+${Math.round(trait.weaponBonus.damage * 100)}% weapon damage`,
        type: 'pos'
      });
    if (trait.blocksSlots?.length) tags.push({ text: 'blocks gear', type: 'neg' });
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
  <div class="section-hdr">| TRAITS ({pawn.traits?.length || 0})</div>
  {#if pawn.traits && pawn.traits.length > 0}
    <div class="cards-grid">
      {#each pawn.traits as trait}
        {@const tags = getEffectTags(trait)}
        <div
          class="trait-card"
          role="presentation"
          on:mouseenter={(e) => showTip(trait, e)}
          on:mousemove={moveTip}
          on:mouseleave={hideTip}
        >
          <div class="card-accent"></div>
          <div class="card-body">
            <div class="card-header">
              <span class="card-name">{trait.name.toUpperCase()}</span>
            </div>
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
    <div class="empty-row"><span class="muted">no traits</span></div>
  {/if}
</div>

{#if hovered}
  {@const t = hovered.trait}
  {@const cn = condName(t)}
  {@const nw = naturalWeaponNames(t)}
  {@const na = naturalArmorOf(t)}
  {@const bl = blockedLabels(t)}
  <div class="trait-tip" style="left:{hovered.x + 14}px; top:{hovered.y + 12}px">
    <div class="tip-name">{t.name}</div>
    <div class="tip-meta">
      {RARITY_LABEL[t.tier ?? 'mundane']} · {t.scope === 'personal' ? 'personal' : 'racial'} trait
    </div>
    <div class="tip-desc">{t.description}</div>
    {#if t.flavorLine}<div class="tip-flavor">“{t.flavorLine}”</div>{/if}
    {#if cn}<div class="tip-row"><span class="tip-lbl">Condition</span> {cn}</div>{/if}
    {#if nw.length}<div class="tip-row">
        <span class="tip-lbl">Natural weapon</span>
        {nw.join(', ')}
      </div>{/if}
    {#if na}<div class="tip-row"><span class="tip-lbl">Natural armor</span> +{na}</div>{/if}
    {#if bl.length}
      <div class="tip-row neg"><span class="tip-lbl">Blocks gear</span> {bl.join(', ')}</div>
    {/if}
  </div>
{/if}

<style>
  .traits-section {
    border-bottom: 1px solid var(--border);
  }

  .section-hdr {
    padding: 4px 8px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 12px;
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
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--accent-hi);
    font-size: 12px;
    letter-spacing: 0.04em;
    font-weight: 600;
    min-width: 0;
  }
  .card-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card-desc {
    color: var(--text-muted);
    font-size: 11px;
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
    font-size: 11px;
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
    font-size: 12px;
  }

  /* Hover tooltip — full trait detail (the card body is line-clamped). */
  .trait-tip {
    position: fixed;
    z-index: 60;
    pointer-events: none;
    max-width: 260px;
    padding: 7px 9px;
    background: var(--bg-panel);
    border: 1px solid var(--border-hi);
    border-radius: 3px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
    font-size: 11px;
    line-height: 1.35;
  }
  .tip-name {
    color: var(--accent-hi);
    font-weight: 600;
    letter-spacing: 0.03em;
  }
  .tip-meta {
    color: var(--text-dim);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 3px;
  }
  .tip-desc {
    color: var(--text);
  }
  .tip-flavor {
    color: var(--text-muted);
    font-style: italic;
    margin-top: 3px;
  }
  .tip-row {
    margin-top: 3px;
    color: var(--text);
  }
  .tip-row.neg {
    color: var(--neg);
  }
  .tip-lbl {
    color: var(--text-dim);
    text-transform: uppercase;
    font-size: 9px;
    letter-spacing: 0.05em;
    margin-right: 4px;
  }
</style>
