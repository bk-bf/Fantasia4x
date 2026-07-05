<!-- PawnAttributes.svelte — compact table of ALL stats.jsonc stats for a pawn.
     Hover a cell to see its formula with the pawn's own numbers substituted in. -->
<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import statsData from '$lib/game/database/stats.jsonc';
  import { pawnStatService } from '$lib/game/services/PawnStatService';
  import { itemService } from '$lib/game/services/ItemService';
  import { getActiveConditionViews } from '$lib/components/util/conditionInfo';
  import { conditionNeedMultipliers, conditionStatMultipliers } from '$lib/game/core/needs';
  import PawnStatBanner from './PawnStatBanner.svelte';

  export let pawn: Pawn;
  /** Soft-highlight the stats related to this work category (its *_speed/yield/quality plus the
   *  capacities those formulas use). Set by clicking a column in the work-priority grid. */
  export let highlightCategory: string | null = null;

  type StatDef = {
    id: string;
    category: string;
    primaryStat: string;
    formula: string;
    description: string;
  };
  const STATS = statsData as unknown as StatDef[];
  const CAPACITY_IDS = STATS.filter((s) => s.category === 'capacity').map((s) => s.id);
  // Work *_speed stats are throughput → scaled by the active-condition workEfficiency at runtime
  // (getWorkModifiers). yield/quality are NOT (conditions don't touch them), so they stay raw.
  const WORK_SPEED_IDS = new Set(
    STATS.filter((s) => s.category === 'work' && s.id.endsWith('_speed')).map((s) => s.id)
  );

  // Active conditions multiply work throughput (speed) and movement — the same factors
  // getWorkModifiers / getMoveSpeed apply at runtime but the raw stat formulas (evaluateStat) omit.
  // Fold them in so the table matches what the pawn actually achieves (as injury already does via
  // capacities). Hidden FSM states (eating/sleeping) carry no work/move modifier → no effect.
  $: condViews = getActiveConditionViews(pawn);
  $: condWorkMult = condViews.reduce((m, v) => m * (v.modifiers.workEfficiency ?? 1), 1);
  $: condMoveMult = condViews.reduce((m, v) => m * (v.modifiers.moveSpeed ?? 1), 1);
  // Persistent-condition hunger/fatigue rate multipliers (malnutrition, dehydration, hypothermia…),
  // the same product the sim applies to the *_rate accrual — surfaced on the hunger_rate/fatigue_rate stats.
  $: condNeed = conditionNeedMultipliers(pawn.conditions ?? []);
  // Core-stat multipliers from active conditions (shock/winded/… crush STR/DEX/CON/PER/INT) — the
  // SAME factors evaluateFormula folds into every formula. The tooltip breakdown lists the CURRENT
  // (crushed) stat the result was actually computed from, not the pawn's pristine base value.
  $: condStatMult = conditionStatMultipliers(pawn);
  function conditionMult(id: string): number {
    if (WORK_SPEED_IDS.has(id)) return condWorkMult;
    if (id === 'movement_speed') return condMoveMult;
    if (id === 'hunger_rate') return condNeed.hungerRate;
    if (id === 'fatigue_rate') return condNeed.fatigueRate;
    return 1;
  }

  // Stats relevant to the highlighted work category: its work stats + the capacities they depend on.
  $: relevant = (() => {
    const set = new Set<string>();
    if (!highlightCategory) return set;
    const workStats = STATS.filter((s) => s.id.startsWith(`${highlightCategory}_`));
    for (const ws of workStats) {
      set.add(ws.id);
      for (const cap of CAPACITY_IDS) {
        if (new RegExp(`\\b${cap}\\b`).test(ws.formula)) set.add(cap);
      }
    }
    return set;
  })();

  const CATEGORY_ORDER = ['physical', 'capacity', 'combat', 'resistance', 'work'];
  const CATEGORY_LABEL: Record<string, string> = {
    physical: 'PHYSICAL',
    capacity: 'CAPACITIES',
    combat: 'COMBAT',
    resistance: 'RESISTANCES',
    work: 'WORK'
  };

  $: capacities = pawnStatService.computeCapacities(pawn);
  // carry_weight / carry_volume aren't evaluable through the generic formula engine (their
  // formulas use custom vars + gear bonuses), so pull the real budget from ItemService.
  $: carry = itemService.getCarryCapacityBreakdown(pawn);

  // Neutral reference pawn — all stats 10, average body (70 kg / 170 cm), uninjured. Every stat is
  // coloured by how far THIS pawn sits above/below this baseline, so racial strengths/weaknesses
  // (carry, hunger, blood pool, work speeds…) read at a glance instead of hiding behind a bare "1".
  const BASELINE = {
    id: '__statbaseline__',
    stats: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      perception: 10,
      intelligence: 10,
      charisma: 10
    },
    physicalTraits: { weight: 70, height: 170, size: 'medium' }
  } as unknown as Pawn;
  const baseCaps = pawnStatService.computeCapacities(BASELINE);
  const baseCarry = itemService.getCarryCapacityBreakdown(BASELINE);
  // Stats where a LOWER number is the better outcome — colouring inverts for these.
  const LOWER_BETTER = new Set(['hunger_rate', 'fatigue_rate', 'pain']);

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const signed = (n: number) => (n >= 0 ? '+' : '−') + round2(Math.abs(n));

  // Raw computed values. Capacities come from the organ model (computeCapacities), NOT the literal
  // "1.0" placeholder formula — so injury actually shows and the bare healthy value is exposed.
  function actualRaw(id: string): number {
    if (id === 'carry_weight') return carry.weight.total;
    if (id === 'carry_volume') return carry.volume.total;
    if (id in capacities) return capacities[id];
    return pawnStatService.evaluateStat(id, pawn) * conditionMult(id);
  }
  function baseRaw(id: string): number {
    if (id === 'carry_weight') return baseCarry.weight.total;
    if (id === 'carry_volume') return baseCarry.volume.total;
    if (id in baseCaps) return baseCaps[id];
    return pawnStatService.evaluateStat(id, BASELINE);
  }

  // Body capacities display as a fraction of healthy (1.00 = full) so injury reads as a clear drop;
  // pain stays raw (0 = none). Everything else shows its computed value.
  function val(id: string): number {
    const raw = actualRaw(id);
    if (id in capacities && id !== 'pain') {
      const b = baseCaps[id];
      return round2(b ? raw / b : raw);
    }
    return round2(raw);
  }
  // Baseline in the SAME space the value is displayed in (normalised capacities → 1.00).
  function baseDisplay(id: string): number {
    if (id in capacities && id !== 'pain') return 1;
    return round2(baseRaw(id));
  }

  function unit(id: string): string {
    if (id === 'carry_weight') return ' kg';
    if (id === 'carry_volume') return ' L';
    return '';
  }

  type Deriv = { formula: string; vars: { name: string; value: string }[]; description: string };

  /** Keep the symbolic formula and list ONLY the variables it uses with this pawn's value, so the
   *  player reads "CON = 15, consciousness = 1.01" instead of decoding raw numbers. Capacities have
   *  no real formula (placeholder "1.0"), so surface their organ breakdown + injury note instead. */
  function derivation(s: StatDef): Deriv {
    if (s.id === 'carry_weight') {
      return {
        formula: 'bodyWeight × loadFraction + gear  (loadFraction = STR × 1.2%)',
        vars: [
          { name: 'bodyWeight', value: `${carry.bodyWeight}kg` },
          {
            name: 'loadFraction',
            value: `${Math.round(carry.weight.loadFraction * 100)}% (STR ${carry.strength})`
          },
          { name: 'gear', value: signed(carry.weight.gear) }
        ],
        description: s.description
      };
    }
    if (s.id === 'carry_volume') {
      return {
        formula: 'bodyWeight × 13% + gear',
        vars: [
          { name: 'bodyWeight', value: `${carry.bodyWeight}kg` },
          { name: 'gear', value: signed(carry.volume.gear) }
        ],
        description: s.description
      };
    }
    if (s.id in capacities) {
      return {
        formula: s.description, // the organ breakdown, e.g. "brain × 0.5 + heart × 0.15 + …"
        vars: [],
        description:
          s.id === 'pain'
            ? '0 when unhurt — injuries, limb damage and bleeding raise it, sapping consciousness.'
            : '1.00 when healthy — injury or organ loss lowers it.'
      };
    }
    const vars: { name: string; value: string }[] = [];
    const add = (name: string, value: number | string) => {
      if (new RegExp(`\\b${name}\\b`).test(s.formula)) vars.push({ name, value: String(value) });
    };
    // Show the CURRENT core stat (base × active-condition multiplier) — the value the formula was
    // actually evaluated with — so a crushed STR under shock reads "STR = 5", reconciling with the
    // result. Charisma isn't touched by conditions. Core stats display as rounded ints (no floats).
    const st = pawn.stats;
    const sm = condStatMult;
    const eff = (base: number, mult: number) => (mult === 1 ? base : Math.round(base * mult));
    add('STR', eff(st.strength, sm.strength));
    add('DEX', eff(st.dexterity, sm.dexterity));
    add('CON', eff(st.constitution, sm.constitution));
    add('PER', eff(st.perception, sm.perception));
    add('INT', eff(st.intelligence, sm.intelligence));
    add('CHA', st.charisma);
    add('weight', pawn.physicalTraits?.weight ?? 70);
    add('height', pawn.physicalTraits?.height ?? 170);
    for (const [cap, cv] of Object.entries(capacities)) add(cap, Math.round(cv * 100) / 100);
    // Surface the active-condition multiplier so the formula and the displayed result reconcile.
    const cm = conditionMult(s.id);
    if (cm !== 1) vars.push({ name: 'conditions', value: '×' + round2(cm) });
    return { formula: s.formula, vars, description: s.description };
  }

  function fmtName(id: string): string {
    return id.replace(/_/g, ' ');
  }

  // Colour by the MULTIPLE of the baseline ("average") pawn's value, with tight bands so only a truly
  // exceptional stat goes blue (the old fractional scale saturated to cyan at just +30%, blueing
  // everything). Bands: 1.0–1.15× = average (grey), 1.15–1.5× = light green, 1.5–2.0× = green,
  // 2.0×+ = blue. The worse direction mirrors them with the inverse multiple (amber/orange/red).
  // Works for multiplier stats (value ≈ ratio, baseline ≈ 1) AND absolute ones (blood volume green at
  // 1.5× avg, blue at 2×). LOWER_BETTER stats (hunger/fatigue rate, pain) flip which side is "good".
  const COOL = ['#9ccc65', '#43a047', '#2196f3']; // light green → green → blue (better)
  const WARM = ['#e0a64a', '#e07a4f', '#e04f4f']; // amber → orange → red (worse)
  const NEUTRAL = 'var(--text-dim)';
  // Multiple (≥1) → band tier 0/1/2, or -1 when inside the average band.
  const band = (m: number): number => (m >= 2.0 ? 2 : m >= 1.5 ? 1 : m >= 1.15 ? 0 : -1);
  function trend(id: string): { glyph: string; color: string } {
    const a = actualRaw(id);
    const b = baseRaw(id);
    if (!isFinite(a) || !isFinite(b)) return { glyph: '–', color: NEUTRAL };

    // Multiple of the baseline value. Near-zero baselines (resistances, pain) have no ratio, so anchor
    // on a gentle absolute reference (pain 0–100 vs resistances ~0–0.25) so they don't saturate.
    let mult: number;
    if (Math.abs(b) < 0.02) {
      if (Math.abs(a) < 1e-4) return { glyph: '–', color: NEUTRAL };
      const ref = id === 'pain' ? 25 : 0.25;
      mult = Math.max(0.01, 1 + a / ref);
    } else {
      mult = a / b;
    }

    const good = LOWER_BETTER.has(id) ? 1 / mult : mult; // >1 = better than average
    const up = band(good);
    if (up >= 0) return { glyph: '▲', color: COOL[up] };
    const down = band(1 / good);
    if (down >= 0) return { glyph: '▼', color: WARM[down] };
    return { glyph: '–', color: NEUTRAL };
  }

  // The hover tooltip opens below its cell; on low rows that clips past the panel's scroll
  // viewport. A Svelte action measures against the nearest scrollable ancestor on enter and flips
  // the tooltip ABOVE the cell when there isn't room below (CSS `.cell.up .tip`). An action (vs an
  // on:mouseenter handler) keeps it off the a11y static-interaction path.
  function flipTip(cell: HTMLElement) {
    const onEnter = () => {
      const tip = cell.querySelector<HTMLElement>('.tip');
      if (!tip) return;
      let clip: HTMLElement | null = cell.parentElement;
      while (clip && clip !== document.body) {
        const oy = getComputedStyle(clip).overflowY;
        if (oy === 'auto' || oy === 'scroll' || oy === 'hidden') break;
        clip = clip.parentElement;
      }
      const cr =
        clip && clip !== document.body
          ? clip.getBoundingClientRect()
          : ({ top: 0, bottom: window.innerHeight } as DOMRect);
      // Tip is display:none until hover — make it briefly measurable (uncapped), then restore.
      const prev = tip.style.cssText;
      tip.style.visibility = 'hidden';
      tip.style.display = 'block';
      tip.style.maxHeight = 'none';
      const tipH = tip.offsetHeight;
      tip.style.cssText = prev;
      const r = cell.getBoundingClientRect();
      const margin = 6;
      const below = cr.bottom - r.bottom - margin;
      const above = r.top - cr.top - margin;
      // Open downward if it fits, else upward if it fits, else whichever side has more room.
      const up = tipH <= below ? false : tipH <= above ? true : above > below;
      cell.classList.toggle('up', up);
      // Never overrun the viewport: cap to the chosen side's space (the tip scrolls if longer).
      const avail = up ? above : below;
      tip.style.maxHeight = tipH > avail ? `${Math.max(60, avail)}px` : '';
    };
    cell.addEventListener('mouseenter', onEnter);
    return { destroy: () => cell.removeEventListener('mouseenter', onEnter) };
  }

  $: grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    label: CATEGORY_LABEL[cat] ?? cat.toUpperCase(),
    stats: STATS.filter((s) => s.category === cat)
  })).filter((g) => g.stats.length > 0);

  // val()/derivation()/trend() read the pawn + its derived state (capacities, carry, conditions)
  // INSIDE their bodies — Svelte's template/reactive dep-tracking can't see through a function call,
  // so a pawn switch wouldn't re-run the grid cells (stale stats). buildRows takes those reactive
  // values as args purely so Svelte tracks them as dependencies and recomputes the whole table on any
  // change; the body reads them via closure. Without this, switching pawn left the previous stats.
  $: catRows = buildRows(
    pawn,
    capacities,
    carry,
    condWorkMult,
    condMoveMult,
    condNeed,
    condStatMult,
    relevant
  );

  function buildRows(..._deps: unknown[]) {
    return grouped.map((g) => ({
      label: g.label,
      cells: g.stats.map((s) => ({
        id: s.id,
        name: fmtName(s.id),
        unit: unit(s.id),
        v: val(s.id),
        d: derivation(s),
        t: trend(s.id),
        base: baseDisplay(s.id),
        hl: relevant.has(s.id)
      }))
    }));
  }
