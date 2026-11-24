'use strict';
(() => {
  const { num, pct } = UI;
  const wp = o => o.raw.weaponProperties || {}, ap = o => o.raw.armorProperties || {}, am = o => o.raw.ammoProperties || {};
  const first = (...v) => v.find(x => x !== undefined && x !== null);
  const mid = r => (r ? (r[0] + r[1]) / 2 : undefined);
  const span = r => (r ? (r[0] === r[1] ? String(r[0]) : r[0] + '–' + r[1]) : '');
  const total = m => Object.values(m || {}).reduce((n, v) => n + v, 0) || undefined;
  const times = v => '×' + num(v);
  const plus = v => '+' + v + '%';
  const nameOf = id => { const o = UI.item(id.replace(/^category:/, '')); return o ? o.name : UI.title(id.replace(/^category:/, 'any ')); };
  const listed = m => Object.entries(m || {}).map(([k, v]) => v + ' ' + nameOf(k)).join(', ');
  const core = k => ({ get: o => mid((o.raw.statRanges || {})[k]), text: o => span((o.raw.statRanges || {})[k]) });
  const N = (label, name, get, more) => ({ label, name, get, num: true, ...more });
  const T = (label, name, get, more) => ({ label, name, get, ...more });

  const STAT = {
    kind: T('Kind', 'kind', o => UI.tabName(o.tab)),
    line: T('Line', 'line', o => o.line.slice(o.cat === 'item' ? 1 : 0).join(' · ')),
    group: T('Group', 'group', o => o.group),
    age: T('Age', 'age', o => o.age, { sort: o => o.col, age: true }),
    tier: N('T', 'tier', o => o.tier, { plain: true }),
    wt: N('KG', 'weight', o => o.raw.weightKg, { low: true }),
    vol: N('L', 'volume', o => o.raw.volumeL, { low: true }),
    dur: N('DUR', 'durability', o => first(o.raw.maxDurability, o.d.durability)),
    effects: T('Effect', 'effect', o => o.d.effects || o.d.stat || o.d.effect || ''),
    source: T('Source', 'source', o => o.d.source),
    gated: T('Gated by', 'gated by', o => o.d.gatedBy),
    research: T('Research', 'research', o => o.d.research),
    builds: T('Builds', 'builds', o => (o.d.classes || []).join(', ')),

    dmg: N('DMG', 'damage', o => first(o.d.dmg, wp(o).damage, am(o).damage)),
    roll: T('Roll', 'damage roll', o => (o.d.damMin === undefined ? '' : o.d.damMin + '–' + o.d.damMax), { sort: o => o.d.damMax }),
    type: T('Type', 'damage type', o => first(o.d.damageType, wp(o).damageType, am(o).damageType)),
    ap: N('AP', 'armour penetration', o => first(o.d.ap, wp(o).armorPenetration, am(o).armorPen), { fmt: pct }),
    admg: N('ADMG', 'armour damage', o => first(o.d.armorDmg, wp(o).armorDamage, am(o).armorDamage)),
    crit: N('CRIT', 'crit chance', o => first(o.d.crit, wp(o).critMod), { fmt: pct }),
    acc: N('ACC', 'accuracy', o => first(o.d.accuracy, am(o).accuracyBonus)),
    spd: N('SPD', 'attack speed', o => first(o.d.atkSpeed, wp(o).attackSpeed)),
    sta: N('STA', 'stamina cost', o => first(o.d.stamina, wp(o).staminaCost), { low: true }),
    reach: N('RCH', 'reach', o => o.d.reach),
    range: N('RNG', 'range', o => o.d.range || undefined),
    stun: N('STUN', 'stun chance', o => first(o.d.stun, wp(o).stunChance), { fmt: pct }),
    hands: T('Hands', 'hands', o => (o.d.twoHanded === undefined ? '' : o.d.twoHanded ? '2H' : '1H')),
    scal: T('Scales', 'scaling stat', o => o.d.scaling),
    wield: N('STR', 'strength to wield', o => o.d.wieldStr, { low: true }),
    onhit: T('On hit', 'on hit', o => o.d.onHit),
    users: N('USED', 'creatures using it', o => (UI.rel.wields.get(o.id) || []).length || undefined),

    def: N('DEF', 'defence', o => first(o.d.defense, ap(o).defense)),
    av: N('AV', 'armour value', o => ap(o).armorValue),
    move: N('MOVE', 'movement penalty', o => first(o.d.movePen, ap(o).movementPenalty) || undefined, { fmt: pct, low: true }),
    fat: N('FAT', 'fatigue per turn', o => ap(o).fatiguePerTurn, { low: true }),
    stealth: N('STL', 'stealth', o => o.d.stealthMod),
    block: N('BLK', 'block', o => first(o.d.block, ap(o).blockBonus), { fmt: pct }),
    parry: N('PRY', 'parry', o => ap(o).parryChance, { fmt: pct }),
    cold: N('COLD', 'cold resistance', o => ap(o).coldResistance),
    slot: T('Slot', 'slot', o => o.d.bodyPart || ap(o).slot),
    aclass: T('Class', 'armour class', o => o.d.armourClass || o.d.armorType),
    set: T('Set', 'set', o => (o.d.setLabel === 'unaffiliated' ? '' : o.d.setLabel)),
    layer: T('Layer', 'layer', o => ap(o).armorLayer),

    wspd: N('SPD', 'work speed', o => o.d.boostSpeed, { fmt: times }),
    wyld: N('YLD', 'work yield', o => o.d.boostYield, { fmt: times }),
    wqlt: N('QLT', 'work quality', o => o.d.boostQuality, { fmt: times }),
    cap: N('CAP', 'capacity', o => (o.raw.inventoryBonus || {}).weightKg || (o.raw.inventoryBonus || {}).volumeL || (o.raw.container || {}).capacityL || (o.raw.container || {}).capacityKg),
    carrykg: N('+KG', 'carry weight', o => (o.raw.inventoryBonus || {}).weightKg || undefined),
    carryl: N('+L', 'carry volume', o => (o.raw.inventoryBonus || {}).volumeL || undefined),
    holds: N('HOLD', 'holds litres', o => (o.raw.container || {}).capacityL),
    work: T('Work', 'work', o => o.d.work),

    med: N('MED', 'medicine quality', o => first(o.d.medicine, o.raw.medicineQuality)),
    food: N('FOOD', 'nutrition', o => o.raw.nutrition),
    drink: N('DRNK', 'hydration', o => o.raw.hydration),
    keep: N('KEEP', 'decay seconds', o => o.raw.decaySeconds),
    buff: T('Buff', 'meal buff', o => (o.raw.mealBuff || {}).condition),
    fuel: N('FUEL', 'fuel value', o => o.raw.fuelValue),
    heat: N('HEAT', 'fuel heat', o => o.raw.fuelHeat),
    value: N('VAL', 'value', o => first(o.raw.value, o.raw.craftValue)),

    bspeed: N('SPD', 'craft speed bonus', o => o.d.speed || undefined, { fmt: plus }),
    makes: N('MAKE', 'recipes', o => o.d.makes || undefined),
    bwork: N('WORK', 'work to build', o => o.d.work, { low: true }),
    costn: N('COST', 'materials', o => total(o.src.cost), { low: true }),
    cost: T('Materials', 'materials', o => listed(o.src.cost)),
    bfuel: N('FUEL', 'fuel per tick', o => o.d.fuel, { low: true }),
    light: N('LIGHT', 'light radius', o => o.raw.lightRadius),
    stores: T('Stores', 'stores', o => o.d.stores),
    boosts: T('Bonus', 'bonus', o => o.d.boosts),
    btool: N('TOOL', 'tool tier', o => o.raw.toolTierRequired || undefined, { plain: true }),
    pop: N('POP', 'population', o => o.raw.populationRequired, { plain: true }),
    rung: N('RUNG', 'ladder rung', o => o.d.rung, { plain: true }),
    needs: T('Research', 'research', o => { const r = UI.data.research[o.raw.researchRequired]; return r ? r.name : ''; }),

    threat: N('THR', 'threat', o => o.raw.threatLevel),
    str: N('STR', 'strength', null, core('strength')),
    dex: N('DEX', 'dexterity', null, core('dexterity')),
    con: N('CON', 'constitution', null, core('constitution')),
    per: N('PER', 'perception', null, core('perception')),
    arm: N('ARM', 'natural armour', o => first(o.raw.naturalArmor, mid(o.raw.naturalArmorRange)), { text: o => first(o.raw.naturalArmor, span(o.raw.naturalArmorRange)) }),
    pack: T('Pack', 'pack size', o => span(o.raw.pack), { sort: o => (o.raw.pack || [])[1] }),
    temper: T('Temper', 'behaviour', o => o.raw.behaviour),
    diet: T('Diet', 'diet', o => o.raw.diet),
    size: N('SIZE', 'body scale', o => o.raw.bodyScale),
    tame: T('Tame', 'tameable', o => (o.raw.tameable ? 'yes' : '')),
    cclass: T('Class', 'class', o => o.sub),
    species: T('Species', 'species', o => o.group),
    lair: T('Lair', 'lair', o => o.raw.lair),
    biome: T('Biomes', 'biomes', o => Object.keys(o.raw.biomeWeights || {}).join(', ')),

    yieldn: N('YLD', 'yields', o => (o.src.yields || []).length || undefined),
    yields: T('Yields', 'yields', o => (o.src.yields || []).map(nameOf).join(', ')),
    growth: N('GROW', 'growth turns', o => o.src.growthTurns, { low: true }),
    hwork: N('WORK', 'work', o => ((o.harvest || [])[0] || {}).work, { low: true }),
    htool: N('TOOL', 'tool tier', o => ((o.harvest || [])[0] || {}).tool || undefined, { plain: true }),
    node: T('Amount', 'node amount', o => span(o.node), { sort: o => (o.node || [])[1] }),
    spawns: T('Spawns on', 'spawns on', o => (o.src.spawnsOn || []).join(', ')),
    movec: N('MOVE', 'movement cost', o => o.src.movementCost, { low: true }),
    walk: T('Walk', 'walkable', o => (o.src.walkable === false ? 'no' : o.src.walkable ? 'yes' : '')),
    biomes: T('Biomes', 'biomes', o => (o.biomes || []).join(', ')),
    focus: T('Focus', 'stat focus', o => (o.src.statFocus || []).join(', ')),
    dump: T('Dump', 'stat dump', o => (o.src.statDump || []).join(', ')),
    bias: T('Size', 'size bias', o => (o.src.sizeBias || []).join(', ')),
    traits: T('Traits', 'traits', o => (o.src.traits || []).join(', ')),
    fodds: T('Odds', 'odds', o => o.src.odds),
    fseen: T('Seen', 'seen in the generated folk', o => o.src.seen),
    fwho: T('Cultures', 'cultures', o => o.src.who),
    fdetail: T('Detail', 'detail', o => o.src.detail),
    ckind: T('Kind', 'condition kind', o => o.src.kind),
    cicon: T('Icon', 'icon', o => o.src.icon),
    mark: T('Mark', 'boon or bane', o => o.src.mark),
    trinket: T('Effect', 'effect', o => (o.d.defense === undefined && o.d.block === undefined ? o.d.stat || o.d.effects || '' : '')),
  };
  for (const id in STAT) STAT[id].id = id;

  const DAMAGE = { cutting: 'CUT', piercing: 'PRC', blunt: 'BLT', fire: 'FIR', frost: 'FRO', lightning: 'LTN' };
  const SLOTS = ['head', 'torso — skin', 'torso — mid', 'torso — outer', 'arms', 'hands', 'legs', 'feet', 'feet — under', 'cloak', 'shield', 'amulet', 'ring'];
  const CLASSES = ['light', 'medium', 'heavy', 'shield'];
  const last = (o, n) => o.line[o.line.length - n];
  const armour = o => o.line[0] === 'Armour';
  const slotOf = o => (armour(o) ? last(o, 1) : o.line[0] === 'Shields' ? 'shield' : o.line[1]);
  const classOf = o => o.d.armourClass || 'regalia';
  const setOf = o => (armour(o) ? last(o, 3) : o.line[0]);
  const rankIn = list => label => { const i = list.indexOf(label); return i < 0 ? list.length : i; };
  const buildsOf = o => o.d.classes || ['General'];
  const buildRank = label => { const i = UI.data.builds.findIndex(b => b.name === label); return i < 0 ? 99 : i; };
  const buildNote = label => { const b = UI.data.builds.find(x => x.name === label); return b ? [b.cat, b.goal, b.requires, b.downside].filter(Boolean).join('\n') : ''; };
  const by = (id, label, of, rank, note) => ({ id, label, of, rank, note });
  const one = fn => o => [fn(o) || '—'];

  const TABS = [
    { id: 'all', name: 'All', lenses: ['sprites', 'table'], table: ['kind', 'line', 'age', 'tier', 'wt', 'effects', 'source'] },
    { id: 'item', name: 'Items', lenses: ['table', 'matrix', 'sprites'], axis: 'age', tile: [], note: 'effects', table: ['kind', 'line', 'age', 'tier', 'wt', 'vol', 'dur', 'effects', 'source', 'gated'], by: [by('kind', 'Kind', one(o => UI.tabName(o.tab)), l => TABS.findIndex(t => t.name === l))] },
    { id: 'weapon', name: 'Weapons', item: true, lenses: ['matrix', 'table', 'sprites'], axis: 'age', tile: ['dmg', 'ap', 'spd', 'sta'], main: 'dmg', tag: o => [DAMAGE[o.d.damageType], o.d.twoHanded ? '2H' : ''].filter(Boolean).join(' '),
      table: ['line', 'age', 'tier', 'dmg', 'roll', 'type', 'ap', 'admg', 'crit', 'acc', 'spd', 'sta', 'reach', 'range', 'stun', 'hands', 'scal', 'wield', 'wt', 'dur', 'source'], detail: ['onhit', 'builds', 'gated', 'research'],
      by: [by('family', 'Family', one(o => o.line[1])), by('build', 'Build', buildsOf, buildRank, buildNote), by('damage', 'Damage', one(o => o.d.damageType)), by('hands', 'Hands', one(o => o.line[3])), by('weight', 'Weight', one(o => o.line[2]), rankIn(['light', 'medium', 'heavy'])), by('scaling', 'Scaling', one(o => o.d.scaling))] },
    { id: 'armour', name: 'Armour', item: true, lenses: ['matrix', 'table', 'sprites'], axis: 'age', tile: ['def', 'move', 'wt'], main: 'def', note: 'trinket', tag: o => ({ light: 'L', medium: 'M', heavy: 'H', shield: 'SH' })[o.d.armourClass] || '',
      table: ['slot', 'aclass', 'set', 'layer', 'age', 'tier', 'def', 'av', 'block', 'parry', 'move', 'fat', 'stealth', 'cold', 'wt', 'dur', 'effects', 'source'], detail: ['builds', 'gated', 'research'],
      by: [by('slot', 'Slot', one(slotOf), rankIn(SLOTS)), by('cover', 'Class · slot', one(o => classOf(o) + ' · ' + slotOf(o)), l => { const [c, s] = l.split(' · '); return rankIn(CLASSES)(c) * 100 + rankIn(SLOTS)(s); }), by('set', 'Set', one(setOf)), by('class', 'Class', one(classOf), rankIn(CLASSES)), by('layer', 'Layer', one(o => (armour(o) ? last(o, 2) : o.line[0]))), by('build', 'Build', buildsOf, buildRank, buildNote)] },
    { id: 'tool', name: 'Tools', item: true, lenses: ['matrix', 'table', 'sprites'], axis: 'age', tile: ['wspd', 'wyld', 'cap', 'dur'], main: 'wspd',
      table: ['line', 'age', 'tier', 'work', 'wspd', 'wyld', 'wqlt', 'carrykg', 'carryl', 'holds', 'wt', 'dur', 'effects', 'source'], detail: ['gated', 'research'],
      by: [by('work', 'Work', one(o => (o.line[0] === 'Tools' ? o.line[1] : o.line.slice(0, 2).join(' · ')))), by('kind', 'Kind', one(o => o.line[0]))] },
    { id: 'ammo', name: 'Ammo', item: true, lenses: ['matrix', 'table', 'sprites'], axis: 'age', tile: ['dmg', 'ap', 'admg'], main: 'dmg', tag: o => DAMAGE[am(o).damageType] || '',
      table: ['line', 'age', 'tier', 'dmg', 'type', 'ap', 'admg', 'acc', 'wt', 'source'], detail: ['gated', 'research'], by: [by('type', 'Type', one(o => o.line[1]))] },
    { id: 'medicine', name: 'Medicine', item: true, lenses: ['matrix', 'table', 'sprites'], axis: 'age', tile: ['med'], main: 'med', note: 'effects',
      table: ['line', 'age', 'tier', 'med', 'effects', 'wt', 'source'], detail: ['gated', 'research'], by: [by('form', 'Form', one(o => (o.line[0] === 'Fluids' ? 'Draught' : 'Dressing')))] },
    { id: 'food', name: 'Food & drink', item: true, lenses: ['matrix', 'table', 'sprites'], axis: 'age', tile: ['food', 'drink', 'keep'], main: 'food',
      table: ['line', 'age', 'food', 'drink', 'keep', 'buff', 'wt', 'effects', 'source'], detail: ['gated'], by: [by('kind', 'Kind', one(o => (o.line[0] === 'Fluids' ? 'Drink' : o.line[2] || o.line[1])))] },
    { id: 'supply', name: 'Potions & fluids', item: true, lenses: ['matrix', 'table', 'sprites'], axis: 'age', tile: [], note: 'effects',
      table: ['line', 'age', 'tier', 'effects', 'wt', 'source', 'gated'], by: [by('kind', 'Kind', one(o => o.line[1]))] },
    { id: 'material', name: 'Materials', item: true, lenses: ['matrix', 'table', 'sprites'], axis: 'age', tile: ['wt', 'fuel', 'value'],
      table: ['line', 'age', 'tier', 'wt', 'vol', 'fuel', 'heat', 'value', 'effects', 'source', 'gated'], by: [by('group', 'Group', one(o => o.line[1])), by('detail', 'Detail', one(o => o.line.slice(1).join(' · ')))] },
    { id: 'natural', name: 'Natural', item: true, lenses: ['table', 'sprites'], table: ['dmg', 'type', 'ap', 'spd', 'sta', 'users'] },
    { id: 'building', name: 'Buildings', lenses: ['matrix', 'table', 'sprites'], axis: 'age', tile: ['bspeed', 'makes', 'bwork', 'costn'], main: 'makes',
      table: ['line', 'age', 'rung', 'bspeed', 'makes', 'bwork', 'costn', 'btool', 'pop', 'bfuel', 'light', 'boosts', 'stores', 'needs', 'cost'],
      by: [by('purpose', 'Purpose', one(o => o.line.join(' · '))), by('category', 'Category', one(o => o.line[0])), by('group', 'Group', one(o => o.group))] },
    { id: 'creature', name: 'Creatures', lenses: ['matrix', 'table', 'sprites'], axis: 'tier', tile: ['threat', 'str', 'con', 'arm'], main: 'threat', tag: o => ({ aggressive: 'AGG', neutral: 'NEU', passive: 'PAS' })[o.raw.behaviour] || '',
      table: ['species', 'cclass', 'tier', 'threat', 'str', 'dex', 'con', 'per', 'arm', 'pack', 'size', 'temper', 'diet', 'tame', 'lair', 'biome'],
      by: [by('species', 'Species', one(o => o.group)), by('class', 'Class', one(o => o.sub)), by('temper', 'Temper', one(o => o.raw.behaviour)), by('diet', 'Diet', one(o => o.raw.diet)), by('biome', 'Biome', o => Object.keys(o.raw.biomeWeights || {}))] },
    { id: 'folk', name: 'Folk', lenses: ['sprites', 'table'], table: ['fodds', 'fseen', 'fwho', 'fdetail', 'focus', 'dump', 'bias', 'traits'] },
    { id: 'ground', name: 'Ground', world: true, lenses: ['sprites', 'table'], table: ['movec', 'walk', 'biomes'] },
    { id: 'tree', name: 'Trees', world: true },
    { id: 'plant', name: 'Plants', world: true },
    { id: 'crop', name: 'Crops', world: true },
    { id: 'ore', name: 'Ore & rock', world: true },
    { id: 'site', name: 'Sites', world: true },
    { id: 'condition', name: 'Conditions', lenses: ['sprites', 'table'], table: ['ckind', 'cicon', 'mark'], by: [by('kind', 'Kind', one(o => o.src.kind))] },
    { id: 'concept', name: 'Concepts', lenses: ['sprites'] },
  ];
  for (const t of TABS) {
    t.lenses = t.lenses || ['sprites', 'table'];
    t.table = t.table || ['group', 'yieldn', 'growth', 'hwork', 'htool', 'node', 'spawns', 'yields'];
    t.has = t.id === 'all' ? () => true : t.id === 'item' ? o => o.cat === 'item' : o => o.tab === t.id;
  }

  UI.STAT = STAT;
  UI.TABS = TABS;
  UI.tab = id => TABS.find(t => t.id === id) || TABS.find(t => t.id === 'all');
  UI.tabName = id => UI.tab(id).name;
  UI.value = (stat, o) => { const v = stat.get(o); return v === undefined || v === null || v === '' ? null : v; };
  UI.shown = (stat, o) => {
    const v = UI.value(stat, o);
    if (v === null) return '';
    if (stat.text) return String(stat.text(o));
    return stat.num ? (stat.fmt || num)(v) : String(v);
  };
  UI.brief = (stat, o) => { const v = UI.value(stat, o); return v === null ? '' : stat.num ? (stat.fmt || num)(v) : String(v); };
  UI.sortKey = (stat, o) => (stat.sort ? stat.sort(o) : UI.value(stat, o));
  UI.lens = () => { const t = UI.tab(UI.st.cat); return t.lenses.includes(UI.st.view) ? UI.st.view : t.lenses[0]; };
  UI.grouping = () => { const t = UI.tab(UI.st.cat); return (t.by || []).find(b => b.id === UI.st.by) || (t.by || [])[0]; };
})();
