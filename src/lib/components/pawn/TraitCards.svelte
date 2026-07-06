<!-- TraitCards.svelte — shared trait-card grid used by BOTH the pawn STATUS tab (PawnTraits) and the
     RACE detail tab, so there's one source of truth for how a trait renders. Each card: a rarity-
     coloured accent (tier → rarities.jsonc colour), name, description, health-pill-style effect chips,
     and a cursor-following hover tooltip with the full breakdown. -->
<script lang="ts">
  import type { Trait } from '$lib/game/core/types';
  import { workAxisLabel } from '$lib/components/util/pawnUtils';
  import { getTransientConditionDef } from '$lib/game/core/needs';
  import { gameCoordinator } from '$lib/game/systems/GameCoordinator';
  import raritiesData from '$lib/game/database/rarities.jsonc';
  import HoverTip from '$lib/components/UI/HoverTip.svelte';

  let {
    traits,
    guaranteedCount = undefined
  }: {
    traits: Trait[];
    /** When set (race view), the first N traits are the race's shared identity; the rest "vary" per
     *  pawn. Omitted for a pawn's own traits (they're just the pawn's traits). */
    guaranteedCount?: number;
  } = $props();

  // ── Rarity colour (tier → rarities.jsonc) ──────────────────────────────────
  const RARITY_COLOR: Record<string, string> = Object.fromEntries(
    (raritiesData as { id: string; color: string }[]).map((r) => [r.id, r.color])
  );
  const TIER_RARITY: Record<string, string> = {
    mundane: 'common',
    supernatural: 'epic',
    legendary: 'legendary'
  };
  const rarityColor = (t: Trait) => RARITY_COLOR[TIER_RARITY[t.tier ?? 'mundane']] ?? '#9E9E9E';

  const STAT_ABBR: Record<string, string> = {
    strength: 'STR',
    dexterity: 'DEX',
    intelligence: 'INT',
    perception: 'PER',
    charisma: 'CHA',
    constitution: 'CON'
  };
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

  // A pill = a short LABEL + a VALUE, exactly like the health-tab StatPills (e.g. "STR +2").
  type Tag = { label: string; value: string; type: 'pos' | 'neg' | 'neutral' };
  // Pill tint per polarity — feeds the StatPills-style label/value colour-mix.
  const PILL_TINT: Record<Tag['type'], string> = {
    pos: '#6fae3a',
    neg: '#c65a3a',
    neutral: '#b8965a'
  };
  const axisShort = (name: string) =>
    name === 'workSpeed'
      ? 'spd'
      : name === 'workYield'
        ? 'yld'
        : name === 'workQuality'
          ? 'qual'
          : workAxisLabel(name);

  function getEffectTags(trait: Trait): Tag[] {
    const tags: Tag[] = [];
    // ADR-023 capabilities (id-free — the tooltip names the specifics).
    const cond = trait.selfCondition ? getTransientConditionDef(trait.selfCondition) : undefined;
    if (cond?.grantsNaturalWeapon?.length)
      tags.push({ label: 'natural weapon', value: '', type: 'pos' });
    if (cond?.grantsNaturalArmor)
      tags.push({ label: 'nat armor', value: `+${cond.grantsNaturalArmor}`, type: 'pos' });
    if (trait.onHitEffect) tags.push({ label: 'on-hit', value: 'proc', type: 'pos' });
    if (trait.weaponBonus?.damage)
      tags.push({
        label: 'weapon',
        value: `+${Math.round(trait.weaponBonus.damage * 100)}%`,
        type: 'pos'
      });
    if (trait.blocksSlots?.length) tags.push({ label: 'blocks', value: 'gear', type: 'neg' });
    for (const [name, value] of Object.entries(trait.effects || {})) {
      if (name.endsWith('Bonus') && typeof value === 'number') {
        const stat = name.replace('Bonus', '');
        tags.push({ label: STAT_ABBR[stat] ?? stat, value: `+${value}`, type: 'pos' });
      } else if (name.endsWith('Penalty') && typeof value === 'number') {
        const stat = name.replace('Penalty', '');
        // A penalty is stored positive — render it SIGNED so it reads "CHA -1".
        tags.push({ label: STAT_ABBR[stat] ?? stat, value: `-${value}`, type: 'neg' });
      } else if (value && typeof value === 'object') {
        for (const [workType, mul] of Object.entries(value as Record<string, number>)) {
          const pct = Math.round((mul - 1) * 100);
          tags.push({
            label: workType,
            value: `${pct >= 0 ? '+' : ''}${pct}% ${axisShort(name)}`,
            type: pct >= 0 ? 'pos' : 'neg'
          });
        }
      } else if (typeof value === 'number' && value !== 0) {
        // Resistances / nightVision / healRate — a 0-baseline stat shown as a signed percentage.
        const label = name
          .replace(/_/g, ' ')
          .replace(/([A-Z])/g, ' $1')
          .replace(/resistance/i, 'res')
          .trim()
          .toLowerCase();
        const pct = Math.round(value * 100);
        tags.push({
          label,
          value: `${pct >= 0 ? '+' : ''}${pct}%`,
          type: pct >= 0 ? 'pos' : 'neg'
        });
      }
    }
    return tags;
  }

  // ── Tooltip data ───────────────────────────────────────────────────────────
  function condName(t: Trait): string | null {
    return t.selfCondition ? (getTransientConditionDef(t.selfCondition)?.name ?? null) : null;
  }
  function naturalWeaponNames(t: Trait): string[] {
    const cond = t.selfCondition ? getTransientConditionDef(t.selfCondition) : undefined;
    return (cond?.grantsNaturalWeapon ?? [])
      .map((id) => gameCoordinator.getItemById(id)?.name)
      .filter((n): n is string => !!n);
  }
  function naturalArmorOf(t: Trait): number {
    const cond = t.selfCondition ? getTransientConditionDef(t.selfCondition) : undefined;
    return cond?.grantsNaturalArmor ?? 0;
  }
  function blockedLabels(t: Trait): string[] {
    return (t.blocksSlots ?? []).map((s) => SLOT_LABEL[s] ?? s);
  }

  let hovered = $state<{ trait: Trait; x: number; y: number } | null>(null);
  function showTip(trait: Trait, e: MouseEvent) {
    hovered = { trait, x: e.clientX, y: e.clientY };
  }
  function moveTip(e: MouseEvent) {
    if (hovered) hovered = { ...hovered, x: e.clientX, y: e.clientY };
  }
  function hideTip() {
    hovered = null;
  }
