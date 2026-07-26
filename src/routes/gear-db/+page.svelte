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
  </div>

  {#if view === 'builds'}
    <p class="hint">Every archetype's real support, extracted from the data. Click a build to see its entries.</p>
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th>Build</th><th class="num">Weapons</th><th class="num">Armour</th>
            <th class="num">Ungated</th><th class="num">Cultural</th><th class="num">Lineage</th>
            <th>Lineages</th><th>Gaps</th>
          </tr>
        </thead>
        <tbody>
          {#each summaries as s (s.build)}
            <tr class="clickable" onclick={() => openBuild(s.build)}>
              <td class="name cls" data-cat={BUILD_CAT[s.build]}>{s.build}</td>
              <td class="num">{s.weapons}</td>
              <td class="num">{s.armor}</td>
              <td class="num" class:warn={s.ungatedTraits <= 1}>{s.ungatedTraits}</td>
              <td class="num">{s.culturalTraits}</td>
              <td class="num">{s.lineageTraits}</td>
              <td class="sub">{s.lineages.length ? s.lineages.join(' · ') : '—'}</td>
              <td class="gaps">{#if s.gaps.length}{s.gaps.join(' · ')}{:else}—{/if}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
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
            <tr>
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
  td.num.warn {
    color: #d76f5d;
  }
  td.gaps {
    color: #d76f5d;
    font-size: 12px;
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
  td.cls[data-cat='general'] {
    color: #6d6653;
  }
  .sub {
    color: #9a9279;
    font-size: 12px;
    white-space: normal;
  }
</style>
