<!-- TraitCards.svelte — shared trait-card grid used by BOTH the pawn STATUS tab (PawnTraits) and the
     RACE detail tab, so there's one source of truth for how a trait renders. Each card: a rarity-
     coloured accent (tier → rarities.jsonc colour), name, description, health-pill-style effect chips,
     and a cursor-following hover tooltip with the full breakdown. -->
<script lang="ts">
  import type { Trait, Pawn, Item } from '$lib/game/core/types';
  import { naturalGearForTrait, type NaturalGearMeta } from '$lib/components/util/naturalGear';
  import { workAxisLabel } from '$lib/components/util/pawnUtils';
  import { partLabel, limbLabel } from '$lib/utils/bodyLabels';
  import { getTransientConditionDef } from '$lib/game/core/needs';
  import raritiesData from '$lib/game/database/rarities.jsonc';
  import HoverTip from '$lib/components/UI/HoverTip.svelte';
  import ItemStatTooltip from '$lib/components/UI/ItemStatTooltip.svelte';
  import WorkCellTooltip from '$lib/components/screens/work/WorkCellTooltip.svelte';
  import { WORK_CATEGORIES } from '$lib/game/core/Work';
  import { pawnStatService } from '$lib/game/services/PawnStatService';
  import { rankWorkCells, getPawnLaborLevel, type CellRank } from '$lib/utils/workUtils';
  import { gameState } from '$lib/stores/gameState';
  import StatTooltip from '$lib/components/pawn/StatTooltip.svelte';
  import { buildStatContext, computeStatView, isDerivedStat } from '$lib/components/util/statView';
  import ConditionTooltip from '$lib/components/pawn/ConditionTooltip.svelte';
  import { conditionViewForId } from '$lib/components/util/conditionInfo';

  // A trait resistance/rate effect key → its stats.jsonc DERIVED stat id, so the pill can open the SAME
  // attributes-tab tooltip for that stat. (nightVision has no stat → stays a plain pill.)
  const EFFECT_TO_STAT: Record<string, string> = {
    coldResistance: 'cold_resistance',
    fireResistance: 'fire_resistance',
    poisonResistance: 'poison_resistance',
    diseaseResistance: 'disease_resistance',
    mentalResistance: 'mental_resistance',
    lightningResistance: 'lightning_resistance',
    shadowResistance: 'shadow_resistance',
    wetnessResistance: 'wetness_resistance',
    cutting_resistance: 'cutting_resistance',
    piercing_resistance: 'piercing_resistance',
    blunt_resistance: 'blunt_resistance',
    healRate: 'heal_rate'
  };
  // Resistances a §3 covering folds into its gear tooltip — skip these as standalone pills on a gear trait.
  const GEAR_FOLDED_RES = new Set([
    'coldResistance',
    'fireResistance',
    'cutting_resistance',
    'piercing_resistance',
    'blunt_resistance'
  ]);

  // What a core stat drives — the "attributes tab" answer, shown when a stat pill is hovered.
  const STAT_DRIVES: Record<string, string> = {
    strength: 'melee damage, carry weight, and heavy labour (mining, woodcutting, construction)',
    dexterity: 'accuracy, dodge, attack & aim speed, and fine work (crafting, cooking)',
    constitution: 'stamina, blood, healing, and cold / heat / poison resistance',
    perception: 'ranged accuracy & range, foraging, research, and spotting threats',
    intelligence: 'research, medicine, smithing quality, and alchemy',
    charisma: 'social standing and speech'
  };

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

  // Real per-pawn work-cell medal ranking (identical to the work tab) so a work pill's WorkCellTooltip
  // shows the true ★/▾ — computed once per pawn from the single work model.
  let workRank = $derived.by<Record<string, CellRank>>(() => {
    if (!pawn) return {};
    const eff: Record<string, number> = {};
    for (const wc of WORK_CATEGORIES) {
      const m = pawnStatService.getWorkModifiers(pawn, wc.id);
      eff[wc.id] = m.speed * (m.yield ?? 1) * (m.quality ?? 1);
    }
    return rankWorkCells(eff);
  });

  // Per-pawn stat context (capacities/carry/conditions) for the attributes-tab tooltip, computed once
  // and reused by any hovered stat/resistance pill. Null in the race view (no pawn).
  let statCtx = $derived(pawn ? buildStatContext(pawn) : null);

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
  // `kind` routes a pill's HOVER to its own breakdown panel (not the card's flavor): a natural weapon
  // opens the real item stat tooltip, a work pill the work-model breakdown, a stat pill the attribute
  // breakdown. `info` pills carry ready-made rows. Plain pills (no kind) just show their `tip` text.
  type Tag = {
    label: string;
    value: string;
    type: 'pos' | 'neg' | 'neutral';
    tip?: string;
    kind?: 'gear' | 'work' | 'attr' | 'cond';
    /** kind 'cond' — a granted/aura condition id + its "FROM" label; hover shows the shared ConditionTooltip. */
    condId?: string;
    condSource?: string;
    /** kind 'gear' — the natural weapon/armor item fed to ItemStatTooltip (the SAME gear-tab tooltip). */
    gearItem?: Item;
    /** kind 'gear' — the innate / evolution-stage / carry-cost extras for the tooltip's NATURAL block. */
    gearNatural?: NaturalGearMeta;
    workId?: string;
    statId?: string;
    /** Extra rows for an `info`-style hover (condition modifiers, wound detail, bodyMod prose…). */
    info?: { title?: string; desc?: string; rows?: { k: string; v: string }[] };
  };

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
    const gear = naturalGearForTrait(trait);
    const cond = trait.selfCondition ? getTransientConditionDef(trait.selfCondition) : undefined;
    // §3 NATURAL GEAR: one "＋ <weapon/armor name>" pill; hovering shows the SAME ItemStatTooltip the GEAR
    // TAB uses (def, resistances, on-hit…). No separate nat-armor / carry / resistance pills — that whole
    // breakdown lives in the one gear tooltip, so the card isn't a pile of redundant pills.
    if (gear) {
      tags.push({ label: '＋', value: gear.name.toLowerCase(), type: 'pos', kind: 'gear', gearItem: gear.item, gearNatural: gear.natural });
    } else if (cond) {
      // §6b passive covering/affinity (no gear granted): the "＋ <name>" pill opens the SAME condition
      // tooltip the health tab uses (ConditionTooltip), not a re-derived one.
      tags.push({
        label: '＋',
        value: cond.name.toLowerCase(),
        type: 'pos',
        kind: 'cond',
        condId: trait.selfCondition,
        condSource: `${trait.name} (racial trait)`
      });
    }
    // §6a: an aura radiates a condition to everyone within its (finite) radius.
    if (trait.aura) {
      const auraCond = getTransientConditionDef(trait.aura.condition);
      tags.push({
        label: 'aura',
        value: (auraCond?.name ?? trait.aura.condition.replace(/_/g, ' ')).toLowerCase(),
        type: trait.aura.affects === 'foes' ? 'neutral' : 'pos',
        kind: auraCond ? 'cond' : undefined,
        condId: trait.aura.condition,
        condSource: `${trait.name} — radiates to ${trait.aura.affects} within ${trait.aura.radius} tiles`
      });
    }
    // §3d grafts: the trait grows a real, losable limb.
    for (const g of trait.grafts ?? [])
      tags.push({
        label: 'grows',
        value: limbLabel(g.limb),
        type: 'pos',
        tip: `Grows a real ${limbLabel(g.limb)} — a losable limb, and the trait's power goes with it.`
      });
    // §4 wound-kind: the permanent injury stamped at generation (human part label, never the raw id).
    for (const w of trait.wounds ?? [])
      tags.push({
        label: woundPartLabel(w.part),
        value: w.severity,
        type: 'neg',
        tip: `Old ${w.severity} ${woundHoverLabel(w.part)} — a permanent scar: it never heals and can't be treated.`
      });
    // §1 bodyMod: intrinsic body-structure change — one pill per part-group + a weight pill.
    for (const m of trait.bodyMods ?? []) {
      if (m.hpMult != null && m.hpMult !== 1) {
        const pct = Math.round((m.hpMult - 1) * 100);
        tags.push({
          label: bodyModPartLabel(m.target),
          value: `${pct >= 0 ? '+' : ''}${pct}%`,
          type: pct >= 0 ? 'pos' : 'neg',
          tip: bodyModDesc(m)
        });
      }
      if (m.weightKg)
        tags.push({
          label: 'weight',
          value: `+${m.weightKg} kg`,
          type: 'neg',
          tip: `+${m.weightKg} kg body weight — loads the body and slows the pawn.`
        });
    }
    if (trait.onHitEffect) {
      const oh = trait.onHitEffect;
      const oc = oh.condition ? getTransientConditionDef(oh.condition) : undefined;
      const inflict = oh.condition
        ? `inflict ${(oc?.name ?? oh.condition.replace(/_/g, ' ')).toLowerCase()}`
        : 'draw blood';
      tags.push({
        label: 'on-hit',
        value: 'proc',
        type: 'pos',
        tip: `${Math.round(oh.chance * 100)}% chance to ${inflict} on any landed melee hit.`
      });
    }
    if (trait.weaponBonus?.damage)
      tags.push({
        label: 'weapon',
        value: `+${Math.round(trait.weaponBonus.damage * 100)}%`,
        type: 'pos',
        tip: `+${Math.round(trait.weaponBonus.damage * 100)}% damage with any wielded weapon.`
      });
    if (trait.blocksSlots?.length)
      tags.push({
        label: 'blocks',
        value: 'gear',
        type: 'neg',
        tip: `This body can't wear: ${blockedLabels(trait).join(', ')}.`
      });
    // §3 evolution stage is shown in the natural-gear tooltip's NATURAL block (via `gear.natural`),
    // not as its own pill.
    for (const [name, value] of Object.entries(trait.effects || {})) {
      if (name.endsWith('Bonus') && typeof value === 'number') {
        const stat = name.replace('Bonus', '');
        tags.push({ label: STAT_ABBR[stat] ?? stat, value: `+${value}`, type: 'pos', kind: 'attr', statId: stat });
      } else if (name.endsWith('Penalty') && typeof value === 'number') {
        const stat = name.replace('Penalty', '');
        // A penalty is stored positive — render it SIGNED so it reads "CHA -1".
        tags.push({ label: STAT_ABBR[stat] ?? stat, value: `-${value}`, type: 'neg', kind: 'attr', statId: stat });
      } else if (name === 'combatMods' && value && typeof value === 'object') {
        // §1 combat combos: each key is a stats.jsonc COMBAT stat (hit_chance, dodge…) → its pill routes
        // to the SAME attributes-tab tooltip (kind 'attr'), value is a bare signed % (no "combat mods" tail).
        for (const [statId, mul] of Object.entries(value as Record<string, number>)) {
          const pct = Math.round((mul - 1) * 100);
          tags.push({
            label: statId.replace(/_/g, ' '),
            value: `${pct >= 0 ? '+' : ''}${pct}%`,
            type: pct >= 0 ? 'pos' : 'neg',
            kind: 'attr',
            statId
          });
        }
      } else if (value && typeof value === 'object') {
        for (const [workType, mul] of Object.entries(value as Record<string, number>)) {
          const pct = Math.round((mul - 1) * 100);
          tags.push({
            label: workType.replace(/_/g, ' '),
            value: `${pct >= 0 ? '+' : ''}${pct}% ${axisShort(name)}`,
            type: pct >= 0 ? 'pos' : 'neg',
            kind: workType === 'all' ? undefined : 'work',
            workId: workType === 'all' ? undefined : workType
          });
        }
      } else if (typeof value === 'number' && value !== 0) {
        // A covering's resistance is already in its gear tooltip — don't also list it as its own pill.
        if (gear && GEAR_FOLDED_RES.has(name)) continue;
        // Resistances / nightVision / healRate — a 0-baseline stat shown as a signed percentage. Routed
        // to the SAME attributes-tab stat tooltip (kind 'attr') via the derived stat id it maps to.
        const label = name
          .replace(/_/g, ' ')
          .replace(/([A-Z])/g, ' $1')
          .replace(/resistance/i, 'res')
          .trim()
          .toLowerCase();
        const pct = Math.round(value * 100);
        const sid = EFFECT_TO_STAT[name];
        tags.push({
          label,
          value: `${pct >= 0 ? '+' : ''}${pct}%`,
          type: pct >= 0 ? 'pos' : 'neg',
          kind: sid ? 'attr' : undefined,
          statId: sid
        });
      }
    }
    return tags;
  }

  // ── Tooltip data ───────────────────────────────────────────────────────────
  function blockedLabels(t: Trait): string[] {
    return (t.blocksSlots ?? []).map((s) => SLOT_LABEL[s] ?? s);
  }

  // TWO hover panels (never both): the CARD shows flavor; a PILL shows its own breakdown. A pill sits
  // inside the card, so its hover suppresses the card panel — no more listing flavor + weapon detail twice.
  let hoveredCard = $state<{ trait: Trait; x: number; y: number } | null>(null);
  let hoveredPill = $state<{ tag: Tag; x: number; y: number } | null>(null);
  function showCard(trait: Trait, e: MouseEvent) {
    hoveredCard = { trait, x: e.clientX, y: e.clientY };
  }
  function moveCard(e: MouseEvent) {
    if (hoveredCard) hoveredCard = { ...hoveredCard, x: e.clientX, y: e.clientY };
    if (hoveredPill) hoveredPill = { ...hoveredPill, x: e.clientX, y: e.clientY };
  }
  function hideCard() {
    hoveredCard = null;
    hoveredPill = null;
  }
  function showPill(tag: Tag, e: MouseEvent) {
    hoveredPill = { tag, x: e.clientX, y: e.clientY };
  }
  function hidePill() {
    hoveredPill = null;
  }