</script>

<div class="cards-grid">
  {#each traits as trait, i (trait.id ?? trait.name)}
    {@const tags = getEffectTags(trait)}
    <div
      class="trait-card"
      style="--rarity: {rarityColor(trait)}"
      role="presentation"
      onmouseenter={(e) => showTip(trait, e)}
      onmousemove={moveTip}
      onmouseleave={hideTip}
    >
      <div class="card-accent"></div>
      <div class="card-body">
        <div class="card-header">
          <span class="card-name">{trait.name.toUpperCase()}</span>
          {#if guaranteedCount != null}
            <span class="ident-mk" class:always={i < guaranteedCount}
              >{i < guaranteedCount ? 'every member' : 'some'}</span
            >
          {/if}
        </div>
        <div class="card-desc">{trait.description}</div>
        {#if tags.length > 0}
          <div class="card-tags">
            {#each tags as tag}
              <span
                class="chip"
                class:warn={tag.type === 'neg'}
                style="--pill: {PILL_TINT[tag.type]}"
                ><span class="pill-k">{tag.label}</span>{#if tag.value}<span class="pill-v"
                    >{tag.value}</span
                  >{/if}</span
              >
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/each}
</div>

{#if hovered}
  {@const t = hovered.trait}
  {@const cn = condName(t)}
  {@const nw = naturalWeaponNames(t)}
  {@const na = naturalArmorOf(t)}
  {@const bl = blockedLabels(t)}
  <!-- Routed through the shared HoverTip so it inherits the viewport flip/clamp (never clips an edge). -->
  <HoverTip x={hovered.x} y={hovered.y}>
    <div class="tip-name" style="color: {rarityColor(t)}">{t.name}</div>
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
  </HoverTip>
{/if}

<style>
  .cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 6px;
    padding: 6px 8px;
  }

  /* Rarity-coloured accent + a faint tinted border, so a supernatural/legendary pull reads apart. */
  .trait-card {
    display: flex;
    background: var(--bg-panel);
    border: 1px solid color-mix(in srgb, var(--rarity) 45%, var(--border));
    border-radius: 2px;
    overflow: hidden;
    transition: border-color 0.15s ease;
  }
  .trait-card:hover {
    border-color: var(--rarity);
  }
  .card-accent {
    width: 3px;
    flex-shrink: 0;
    background: var(--rarity);
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
    align-items: baseline;
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
  .ident-mk {
    flex-shrink: 0;
    font-size: 9px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  .ident-mk.always {
    color: var(--pos, #68b030);
  }
  .card-desc {
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    margin-top: 3px;
  }
  /* Exactly the health-tab StatPills look: no border, dark tinted fill, dim uppercase LABEL + bright
     bold VALUE, tinted per polarity (green bonus / red penalty). */
  .chip {
    display: flex;
    align-items: center;
    gap: 3px;
    border: 0;
    background: color-mix(in srgb, var(--pill) 14%, rgba(28, 16, 6, 0.92));
    padding: 0 4px;
    height: 13px;
    font-size: 9px;
    line-height: 1;
    white-space: nowrap;
  }
  .chip.warn {
    background: color-mix(in srgb, var(--pill) 22%, rgba(40, 12, 6, 0.92));
  }
  .pill-k {
    color: color-mix(in srgb, var(--pill) 45%, #9a8458);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .pill-v {
    color: color-mix(in srgb, var(--pill) 75%, #e8c870);
    font-weight: bold;
  }

  /* Tooltip frame/position/clamping comes from the shared HoverTip; only the content is styled here. */
  .tip-name {
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
