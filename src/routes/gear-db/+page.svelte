<script lang="ts">
  import { effectsOf } from '$lib/dev/itemTree';
  import ItemTree from '$lib/dev/ItemTree.svelte';

  // DEV TOOL — data-driven BUILD database. Reads the derived catalogue from $lib/dev/gearDb (which
  // imports the real items/recipes/buildings/research/traits .jsonc), so it stays in sync with the
  // data. Two views: the build × age grids, and the item tree over every entry in items.jsonc.
  import { page } from '$app/state';
  import {
    GEAR,
    CLASSES,
    AGES,
    BUILDS,
    BUILD_CAT,
    REAL_RARITIES,
    BODY_PARTS,
    DROPPED,
    UNAFFILIATED,
    BUILD_SPEC,
    buildSummaries,
    describeClasses,
    type GearRow,
    type GearKind
  } from '$lib/dev/gearDb';
  import {
    STAT_GROUPS,
    STAT_INFO,
    buildStatRows,
    type StatInfo,
    type Rank
  } from '$lib/dev/buildStats';

  const summaries = buildSummaries();

  // Coverage grid: build × kind × age → the actual items (precomputed once; GEAR is static).
  const cellMap = new Map<string, GearRow[]>();
  for (const g of GEAR) {
    if (g.kind !== 'weapon' && g.kind !== 'armor') continue;
    for (const b of g.classes) {
      const key = `${b}|${g.kind}|${g.age}`;
      const arr = cellMap.get(key) ?? cellMap.set(key, []).get(key)!;
      arr.push(g);
    }
  }
  // Armour groups by SET (one-offs last, then tier/name); everything else stays tier-then-name. Six
  // steel torso pieces in one cell are unreadable until the kit they belong to is what orders them.
  for (const arr of cellMap.values())
    arr.sort(
      (a, b) =>
        Number(!a.armorSet) - Number(!b.armorSet) ||
        (a.armorSet ?? '').localeCompare(b.armorSet ?? '') ||
        a.tier - b.tier ||
        a.name.localeCompare(b.name)
    );
  const cell = (build: string, gkind: 'weapon' | 'armor', age: string) =>
    cellMap.get(`${build}|${gkind}|${age}`) ?? [];

  // The same grid keyed off fallbackClasses — armour a build can wear but that was not made for it.
  // Sturdiest first, so picking the head of the list picks the best stopgap.
  const fbMap = new Map<string, GearRow[]>();
  for (const g of GEAR) {
    if (g.kind !== 'armor') continue;
    for (const b of g.fallbackClasses) {
      const key = `${b}|${g.age}`;
      const arr = fbMap.get(key) ?? fbMap.set(key, []).get(key)!;
      arr.push(g);
    }
  }
  for (const arr of fbMap.values())
    arr.sort((a, b) => (b.defense ?? 0) - (a.defense ?? 0) || a.tier - b.tier);

  // What a build must have covered at an age. The three torso layers collapse to ONE requirement —
  // a build needs *a* torso piece, not one per layer — and cloak/pack are carry, not protection, so
  // neither counts as a coverage gap.
  const COVERAGE_PARTS = ['head', 'torso', 'arms', 'hands', 'legs', 'feet'] as const;
  const coverageOf = (p: string | null) => (p?.startsWith('torso') ? 'torso' : p);
  const missingParts = (items: GearRow[]) =>
    COVERAGE_PARTS.filter((p) => !items.some((it) => coverageOf(it.bodyPart) === p));

  /** What a build borrows at an age: for each region its own line does not cover, the sturdiest piece
   *  it could still put on. One per region — a stopgap, not a shopping list — so an age whose kit is
   *  complete borrows nothing and the cell stays clean. */
  const FALLBACK = '__fallback';
  const fallbackFill = (build: string, age: string, own: GearRow[]): GearRow[] => {
    const gaps = missingParts(own);
    if (!gaps.length) return [];
    const pool = fbMap.get(`${build}|${age}`) ?? [];
    return gaps
      .map((p) => pool.find((it) => coverageOf(it.bodyPart) === p))
      .filter((it): it is GearRow => !!it);
  };

  /** A cell's pieces grouped into their sets, in the order the cell is already sorted. One-offs
   *  collect into a single trailing group so they fold away together. */
  const setGroups = (items: GearRow[]): { key: string; label: string; items: GearRow[] }[] => {
    const out: { key: string; label: string; items: GearRow[] }[] = [];
    for (const it of items) {
      const key = setKey(it);
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(it);
      else out.push({ key, label: it.setLabel ?? 'unaffiliated', items: [it] });
    }
    return out;
  };

  const byEvoRarity = (a: GearRow, b: GearRow) =>
    a.evoStage - b.evoStage || a.rarityRank - b.rarityRank || a.name.localeCompare(b.name);
  const posFirst = (a: GearRow, b: GearRow) =>
    (a.polarity === 'negative' ? 1 : 0) - (b.polarity === 'negative' ? 1 : 0) ||
    a.evoStage - b.evoStage ||
    a.name.localeCompare(b.name);
  const allTraits = (build: string) =>
    GEAR.filter((g) => g.kind === 'trait' && g.classes.includes(build as never)).sort(byEvoRarity);
  // Traits at a given rarity — positives first, then flaws (red); flaws graded INTO the real rarity
  // columns (no separate flaw column). excludeLineage pulls lineage-marked traits out (they get their
  // own column when the lineage column is toggled on).
  const raritycell = (build: string, rarity: string, excludeLineage = false) =>
    allTraits(build)
      .filter((t) => t.gradeRarity === rarity && (!excludeLineage || !t.lineageNames))
      .sort(posFirst);
  const lineageColTraits = (build: string) =>
    allTraits(build)
      .filter((t) => t.lineageNames != null)
      .sort(
        (a, b) =>
          a.gradeRank - b.gradeRank ||
          (a.lineageNames ?? '').localeCompare(b.lineageNames ?? '') ||
          a.name.localeCompare(b.name)
      );
  let showLineageCol = $state(false);

  // Sets COLLAPSE rather than hide: the set name stays on screen as its own control and its pieces
  // fold in under it. Collapsing keys off the SET, so folding `steel_plate` folds it in every cell it
  // appears in — a kit is one thing wherever it shows up.
  let collapsedSets = $state<Record<string, boolean>>({});
  const setKey = (g: GearRow) => g.armorSet ?? UNAFFILIATED;
  const toggleSet = (k: string) => (collapsedSets[k] = !collapsedSets[k]);

  const pBview = page.url?.searchParams?.get('bview') ?? '';
  type BView = 'weapon' | 'armor' | 'trait' | 'stats' | 'all';
  let bview = $state<BView>(
    (['armor', 'trait', 'stats', 'all'] as string[]).includes(pBview) ? (pBview as BView) : 'weapon'
  );

  // Which stats decide each build's fights, and the formula behind each. Static — GEAR is static.
  const statRows = buildStatRows();
  const RANK_GLYPH: Record<Rank, string> = { primary: '●', secondary: '○', none: '·' };

  // Cross-table multi-select: click any item/trait to highlight every instance of it in the table.
  let sel = $state<Record<string, boolean>>({});
  const selCount = $derived(Object.keys(sel).length);
  function toggleSel(id: string) {
    if (sel[id]) {
      delete sel[id];
      selOrder = selOrder.filter((x) => x !== id);
      return;
    }
    // More than three columns stops being readable, so the oldest pick drops out.
    if (compare && selOrder.length >= COMPARE_MAX) {
      const [oldest, ...rest] = selOrder;
      delete sel[oldest];
      selOrder = rest;
    }
    sel[id] = true;
    selOrder = [...selOrder, id];
  }
  const clearSel = () => {
    sel = {};
    selOrder = [];
  };

  /**
   * COMPARE — a popup that lays the picked items out as columns of ONE grid.
   *
   * Alignment has to be structural: separate floating panels can never be trusted to line up (they
   * carry their own content heights and get nudged by viewport clamping), whereas one grid shares its
   * rows by construction. The popup is size-capped and scrolls internally, so it cannot clip off-screen
   * either, and it minimises to its title bar when it is in the way.
   */
  const COMPARE_MAX = 3;
  let compare = $state(false);
  let compareMin = $state(false);
  /** Click order, so the columns read in the order they were picked. */
  let selOrder = $state<string[]>([]);
  const compareRows = $derived(
    selOrder.map((id) => GEAR.find((g) => g.id === id)).filter((g): g is GearRow => !!g)
  );
  /**
   * Union of every field label across the picks, so each column lines up even when one weapon omits a
   * field another has. A label the first pick lacks (a stiletto has no `stun`) is spliced in next to its
   * neighbour from the row that does have it — appending would dump it at the bottom, away from its block.
   */
  const compareLabels = $derived.by(() => {
    const order: string[] = [];
    for (const g of compareRows) {
      let at = -1;
      for (const r of infoRows(g)) {
        const known = order.indexOf(r.label);
        if (known >= 0) {
          at = known;
          continue;
        }
        order.splice(++at, 0, r.label);
      }
    }
    return order;
  });
  const cellFor = (g: GearRow, label: string) => infoRows(g).find((r) => r.label === label) ?? null;

  // Hover / info panel: a formatted, colour-coded breakdown of any item, trait, or build.
  let hovered = $state<GearRow | null>(null);
  let hoveredBuild = $state<string | null>(null);
  /** A stat's formula panel — `why` is set when the hover came from a build's cell rather than a header. */
  let hoveredStat = $state<{ info: StatInfo; build: string | null; why: string | null } | null>(
    null
  );
  let hx = $state(0);
  let hy = $state(0);
  function pos(e: MouseEvent) {
    hx = e.clientX;
    hy = e.clientY;
  }
  // Action that keeps the floating tooltip fully on-screen: drop it near the cursor, then measure its
  // real size and clamp it back inside the viewport (a plain clamp, not a binary up/down flip). Re-runs
  // via `update` whenever the cursor position or the hovered target changes.
  function place(node: HTMLElement, _param: unknown) {
    const reposition = () => {
      if (typeof window === 'undefined') return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const r = node.getBoundingClientRect();
      let left = hx + 14;
      if (left + r.width > vw - 8) left = hx - r.width - 14;
      node.style.left = Math.max(8, left) + 'px';
      let top = hy + 14;
      if (top + r.height > vh - 8) top = vh - r.height - 8;
      node.style.top = Math.max(8, top) + 'px';
    };
    reposition();
    return { update: (_p: unknown) => reposition() };
  }
  function hoverGear(g: GearRow, e: MouseEvent) {
    hovered = g;
    hoveredBuild = null;
    hoveredStat = null;
    pos(e);
  }
  function hoverBuild(b: string, e: MouseEvent) {
    hoveredBuild = b;
    hovered = null;
    hoveredStat = null;
    pos(e);
  }
  function hoverStat(
    statId: string,
    e: MouseEvent,
    build: string | null = null,
    why: string | null = null
  ) {
    hoveredStat = { info: STAT_INFO[statId], build, why };
    hovered = null;
    hoveredBuild = null;
    pos(e);
  }
  function hoverOut() {
    hovered = null;
    hoveredBuild = null;
    hoveredStat = null;
  }

  interface InfoRow {
    label: string;
    val: string;
    tone: 'good' | 'bad' | 'info';
  }
  /** Combat's cadence ceiling: BASE_ATTACK_INTERVAL_TICKS / MIN_ATTACK_INTERVAL_TICKS (120/72). */
  const CADENCE_CAP = 120 / 72;
  function infoRows(g: GearRow): InfoRow[] {
    const rows: InfoRow[] = [];
    const push = (label: string, val: unknown, tone: InfoRow['tone'] = 'info') => {
      if (val !== null && val !== undefined && val !== '')
        rows.push({ label, val: String(val), tone });
    };
    // WHAT IT DOES, first and unconditionally. Without this a herbal tea and a cup of water render
    // identically: the rest of this function is per-KIND (weapon damage, armour defence) and simply has
    // no branch for "grants a condition" or "cures one".
    push('effects', effectsOf(g.raw ?? {}), 'good');
    const e = g.raw?.effects ?? {};
    const mults = (obj: Record<string, number> | undefined, suffix = '') => {
      if (!obj) return;
      for (const [k, v] of Object.entries(obj)) push(k + suffix, '×' + v, v >= 1 ? 'good' : 'bad');
    };
    if (g.kind === 'weapon' || g.kind === 'ammo') {
      // ── DAMAGE, all of it together ──
      push(
        'damage',
        g.dmg != null
          ? `${g.dmg}${g.damMin != null ? ` (${g.damMin}–${g.damMax})` : ''} ${g.damageType ?? ''}`.trim()
          : null,
        'good'
      );
      // Audit numbers. Paper dps is damage × the weapon's own speed. It is only reachable while the
      // wielder is slow enough: the weapon's speed multiplies the attack_speed stat and Combat floors
      // the interval at MIN_ATTACK_INTERVAL_TICKS, so cadence stops improving at
      // BASE_ATTACK_INTERVAL_TICKS / MIN = 120/72 ≈ 1.67. Past that a fast weapon gains nothing and
      // only per-hit damage counts, which is what "capped" shows. Read both beside pen and armour
      // damage: a dagger wins on paper, loses at the cap, and never opens armour either way.
      const dps = g.dmg != null && g.atkSpeed != null ? g.dmg * g.atkSpeed : null;
      push('dps (dmg × speed)', dps != null ? dps.toFixed(1) : null, 'good');
      push('dps capped (1.67×)', g.dmg != null ? (g.dmg * CADENCE_CAP).toFixed(1) : null, 'good');
      push(
        'dmg / stamina',
        g.dmg != null && g.stamina ? (g.dmg / g.stamina).toFixed(1) : null,
        'good'
      );
      push('crit', g.crit != null ? pct(g.crit) : null, 'good');
      push('crit multiplier', g.critMult != null ? '×' + g.critMult.toFixed(1) : null, 'good');
      push('scales with', g.scaling);
      // ── vs ARMOUR ──
      push('armour pen', g.ap != null ? pct(g.ap) : null, 'good');
      push('armour damage', g.armorDmg, 'good');
      // ── LANDING IT ──
      push('accuracy', g.accuracy, g.accuracy != null && g.accuracy < 0 ? 'bad' : 'good');
      push('attack speed', g.atkSpeed);
      push('stun', g.stun != null ? pct(g.stun) : null, 'good');
      push('on-hit', g.onHit, 'bad');
      // ── COST & HANDLING ──
      push('stamina / hit', g.stamina, 'bad');
      push(
        'stamina / sec',
        g.stamina && g.atkSpeed != null ? (g.stamina * g.atkSpeed).toFixed(1) : null,
        'bad'
      );
      push('reach', g.reach);
      push('range', g.range);
      push('grip', g.twoHanded ? 'two-handed' : 'one-handed');
      push('STR to wield', g.wieldStr, 'bad');
    } else if (g.kind === 'armor') {
      push('defense', g.defense, 'good');
      push('weight class', g.armorType);
      push('equips', g.bodyPart ?? g.slot);
      push('block', g.block != null ? pct(g.block) : null, 'good');
      push('stealth', g.stealthMod != null ? '+' + g.stealthMod : null, 'good');
      push('move penalty', g.movePen != null ? pct(g.movePen) : null, 'bad');
      const ap = g.raw?.armorProperties ?? {};
      if (ap.slashResistance) push('slash resist', pct(ap.slashResistance), 'good');
      if (ap.pierceResistance) push('pierce resist', pct(ap.pierceResistance), 'good');
      if (ap.crushResistance) push('crush resist', pct(ap.crushResistance), 'good');
    } else if (g.kind === 'tool') {
      push('work', g.work);
      push('speed', g.boostSpeed, 'good');
      push('yield', g.boostYield, 'good');
      push('quality', g.boostQuality, 'good');
    } else if (g.kind === 'medicine') {
      push('medicine quality', g.medicine, 'good');
    } else if (g.kind === 'trait') {
      push('gating', g.gating);
      push('rarity', g.rarity === 'negative' ? `flaw (graded ${g.gradeRarity})` : g.rarity);
      push('polarity', g.polarity, g.polarity === 'negative' ? 'bad' : 'good');
      push('lineage', g.lineageNames);
      if (g.evoStage) push('evolution stage', g.evoStage);
      push('evolves into', g.evolvesTo);
      for (const stat of [
        'strength',
        'dexterity',
        'constitution',
        'perception',
        'intelligence',
        'charisma'
      ]) {
        const ab = stat.slice(0, 3).toUpperCase();
        const v = e[stat + 'Bonus'];
        if (v != null) push(ab, (v < 0 ? '−' : '+') + Math.abs(v), v < 0 ? 'bad' : 'good');
      }
      mults(e.combatMods);
      mults(e.workSpeed, ' speed');
      mults(e.workQuality, ' quality');
      mults(e.workYield, ' yield');
      push('stealth', e.stealth != null ? '+' + e.stealth : null, 'good');
      push('heal rate', e.healRate != null ? '+' + e.healRate : null, 'good');
      push('night vision', e.nightVision != null ? '+' + e.nightVision : null, 'good');
      const res = g.raw?.resistances ?? {};
      for (const [k, v] of Object.entries(res)) push(k + ' resist', '×' + v, 'good');
      if (g.raw?.bodyMods)
        push(
          'body',
          g.raw.bodyMods
            .map((bm: any) => `${bm.target}${bm.hpMult ? ' ×' + bm.hpMult : ''}`)
            .join(', ')
        );
      if (g.raw?.selfCondition) push('grants', g.raw.selfCondition, 'good');
      if (g.raw?.aura)
        push('aura', `${g.raw.aura.condition} · r${g.raw.aura.radius} · ${g.raw.aura.affects}`);
    }
    if (g.kind !== 'trait') {
      push('weight', g.weightKg ? g.weightKg + ' kg' : null);
      push('durability', g.durability || null);
      push('age / tier', `${g.age} · T${g.tier}`);
      if (g.recipe) {
        push('station', g.recipe.station);
        push('tool tier', 'T' + g.recipe.toolTier);
        push('discipline', g.recipe.discipline);
        push('inputs', g.recipe.inputs.map((i) => `${i.qty}× ${i.name}`).join(', ') || null);
      } else {
        // Name the creatures, not the word "wild". A drop the player cannot attribute to an animal
        // is a drop they cannot go get.
        if (g.droppedBy.length) {
          const top = g.droppedBy.slice(0, 5);
          const more = g.droppedBy.length - top.length;
          push(
            g.craftable ? 'also drops from' : 'dropped by',
            top.map((d) => `${d.creature} ${pct(d.chance)}`).join(', ') +
              (more ? `, +${more} more` : ''),
            'good'
          );
        }
        push(
          'source',
          g.craftable ? 'craftable' : g.droppedBy.length ? 'drop only' : g.source,
          g.craftable || g.droppedBy.length ? 'info' : 'bad'
        );
      }
      push('research', g.research);
    }
    return rows;
  }

  // Autocomplete: type to find any weapon/armour/trait; ↑↓ to cycle, Enter/click to highlight it.
  let acq = $state('');
  let acIdx = $state(0);
  const acMatches = $derived.by(() => {
    const q = acq.trim().toLowerCase();
    if (!q) return [] as GearRow[];
    const seen = new Set<string>();
    const out: GearRow[] = [];
    for (const g of GEAR) {
      if (g.kind === 'tool' || g.kind === 'medicine' || seen.has(g.id)) continue;
      if (g.name.toLowerCase().includes(q) || g.id.includes(q)) {
        seen.add(g.id);
        out.push(g);
      }
      if (out.length >= 40) break;
    }
    return out;
  });
  $effect(() => {
    void acq;
    acIdx = 0;
  });
  function acKey(e: KeyboardEvent) {
    const n = acMatches.length;
    if (!n) return;
    if (e.key === 'ArrowDown') {
      acIdx = (acIdx + 1) % n;
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      acIdx = (acIdx - 1 + n) % n;
      e.preventDefault();
    } else if (e.key === 'Enter') {
      toggleSel(acMatches[acIdx].id);
      e.preventDefault();
    } else if (e.key === 'Escape') acq = '';
  }

  // Initial view from the URL (?view=audit) so SSR + deep-links agree.
  const params = page.url?.searchParams ?? new URLSearchParams();
  let view = $state<'builds' | 'audit'>(params.get('view') === 'audit' ? 'audit' : 'builds');

  const pct = (v: number | null) => (v == null ? '—' : Math.round(v * 100) + '%');
  const numf = (v: number | null) => (v == null ? '—' : String(v));
  const dash = (v: string | null | undefined) => (v == null || v === '' ? '—' : v);
  const clsStr = (g: GearRow) => describeClasses(g.classes);
  const inputsStr = (g: GearRow) =>
    g.recipe && g.recipe.inputs.length
      ? g.recipe.inputs.map((i) => `${i.qty}× ${i.name}`).join(', ')
      : '—';
  const detail = (g: GearRow) => {
    if (g.kind === 'weapon' || g.kind === 'ammo')
      return g.dmg == null
        ? '—'
        : `${g.dmg}${g.damMin != null ? ` (${g.damMin}–${g.damMax})` : ''} ${g.damageType ?? ''}${g.ap ? ` · AP ${pct(g.ap)}` : ''}${g.crit ? ` · crit ${pct(g.crit)}` : ''}`;
    if (g.kind === 'armor')
      return `def ${numf(g.defense)} · ${dash(g.armorType)}${g.slot ? ` · ${g.slot}` : ''}${g.stealthMod ? ` · stealth +${g.stealthMod}` : ''}`;
    if (g.kind === 'trait') return dash(g.effect);
    return '—';
  };
  const source = (g: GearRow) =>
    g.kind === 'trait'
      ? dash(g.gating)
      : g.recipe
        ? g.recipe.station
        : g.craftable
          ? 'craftable'
          : 'wild/boss';
