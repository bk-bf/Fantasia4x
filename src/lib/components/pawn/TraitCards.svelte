<!-- TraitCards.svelte — shared trait-card grid used by BOTH the pawn STATUS tab (PawnTraits) and the
     RACE detail tab, so there's one source of truth for how a trait renders. Each card: a rarity-
     coloured accent (tier → rarities.jsonc colour), name, description, health-pill-style effect chips,
     and a cursor-following hover tooltip with the full breakdown. -->
<script lang="ts">
  import type { Trait, Pawn } from '$lib/game/core/types';
  import { workAxisLabel } from '$lib/components/util/pawnUtils';
  import { partLabel, limbLabel } from '$lib/utils/bodyLabels';
  import { getTransientConditionDef } from '$lib/game/core/needs';
  import { gameCoordinator } from '$lib/game/systems/GameCoordinator';
  import raritiesData from '$lib/game/database/rarities.jsonc';
  import HoverTip from '$lib/components/UI/HoverTip.svelte';

  let {
    traits,
    guaranteedCount = undefined,
    pawn = undefined
  }: {
    traits: Trait[];
    /** When set (race view), the first N traits are the race's shared identity; the rest "vary" per
     *  pawn. Omitted for a pawn's own traits (they're just the pawn's traits). */
    guaranteedCount?: number;
    /** The owning pawn (STATUS tab only). Lets a wound trait's hover cite the ACTUAL wounded side —
     *  the applier flips left/right per pawn, so the trait data alone can't say which. Absent (race
     *  view) ⇒ the hover stays side-agnostic. */
    pawn?: Pawn;
  } = $props();

  // ── Rarity colour + label (the trait's `rarity` IS a rarities.jsonc id) ─────
  const RARITIES = raritiesData as { id: string; name: string; color: string }[];
  const RARITY_COLOR: Record<string, string> = Object.fromEntries(
    RARITIES.map((r) => [r.id, r.color])
  );
  const RARITY_LABEL: Record<string, string> = Object.fromEntries(
    RARITIES.map((r) => [r.id, r.name])
  );
  const rarityColor = (t: Trait) => RARITY_COLOR[t.rarity ?? 'common'] ?? '#9E9E9E';

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

  // A pill = a short LABEL + a VALUE, exactly like the health-tab StatPills (e.g. "STR +2").
  // `tip` (optional) = a hover tooltip on the PILL itself — used for a trait's granted condition
  // ("＋ hydro-vigor") so hovering the pill explains the condition (TRAIT-LIBRARY-EXPANSION §6b).
  type Tag = { label: string; value: string; type: 'pos' | 'neg' | 'neutral'; tip?: string };

  // Human sentence for a condition's activateWhen predicate — "active while wet ≥ 50" etc.
  const PRED_NEED_LABEL: Record<string, string> = {
    wetness: 'wet',
    coldExposure: 'cold',
    heatExposure: 'hot',
    hunger: 'hungry',
    thirst: 'thirsty',
    fatigue: 'tired',
    hygiene: 'filthy'
  };
  function describePredicate(w: NonNullable<ReturnType<typeof getTransientConditionDef>>['activateWhen']): string {
    if (!w) return '';
    const bits: string[] = [];
    if (w.need) bits.push(PRED_NEED_LABEL[w.need] ?? w.need);
    if (w.meter === 'bloodFrac') bits.push('bleeding low');
    else if (w.meter === 'pain') bits.push('in pain');
    else if (w.meter === 'ambientLight') bits.push((w.atOrBelow ?? 1) <= 0.5 ? 'in the dark' : 'in daylight');
    if (w.hasCondition) bits.push(getTransientConditionDef(w.hasCondition)?.name?.toLowerCase() ?? w.hasCondition.replace(/_/g, ' '));
    if (w.unsheltered) bits.push('under open sky');
    return bits.join(' + ');
  }
  // Tooltip text for a granted condition pill: description + live modifiers + when it's active.
  function conditionTip(condId: string): string {
    const cond = getTransientConditionDef(condId);
    if (!cond) return '';
    const mods = Object.entries(cond.modifiers ?? {})
      .filter(([, v]) => typeof v === 'number' && v !== 1)
      .map(([k, v]) => {
        const pct = Math.round(((v as number) - 1) * 100);
        return `${k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').toLowerCase()} ${pct >= 0 ? '+' : ''}${pct}%`;
      });
    const when = cond.activateWhen ? `active while ${describePredicate(cond.activateWhen)}` : null;
    const proc = cond.triggers?.length
      ? 'can trigger: ' + cond.triggers.map((tr) => getTransientConditionDef(tr.to)?.name ?? tr.to.replace(/_/g, ' ')).join(', ')
      : null;
    return [cond.description, mods.join(' · '), when, proc].filter(Boolean).join('\n');
  }
  // Pill tint per polarity — feeds the StatPills-style label/value colour-mix.
  const PILL_TINT: Record<Tag['type'], string> = {
    pos: '#6fae3a',
    neg: '#c65a3a',
    neutral: '#b8965a'
  };
  // The wound DATA names a canonical side (leftEye) but the applier may flip to the twin for
  // variety — so the card shows the side-agnostic organ ("eye"); the health tab shows the real side.
  const woundPartLabel = (id: string) => partLabel(id).replace(/^(left|right) /i, '');
  const stripSide = (id: string) => id.replace(/^(left|right)/i, '').toLowerCase();
  // The ACTUAL wounded part on THIS pawn for a trait's wound spec — the applier may have flipped the
  // side, so match the pawn's real permanent wound by organ family (leftEye ↔ rightEye). Falls back to
  // the spec's canonical part when there's no pawn (race view) or no match.
  function actualWoundPart(specPart: string): string {
    if (!pawn) return specPart;
    const base = stripSide(specPart);
    const hit = (pawn.injuries ?? []).find((w) => w.permanent && stripSide(w.bodyPart) === base);
    return hit?.bodyPart ?? specPart;
  }
  // Hover label: the real sided part when we have the pawn (STATUS tab), else side-agnostic (race view).
  const woundHoverLabel = (specPart: string) =>
    pawn ? partLabel(actualWoundPart(specPart)) : woundPartLabel(specPart);
  // §1 bodyMod: human label for which parts a body-structure trait reshapes.
  const bodyModPartLabel = (target: string) =>
    target === 'skeleton' ? 'bones' : target === 'flesh' ? 'hide' : woundPartLabel(target);
  // Prose for a single bodyMod, explaining the mechanical change (fracture / wound tolerance).
  function bodyModDesc(m: { target: string; hpMult?: number; weightKg?: number }): string {
    const bits: string[] = [];
    if (m.hpMult != null && m.hpMult !== 1) {
      const pct = Math.round((m.hpMult - 1) * 100);
      const signed = `${pct >= 0 ? '+' : ''}${pct}%`;
      if (m.target === 'skeleton')
        bits.push(pct >= 0 ? `${signed} bone — fractures far harder` : `${signed} bone — fractures easily`);
      else if (m.target === 'flesh')
        bits.push(pct >= 0 ? `${signed} flesh — a wound bites deeper before it tells` : `${signed} flesh — wounds bite faster`);
      else bits.push(`${signed} part HP`);
    }
    if (m.weightKg) bits.push(`+${m.weightKg} kg body weight (loads the body, slows the pawn)`);
    return bits.join('; ');
  }
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
    // §6b: expose the granted condition as a live "＋ <name>" pill; hovering the pill shows the
    // condition's own tooltip (description, modifiers, when it's active, what it can trigger).
    if (cond) {
      tags.push({
        label: '＋',
        value: cond.name.toLowerCase(),
        type: 'pos',
        tip: conditionTip(trait.selfCondition!)
      });
    }
    // §6a: an aura radiates a condition to everyone within its (finite) radius.
    if (trait.aura) {
      const auraCond = getTransientConditionDef(trait.aura.condition);
      tags.push({
        label: 'aura',
        value: `${(auraCond?.name ?? trait.aura.condition.replace(/_/g, ' ')).toLowerCase()} · ${trait.aura.radius} tiles · ${trait.aura.affects}`,
        type: trait.aura.affects === 'foes' ? 'neutral' : 'pos',
        tip: auraCond ? conditionTip(trait.aura.condition) : undefined
      });
    }
    // §3d grafts: the trait grows a real, losable limb.
    for (const g of trait.grafts ?? [])
      tags.push({ label: 'grows', value: limbLabel(g.limb), type: 'pos' });
    if (cond?.grantsNaturalWeapon?.length)
      tags.push({ label: 'natural weapon', value: '', type: 'pos' });
    if (cond?.grantsNaturalArmor)
      tags.push({ label: 'nat armor', value: `+${cond.grantsNaturalArmor}`, type: 'pos' });
    // §3 natural armor is worn permanently — it eats a share of carry capacity, so it reads as a cost.
    if (cond?.carryPenalty)
      tags.push({ label: 'carry', value: `-${Math.round(cond.carryPenalty * 100)}%`, type: 'neg' });
    // §4 wound-kind: the permanent injury stamped at generation (human part label, never the raw id).
    for (const w of trait.wounds ?? [])
      tags.push({ label: woundPartLabel(w.part), value: w.severity, type: 'neg' });
    // §1 bodyMod: intrinsic body-structure change — one pill per part-group + a weight pill.
    for (const m of trait.bodyMods ?? []) {
      if (m.hpMult != null && m.hpMult !== 1) {
        const pct = Math.round((m.hpMult - 1) * 100);
        tags.push({
          label: bodyModPartLabel(m.target),
          value: `${pct >= 0 ? '+' : ''}${pct}%`,
          type: pct >= 0 ? 'pos' : 'neg'
        });
      }
      if (m.weightKg) tags.push({ label: 'weight', value: `+${m.weightKg} kg`, type: 'neg' });
    }
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
            label: workType.replace(/_/g, ' '),
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
                title={tag.tip}
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
      {RARITY_LABEL[t.rarity ?? 'common']} · {t.scope === 'personal' ? 'personal' : 'racial'} trait
    </div>
    <div class="tip-desc">{t.description}</div>
    {#if t.flavorLine}<div class="tip-flavor">“{t.flavorLine}”</div>{/if}
    {#if cn}
      {@const cdef = getTransientConditionDef(t.selfCondition!)}
      <div class="tip-row"><span class="tip-lbl">Condition</span> {cn}</div>
      {#if cdef?.description}<div class="tip-row">{cdef.description}</div>{/if}
      {#if cdef?.activateWhen}<div class="tip-row">
          <span class="tip-lbl">Active while</span>
          {describePredicate(cdef.activateWhen)}
        </div>{/if}
    {/if}
    {#if t.aura}
      {@const acond = getTransientConditionDef(t.aura.condition)}
      <div class="tip-row">
        <span class="tip-lbl">Aura</span>
        {acond?.name ?? t.aura.condition.replace(/_/g, ' ')} — {t.aura.affects} within {t.aura.radius} tiles
      </div>
    {/if}
    {#if t.grafts?.length}
      <div class="tip-row">
        <span class="tip-lbl">Grows</span>
        {t.grafts.map((g) => limbLabel(g.limb)).join(', ')} — a real limb: losable, and the trait's power goes with it
      </div>
    {/if}
    {#if t.stage}
      <div class="tip-row"><span class="tip-lbl">Stage</span> {t.stage} of 3{t.evolvesTo ? ' — can evolve further' : ' — the apex of its line'}</div>
    {/if}
    {#if nw.length}<div class="tip-row">
        <span class="tip-lbl">Natural weapon</span>
        {nw.join(', ')}
      </div>{/if}
    {#if na}
      {@const cp = t.selfCondition ? getTransientConditionDef(t.selfCondition)?.carryPenalty : undefined}
      <div class="tip-row">
        <span class="tip-lbl">Natural armor</span>
        +{na} def{cp ? ` · −${Math.round(cp * 100)}% carry capacity (worn always)` : ''}
      </div>
    {/if}
    {#if t.wounds?.length}
      <div class="tip-row neg">
        <span class="tip-lbl">Old wound</span>
        {t.wounds.map((w) => `${woundHoverLabel(w.part)} (${w.severity})`).join(', ')}
      </div>
    {/if}
    {#if t.bodyMods?.length}
      {#each t.bodyMods as m}
        <div class="tip-row">
          <span class="tip-lbl">Body · {bodyModPartLabel(m.target)}</span>
          {bodyModDesc(m)}
        </div>
      {/each}
    {/if}
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
