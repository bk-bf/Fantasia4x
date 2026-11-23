import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = process.argv[2] || join(here, '../..');
const db = join(repo, 'src/lib/game/database');
const load = p => JSON.parse(readFileSync(join(db, p), 'utf8'));
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const rgbHex = c => Array.isArray(c) ? '#' + c.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('') : c;
const title = s => s.replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
const pick = (o, keys) => { const r = {}; for (const k of keys) if (o[k] !== undefined) r[k] = o[k]; return r; };
const omit = (o, keys) => { const r = {}; for (const k in o) if (!keys.includes(k)) r[k] = o[k]; return r; };
const filled = o => { const r = {}; for (const k in o) { const v = o[k]; if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) continue; r[k] = v; } return r; };
const git = (...args) => { try { return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim(); } catch { return ''; } };

async function derived() {
  const { createServer } = await import(pathToFileURL(join(repo, 'node_modules/vite/dist/node/index.js')).href);
  const server = await createServer({ root: repo, configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'error' });
  try {
    const gear = await server.ssrLoadModule('/src/lib/dev/gearDb.ts');
    const buildings = await server.ssrLoadModule('/src/lib/dev/buildingTree.ts');
    const items = await server.ssrLoadModule('/src/lib/dev/itemTree.ts');
    return { AGES: [...gear.AGES], BUILDS: gear.BUILDS.map(name => ({ name, cat: gear.BUILD_CAT[name], ...gear.BUILD_SPEC[name] })), tree: new Map(items.TREE_ITEMS.map(t => [t.id, t])), rows: new Map(buildings.BUILD_ROWS.map(r => [r.id, r])) };
  } finally { await server.close(); }
}

const dev = await derived();
const out = [];
const add = o => out.push(o);

for (const s of load('world/subterrains.json')) add({ cat: 'ground', group: 'Subterrain', id: s.id, name: s.displayName, color: s.fg, src: pick(s, ['walkable', 'movementCost']), biomes: s.biomes ? Object.keys(s.biomes) : undefined });

const COVER = new Set(['grass_patch', 'tall_grass_patch', 'deep_grass_patch', 'moss', 'forest_moss']);
const DEPOSIT = new Set(['savanna', 'quicksand', 'mud_deposit', 'bog_deposit', 'fire_clay', 'blue_clay', 'riverbank_deposit']);
const HERB = new Set(['bloodroot', 'dreamleaf', 'mandrake', 'emberbloom']);
const DEADWOOD = new Set(['fallen_logs', 'tree_stump']);
const ROCK = new Set(['stone_outcrop', 'mountain_wall', 'cliff_wall']);
function resourceKind(r) {
  if (r.id.startsWith('crop_')) return ['crop', 'Crop'];
  if (r.subterrain === 'tree') return ['tree', r.glow ? 'Magic tree' : 'Tree'];
  if (r.id === 'dead_tree') return ['tree', 'Tree'];
  if (r.subterrain === 'ore_vein') return ['ore', 'Ore vein'];
  if (r.subterrain === 'crystal_formation') return ['ore', 'Crystal'];
  if (ROCK.has(r.id)) return ['ore', 'Rock'];
  if (DEPOSIT.has(r.id)) return ['ore', 'Deposit'];
  if (r.lair) return ['site', 'Lair'];
  if ((r.designationTypes || []).includes('dig') && !COVER.has(r.id)) return ['site', 'Dig site'];
  if (COVER.has(r.id)) return ['plant', 'Ground cover'];
  if (HERB.has(r.id)) return ['plant', 'Herb'];
  if (r.subterrain === 'mushroom_patch') return ['plant', 'Fungus'];
  if (DEADWOOD.has(r.id)) return ['plant', 'Deadwood'];
  if (r.id.startsWith('wild_') || r.id === 'sugarcane' || r.id === 'berry_bush') return ['plant', 'Wild crop'];
  return ['plant', 'Shrub'];
}
function harvest(r) {
  const acts = [r.interaction, ...(r.interactions || [])].filter(Boolean), seen = new Set(), list = [];
  for (const a of acts) {
    const k = a.action + '/' + (a.harvestSubType || '');
    if (seen.has(k)) continue;
    seen.add(k);
    list.push({ action: a.action, work: a.workAmount, tool: a.toolRequirement && a.toolRequirement.minTier, toolWork: a.toolRequirement && a.toolRequirement.workType, yields: (a.yields || []).map(y => ({ id: y.itemId, n: y.amount })) });
  }
  return list;
}
for (const r of load('world/resources.json')) {
  const [cat, group] = resourceKind(r);
  const yields = [...new Set([r.interaction, ...(r.interactions || [])].filter(Boolean).flatMap(i => (i.yields || []).map(y => y.itemId)))];
  add({ cat, group, id: r.id, name: r.displayName, color: r.fg, src: { ...pick(r, ['subterrain', 'walkable', 'renderScale', 'detail', 'showGroundBelow', 'blocksSight', 'roofSupport', 'lair', 'particleEffect', 'growthTurns']), glow: r.glow ? r.glow.color : undefined, yields, spawnsOn: Object.keys((r.spawn || {}).subterrains || {}), seasons: r.seasonVariants ? Object.keys(r.seasonVariants) : undefined }, harvest: harvest(r), node: r.nodeAmountRange, grazing: r.grazing });
}

