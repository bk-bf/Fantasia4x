<script lang="ts">
  // DEV TOOL — data-driven BUILD database. Reads the derived catalogue from $lib/dev/gearDb (which
  // imports the real items/recipes/buildings/research/traits .jsonc), so it stays in sync with the
  // data. Everything is auto-classified to build archetypes by stats. Views: a Builds overview + a
  // filterable/sortable catalogue of weapons, armour, ammo and traits.
  import { page } from '$app/state';
  import {
    GEAR,
    CLASSES,
    AGES,
    BUILDS,
    BUILD_CAT,
    REAL_RARITIES,
    BODY_PARTS,
    BUILD_SPEC,
    buildSummaries,
    describeClasses,
    type GearRow,
    type GearKind
  } from '$lib/dev/gearDb';

  const CAT_KINDS: (GearKind | 'all')[] = ['all', 'weapon', 'armor', 'ammo', 'trait'];
  const KIND_LABEL: Record<string, string> = {
    all: 'All', weapon: 'Weapons', armor: 'Armour', ammo: 'Ammo', trait: 'Traits'
  };
  const CATALOGUE = GEAR.filter((g) => ['weapon', 'armor', 'ammo', 'trait'].includes(g.kind));
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
  for (const arr of cellMap.values()) arr.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name)); // by tier
  const cell = (build: string, gkind: 'weapon' | 'armor', age: string) => cellMap.get(`${build}|${gkind}|${age}`) ?? [];
  const missingParts = (items: GearRow[]) => BODY_PARTS.filter((p) => !items.some((it) => it.bodyPart === p));

  const byEvoRarity = (a: GearRow, b: GearRow) => a.evoStage - b.evoStage || a.rarityRank - b.rarityRank || a.name.localeCompare(b.name);
  const posFirst = (a: GearRow, b: GearRow) =>
    (a.polarity === 'negative' ? 1 : 0) - (b.polarity === 'negative' ? 1 : 0) || a.evoStage - b.evoStage || a.name.localeCompare(b.name);
  const allTraits = (build: string) => GEAR.filter((g) => g.kind === 'trait' && g.classes.includes(build as never)).sort(byEvoRarity);
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
      .sort((a, b) => a.gradeRank - b.gradeRank || (a.lineageNames ?? '').localeCompare(b.lineageNames ?? '') || a.name.localeCompare(b.name));
  let showLineageCol = $state(false);

  const pBview = page.url?.searchParams?.get('bview') ?? '';
  let bview = $state<'weapon' | 'armor' | 'trait' | 'all'>(
    (['armor', 'trait', 'all'] as string[]).includes(pBview) ? (pBview as 'armor' | 'trait' | 'all') : 'weapon'
  );

  // Cross-table multi-select: click any item/trait to highlight every instance of it in the table.
  let sel = $state<Record<string, boolean>>({});
  const selCount = $derived(Object.keys(sel).length);
  function toggleSel(id: string) {
    if (sel[id]) delete sel[id];
    else sel[id] = true;
  }
  const clearSel = () => (sel = {});

  // Hover / info panel: a formatted, colour-coded breakdown of any item, trait, or build.
  let hovered = $state<GearRow | null>(null);
  let hoveredBuild = $state<string | null>(null);
  let hx = $state(0);
  let hy = $state(0);
  let pinInfo = $state(false);
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
    pos(e);
  }
  function hoverBuild(b: string, e: MouseEvent) {
    hoveredBuild = b;
    hovered = null;
    pos(e);
  }
  function hoverOut() {
    if (pinInfo) return; // keep the last breakdown pinned
    hovered = null;
    hoveredBuild = null;
  }

  interface InfoRow {
    label: string;
    val: string;
    tone: 'good' | 'bad' | 'info';
  }
  function infoRows(g: GearRow): InfoRow[] {
    const rows: InfoRow[] = [];
    const push = (label: string, val: unknown, tone: InfoRow['tone'] = 'info') => {
      if (val !== null && val !== undefined && val !== '') rows.push({ label, val: String(val), tone });
    };
    const e = g.raw?.effects ?? {};
    const mults = (obj: Record<string, number> | undefined, suffix = '') => {
      if (!obj) return;
      for (const [k, v] of Object.entries(obj)) push(k + suffix, '×' + v, v >= 1 ? 'good' : 'bad');
    };
    if (g.kind === 'weapon' || g.kind === 'ammo') {
      push('damage', g.dmg != null ? `${g.dmg}${g.damMin != null ? ` (${g.damMin}–${g.damMax})` : ''} ${g.damageType ?? ''}`.trim() : null, 'good');
      push('armour pen', g.ap != null ? pct(g.ap) : null, 'good');
      push('armour damage', g.armorDmg, 'good');
      push('crit', g.crit != null ? pct(g.crit) : null, 'good');
      push('accuracy', g.accuracy, g.accuracy != null && g.accuracy < 0 ? 'bad' : 'good');
      push('attack speed', g.atkSpeed);
      push('reach', g.reach);
      push('range', g.range);
      push('stun', g.stun != null ? pct(g.stun) : null, 'good');
      push('stamina / hit', g.stamina, 'bad');
      push('scales with', g.scaling);
      push('grip', g.twoHanded ? 'two-handed' : 'one-handed');
      push('on-hit', g.onHit, 'bad');
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
      for (const stat of ['strength', 'dexterity', 'constitution', 'perception', 'intelligence', 'charisma']) {
        const ab = stat.slice(0, 3).toUpperCase();
        if (e[stat + 'Bonus'] != null) push(ab, '+' + e[stat + 'Bonus'], 'good');
        if (e[stat + 'Penalty'] != null) push(ab, '−' + e[stat + 'Penalty'], 'bad');
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
      if (g.raw?.bodyMods) push('body', g.raw.bodyMods.map((bm: any) => `${bm.target}${bm.hpMult ? ' ×' + bm.hpMult : ''}`).join(', '));
      if (g.raw?.selfCondition) push('grants', g.raw.selfCondition, 'good');
      if (g.raw?.aura) push('aura', `${g.raw.aura.condition} · r${g.raw.aura.radius} · ${g.raw.aura.affects}`);
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
        push('source', g.craftable ? 'craftable' : 'wild / boss');
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
    if (e.key === 'ArrowDown') { acIdx = (acIdx + 1) % n; e.preventDefault(); }
    else if (e.key === 'ArrowUp') { acIdx = (acIdx - 1 + n) % n; e.preventDefault(); }
    else if (e.key === 'Enter') { toggleSel(acMatches[acIdx].id); e.preventDefault(); }
    else if (e.key === 'Escape') acq = '';
  }

  // Initial view from the URL (?view=catalogue&kind=weapon&build=Marksman) so SSR + deep-links agree.
  const params = page.url?.searchParams ?? new URLSearchParams();
  const pKind = params.get('kind');
  const pBuild = params.get('build');
  let view = $state<'builds' | 'catalogue'>(
    pKind || pBuild || params.get('view') === 'catalogue' ? 'catalogue' : 'builds'
  );
  let kind = $state<GearKind | 'all'>(pKind && CAT_KINDS.includes(pKind as never) ? (pKind as GearKind | 'all') : 'all');
  let q = $state('');
  let cls = $state(pBuild ?? 'All');
  let age = $state('All');
  let sortKey = $state<string>('name');
  let sortDir = $state(1);

  const pct = (v: number | null) => (v == null ? '—' : Math.round(v * 100) + '%');
  const numf = (v: number | null) => (v == null ? '—' : String(v));
  const dash = (v: string | null | undefined) => (v == null || v === '' ? '—' : v);
  const clsStr = (g: GearRow) => describeClasses(g.classes);
  const inputsStr = (g: GearRow) =>
    g.recipe && g.recipe.inputs.length ? g.recipe.inputs.map((i) => `${i.qty}× ${i.name}`).join(', ') : '—';
  const detail = (g: GearRow) => {
    if (g.kind === 'weapon' || g.kind === 'ammo')
      return g.dmg == null ? '—' : `${g.dmg}${g.damMin != null ? ` (${g.damMin}–${g.damMax})` : ''} ${g.damageType ?? ''}${g.ap ? ` · AP ${pct(g.ap)}` : ''}${g.crit ? ` · crit ${pct(g.crit)}` : ''}`;
    if (g.kind === 'armor') return `def ${numf(g.defense)} · ${dash(g.armorType)}${g.slot ? ` · ${g.slot}` : ''}${g.stealthMod ? ` · stealth +${g.stealthMod}` : ''}`;
    if (g.kind === 'trait') return dash(g.effect);
    return '—';
  };
  const source = (g: GearRow) =>
    g.kind === 'trait' ? dash(g.gating) : g.recipe ? g.recipe.station : g.craftable ? 'craftable' : 'wild/boss';

  interface Col {
    key: string;
    label: string;
    get: (g: GearRow) => string | number | null;
    disp?: (g: GearRow) => string;
    numeric?: boolean;
    clscol?: boolean;
  }

  const clsCol: Col = { key: 'cls', label: 'Class', get: (g) => g.cls, disp: clsStr, clscol: true };
  const recipeCols: Col[] = [
    { key: 'station', label: 'Station', get: (g) => g.recipe?.station ?? null, disp: (g) => dash(g.recipe?.station) },
    { key: 'toolTier', label: 'Tool tier', get: (g) => g.recipe?.toolTier ?? null, disp: (g) => (g.recipe ? 'T' + g.recipe.toolTier : '—'), numeric: true },
    { key: 'inputs', label: 'Inputs', get: (g) => inputsStr(g), disp: inputsStr },
    { key: 'research', label: 'Research', get: (g) => g.research, disp: (g) => dash(g.research) },
    { key: 'craftable', label: 'Source', get: (g) => (g.craftable ? 1 : 0), disp: (g) => (g.craftable ? 'craftable' : 'wild/boss'), numeric: true }
  ];

  const colsByKind: Record<string, Col[]> = {
    all: [
      { key: 'name', label: 'Item · trait', get: (g) => g.name },
      { key: 'kind', label: 'Kind', get: (g) => g.kind },
      clsCol,
      { key: 'age', label: 'Age', get: (g) => g.ageRank, disp: (g) => (g.kind === 'trait' ? '—' : g.age), numeric: true },
      { key: 'detail', label: 'Detail', get: (g) => detail(g) },
      { key: 'source', label: 'Source', get: (g) => source(g), disp: source }
    ],
    weapon: [
      { key: 'name', label: 'Weapon', get: (g) => g.name },
      clsCol,
      { key: 'dmg', label: 'Dmg', get: (g) => g.dmg, disp: (g) => (g.dmg == null ? '—' : `${g.dmg} (${g.damMin}–${g.damMax})`), numeric: true },
      { key: 'damageType', label: 'Type', get: (g) => g.damageType, disp: (g) => dash(g.damageType) },
      { key: 'ap', label: 'AP', get: (g) => g.ap, disp: (g) => pct(g.ap), numeric: true },
      { key: 'armorDmg', label: 'ArmDmg', get: (g) => g.armorDmg, disp: (g) => numf(g.armorDmg), numeric: true },
      { key: 'crit', label: 'Crit', get: (g) => g.crit, disp: (g) => pct(g.crit), numeric: true },
      { key: 'accuracy', label: 'Acc', get: (g) => g.accuracy, disp: (g) => numf(g.accuracy), numeric: true },
      { key: 'atkSpeed', label: 'Spd', get: (g) => g.atkSpeed, disp: (g) => numf(g.atkSpeed), numeric: true },
      { key: 'stamina', label: 'Stam', get: (g) => g.stamina, disp: (g) => numf(g.stamina), numeric: true },
      { key: 'reach', label: 'Reach', get: (g) => g.reach, disp: (g) => numf(g.reach), numeric: true },
      { key: 'range', label: 'Range', get: (g) => g.range, disp: (g) => numf(g.range), numeric: true },
      { key: 'stun', label: 'Stun', get: (g) => g.stun, disp: (g) => pct(g.stun), numeric: true },
      { key: 'scaling', label: 'Scales', get: (g) => g.scaling, disp: (g) => dash(g.scaling) },
      { key: 'twoHanded', label: 'Hands', get: (g) => (g.twoHanded ? 2 : 1), disp: (g) => (g.twoHanded ? '2H' : '1H'), numeric: true },
      { key: 'onHit', label: 'On-hit', get: (g) => g.onHit, disp: (g) => dash(g.onHit) },
      { key: 'wieldStr', label: 'STR gate', get: (g) => g.wieldStr, disp: (g) => numf(g.wieldStr), numeric: true },
      { key: 'weightKg', label: 'Wt', get: (g) => g.weightKg, disp: (g) => g.weightKg + 'kg', numeric: true },
      { key: 'age', label: 'Age', get: (g) => g.ageRank, disp: (g) => g.age, numeric: true },
      { key: 'tier', label: 'Tier', get: (g) => g.tier, numeric: true },
      ...recipeCols
    ],
    armor: [
      { key: 'name', label: 'Armour', get: (g) => g.name },
      clsCol,
      { key: 'defense', label: 'Def', get: (g) => g.defense, disp: (g) => numf(g.defense), numeric: true },
      { key: 'armorType', label: 'Weight', get: (g) => g.armorType, disp: (g) => dash(g.armorType) },
      { key: 'slot', label: 'Slot', get: (g) => g.slot, disp: (g) => dash(g.slot) },
      { key: 'block', label: 'Block', get: (g) => g.block, disp: (g) => pct(g.block), numeric: true },
      { key: 'stealthMod', label: 'Stealth', get: (g) => g.stealthMod, disp: (g) => (g.stealthMod == null ? '—' : '+' + g.stealthMod), numeric: true },
      { key: 'movePen', label: 'Move pen', get: (g) => g.movePen, disp: (g) => pct(g.movePen), numeric: true },
      { key: 'weightKg', label: 'Wt', get: (g) => g.weightKg, disp: (g) => g.weightKg + 'kg', numeric: true },
      { key: 'age', label: 'Age', get: (g) => g.ageRank, disp: (g) => g.age, numeric: true },
      { key: 'tier', label: 'Tier', get: (g) => g.tier, numeric: true },
      ...recipeCols
    ],
    ammo: [
      { key: 'name', label: 'Ammunition', get: (g) => g.name },
      clsCol,
      { key: 'dmg', label: 'Dmg', get: (g) => g.dmg, disp: (g) => numf(g.dmg), numeric: true },
      { key: 'damageType', label: 'Type', get: (g) => g.damageType, disp: (g) => dash(g.damageType) },
      { key: 'ap', label: 'AP', get: (g) => g.ap, disp: (g) => pct(g.ap), numeric: true },
      { key: 'armorDmg', label: 'ArmDmg', get: (g) => g.armorDmg, disp: (g) => numf(g.armorDmg), numeric: true },
      { key: 'age', label: 'Age', get: (g) => g.ageRank, disp: (g) => g.age, numeric: true },
      ...recipeCols
    ],
    trait: [
      { key: 'name', label: 'Trait', get: (g) => g.name },
      { key: 'cls', label: 'Supports', get: (g) => g.cls, disp: clsStr, clscol: true },
      { key: 'effect', label: 'Effect', get: (g) => g.effect, disp: (g) => dash(g.effect) },
      { key: 'gating', label: 'Gating', get: (g) => g.gating, disp: (g) => dash(g.gating) },
      { key: 'scope', label: 'Scope', get: (g) => g.scope, disp: (g) => dash(g.scope) },
      { key: 'rarity', label: 'Rarity', get: (g) => g.rarity, disp: (g) => dash(g.rarity) },
      { key: 'lineageNames', label: 'Lineage', get: (g) => g.lineageNames, disp: (g) => dash(g.lineageNames) }
    ]
  };

  const cols = $derived(colsByKind[kind]);

  const rows = $derived.by(() => {
    let r = kind === 'all' ? CATALOGUE : GEAR.filter((g) => g.kind === kind);
    if (cls !== 'All') r = r.filter((g) => g.classes.includes(cls as never));
    if (age !== 'All') r = r.filter((g) => g.age === age);
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      r = r.filter((g) =>
        (g.name + ' ' + g.id + ' ' + clsStr(g) + ' ' + (g.effect ?? '') + ' ' + (g.damageType ?? '')).toLowerCase().includes(s)
      );
    }
    const col = cols.find((c) => c.key === sortKey) ?? cols[0];
    return [...r].sort((a, b) => {
      const av = col.get(a),
        bv = col.get(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sortDir;
      return String(av).localeCompare(String(bv)) * sortDir;
    });
  });

  function sortBy(key: string) {
    if (sortKey === key) sortDir = -sortDir;
    else {
      sortKey = key;
      sortDir = 1;
    }
  }
  function openBuild(b: string) {
    cls = b;
    kind = 'all';
    view = 'catalogue';
    sortKey = 'name';
    sortDir = 1;
  }
  function selectKind(k: GearKind | 'all') {
    kind = k;
    view = 'catalogue';
    sortKey = 'name';
    sortDir = 1;
  }
</script>

<div class="build-db">
  <header>
    <h1>Build database <span class="live">live · {BUILDS.length} builds · {GEAR.length} entries</span></h1>
    <p>Auto-classified from <code>items.jsonc</code>, <code>recipes.jsonc</code> &amp; <code>traits.jsonc</code> by stats. Edit the data, save, reload.</p>
  </header>

  <div class="tabs">
    <button class="tab lead" class:active={view === 'builds'} onclick={() => (view = 'builds')}>Builds</button>
    <span class="sep"></span>
    {#each CAT_KINDS as k (k)}
      <button class="tab" class:active={view === 'catalogue' && kind === k} onclick={() => selectKind(k)}>{KIND_LABEL[k]}</button>
    {/each}
    <button class="tab info-toggle" class:active={pinInfo} onclick={() => (pinInfo = !pinInfo)} title="Pin a breakdown panel; otherwise hover shows a tooltip">ⓘ info panel</button>
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
    >{g.name}{#if g.kind === 'trait'}{#if g.lineageNames}<i class="lin">{g.lineageNames}</i>{:else if g.evoStage}<i>s{g.evoStage}</i>{/if}{:else}<i>T{g.tier}</i>{#if armour && g.bodyPart}<i class="slot">{g.bodyPart}</i>{/if}{/if}</button>
  {/snippet}
  {#snippet gearCell(items: GearRow[], armour: boolean)}
    {#each items as it (it.id)}{@render pill(it, armour)}{/each}
    {#if armour}{#each missingParts(items) as p (p)}<span class="miss">– {p}</span>{/each}{/if}
    {#if !items.length && !armour}<span class="dot">·</span>{/if}
  {/snippet}

  {#snippet infoBody(g: GearRow)}
    <div class="info-head" data-cat={BUILD_CAT[g.cls] ?? 'general'}>{g.name}<span class="info-kind">{g.kind}</span></div>
    {#if g.desc}<p class="info-desc">{g.desc}</p>{/if}
    <div class="info-grid">
      <div class="info-row"><span class="il">class</span><span class="iv info">{describeClasses(g.classes)}</span></div>
      {#each infoRows(g) as r, i (i)}<div class="info-row"><span class="il">{r.label}</span><span class="iv {r.tone}">{r.val}</span></div>{/each}
    </div>
  {/snippet}
  {#snippet buildBody(b: string)}
    <div class="info-head" data-cat={BUILD_CAT[b]}>{b}<span class="info-kind">build spec</span></div>
    <div class="info-grid">
      <div class="info-row"><span class="il">goal</span><span class="iv good">{BUILD_SPEC[b]?.goal}</span></div>
      <div class="info-row"><span class="il">requires</span><span class="iv info">{BUILD_SPEC[b]?.requires}</span></div>
      <div class="info-row"><span class="il">downside</span><span class="iv bad">{BUILD_SPEC[b]?.downside}</span></div>
    </div>
  {/snippet}

  {#if view === 'builds'}
    <div class="tabs sub">
      <button class="tab" class:active={bview === 'weapon'} onclick={() => (bview = 'weapon')}>Weapons by age</button>
      <button class="tab" class:active={bview === 'armor'} onclick={() => (bview = 'armor')}>Armour by age</button>
      <button class="tab" class:active={bview === 'trait'} onclick={() => (bview = 'trait')}>Traits &amp; lineages</button>
      <button class="tab" class:active={bview === 'all'} onclick={() => (bview = 'all')}>ALL</button>
      {#if selCount}<button class="tab clear" onclick={clearSel}>clear {selCount} selected ✕</button>{/if}
    </div>
    <div class="ac">
      <input class="search" type="search" autocomplete="off" placeholder="find weapon / armour / trait — ↑↓ to cycle, Enter to highlight" bind:value={acq} onkeydown={acKey} />
      {#if acMatches.length}
        <div class="acmenu" role="listbox" aria-label="matches">
          {#each acMatches as g, i (g.id)}
            <button type="button" class="acitem" class:hl={i === acIdx} class:selli={sel[g.id]} onclick={() => toggleSel(g.id)}>
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
        Each build's traits by rarity — <b class="neg">flaws in red</b>, lineage marker as a grey pill.
        <label class="chk" style="margin-left:14px"><input type="checkbox" bind:checked={showLineageCol} /> show lineage column</label>
        <span class="sub" style="margin-left:8px">{showLineageCol ? '(lineage traits pulled into their own column)' : '(lineage traits shown in their rarity column)'}</span>
      </p>
      <div class="scroll">
        <table class="grid">
          <thead>
            <tr><th>Build</th>{#each REAL_RARITIES as r (r)}<th>{r}</th>{/each}{#if showLineageCol}<th>lineage</th>{/if}</tr>
          </thead>
          <tbody>
            {#each BUILDS as b (b)}
              <tr>
                <td class="name cls clickable" data-cat={BUILD_CAT[b]} onclick={() => openBuild(b)} onmouseenter={(e) => hoverBuild(b, e)} onmouseleave={hoverOut}>{b}</td>
                {#each REAL_RARITIES as r (r)}
                  {@const ts = raritycell(b, r, showLineageCol)}
                  <td class="cellwrap" class:gap={ts.length === 0}>{#if ts.length}{#each ts as t (t.id)}{@render pill(t, false)}{/each}{:else}<span class="dot">·</span>{/if}</td>
                {/each}
                {#if showLineageCol}
                  {@const ls = lineageColTraits(b)}
                  <td class="cellwrap" class:gap={ls.length === 0}>{#if ls.length}{#each ls as t (t.id)}{@render pill(t, false)}{/each}{:else}<span class="dot">·</span>{/if}</td>
                {/if}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else if bview === 'all'}
      <p class="hint">One row per build — weapons &amp; armour by age (tier-sorted), then traits by rarity (<b class="neg">flaws in red</b>). <code>T#</code> = tier · <code>s#</code> = evolution stage. Click any to highlight.</p>
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
                <td class="name cls clickable" data-cat={BUILD_CAT[b]} onclick={() => openBuild(b)} onmouseenter={(e) => hoverBuild(b, e)} onmouseleave={hoverOut}>{b}</td>
                {#each AGES as a (a)}
                  {@const its = cell(b, 'weapon', a)}
                  <td class="cellwrap" class:gap={its.length === 0}>{@render gearCell(its, false)}</td>
                {/each}
                {#each AGES as a (a)}
                  {@const its = cell(b, 'armor', a)}
                  <td class="cellwrap" class:gap={its.length === 0}>{@render gearCell(its, true)}</td>
                {/each}
                {#each REAL_RARITIES as r (r)}
                  {@const ts = raritycell(b, r)}
                  <td class="cellwrap" class:gap={ts.length === 0}>{#if ts.length}{#each ts as t (t.id)}{@render pill(t, false)}{/each}{:else}<span class="dot">·</span>{/if}</td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <p class="hint">Each build's {bview === 'weapon' ? 'weapons' : 'armour'} laid out by age — empty cells are coverage gaps. <code>T#</code> = tier. Click an item to highlight it across the table; click a build name for its full list.</p>
      <div class="scroll">
        <table class="grid">
          <thead>
            <tr><th>Build</th>{#each AGES as a (a)}<th>{a}</th>{/each}</tr>
          </thead>
          <tbody>
            {#each BUILDS as b (b)}
              <tr>
                <td class="name cls clickable" data-cat={BUILD_CAT[b]} onclick={() => openBuild(b)} onmouseenter={(e) => hoverBuild(b, e)} onmouseleave={hoverOut}>{b}</td>
                {#each AGES as a (a)}
                  {@const its = cell(b, bview, a)}
                  <td class="cellwrap" class:gap={its.length === 0}>{@render gearCell(its, bview === 'armor')}</td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {:else}
    <div class="controls">
      <input class="search" type="search" placeholder="search…" bind:value={q} />
      <label>build
        <select bind:value={cls}>
          <option>All</option>
          {#each CLASSES as c (c)}<option>{c}</option>{/each}
        </select>
      </label>
      <label>age
        <select bind:value={age}>
          <option>All</option>
          {#each AGES as a (a)}<option>{a}</option>{/each}
        </select>
      </label>
      <span class="count">{rows.length} shown</span>
    </div>
    <div class="scroll">
      <table>
        <thead>
          <tr>
            {#each cols as c (c.key)}
              <th class:num={c.numeric} class:sorted={sortKey === c.key} onclick={() => sortBy(c.key)}>
                {c.label}{#if sortKey === c.key}<span class="arrow">{sortDir === 1 ? '▲' : '▼'}</span>{/if}
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each rows as g (g.id)}
            <tr class="clickable" class:sel={sel[g.id]} onclick={() => toggleSel(g.id)}>
              {#each cols as c (c.key)}
                <td class:num={c.numeric} class:name={c.key === 'name'} class:cls={c.clscol} data-cat={BUILD_CAT[g.cls]}>
                  {c.disp ? c.disp(g) : (c.get(g) ?? '—')}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if rows.length === 0}<p class="empty">No entries match.</p>{/if}
  {/if}

  {#if pinInfo}
    <aside class="infopanel">
      <div class="ip-head">info panel<button type="button" class="ip-close" onclick={() => (pinInfo = false)}>✕</button></div>
      {#if hoveredBuild}{@render buildBody(hoveredBuild)}
      {:else if hovered}{@render infoBody(hovered)}
      {:else}<p class="info-empty">Hover any item, trait, or build name to inspect it here.</p>{/if}
    </aside>
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
  .search,
  select {
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
  th.sorted {
    color: #d8ab52;
  }
  th.num,
  td.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .arrow {
    font-size: 9px;
    margin-left: 3px;
  }
  tbody tr:hover td {
    background: rgba(216, 171, 82, 0.04);
  }
  tr.clickable {
    cursor: pointer;
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
  tbody tr.sel td,
  tbody tr.sel:hover td {
    background: rgba(216, 171, 82, 0.16);
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
  .info-head[data-cat='melee'] { color: #83bb6f; }
  .info-head[data-cat='duelist'] { color: #d3a04e; }
  .info-head[data-cat='tank'] { color: #6fa0c8; }
  .info-head[data-cat='finesse'] { color: #e6bf57; }
  .info-head[data-cat='ranged'] { color: #d76f5d; }
  .info-head[data-cat='caster'] { color: #a98fd6; }
  .info-head[data-cat='general'] { color: #9a9279; }
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
  .iv.good { color: #83bb6f; }
  .iv.bad { color: #d76f5d; }
  .iv.info { color: #ece6d4; }
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
