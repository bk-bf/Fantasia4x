'use strict';
let sheetFor = '';
function miniCanvas(w, season, scale, roofs) {
  const r = renderWorld(w, { season, roofs });
  const cv = document.createElement('canvas');
  cv.width = r.W; cv.height = r.H;
  cv.style.width = r.W * scale + 'px'; cv.style.height = r.H * scale + 'px';
  present(r, cv.getContext('2d'), 'day', 0, true);
  return cv;
}
function sprWorld(spr, ground) {
  const W = Math.max(2, Math.ceil((spr.w + 4) / T)), H = Math.max(2, Math.ceil((spr.h + 6) / T)), w = new World(W, H, G[ground]);
  w.objs.push({ spr, x: W * 8 + (spr.ax - (spr.w >> 1)), y: H * T - 5 });
  return w;
}
function buildSheet(root, season) {
  if (sheetFor === season) return;
  sheetFor = season; root.textContent = '';
  const S = 3;
  const section = (title, note) => {
    const h = document.createElement('h2'); h.textContent = title;
    if (note) { const sm = document.createElement('small'); sm.textContent = note; h.appendChild(sm); }
    const d = document.createElement('div'); d.className = 'cells';
    root.append(h, d); return d;
  };
  const cell = (d, cv, label) => { const c = document.createElement('div'); c.className = 'cell'; const sp = document.createElement('span'); sp.textContent = label; c.append(cv, sp); d.appendChild(c); };
  const sprCell = (d, spr, label, ground) => cell(d, miniCanvas(sprWorld(spr, ground || 'tall_grass'), season, S), label);

  let d = section('Ground', GROUND.length + ' types, drawn in world space so no tile repeats');
  for (const g of GROUND) cell(d, miniCanvas(new World(4, 3, G[g.id]), season, S), g.name);

  d = section('Transitions', 'borders follow noise, not the grid');
  const pairs = [['deep_grass', 'dirt'], ['tall_grass', 'riverbank', 'shallow_water', 'water'], ['mossy_ground', 'bog'], ['savanna', 'rocky'], ['grass', 'mud', 'shallow_water'], ['riverbank', 'rapids']];
  for (const p of pairs) {
    const w = new World(8, 4, 0);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) w.g[y * 8 + x] = G[p[Math.min(p.length - 1, Math.floor(x / 8 * p.length))]];
    cell(d, miniCanvas(w, season, S), p.map(i => GROUND[G[i]].name).join(' / '));
  }

  d = section('Trees', Object.keys(TREES).length + ' kinds, 5 variants each, 3 seasons');
  for (const k in TREES) sprCell(d, mkTree(k, 1, season), TREES[k].name, 'tree');
  for (let i = 0; i < 5; i++) sprCell(d, mkTree('oak', i, season), 'Oak variant ' + (i + 1), 'tree');

  d = section('Plants and fungi');
  for (const k in PLANTS) sprCell(d, mkPlant(k, 1, season), PLANTS[k].name, k === 'reeds' ? 'riverbank' : 'deep_grass');

  d = section('Crops');
  for (const k in CROPS) sprCell(d, mkCrop(k, 1, season), CROPS[k].name, 'tilled');

  d = section('Rock and ore', 'ore shows in the cap and the cliff face');
  { const w = new World(5, 4, G.rocky); for (let x = 0; x < 5; x++) for (let y = 0; y < 2; y++) w.wall[y * 5 + x] = WL.mountain; w.wall[2 * 5 + 3] = w.wall[2 * 5 + 4] = WL.mountain; cell(d, miniCanvas(w, season, S), 'Mountain Wall'); }
  for (const k in ORE) {
    const w = new World(3, 3, G.rocky);
    for (let x = 0; x < 3; x++) for (let y = 0; y < 2; y++) { w.wall[y * 3 + x] = WL.mountain; w.ore[y * 3 + x] = { ramp: ORE[k], seed: 5, glow: null }; }
    cell(d, miniCanvas(w, season, S), k[0].toUpperCase() + k.slice(1));
  }

  d = section('Crystals, outcrops and lairs');
  for (const k in ROCKS) sprCell(d, mkRock(k, 1, season), ROCKS[k].name, ROCKS[k].gem || k === 'vent' || k === 'geode' || k === 'voidshard' ? 'cave' : k === 'cairn' ? 'mud' : 'grass');

  d = section('Walls', 'each wall has a lit cap and a front face; neighbours join');
  for (let i = 1; i < WALLS.length; i++) {
    const w = new World(6, 5, G.tall_grass), m = WALLS[i];
    if (m.rock) continue;
    for (let x = 1; x <= 4; x++) { w.wall[1 * 6 + x] = i; w.wall[3 * 6 + x] = i; }
    w.wall[2 * 6 + 1] = i; w.wall[2 * 6 + 4] = i;
    if (!m.thin) { w.feat[3 * 6 + 2] = 1; w.feat[3 * 6 + 3] = 2; w.floor[2 * 6 + 2] = w.floor[2 * 6 + 3] = FL.plank; }
    cell(d, miniCanvas(w, season, S), m.name);
  }

  d = section('Floors and roofs');
  for (let i = 1; i < FLOORS.length; i++) { const w = new World(3, 2, G.dirt); w.floor.fill(i); cell(d, miniCanvas(w, season, S), FLOORS[i].name); }
  for (const [kind, name] of [['thatch', 'Thatch Roof'], ['tile', 'Tiled Roof']]) {
    const w = new World(6, 5, G.tall_grass); w.room(1, 1, 4, 3, WL.stone, FL.plank, kind);
    cell(d, miniCanvas(w, season, S, true), name);
  }

  const cats = [['production', 'Workstations'], ['shelter', 'Beds'], ['furniture', 'Furniture'], ['stock', 'Stockpiles']];
  for (const [cat, title] of cats) {
    const keys = Object.keys(BUILDS).filter(k => BUILDS[k].cat === cat);
    d = section(title, keys.length + ' drawn');
    for (const k of keys) sprCell(d, mkBuild(k, 0), BUILDS[k].name, cat === 'production' ? 'dirt' : cat === 'stock' ? 'grass' : 'tall_grass');
  }

  d = section('Folk', 'one layered generator: body, skin, hair, clothing, headgear, tool');
  for (const k in PAWNS) sprCell(d, mkPawn(PAWNS[k].o), PAWNS[k].name, 'tall_grass');

  d = section('Creatures', 'four-legged beasts share one parametric body');
  for (const k in BEASTS) sprCell(d, mkBeast(k), BEASTS[k].name, 'grass');
  for (const k in OTHER) sprCell(d, mkBeast(k), OTHER[k], k === 'shade' || k === 'ooze' || k === 'croaker' || k === 'adder' ? 'moss' : 'grass');
}