const BUILDING_DROP = ['id', 'name', 'description', 'color', 'charSpans', 'transparentBg', 'category', 'ageTier', 'buildingCost'];
for (const b of load('world/buildings.json')) {
  const [age, step] = b.ageTier.split(':'), row = dev.rows.get(b.id);
  add({ cat: 'building', group: title(b.category), sub: title(age), id: b.id, name: b.name, desc: b.description, color: b.color, src: { ...pick(b, ['ageTier', 'workstation', 'walkable', 'lightRadius', 'lightColor', 'passive', 'blocksSight', 'notBuildable', 'terraformSubType', 'requiresLighting']), age, step: +step, cost: b.buildingCost }, age: row ? row.age : title(age), line: row ? row.path.slice(0, -1) : [title(b.category)], d: row ? filled(pick(row, ['rung', 'speed', 'boosts', 'stores', 'fuel', 'makes', 'inherited', 'work'])) : {}, raw: filled(omit(b, BUILDING_DROP)) });
}

const CREATURE_DROP = ['id', 'name', 'flavor', 'audio', 'charSpans', 'fg', 'bg'];
const creatures = load('pawns/creatures.json');
const byId = Object.fromEntries(creatures.map(c => [c.id, c]));
for (const c of creatures) {
  const base = c.variantOf && byId[c.variantOf] ? byId[c.variantOf] : c;
  const species = c.species || (c.id.startsWith('kingdom_') ? 'kingdom' : c.id);
  add({ cat: 'creature', group: title(byId[species] ? byId[species].name : species), sub: title(c.entityClass), id: c.id, name: c.name, desc: c.flavor, color: rgbHex(c.fg), src: { ...pick(c, ['entityClass', 'species', 'variantOf', 'limbMap', 'bodyScale', 'tier', 'threatLevel', 'behaviour', 'diet', 'lair', 'naturalWeapons', 'mountable', 'tameable', 'traits', 'sex']), baseScale: base.bodyScale }, raw: filled(omit(c, CREATURE_DROP)) });
}

for (const a of load('social/culture-lore.json').archetypes) add({ cat: 'folk', group: 'Culture archetype', id: slug(a.name), name: a.name, desc: `${title(a.homelands[0])}. ${title(a.origins[0])}.`, src: pick(a, ['sizeBias', 'traits', 'statFocus', 'statDump', 'temperaments', 'homelands']) });