</script>

<div class="build-db">
  <header>
    <h1>
      Build database <span class="live">live · {BUILDS.length} builds · {GEAR.length} entries</span>
    </h1>
    <p>
      Auto-classified from <code>items.jsonc</code>, <code>recipes.jsonc</code> &amp;
      <code>traits.jsonc</code> by stats. Edit the data, save, reload.
    </p>
  </header>

  <div class="tabs">
    <button class="tab lead" class:active={view === 'builds'} onclick={() => (view = 'builds')}
      >Builds</button
    >
    <button
      class="tab lead"
      class:active={view === 'audit'}
      onclick={() => (view = 'audit')}
      title="Every item in items.jsonc, nested by what it is — armour by age ▸ set ▸ class ▸ coverage"
      >Audit</button
    >
    <span class="sep"></span>
    <button
      class="tab info-toggle"
      class:active={compare}
      onclick={() => (compare = !compare)}
      title="Compare: pick up to {COMPARE_MAX} entries and read them side by side in one grid"
      >⇹ compare{compare ? ` ${selOrder.length}/${COMPARE_MAX}` : ''}</button
    >
  </div>

  {#snippet pill(g: GearRow, armour: boolean)}
    <button
      type="button"
      class="pill"
      class:sel={sel[g.id]}
      class:neg={g.polarity === 'negative'}
      onclick={() => toggleSel(g.id)}
      onmouseenter={(e) => hoverGear(g, e)}
      onmouseleave={hoverOut}
      >{g.name}{#if g.kind === 'trait'}{#if g.lineageNames}<i class="lin">{g.lineageNames}</i
          >{:else if g.evoStage}<i>s{g.evoStage}</i>{/if}{:else}<i>T{g.tier}</i
        >{#if armour && g.bodyPart}<i class="slot">{g.bodyPart}</i>{/if}{/if}</button
    >
  {/snippet}
  {#snippet gearCell(items: GearRow[], armour: boolean, fill: GearRow[])}
    {#if armour}
      {#each setGroups(items) as grp (grp.key)}
        {@const shut = collapsedSets[grp.key]}
        <div class="setgrp">
          <button
            type="button"
            class="setname"
            class:oneoff={grp.key === UNAFFILIATED || grp.key === DROPPED}
            class:dropped={grp.key === DROPPED}
            onclick={() => toggleSet(grp.key)}
            title={shut ? `expand ${grp.label}` : `collapse ${grp.label}`}
            >{shut ? '▸' : '▾'}&nbsp;{grp.label}<i>{grp.items.length}</i></button
          >
          {#if !shut}<div class="setitems">
              {#each grp.items as it (it.id)}{@render pill(it, armour)}{/each}
            </div>{/if}
        </div>
      {/each}
      {#if fill.length}
        {@const shut = collapsedSets[FALLBACK]}
        <div class="setgrp">
          <button
            type="button"
            class="setname fb"
            onclick={() => toggleSet(FALLBACK)}
            title={shut ? 'expand borrowed pieces' : 'collapse borrowed pieces'}
            >{shut ? '▸' : '▾'}&nbsp;for want of better<i>{fill.length}</i></button
          >
          {#if !shut}<div class="setitems">
              {#each fill as it (it.id)}{@render pill(it, armour)}{/each}
            </div>{/if}
        </div>
      {/if}
      {#each missingParts([...items, ...fill]) as p (p)}<span class="miss">– {p}</span>{/each}
    {:else}
      {#each items as it (it.id)}{@render pill(it, armour)}{/each}
      {#if !items.length}<span class="dot">·</span>{/if}
    {/if}
  {/snippet}

  {#snippet infoBody(g: GearRow)}
    <div class="info-head" data-cat={BUILD_CAT[g.cls] ?? 'general'}>
      {g.name}<span class="info-kind">{g.kind}</span>
    </div>
    {#if g.desc}<p class="info-desc">{g.desc}</p>{/if}
    <div class="info-grid">
      <div class="info-row">
        <span class="il">class</span><span class="iv info">{describeClasses(g.classes)}</span>
      </div>
      {#each infoRows(g) as r, i (i)}<div class="info-row">
          <span class="il">{r.label}</span><span class="iv {r.tone}">{r.val}</span>
        </div>{/each}
    </div>
  {/snippet}
  {#snippet statBody(s: StatInfo, build: string | null, why: string | null)}
    <div class="info-head" data-cat={build ? BUILD_CAT[build] : 'general'}>
      {s.label}<span class="info-kind"
        >{s.source === 'rolled'
          ? 'rolled aptitude'
          : s.wiring === 'wired'
            ? 'derived stat'
            : s.wiring}</span
      >
    </div>
    {#if s.description}<p class="info-desc">{s.description}</p>{/if}
    <div class="info-grid">
      {#if why}<div class="info-row">
          <span class="il">{build}</span><span class="iv info">{why}</span>
        </div>{/if}
      <div class="info-row">
        <span class="il">keys off</span><span class="iv info">{s.primaryStat ?? '—'}</span>
      </div>
      <div class="info-row">
        <span class="il">formula</span><span class="iv good mono">{s.formula}</span>
      </div>
      {#if s.engineFormula}
        <div class="info-row">
          <span class="il">in combat</span><span
            class="iv {s.wiring === 'dead' ? 'bad' : 'info'} mono">{s.engineFormula}</span
          >
        </div>
      {/if}
      <div class="info-row">
        <span class="il">read by</span>
        <span class="iv {s.wiring === 'wired' ? 'good' : 'bad'}">{s.where}</span>
      </div>
    </div>
  {/snippet}
  {#snippet buildBody(b: string)}
    <div class="info-head" data-cat={BUILD_CAT[b]}>
      {b}<span class="info-kind">build spec</span>
    </div>
    <div class="info-grid">
      <div class="info-row">
        <span class="il">goal</span><span class="iv good">{BUILD_SPEC[b]?.goal}</span>
      </div>
      <div class="info-row">
        <span class="il">requires</span><span class="iv info">{BUILD_SPEC[b]?.requires}</span>
      </div>
      <div class="info-row">
        <span class="il">downside</span><span class="iv bad">{BUILD_SPEC[b]?.downside}</span>
      </div>
    </div>
  {/snippet}

  {#if view === 'audit'}
    <ItemTree onhover={hoverGear} onout={hoverOut} />
  {:else if view === 'builds'}
    <div class="tabs sub">
      <button class="tab" class:active={bview === 'weapon'} onclick={() => (bview = 'weapon')}
        >Weapons by age</button
      >
      <button class="tab" class:active={bview === 'armor'} onclick={() => (bview = 'armor')}
        >Armour by age</button
      >
      <button class="tab" class:active={bview === 'trait'} onclick={() => (bview = 'trait')}
        >Traits &amp; lineages</button
      >
      <button class="tab" class:active={bview === 'stats'} onclick={() => (bview = 'stats')}
        >Stats by build</button
      >
      <button class="tab" class:active={bview === 'all'} onclick={() => (bview = 'all')}>ALL</button
      >
      {#if selCount}<button class="tab clear" onclick={clearSel}>clear {selCount} selected ✕</button
        >{/if}
    </div>
    <div class="ac">
      <input
        class="search"
        type="search"
        autocomplete="off"
        placeholder="find weapon / armour / trait — ↑↓ to cycle, Enter to highlight"
        bind:value={acq}
        onkeydown={acKey}
      />
      {#if acMatches.length}
        <div class="acmenu" role="listbox" aria-label="matches">
          {#each acMatches as g, i (g.id)}
            <button
              type="button"
              class="acitem"
              class:hl={i === acIdx}
              class:selli={sel[g.id]}
              onclick={() => toggleSel(g.id)}
            >
              <span class="acname">{g.name}</span>
              <span class="ackind">{g.kind}</span>
              <span class="acbuild">{clsStr(g)}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
    {#if bview === 'trait'}
      <p class="hint">
        Each build's traits by rarity — <b class="neg">flaws in red</b>, lineage marker as a grey
        pill.
        <label class="chk" style="margin-left:14px"
          ><input type="checkbox" bind:checked={showLineageCol} /> show lineage column</label
        >
        <span class="sub" style="margin-left:8px"
          >{showLineageCol
            ? '(lineage traits pulled into their own column)'
            : '(lineage traits shown in their rarity column)'}</span
        >
      </p>
      <div class="scroll">
        <table class="grid">
          <thead>
            <tr
              ><th>Build</th>{#each REAL_RARITIES as r (r)}<th>{r}</th
                >{/each}{#if showLineageCol}<th>lineage</th>{/if}</tr
            >
          </thead>
          <tbody>
            {#each BUILDS as b (b)}
              <tr>
                <td
                  class="name cls"
                  data-cat={BUILD_CAT[b]}
                  onmouseenter={(e) => hoverBuild(b, e)}
                  onmouseleave={hoverOut}>{b}</td
                >
                {#each REAL_RARITIES as r (r)}
                  {@const ts = raritycell(b, r, showLineageCol)}
                  <td class="cellwrap" class:gap={ts.length === 0}
                    >{#if ts.length}{#each ts as t (t.id)}{@render pill(
                          t,
                          false
                        )}{/each}{:else}<span class="dot">·</span>{/if}</td
                  >
                {/each}
                {#if showLineageCol}
                  {@const ls = lineageColTraits(b)}
                  <td class="cellwrap" class:gap={ls.length === 0}
                    >{#if ls.length}{#each ls as t (t.id)}{@render pill(
                          t,
                          false
                        )}{/each}{:else}<span class="dot">·</span>{/if}</td
                  >
                {/if}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else if bview === 'stats'}
      <p class="hint">
        Which stats decide each build's fights — <b class="pri">●</b> decisive ·
        <b class="sec">○</b>
        matters · <span class="dot">·</span> irrelevant. Hover a column head for the formula, a cell
        for why this build cares. <b class="rolled">R marks a ROLLED aptitude</b> — a per-pawn roll
        no core stat touches; <b class="sec">≈</b> marks a stat the engine recomputes in its own function.
        Every combat stat is wired now; the dead ones were fixed or deleted.
      </p>
      <div class="scroll">
        <table class="grid stats">
          <thead>
            <tr class="grouphead">
              <th colspan="2"></th>
              {#each STAT_GROUPS as grp (grp.label)}<th colspan={grp.stats.length}>{grp.label}</th
                >{/each}
            </tr>
            <tr>
              <th>Build</th>
              <th>Scales on</th>
              {#each STAT_GROUPS as grp (grp.label)}
                {#each grp.stats as sid (sid)}
                  {@const s = STAT_INFO[sid]}
                  <th
                    class="stath"
                    class:dead={s.wiring === 'dead'}
                    class:rolled={s.source === 'rolled'}
                    class:mirrored={s.wiring === 'mirrored'}
                    onmouseenter={(e) => hoverStat(sid, e)}
                    onmouseleave={hoverOut}
                    >{s.label}{#if s.source === 'rolled'}<i
                        class="wire roll"
                        title="rolled per pawn — no core stat touches it">R</i
                      >{:else if s.wiring !== 'wired'}<i class="wire"
                        >{s.wiring === 'dead' ? '✕' : '≈'}</i
                      >{/if}</th
                  >
                {/each}
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each statRows as row (row.build)}
              <tr>
                <td
                  class="name cls"
                  data-cat={BUILD_CAT[row.build]}
                  onmouseenter={(e) => hoverBuild(row.build, e)}
                  onmouseleave={hoverOut}>{row.build}</td
                >
                <td class="power">{row.powerStats.join(' · ') || '—'}</td>
                {#each STAT_GROUPS as grp (grp.label)}
                  {#each grp.stats as sid (sid)}
                    {@const c = row.cells[sid]}
                    <td
                      class="statcell {c.rank}"
                      class:dead={STAT_INFO[sid].wiring === 'dead'}
                      onmouseenter={(e) => hoverStat(sid, e, row.build, c.why)}
                      onmouseleave={hoverOut}>{RANK_GLYPH[c.rank]}</td
                    >
                  {/each}
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else if bview === 'all'}
      <p class="hint">
        One row per build — weapons &amp; armour by age (tier-sorted), then traits by rarity (<b
          class="neg">flaws in red</b
        >). <code>T#</code> = tier · <code>s#</code> = evolution stage. Click any to highlight.
      </p>
      <div class="scroll">
        <table class="grid">
          <thead>
            <tr class="grouphead">
              <th></th>
              <th colspan={AGES.length}>Weapons · by age</th>
              <th colspan={AGES.length}>Armour · by age</th>
              <th colspan={REAL_RARITIES.length}>Traits · by rarity</th>
            </tr>
            <tr>
              <th>Build</th>
              {#each AGES as a (a)}<th>{a}</th>{/each}
              {#each AGES as a (a)}<th>{a}</th>{/each}
              {#each REAL_RARITIES as r (r)}<th>{r}</th>{/each}
            </tr>
          </thead>
          <tbody>
            {#each BUILDS as b (b)}
              <tr>
                <td
                  class="name cls"
                  data-cat={BUILD_CAT[b]}
                  onmouseenter={(e) => hoverBuild(b, e)}
                  onmouseleave={hoverOut}>{b}</td
                >
                {#each AGES as a (a)}
                  {@const its = cell(b, 'weapon', a)}
                  <td class="cellwrap" class:gap={its.length === 0}
                    >{@render gearCell(its, false, [])}</td
                  >
                {/each}
                {#each AGES as a (a)}
                  {@const its = cell(b, 'armor', a)}
                  {@const fb = fallbackFill(b, a, its)}
                  <td class="cellwrap" class:gap={its.length + fb.length === 0}
                    >{@render gearCell(its, true, fb)}</td
                  >
                {/each}
                {#each REAL_RARITIES as r (r)}
                  {@const ts = raritycell(b, r)}
                  <td class="cellwrap" class:gap={ts.length === 0}
                    >{#if ts.length}{#each ts as t (t.id)}{@render pill(
                          t,
                          false
                        )}{/each}{:else}<span class="dot">·</span>{/if}</td
                  >
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <p class="hint">
        Each build's {bview === 'weapon' ? 'weapons' : 'armour'} laid out by age — empty cells are coverage
        gaps. <code>T#</code> = tier. Click an item to highlight it across the table; click a build name
        for its full list.
      </p>
      <div class="scroll">
        <table class="grid">
          <thead>
            <tr
              ><th>Build</th>{#each AGES as a (a)}<th>{a}</th>{/each}</tr
            >
          </thead>
          <tbody>
            {#each BUILDS as b (b)}
              <tr>
                <td
                  class="name cls"
                  data-cat={BUILD_CAT[b]}
                  onmouseenter={(e) => hoverBuild(b, e)}
                  onmouseleave={hoverOut}>{b}</td
                >
                {#each AGES as a (a)}
                  {@const its = cell(b, bview, a)}
                  {@const fb = bview === 'armor' ? fallbackFill(b, a, its) : []}
                  <td class="cellwrap" class:gap={its.length + fb.length === 0}
                    >{@render gearCell(its, bview === 'armor', fb)}</td
                  >
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}

  {#if compare}
    <!-- Size-capped and scrolled internally, so it can never run off-screen however many rows the
         picks produce. Minimised it collapses to just this title bar. -->
    <section class="cmp" class:min={compareMin}>
      <header class="cmp-bar">
        <span class="cmp-title">compare {compareRows.length}/{COMPARE_MAX}</span>
        {#if compareRows.length && !compareMin}
          <button type="button" class="cmp-btn" onclick={clearSel}>clear</button>
        {/if}
        <button
          type="button"
          class="cmp-btn"
          title={compareMin ? 'restore' : 'minimise'}
          onclick={() => (compareMin = !compareMin)}>{compareMin ? '▴' : '▾'}</button
        >
        <button type="button" class="cmp-btn" title="close" onclick={() => (compare = false)}
          >✕</button
        >
      </header>
      {#if !compareMin}
        <div class="cmp-body">
          {#if compareRows.length === 0}
            <p class="info-empty">
              Click up to {COMPARE_MAX} entries in the table to compare them. A fourth drops the oldest.
            </p>
          {:else}
            <div class="cmp-grid" style="--cols:{compareRows.length}">
              <div class="cmp-row cmp-head">
                <span class="il"></span>
                {#each compareRows as g (g.id)}
                  <span class="cmp-name" data-cat={BUILD_CAT[g.cls] ?? 'general'}>
                    {g.name}
                    <i>{g.kind} · {g.age} · T{g.tier}</i>
                    <button
                      type="button"
                      class="cmp-drop"
                      title="remove"
                      onclick={() => toggleSel(g.id)}>✕</button
                    >
                  </span>
                {/each}
              </div>
              {#each compareLabels as label (label)}
                <div class="cmp-row">
                  <span class="il">{label}</span>
                  {#each compareRows as g (g.id)}
                    {@const c = cellFor(g, label)}
                    <span class="iv {c?.tone ?? 'info'}" class:absent={!c}>{c ? c.val : '—'}</span>
                  {/each}
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </section>
  {/if}

  {#if hoveredStat}
    <div class="tooltip wide" use:place={[hx, hy, hoveredStat]}>
      {@render statBody(hoveredStat.info, hoveredStat.build, hoveredStat.why)}
    </div>
  {:else if hoveredBuild}
    <div class="tooltip" use:place={[hx, hy, hoveredBuild]}>{@render buildBody(hoveredBuild)}</div>
  {:else if hovered}
    <div class="tooltip" use:place={[hx, hy, hovered]}>{@render infoBody(hovered)}</div>
  {/if}
</div>

<style>
  /* app.html forces html,body{overflow:hidden}; this route is its own full-viewport scroll container. */
  .build-db {
    position: fixed;
    inset: 0;
    overflow-y: auto;
    overflow-x: hidden;
    font-family: var(--font-mono, ui-monospace, monospace);
    color: #ece6d4;
    background: #13110c;
    padding: 22px 26px 60px;
  }
  header h1 {
    font-size: 24px;
    margin: 0 0 4px;
    font-weight: 700;
  }
  .live {
    font-size: 12px;
    color: #83bb6f;
    letter-spacing: 0.05em;
    margin-left: 10px;
    font-weight: 400;
  }
  header p {
    color: #9a9279;
    font-size: 13px;
    margin: 0 0 16px;
  }
  code {
    color: #d8ab52;
    background: rgba(216, 171, 82, 0.1);
    padding: 1px 4px;
    border-radius: 3px;
  }
  .tabs {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 14px;
    flex-wrap: wrap;
  }
  .sep {
    width: 1px;
    height: 20px;
    background: #362f22;
    margin: 0 6px;
  }
  .tab {
    font-family: inherit;
    font-size: 12px;
    color: #9a9279;
    background: #1b1811;
    border: 1px solid #362f22;
    border-radius: 4px;
    padding: 5px 12px;
    cursor: pointer;
  }
  .tab.lead {
    color: #d8ab52;
    border-color: #6b5a2f;
  }
  .tab.active {
    color: #13110c;
    background: #d8ab52;
    border-color: #d8ab52;
    font-weight: 700;
  }
  .hint,
  .empty {
    color: #9a9279;
    font-size: 12.5px;
    margin: 0 0 14px;
  }
  .empty {
    padding: 20px;
    text-align: center;
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    margin-bottom: 14px;
  }
  .search {
    font-family: inherit;
    font-size: 13px;
    color: #ece6d4;
    background: #1b1811;
    border: 1px solid #362f22;
    border-radius: 4px;
    padding: 6px 10px;
  }
  label {
    font-size: 12px;
    color: #9a9279;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .count {
    color: #6d6653;
    font-size: 12px;
    margin-left: auto;
  }
  .scroll {
    overflow-x: auto;
    border: 1px solid #362f22;
    border-radius: 6px;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 12.5px;
    white-space: nowrap;
  }
  th,
  td {
    padding: 6px 10px;
    text-align: left;
    border-bottom: 1px solid #2a2519;
  }
  th {
    position: sticky;
    top: 0;
    background: #221e15;
    color: #9a9279;
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
    user-select: none;
    z-index: 1;
  }
  tbody tr:hover td {
    background: rgba(216, 171, 82, 0.04);
  }
  td.name {
    color: #ece6d4;
    font-weight: 600;
  }
  td.cls {
    font-weight: 600;
  }
  td.cls[data-cat='melee'] {
    color: #83bb6f;
  }
  td.cls[data-cat='finesse'] {
    color: #e6bf57;
  }
  td.cls[data-cat='ranged'] {
    color: #d76f5d;
  }
  td.cls[data-cat='caster'] {
    color: #a98fd6;
  }
  td.cls[data-cat='duelist'] {
    color: #d3a04e;
  }
  td.cls[data-cat='tank'] {
    color: #6fa0c8;
  }
  td.cls[data-cat='general'] {
    color: #6d6653;
  }

  /* build × age coverage grid */
  .tabs.sub {
    margin-bottom: 10px;
  }
  table.grid td.cellwrap {
    white-space: normal;
    vertical-align: top;
    min-width: 120px;
  }
  table.grid td.gap {
    background: rgba(215, 111, 93, 0.06);
  }
  .pill {
    display: inline-block;
    margin: 1px 2px 1px 0;
    padding: 1px 6px;
    border-radius: 3px;
    background: #221e15;
    border: 1px solid #362f22;
    font-family: inherit;
    font-size: 11px;
    line-height: 1.5;
    color: #ece6d4;
    white-space: nowrap;
    cursor: pointer;
    -webkit-user-select: text;
    user-select: text;
  }
  .pill:hover {
    border-color: #6b5a2f;
  }
  .pill.sel {
    border-color: #d8ab52;
    background: rgba(216, 171, 82, 0.3);
    color: #fff;
  }
  .tab.clear {
    color: #d8ab52;
    border-color: #6b5a2f;
    margin-left: auto;
  }
  .pill i {
    color: #6d6653;
    font-style: normal;
    margin-left: 4px;
    font-size: 9.5px;
  }
  .pill i.lin {
    color: #9a9279;
    background: #2f2a1e;
    padding: 0 3px;
    border-radius: 2px;
    font-size: 9px;
  }
  .pill i.slot {
    color: #8fb0c8;
    background: #1e2731;
    padding: 0 3px;
    border-radius: 2px;
    font-size: 9px;
  }
  .setgrp {
    margin: 2px 0 3px;
  }
  /* The set name IS the control: click to fold its pieces in under it. */
  .setname {
    display: inline-block;
    font: inherit;
    cursor: pointer;
    margin: 1px 0 1px;
    padding: 0 5px;
    font-size: 9px;
    font-weight: 700;
    color: #d8c48a;
    background: #2b2415;
    border: 1px solid #4a3d1f;
    border-radius: 2px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .setname:hover {
    border-color: #6d5a2c;
    color: #f0dda0;
  }
  .setname i {
    font-style: normal;
    opacity: 0.55;
    margin-left: 5px;
  }
  .setname.oneoff {
    color: #b08a6a;
    background: #2a1f18;
    border-color: #4a3528;
  }
  .setname.oneoff:hover {
    border-color: #6d5038;
    color: #d0a984;
  }
  /* drop-only gear is not a plan, it is loot — read it apart from craftable unaffiliated pieces */
  .setname.dropped {
    color: #9a7f9c;
    background: #241a26;
    border-color: #40304a;
  }
  .setname.dropped:hover {
    border-color: #5c456a;
    color: #c0a2c4;
  }
  /* borrowed from another line to plug a hole — muted, so it never reads as this build's own kit */
  .setname.fb {
    color: #7f8a92;
    background: #1c2126;
    border-color: #333c44;
  }
  .setname.fb:hover {
    border-color: #4a5762;
    color: #a3b1bb;
  }
  /* the nesting: pieces sit indented beneath their set, against a rule that ties them to it */
  .setitems {
    margin: 1px 0 0 5px;
    padding-left: 6px;
    border-left: 1px solid #3a3324;
  }
  .miss {
    display: inline-block;
    margin: 1px 4px 1px 0;
    font-size: 10px;
    color: #8a564a;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }
  .dot {
    color: #4a4436;
  }
  tr.grouphead th {
    background: #221e15;
    color: #d8ab52;
    font-size: 10.5px;
    letter-spacing: 0.1em;
    border-bottom: 1px solid #4a4030;
    border-left: 1px solid #362f22;
    text-align: left;
  }
  b.neg {
    color: #d76f5d;
  }
  b.pri {
    color: #d8ab52;
  }
  b.sec {
    color: #9a9279;
  }

  /* stats-by-build matrix */
  table.stats th.stath {
    text-align: center;
    font-size: 10px;
    letter-spacing: 0.02em;
    padding: 6px 5px;
  }
  table.stats th.stath.dead {
    color: #8a564a;
    text-decoration: line-through;
  }
  table.stats th.stath.mirrored {
    color: #b08a4a;
  }
  table.stats th.stath.rolled {
    color: #83bb6f;
  }
  b.rolled {
    color: #83bb6f;
  }
  th .wire.roll {
    color: #83bb6f;
    font-weight: 700;
  }
  th .wire {
    font-style: normal;
    margin-left: 3px;
    font-size: 9px;
  }
  td.power {
    color: #9a9279;
    font-size: 11px;
  }
  td.statcell {
    text-align: center;
    cursor: help;
    font-size: 13px;
    padding: 4px 5px;
  }
  td.statcell.primary {
    color: #d8ab52;
  }
  td.statcell.secondary {
    color: #7d7663;
  }
  td.statcell.none {
    color: #38332a;
  }
  td.statcell.dead {
    opacity: 0.45;
  }
  td.statcell:hover {
    background: rgba(216, 171, 82, 0.12);
  }
  .pill.neg {
    color: #d99a8e;
    border-color: rgba(215, 111, 93, 0.35);
  }
  .pill.neg.sel {
    color: #fff;
    border-color: #d8ab52;
  }

  /* autocomplete */
  .ac {
    position: relative;
    max-width: 460px;
    margin-bottom: 14px;
  }
  .ac .search {
    width: 100%;
    margin: 0;
  }
  .acmenu {
    position: absolute;
    z-index: 30;
    left: 0;
    right: 0;
    top: 100%;
    margin-top: 3px;
    max-height: 340px;
    overflow-y: auto;
    background: #1b1811;
    border: 1px solid #4a4030;
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  }
  .acitem {
    display: flex;
    gap: 10px;
    align-items: baseline;
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    border-bottom: 1px solid #221e15;
    padding: 5px 11px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12.5px;
    color: #ece6d4;
  }
  .acitem.hl {
    background: rgba(216, 171, 82, 0.16);
  }
  .acitem.selli .acname {
    color: #d8ab52;
    font-weight: 600;
  }
  .acitem .ackind {
    color: #6d6653;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .acitem .acbuild {
    color: #9a9279;
    font-size: 11px;
    margin-left: auto;
    white-space: nowrap;
  }

  /* info tooltip / panel */
  .tab.info-toggle {
    margin-left: auto;
  }
  .tooltip {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 50;
    width: 340px;
    max-height: calc(100vh - 16px);
    overflow-y: auto;
    background: #1b1811;
    border: 1px solid #4a4030;
    border-radius: 8px;
    box-shadow: 0 10px 34px rgba(0, 0, 0, 0.6);
    padding: 12px 14px;
    pointer-events: none;
    font-size: 12.5px;
  }
  /* A formula is a line of code — it needs the room a stat block doesn't. */
  .tooltip.wide {
    width: 440px;
  }
  .iv.mono {
    font-size: 11.5px;
    line-height: 1.45;
    word-break: break-word;
  }
  /* ── COMPARE POPUP ─────────────────────────────────────────────────────────
     Docked bottom-right, capped in both axes and scrolled internally, so no amount of content can
     push it off-screen. The body is ONE grid: a label gutter plus an equal column per pick, which is
     what makes the rows line up across items by construction rather than by positioning luck. */
  .cmp {
    position: fixed;
    right: 12px;
    bottom: 12px;
    z-index: 60;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    width: min(94vw, 1000px);
    max-height: min(82vh, 760px);
    background: #171410;
    border: 1px solid #6d6653;
    border-radius: 8px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.65);
    font-size: 12.5px;
  }
  .cmp.min {
    width: auto;
  }
  .cmp-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-bottom: 1px solid #2a2519;
    flex: 0 0 auto;
  }
  .cmp.min .cmp-bar {
    border-bottom: none;
  }
  .cmp-title {
    color: #9a9279;
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    margin-right: auto;
  }
  .cmp-btn {
    background: transparent;
    border: 1px solid #362f22;
    color: #9a9279;
    border-radius: 4px;
    cursor: pointer;
    padding: 2px 7px;
    font-size: 11px;
    font-family: inherit;
  }
  .cmp-btn:hover {
    color: #ece6d4;
    border-color: #6d6653;
  }
  .cmp-body {
    overflow: auto;
    padding: 10px 12px 14px;
  }
  .cmp-grid {
    min-width: fit-content;
  }
  .cmp-row {
    display: grid;
    grid-template-columns: 15ch repeat(var(--cols), minmax(9ch, 1fr));
    gap: 12px;
    align-items: baseline;
    padding: 1px 0;
  }
  .cmp-row:nth-child(even) {
    background: #1b1811;
  }
  .cmp-head {
    align-items: end;
    padding-bottom: 6px;
    margin-bottom: 4px;
    border-bottom: 1px solid #2a2519;
    background: none;
  }
  .cmp-name {
    display: flex;
    flex-direction: column;
    font-weight: 700;
    color: #ece6d4;
    position: relative;
    padding-right: 14px;
  }
  .cmp-name[data-cat='melee'] {
    color: #83bb6f;
  }
  .cmp-name[data-cat='duelist'] {
    color: #d3a04e;
  }
  .cmp-name[data-cat='tank'] {
    color: #6fa0c8;
  }
  .cmp-name[data-cat='finesse'] {
    color: #e6bf57;
  }
  .cmp-name[data-cat='ranged'] {
    color: #d76f5d;
  }
  .cmp-name[data-cat='caster'] {
    color: #a98fd6;
  }
  .cmp-name[data-cat='general'] {
    color: #9a9279;
  }
  .cmp-name i {
    font-style: normal;
    font-weight: 400;
    color: #6d6653;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-top: 2px;
  }
  .cmp-drop {
    position: absolute;
    top: 0;
    right: 0;
    background: transparent;
    border: none;
    color: #6d6653;
    cursor: pointer;
    font-size: 11px;
    padding: 0;
  }
  .cmp-drop:hover {
    color: #d76f5d;
  }
  .cmp-row .il {
    color: #6d6653;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .cmp-row .iv {
    font-variant-numeric: tabular-nums;
  }
  .cmp-row .iv.absent {
    color: #4a4436;
  }
  .infopanel {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 340px;
    overflow-y: auto;
    background: #171410;
    border-left: 1px solid #4a4030;
    box-shadow: -8px 0 24px rgba(0, 0, 0, 0.4);
    padding: 14px 16px 40px;
    z-index: 40;
    font-size: 12.5px;
  }
  .ip-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: #6d6653;
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    margin-bottom: 10px;
  }
  .ip-close {
    background: transparent;
    border: 1px solid #362f22;
    color: #9a9279;
    border-radius: 4px;
    cursor: pointer;
    padding: 2px 7px;
    font-size: 11px;
  }
  .info-head {
    font-size: 15px;
    font-weight: 700;
    color: #ece6d4;
    display: flex;
    align-items: baseline;
    gap: 8px;
    border-bottom: 1px solid #2a2519;
    padding-bottom: 6px;
    margin-bottom: 8px;
  }
  .info-head[data-cat='melee'] {
    color: #83bb6f;
  }
  .info-head[data-cat='duelist'] {
    color: #d3a04e;
  }
  .info-head[data-cat='tank'] {
    color: #6fa0c8;
  }
  .info-head[data-cat='finesse'] {
    color: #e6bf57;
  }
  .info-head[data-cat='ranged'] {
    color: #d76f5d;
  }
  .info-head[data-cat='caster'] {
    color: #a98fd6;
  }
  .info-head[data-cat='general'] {
    color: #9a9279;
  }
  .info-kind {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #6d6653;
    font-weight: 400;
    margin-left: auto;
  }
  .info-desc {
    color: #b8b199;
    font-size: 12px;
    line-height: 1.5;
    margin: 0 0 10px;
    font-style: italic;
  }
  .info-grid {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .info-row {
    display: flex;
    gap: 10px;
    align-items: baseline;
  }
  .info-row .il {
    flex: 0 0 34%;
    color: #6d6653;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .info-row .iv {
    flex: 1;
    font-variant-numeric: tabular-nums;
  }
  .iv.good {
    color: #83bb6f;
  }
  .iv.bad {
    color: #d76f5d;
  }
  .iv.info {
    color: #ece6d4;
  }
  .info-empty {
    color: #6d6653;
    font-size: 12px;
  }
  td.clickable {
    cursor: pointer;
  }
  .sub {
    color: #9a9279;
    font-size: 12px;
    white-space: normal;
  }
</style>