</script>

<div class="cards-grid">
  {#each traits as trait, i (trait.id ?? trait.name)}
    {@const tags = getEffectTags(trait)}
    <div
      class="trait-card"
      style="--rarity: {rarityColor(trait)}"
      role="presentation"
      onmouseenter={(e) => showCard(trait, e)}
      onmousemove={moveCard}
      onmouseleave={hideCard}
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
                role="img"
                aria-label="{tag.label} {tag.value}"
                onmouseenter={(e) => showPill(tag, e)}
                onmouseleave={hidePill}
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

<!-- PANEL 1 — CARD hover shows ONLY flavor (name, rarity·scope, description, flavour). Suppressed while a
     pill is hovered, so flavor never shows alongside a pill's breakdown. -->
{#if hoveredCard && !hoveredPill}
  {@const t = hoveredCard.trait}
  <HoverTip x={hoveredCard.x} y={hoveredCard.y}>
    <div class="tip-name" style="color: {rarityColor(t)}">{t.name}</div>
    <div class="tip-meta">
      {RARITY_LABEL[t.rarity ?? 'common']} · {t.scope === 'personal' ? 'personal' : 'racial'} trait
    </div>
    <div class="tip-desc">{t.description}</div>
    {#if t.flavorLine}<div class="tip-flavor">“{t.flavorLine}”</div>{/if}
  </HoverTip>
{/if}

<!-- PANEL 2 — PILL hover routes to its own breakdown: a natural weapon → the real item stat tooltip; a
     work pill → the work-model breakdown; a stat pill → the attribute breakdown; anything else → its detail. -->
{#if hoveredPill}
  {@const tag = hoveredPill.tag}
  {#if tag.kind === 'gear'}
    {#if tag.gearItem}
      <ItemStatTooltip
        item={tag.gearItem}
        natural={tag.gearNatural}
        x={hoveredPill.x}
        y={hoveredPill.y}
      />
    {/if}
  {:else if tag.kind === 'cond'}
    {@const cview = tag.condId ? conditionViewForId(tag.condId, tag.condSource) : null}
    {#if cview}
      <HoverTip x={hoveredPill.x} y={hoveredPill.y}>
        <ConditionTooltip view={cview} />
      </HoverTip>
    {/if}
  {:else if tag.kind === 'work' && pawn && tag.workId}
    {@const wc = WORK_CATEGORIES.find((c) => c.id === tag.workId)}
    {#if wc}
      <WorkCellTooltip
        {pawn}
        {wc}
        mods={pawnStatService.getWorkModifiers(pawn, wc.id)}
        rank={workRank[wc.id] ?? { best: -1, worst: -1 }}
        level={getPawnLaborLevel($gameState.workAssignments?.[pawn.id], wc.id)}
        x={hoveredPill.x}
        y={hoveredPill.y}
      />
    {/if}
  {:else if tag.kind === 'attr'}
    {@const sid = tag.statId ?? ''}
    {@const view = pawn && statCtx && isDerivedStat(sid) ? computeStatView(sid, pawn, statCtx) : null}
    {#if view}
      <!-- Resistance / heal_rate: the IDENTICAL attributes-tab panel (shared StatTooltip). -->
      <HoverTip x={hoveredPill.x} y={hoveredPill.y}>
        <div class="tip-name" style="text-transform: capitalize">
          {view.name}<span class="tip-val">{tag.value}</span>
        </div>
        <StatTooltip {view} />
      </HoverTip>
    {:else}
      <!-- Core stat (STR/DEX) — no stats.jsonc formula panel; show what it drives + this pawn's value. -->
      <HoverTip x={hoveredPill.x} y={hoveredPill.y}>
        <div class="tip-name">{sid.charAt(0).toUpperCase() + sid.slice(1)}<span class="tip-val">{tag.value}</span></div>
        {#if STAT_DRIVES[sid]}<div class="tip-desc">Drives {STAT_DRIVES[sid]}.</div>{/if}
        {#if pawn}<div class="tip-row"><span class="tip-lbl">This pawn</span> {pawn.stats[sid as keyof typeof pawn.stats] ?? '—'}</div>{/if}
      </HoverTip>
    {/if}
  {:else}
    <HoverTip x={hoveredPill.x} y={hoveredPill.y}>
      <div class="tip-name" class:neg={tag.type === 'neg'}>
        {tag.label}{#if tag.value}<span class="tip-val">{tag.value}</span>{/if}
      </div>
      {#if tag.tip}<div class="tip-desc" style="white-space: pre-line">{tag.tip}</div>{/if}
    </HoverTip>
  {/if}
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
  .tip-name.neg {
    color: var(--neg);
  }
  /* Muted value appended to a pill-panel header (e.g. "Strength +2", "Crafting +15% spd"). */
  .tip-val {
    color: var(--text-muted);
    font-weight: normal;
    margin-left: 6px;
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
  .tip-lbl {
    color: var(--text-dim);
    text-transform: uppercase;
    font-size: 9px;
    letter-spacing: 0.05em;
    margin-right: 4px;
  }
</style>