const ITEM_DROP = ['id', 'name', 'description', 'color', 'charSpans', 'audio', 'amount'];
const GEAR_KEEP = ['classes', 'fallbackClasses', 'research', 'craftable', 'dmg', 'damMin', 'damMax', 'damageType', 'ap', 'armorDmg', 'crit', 'critMult', 'accuracy', 'atkSpeed', 'stamina', 'reach', 'range', 'stun', 'scaling', 'twoHanded', 'onHit', 'wieldStr', 'defense', 'armorType', 'slot', 'bodyPart', 'droppedBy', 'source', 'armorSet', 'setLabel', 'movePen', 'stealthMod', 'block', 'boostSpeed', 'boostYield', 'boostQuality', 'work', 'medicine', 'effect', 'durability'];
function itemKind(path) {
  const [top, second] = path;
  if (top === 'Weapons') return 'weapon';
  if (top === 'Natural weapons') return 'natural';
  if (top === 'Armour' || top === 'Shields' || top === 'Regalia & jewellery') return 'armour';
  if (top === 'Tools' || top === 'Carry aids' || top === 'Vessels') return 'tool';
  if (top === 'Ammo') return 'ammo';
  if (second === 'Medicine') return 'medicine';
  if (second === 'Food' || second === 'Drink' || second === 'Beast organs') return 'food';
  if (top === 'Fluids' || top === 'Consumables') return 'supply';
  return 'material';
}
for (const i of load('items/items.json')) {
  const w = i.weaponProperties, a = i.armorProperties, t = dev.tree.get(i.id);
  const gear = filled(pick(t.row, GEAR_KEEP));
  if (gear.classes && gear.classes.length === 1 && gear.classes[0] === 'General') delete gear.classes;
  add({ cat: 'item', group: title(i.type), sub: title(i.category), id: i.id, name: i.name, desc: i.description, color: i.color, src: { ...pick(i, ['type', 'category', 'tier', 'material', 'ageTier', 'weightKg', 'hidden', 'rarity', 'heldBy', 'processingType', 'gatheringTypes']), weapon: w && pick(w, ['damageType', 'twoHanded', 'range', 'reach', 'projectile', 'ammoCategory', 'arcane', 'weaponFamily', 'weight']), armor: a && pick(a, ['slot', 'equipmentSlot', 'armorType', 'armorLayer', 'armorSet']), ammo: i.ammoProperties && pick(i.ammoProperties, ['ammoCategory', 'category']), container: i.container ? true : undefined }, kind: itemKind(t.path), age: t.age, line: t.path.filter(p => p !== t.age), paths: t.paths.length > 1 ? t.paths.slice(1).map(p => p.filter(q => q !== t.age)) : undefined, d: filled({ ...gear, stat: t.stat === '—' ? '' : t.stat, effects: t.effects, gatedBy: t.gatedBy, heldBy: t.heldBy, armourClass: t.cls }), raw: filled(omit(i, ITEM_DROP)) });
}

const recipes = load('items/recipes.json').map(r => filled({ id: r.id, station: r.station, in: r.inputs, alt: r.inputAlternatives, dyn: r.dynamicRecipe && Object.values(r.dynamicRecipe).map(s => ({ cats: s.acceptsCategories || [s.acceptsCategory], n: s.quantity })), out: r.outputs, work: r.workAmount, tool: r.toolTierRequired || undefined, toolWork: r.toolRequirement && r.toolRequirement.workType, research: r.researchRequired, passive: r.passive, discipline: r.discipline }));

const pools = {};
for (const [id, p] of Object.entries(load('items/lootpool.json').pools || {})) {
  const drops = [];
  const share = (slot, label) => { const sum = (slot.pick || []).reduce((n, x) => n + (x.w || 1), 0); for (const x of slot.pick || []) drops.push({ id: x.id, slot: label, chance: +(((slot.chance ?? 1) * (x.w || 1)) / sum).toFixed(3) }); };
  for (const [slot, s] of Object.entries(p.slots || {})) share(s, slot);
  for (const s of p.carried || []) share(s, 'carried');
  pools[id] = { dropChance: p.dropChance, drops };
}

const research = Object.fromEntries(load('progression/research.json').map(r => [r.id, { name: r.name, tier: r.tier, needs: r.prerequisites }]));

const counts = {};
for (const o of out) counts[o.cat] = (counts[o.cat] || 0) + 1;
const [commit, commitDate] = git('log', '-1', '--format=%h %cs').split(' ');
const snapshot = { source: 'src/lib/game/database', commit, commitDate, branch: git('rev-parse', '--abbrev-ref', 'HEAD'), dirty: git('status', '--porcelain', '--', 'src/lib/game/database', 'src/lib/dev') !== '', generated: new Date().toISOString().slice(0, 10), ages: dev.AGES, builds: dev.BUILDS, objects: out, recipes, pools, research };
const file = join(here, 'catalog-data.json');
writeFileSync(file, JSON.stringify(snapshot));
console.log(file, JSON.stringify(counts), out.length, 'objects', recipes.length, 'recipes', commit, commitDate, Math.round(JSON.stringify(snapshot).length / 1024) + ' KB');