</script>

<div class="attrs">
  <PawnStatBanner {pawn} />

  {#each catRows as g}
    <div class="cat">
      <div class="cat-hdr">{g.label}</div>
      <div class="grid">
        {#each g.cells as c (c.id)}
          <div class="cell" class:hl={c.hl} use:flipTip>
            <span class="nm">{c.name}</span>
            <span class="vl" style="color: {c.t.color}"
              >{c.v}{c.unit}<span class="trend">{c.t.glyph}</span></span
            >
            <div class="tip">
              <div class="tip-formula">{c.d.formula}</div>
              {#if c.d.vars.length}
                <div class="tip-where">
                  {#each c.d.vars as vv, i}{i > 0 ? ',  ' : ''}<span class="tv-name">{vv.name}</span
                    >
                    = <span class="tv-val">{vv.value}</span>{/each}
                </div>
              {/if}
              <div class="tip-result">
                = <span class="tv-val">{c.v}{c.unit}</span>
                <span class="tip-cmp" style="color: {c.t.color}">{c.t.glyph}</span>
                <span class="tip-avg">vs avg {c.base}{c.unit}</span>
              </div>
              <div class="tip-desc">{c.d.description}</div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  .attrs {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-dim);
  }
  .cat {
    margin-bottom: 6px;
  }
  .cat-hdr {
    color: var(--accent-hi);
    font-size: 11px;
    letter-spacing: 0.06em;
    padding: 2px 6px;
    border-bottom: 1px solid var(--border);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0 8px;
  }
  .cell {
    position: relative;
    display: flex;
    justify-content: space-between;
    gap: 6px;
    padding: 1px 6px;
    border-bottom: 1px dotted var(--border, #222);
    cursor: help;
  }
  .cell:hover {
    background: var(--bg-hover, #151c26);
  }
  .cell.hl {
    background: color-mix(in srgb, var(--accent-hi) 16%, transparent);
    box-shadow: inset 2px 0 0 var(--accent-hi);
  }
  .cell.hl .nm {
    color: var(--text);
  }
  .tip {
    display: none;
    position: absolute;
    z-index: 60;
    left: 0;
    top: 100%;
    min-width: 220px;
    max-width: 340px;
    max-height: 60vh;
    overflow-y: auto;
    padding: 6px 8px;
    background: var(--bg-panel, #0c1118);
    border: 1px solid var(--border-hi, #3a4658);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
    color: var(--text);
    font-size: 11px;
    line-height: 1.5;
    /* auto (not none) so an over-tall tip — capped by flipTip — can be scrolled to read */
    pointer-events: auto;
  }
  .cell:hover .tip {
    display: block;
  }
  /* Low rows: positionTip toggles `.up` (via JS, hence :global) to flip the tooltip above the
     cell so it doesn't clip past the panel's scroll viewport. */
  .cell:global(.up) .tip {
    top: auto;
    bottom: 100%;
  }
  .tip-formula {
    color: var(--accent-hi);
  }
  .tip-where {
    margin-top: 3px;
    color: var(--text-dim);
  }
  .tv-name {
    color: var(--text);
  }
  .tv-val {
    color: #4caf50;
  }
  .tip-result {
    margin-top: 2px;
    color: var(--text-dim);
  }
  .tip-cmp {
    font-weight: bold;
  }
  .tip-avg {
    color: var(--text-dim);
  }
  .trend {
    font-size: 9px;
    margin-left: 3px;
    vertical-align: middle;
  }
  .tip-desc {
    margin-top: 5px;
    padding-top: 4px;
    border-top: 1px solid var(--border);
    color: var(--text-dim);
    font-style: italic;
  }
  .nm {
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .vl {
    color: var(--text);
    flex-shrink: 0;
  }
</style>
