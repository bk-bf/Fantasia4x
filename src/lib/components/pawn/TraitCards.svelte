<script lang="ts">
  import type { Trait, Pawn, Item, EquipmentSlot } from '$lib/game/core/types';
  import { CORE_STAT_ABBR } from '$lib/game/core/types';
  import { naturalGearForTrait, type NaturalGearMeta } from '$lib/components/util/naturalGear';
  import { workAxisLabel } from '$lib/components/util/pawnUtils';
  import { partLabel, limbLabel } from '$lib/components/util/bodyLabels';
  import { getTransientConditionDef } from '$lib/game/core/rules/body/conditions';
  import raritiesData from '$lib/game/database/items/rarities.json';
  import HoverTip from '$lib/components/UI/tooltip/HoverTip.svelte';
  import ItemStatTooltip from '$lib/components/UI/tooltip/ItemStatTooltip.svelte';
  import WorkCellTooltip from '$lib/components/screens/work/WorkCellTooltip.svelte';
  import { WORK_CATEGORIES } from '$lib/game/core/defs/work';
  import { pawnStatService } from '$lib/game/services/PawnStatService';
  import { rankWorkCells, getPawnLaborLevel, type CellRank } from '$lib/components/util/workUtils';
  import { gameState } from '$lib/stores/gameState';
  import StatTooltip from '$lib/components/pawn/StatTooltip.svelte';
  import { buildStatContext, computeStatView, isDerivedStat } from '$lib/components/util/statView';
  import ConditionTooltip from '$lib/components/pawn/ConditionTooltip.svelte';
  import { conditionViewForId, traitGrantLines } from '$lib/components/util/conditionInfo';
  import { createPinnable } from '$lib/components/util/pinnable.svelte';
  import { chrome } from '$lib/pixelArt/chrome';
  import SkinBadge from '$lib/components/UI/widget/SkinBadge.svelte';
  import { traitBadge } from './badges';

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
    healRate: 'heal_rate',
    nightVision: 'night_vision',
    stealth: 'stealth'
  };
  const GEAR_FOLDED_RES = new Set([
    'coldResistance',
    'fireResistance',
    'cutting_resistance',
    'piercing_resistance',
    'blunt_resistance'
  ]);

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
    pawn = undefined,
    list = false
  }: {
    traits: Trait[];
    guaranteedCount?: number;
    pawn?: Pawn;
    list?: boolean;
  } = $props();

  let workRank = $derived.by<Record<string, CellRank>>(() => {
    if (!pawn) return {};
    const eff: Record<string, number> = {};
    for (const wc of WORK_CATEGORIES) {
      const m = pawnStatService.getWorkModifiers(pawn, wc.id);
      eff[wc.id] = m.speed * (m.yield ?? 1) * (m.quality ?? 1);
    }
    return rankWorkCells(eff);
  });

  let statCtx = $derived(pawn ? buildStatContext(pawn) : null);

  const RARITIES = raritiesData as { id: string; name: string; color: string }[];
  const RARITY_COLOR: Record<string, string> = Object.fromEntries(
    RARITIES.map((r) => [r.id, r.color])
  );
  const RARITY_LABEL: Record<string, string> = Object.fromEntries(
    RARITIES.map((r) => [r.id, r.name])
  );
  const rarityColor = (t: Trait) => RARITY_COLOR[t.rarity ?? 'common'] ?? '#9E9E9E';

  const STAT_ABBR: Record<string, string> = CORE_STAT_ABBR;
  const SLOT_LABEL: Record<EquipmentSlot, string> = {
    mainHand: 'Main Hand',
    offHand: 'Off Hand',
    gloves: 'Hands',
    head: 'Head',
    bodyOuter: 'Outer',
    bodyMid: 'Mid',
    bodyBase: 'Skin',
    boots: 'Feet',
    socks: 'Socks',
    bracers: 'Arms',
    greaves: 'Legs',
    belt: 'Belt',
    back: 'Cloak',
    back2: 'Pack',
    amulet: 'Amulet',
    ring: 'Ring',
    ring2: 'Ring'
  };

  type Tag = {
    label: string;
    value: string;
    type: 'pos' | 'neg' | 'neutral';
    tip?: string;
    kind?: 'gear' | 'work' | 'attr' | 'cond';
    condId?: string;
    condSource?: string;
    condGrants?: string[];
    gearItem?: Item;
    gearNatural?: NaturalGearMeta;
    workId?: string;
    statId?: string;
    info?: { title?: string; desc?: string; rows?: { k: string; v: string }[] };
  };

  const PILL_TINT: Record<Tag['type'], string> = {
    pos: 'var(--pos)',
    neg: 'var(--neg)',
    neutral: 'var(--text-dim)'
  };
  const woundPartLabel = (id: string) => partLabel(id).replace(/^(left|right) /i, '');
  const stripSide = (id: string) => id.replace(/^(left|right)/i, '').toLowerCase();
  function actualWoundPart(specPart: string): string {
    if (!pawn) return specPart;
    const base = stripSide(specPart);
    const hit = (pawn.injuries ?? []).find((w) => w.permanent && stripSide(w.bodyPart) === base);
    return hit?.bodyPart ?? specPart;
  }
  const woundHoverLabel = (specPart: string) =>
    pawn ? partLabel(actualWoundPart(specPart)) : woundPartLabel(specPart);
  const bodyModPartLabel = (target: string) =>
    target === 'skeleton' ? 'bones' : target === 'flesh' ? 'hide' : woundPartLabel(target);
  function bodyModDesc(m: { target: string; hpMult?: number; weightKg?: number }): string {
    const bits: string[] = [];
    if (m.hpMult != null && m.hpMult !== 1) {
      const pct = Math.round((m.hpMult - 1) * 100);
      const signed = `${pct >= 0 ? '+' : ''}${pct}%`;
      if (m.target === 'skeleton')
        bits.push(
          pct >= 0 ? `${signed} bone — fractures far harder` : `${signed} bone — fractures easily`
        );
      else if (m.target === 'flesh')
        bits.push(
          pct >= 0
            ? `${signed} flesh — a wound bites deeper before it tells`
            : `${signed} flesh — wounds bite faster`
        );
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
    const gear = naturalGearForTrait(trait);
    const cond = trait.selfCondition ? getTransientConditionDef(trait.selfCondition) : undefined;
    const isCondTrait = !gear && !!cond;
    if (gear) {
      tags.push({
        label: gear.kind === 'weapon' ? 'NAT WEAP' : 'NAT ARM',
        value: gear.name.toLowerCase(),
        type: 'pos',
        kind: 'gear',
        gearItem: gear.item,
        gearNatural: gear.natural
      });
    } else if (cond) {
      tags.push({
        label: 'COND',
        value: cond.name.toLowerCase(),
        type: 'pos',
        kind: 'cond',
        condId: trait.selfCondition,
        condSource: `${trait.name} (cultural trait)`,
        condGrants: traitGrantLines(trait)
      });
    }
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
    for (const g of trait.grafts ?? [])
      tags.push({
        label: 'grows',
        value: limbLabel(g.limb),
        type: 'pos',
        tip: `Grows a real ${limbLabel(g.limb)} — a losable limb, and the trait's power goes with it.`
      });
    for (const w of trait.wounds ?? [])
      tags.push({
        label: woundPartLabel(w.part),
        value: w.severity,
        type: 'neg',
        tip: `Old ${w.severity} ${woundHoverLabel(w.part)} — a permanent scar: it never heals and can't be treated.`
      });
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
    if (trait.blocksSlots?.length)
      tags.push({
        label: 'blocks',
        value: 'gear',
        type: 'neg',
        tip: `This body can't wear: ${blockedLabels(trait).join(', ')}.`
      });
    if (!isCondTrait)
      for (const [name, value] of Object.entries(trait.effects || {})) {
        if (name.endsWith('Bonus') && typeof value === 'number') {
          const stat = name.replace('Bonus', '');
          tags.push({
            label: STAT_ABBR[stat] ?? stat,
            value: `+${value}`,
            type: 'pos',
            kind: 'attr',
            statId: stat
          });
        } else if (name === 'combatMods' && value && typeof value === 'object') {
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
          if (gear && GEAR_FOLDED_RES.has(name)) continue;
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

  function blockedLabels(t: Trait): string[] {
    return (t.blocksSlots ?? []).map((s) => SLOT_LABEL[s]);
  }

  let hoveredCard = $state<{ trait: Trait; x: number; y: number } | null>(null);
  const pill = createPinnable<Tag>();
  function showCard(trait: Trait, e: MouseEvent) {
    hoveredCard = { trait, x: e.clientX, y: e.clientY };
  }
  function moveCard(e: MouseEvent) {
    if (hoveredCard) hoveredCard = { ...hoveredCard, x: e.clientX, y: e.clientY };
    pill.move(e);
  }
  function hideCard() {
    hoveredCard = null;
    pill.close();
  }
</script>

<div class="cards-grid" class:list>
  {#each traits as trait, i (trait.id ?? trait.name)}
    {@const tags = getEffectTags(trait)}
    {@const b = traitBadge(trait)}
    <div
      class="trait-card"
      class:bad={b.kind === 'neg'}
      role="presentation"
      onmouseenter={(e) => showCard(trait, e)}
      onmousemove={moveCard}
      onmouseleave={hideCard}
      {@attach list ? undefined : chrome('cell')}
    >
      <SkinBadge glyph={b.glyph} kind={b.kind} />
      <div class="card-body">
        <div class="card-header">
          <b class="card-name">{trait.name}</b>
          {#if guaranteedCount != null}
            <span class="ident-mk" class:always={i < guaranteedCount}
              >{i < guaranteedCount ? 'every member' : 'some'}</span
            >
          {/if}
        </div>
        <p class="card-desc">{trait.description}</p>
        {#if tags.length > 0}
          <div class="card-tags">
            {#each tags as tag, ti}
              {@const pk = (trait.id ?? trait.name) + ':' + ti}
              <span
                class="chip"
                style="--pill: {PILL_TINT[tag.type]}"
                role="button"
                tabindex="0"
                aria-label="{tag.label} {tag.value}"
                onmouseenter={(e) => pill.open(tag, pk, e)}
                onmouseleave={() => pill.close()}
                onclick={(e) => pill.toggle(tag, pk, e)}
                onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && pill.toggle(tag, pk, e)}
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

{#if hoveredCard && !pill.active}
  {@const t = hoveredCard.trait}
  <HoverTip x={hoveredCard.x} y={hoveredCard.y}>
    <div class="tip-name" style="color: {rarityColor(t)}">{t.name}</div>
    <div class="tip-meta">
      {RARITY_LABEL[t.rarity ?? 'common']} · {t.scope === 'personal' ? 'personal' : 'cultural'} trait
    </div>
    <div class="tip-desc">{t.description}</div>
    {#if t.flavorLine}<div class="tip-flavor">“{t.flavorLine}”</div>{/if}
  </HoverTip>
{/if}

{#if pill.active}
  {@const tag = pill.active}
  {#if tag.kind === 'gear'}
    {#if tag.gearItem}
      <ItemStatTooltip
        item={tag.gearItem}
        natural={tag.gearNatural}
        x={pill.x}
        y={pill.y}
        pinned={pill.pinned}
      />
    {/if}
  {:else if tag.kind === 'cond'}
    {@const cview = tag.condId
      ? conditionViewForId(tag.condId, tag.condSource, tag.condGrants)
      : null}
    {#if cview}
      <HoverTip x={pill.x} y={pill.y} pinned={pill.pinned}>
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
        x={pill.x}
        y={pill.y}
        pinned={pill.pinned}
      />
    {/if}
  {:else if tag.kind === 'attr'}
    {@const sid = tag.statId ?? ''}
    {@const view =
      pawn && statCtx && isDerivedStat(sid) ? computeStatView(sid, pawn, statCtx) : null}
    {#if view}
      <HoverTip x={pill.x} y={pill.y} pinned={pill.pinned}>
        <div class="tip-name" style="text-transform: capitalize">
          {view.name}<span class="tip-val">{tag.value}</span>
        </div>
        <StatTooltip {view} />
      </HoverTip>
    {:else}
      <HoverTip x={pill.x} y={pill.y} pinned={pill.pinned}>
        <div class="tip-name">
          {sid.charAt(0).toUpperCase() + sid.slice(1)}<span class="tip-val">{tag.value}</span>
        </div>
        {#if STAT_DRIVES[sid]}<div class="tip-desc">Drives {STAT_DRIVES[sid]}.</div>{/if}
        {#if pawn}<div class="tip-row">
            <span class="tip-lbl">This pawn</span>
            {pawn.stats[sid as keyof typeof pawn.stats] ?? '—'}
          </div>{/if}
      </HoverTip>
    {/if}
  {:else}
    <HoverTip x={pill.x} y={pill.y} pinned={pill.pinned}>
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
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 4px;
  }
  .cards-grid.list {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .trait-card {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px 9px 7px;
    min-width: 0;
  }
  .list .trait-card {
    padding: 0;
  }
  .card-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }
  .card-header {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }
  .card-name {
    font-weight: normal;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bad .card-name {
    color: var(--neg);
  }
  .ident-mk {
    flex-shrink: 0;
    margin-left: auto;
    color: var(--text-muted);
  }
  .ident-mk.always {
    color: var(--accent-hi);
  }
  .card-desc {
    margin: 0;
    color: var(--text-dim);
    line-height: 16px;
  }
  .card-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    margin-top: 2px;
  }
  .chip {
    display: inline-flex;
    gap: 5px;
    padding: 0 5px;
    box-shadow: inset 0 0 0 1px var(--text-muted);
    white-space: nowrap;
    cursor: help;
  }
  .pill-k {
    color: var(--text-dim);
  }
  .pill-v {
    color: var(--pill);
  }

  .tip-name {
    font-weight: 600;
    letter-spacing: 0.03em;
  }
  .tip-name.neg {
    color: var(--neg);
  }
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
