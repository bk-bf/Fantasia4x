<script lang="ts">
  // DEV TOOL — data-driven gear browser. Reads the derived catalogue from $lib/dev/gearDb (which
  // imports the real items/recipes/buildings/research .jsonc), so it stays in sync with the data.
  // Classification is by stats (see gearDb.classify). Filter + sort by class / age / tier / kind.
  import { GEAR, CLASSES, KINDS, AGES, type GearRow, type GearKind } from '$lib/dev/gearDb';

  let kind = $state<GearKind>('weapon');
  let q = $state('');
  let cls = $state('All');
  let age = $state('All');
  let craftableOnly = $state(false);
  let sortKey = $state<string>('ageRank');
  let sortDir = $state(1);

  const pct = (v: number | null) => (v == null ? '—' : Math.round(v * 100) + '%');
  const num = (v: number | null) => (v == null ? '—' : String(v));
  const dash = (v: string | null | undefined) => (v == null || v === '' ? '—' : v);
  const inputsStr = (g: GearRow) =>
    g.recipe && g.recipe.inputs.length ? g.recipe.inputs.map((i) => `${i.qty}× ${i.name}`).join(', ') : '—';

  interface Col {
    key: string;
    label: string;
    get: (g: GearRow) => string | number | null;
    disp?: (g: GearRow) => string;
    numeric?: boolean;
  }

  const recipeCols: Col[] = [
    { key: 'station', label: 'Station', get: (g) => g.recipe?.station ?? null, disp: (g) => dash(g.recipe?.station) },
    { key: 'toolTier', label: 'Tool tier', get: (g) => g.recipe?.toolTier ?? null, disp: (g) => (g.recipe ? 'T' + g.recipe.toolTier : '—'), numeric: true },
    { key: 'discipline', label: 'Discipline', get: (g) => g.recipe?.discipline ?? null, disp: (g) => dash(g.recipe?.discipline) },
    { key: 'inputs', label: 'Inputs', get: (g) => inputsStr(g), disp: inputsStr },
    { key: 'research', label: 'Research', get: (g) => g.research, disp: (g) => dash(g.research) },
    { key: 'craftable', label: 'Source', get: (g) => (g.craftable ? 1 : 0), disp: (g) => (g.craftable ? 'craftable' : 'wild/boss'), numeric: true }
  ];

  const colsByKind: Record<GearKind, Col[]> = {
    weapon: [
      { key: 'name', label: 'Weapon', get: (g) => g.name },
      { key: 'cls', label: 'Class', get: (g) => g.cls },
      { key: 'dmg', label: 'Dmg', get: (g) => g.dmg, disp: (g) => (g.dmg == null ? '—' : `${g.dmg} (${g.damMin}–${g.damMax})`), numeric: true },
      { key: 'damageType', label: 'Type', get: (g) => g.damageType, disp: (g) => dash(g.damageType) },
      { key: 'ap', label: 'AP', get: (g) => g.ap, disp: (g) => pct(g.ap), numeric: true },
      { key: 'crit', label: 'Crit', get: (g) => g.crit, disp: (g) => pct(g.crit), numeric: true },
      { key: 'atkSpeed', label: 'Spd', get: (g) => g.atkSpeed, disp: (g) => num(g.atkSpeed), numeric: true },
      { key: 'reach', label: 'Reach', get: (g) => g.reach, disp: (g) => num(g.reach), numeric: true },
      { key: 'range', label: 'Range', get: (g) => g.range, disp: (g) => num(g.range), numeric: true },
      { key: 'stun', label: 'Stun', get: (g) => g.stun, disp: (g) => pct(g.stun), numeric: true },
      { key: 'scaling', label: 'Scales', get: (g) => g.scaling, disp: (g) => dash(g.scaling) },
      { key: 'twoHanded', label: 'Hands', get: (g) => (g.twoHanded ? 2 : 1), disp: (g) => (g.twoHanded ? '2H' : '1H'), numeric: true },
      { key: 'onHit', label: 'On-hit', get: (g) => g.onHit, disp: (g) => dash(g.onHit) },
      { key: 'wieldStr', label: 'STR gate', get: (g) => g.wieldStr, disp: (g) => num(g.wieldStr), numeric: true },
      { key: 'weightKg', label: 'Wt', get: (g) => g.weightKg, disp: (g) => g.weightKg + 'kg', numeric: true },
      { key: 'durability', label: 'Dur', get: (g) => g.durability, numeric: true },
      { key: 'age', label: 'Age', get: (g) => g.ageRank, disp: (g) => g.age, numeric: true },
      { key: 'tier', label: 'Tier', get: (g) => g.tier, numeric: true },
      ...recipeCols
    ],
    armor: [
      { key: 'name', label: 'Armour', get: (g) => g.name },
      { key: 'cls', label: 'Class', get: (g) => g.cls },
      { key: 'defense', label: 'Def', get: (g) => g.defense, disp: (g) => num(g.defense), numeric: true },
      { key: 'armorType', label: 'Weight', get: (g) => g.armorType, disp: (g) => dash(g.armorType) },
      { key: 'slot', label: 'Slot', get: (g) => g.slot, disp: (g) => dash(g.slot) },
      { key: 'block', label: 'Block', get: (g) => g.block, disp: (g) => pct(g.block), numeric: true },
      { key: 'stealthMod', label: 'Stealth', get: (g) => g.stealthMod, disp: (g) => (g.stealthMod == null ? '—' : '+' + g.stealthMod), numeric: true },
      { key: 'movePen', label: 'Move pen', get: (g) => g.movePen, disp: (g) => pct(g.movePen), numeric: true },
      { key: 'weightKg', label: 'Wt', get: (g) => g.weightKg, disp: (g) => g.weightKg + 'kg', numeric: true },
      { key: 'durability', label: 'Dur', get: (g) => g.durability, numeric: true },
      { key: 'age', label: 'Age', get: (g) => g.ageRank, disp: (g) => g.age, numeric: true },
      { key: 'tier', label: 'Tier', get: (g) => g.tier, numeric: true },
      ...recipeCols
    ],
    tool: [
      { key: 'name', label: 'Tool', get: (g) => g.name },
      { key: 'cls', label: 'Class', get: (g) => g.cls },
      { key: 'work', label: 'Work', get: (g) => g.work, disp: (g) => dash(g.work) },
      { key: 'boostSpeed', label: 'Speed', get: (g) => g.boostSpeed, disp: (g) => num(g.boostSpeed), numeric: true },
      { key: 'boostYield', label: 'Yield', get: (g) => g.boostYield, disp: (g) => num(g.boostYield), numeric: true },
      { key: 'boostQuality', label: 'Quality', get: (g) => g.boostQuality, disp: (g) => num(g.boostQuality), numeric: true },
      { key: 'weightKg', label: 'Wt', get: (g) => g.weightKg, disp: (g) => g.weightKg + 'kg', numeric: true },
      { key: 'durability', label: 'Dur', get: (g) => g.durability, numeric: true },
      { key: 'age', label: 'Age', get: (g) => g.ageRank, disp: (g) => g.age, numeric: true },
      { key: 'tier', label: 'Tier', get: (g) => g.tier, numeric: true },
      ...recipeCols
    ],
    ammo: [
      { key: 'name', label: 'Ammunition', get: (g) => g.name },
      { key: 'cls', label: 'Class', get: (g) => g.cls },
      { key: 'dmg', label: 'Dmg', get: (g) => g.dmg, disp: (g) => num(g.dmg), numeric: true },
      { key: 'damageType', label: 'Type', get: (g) => g.damageType, disp: (g) => dash(g.damageType) },
      { key: 'ap', label: 'AP', get: (g) => g.ap, disp: (g) => pct(g.ap), numeric: true },
      { key: 'age', label: 'Age', get: (g) => g.ageRank, disp: (g) => g.age, numeric: true },
      { key: 'tier', label: 'Tier', get: (g) => g.tier, numeric: true },
      ...recipeCols
    ],
    medicine: [
      { key: 'name', label: 'Medicine', get: (g) => g.name },
      { key: 'cls', label: 'Class', get: (g) => g.cls },
      { key: 'medicine', label: 'Quality', get: (g) => g.medicine, disp: (g) => num(g.medicine), numeric: true },
      { key: 'age', label: 'Age', get: (g) => g.ageRank, disp: (g) => g.age, numeric: true },
      ...recipeCols
    ]
  };

  const cols = $derived(colsByKind[kind]);

  const rows = $derived.by(() => {
    let r = GEAR.filter((g) => g.kind === kind);
    if (cls !== 'All') r = r.filter((g) => g.cls === cls);
    if (age !== 'All') r = r.filter((g) => g.age === age);
    if (craftableOnly) r = r.filter((g) => g.craftable);
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      r = r.filter((g) => (g.name + ' ' + g.id + ' ' + (g.work ?? '') + ' ' + (g.damageType ?? '') + ' ' + (g.cls ?? '')).toLowerCase().includes(s));
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

  const classCounts = $derived.by(() => {
    const inKind = GEAR.filter((g) => g.kind === kind);
    const m: Record<string, number> = {};
    for (const g of inKind) m[g.cls] = (m[g.cls] ?? 0) + 1;
    return m;
  });
</script>

<div class="gear-db">
  <header>
    <h1>Gear database <span class="live">live · {GEAR.length} items</span></h1>
    <p>Auto-classified from <code>items.jsonc</code> + <code>recipes.jsonc</code> by stats. Edit the data, save, reload.</p>
  </header>

  <div class="controls">
    <div class="kinds">
      {#each KINDS as k (k)}
        <button class:active={kind === k} onclick={() => (kind = k)}>{k}</button>
      {/each}
    </div>
    <input class="search" type="search" placeholder="search…" bind:value={q} />
    <label>class
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
    <label class="chk"><input type="checkbox" bind:checked={craftableOnly} /> craftable only</label>
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
              <td class:num={c.numeric} class:name={c.key === 'name'} class:cls={c.key === 'cls'} data-cls={g.cls}>
                {c.disp ? c.disp(g) : (c.get(g) ?? '—')}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if rows.length === 0}<p class="empty">No items match.</p>{/if}
</div>

<style>
  .gear-db {
    font-family: var(--font-mono, ui-monospace, monospace);
    color: #ece6d4;
    background: #13110c;
    min-height: 100vh;
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
    margin: 0 0 18px;
  }
  code {
    color: #d8ab52;
    background: rgba(216, 171, 82, 0.1);
    padding: 1px 4px;
    border-radius: 3px;
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    margin-bottom: 16px;
  }
  .kinds {
    display: flex;
    gap: 4px;
  }
  .kinds button {
    font-family: inherit;
    font-size: 12px;
    color: #9a9279;
    background: #1b1811;
    border: 1px solid #362f22;
    border-radius: 4px;
    padding: 5px 12px;
    cursor: pointer;
    text-transform: capitalize;
  }
  .kinds button.active {
    color: #13110c;
    background: #d8ab52;
    border-color: #d8ab52;
    font-weight: 700;
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
  .chk {
    cursor: pointer;
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
  td.name {
    color: #ece6d4;
    font-weight: 600;
  }
  td.cls {
    font-weight: 600;
  }
  td.cls[data-cls='Marksman'],
  td.cls[data-cls='Skulker'],
  td.cls[data-cls='Medic'],
  td.cls[data-cls='Commander'] {
    color: #d76f5d;
  }
  td.cls[data-cls='Bruiser'],
  td.cls[data-cls='Tank'],
  td.cls[data-cls='Artisan'] {
    color: #83bb6f;
  }
  td.cls[data-cls='Duelist'],
  td.cls[data-cls='Mage'] {
    color: #e6bf57;
  }
  td.cls[data-cls='Utility'] {
    color: #6d6653;
  }
  .empty {
    color: #9a9279;
    padding: 20px;
    text-align: center;
  }
</style>
