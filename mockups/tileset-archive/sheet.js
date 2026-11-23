'use strict';
let sheetFor = '';
function miniCanvas(w, season, scale, roofs) {
  const r = renderWorld(w, { season, roofs });
  const cv = document.createElement('canvas');
  cv.width = r.W; cv.height = r.H;
  cv.style.width = r.W * scale + 'px'; cv.style.height = r.H * scale + 'px';
  present(r, cv.getContext('2d'), 'day', 0, { noVig: true, calm: true });
  return cv;
}
function sprWorld(spr, ground) {
  const W = Math.max(2, Math.ceil((spr.w + 8) / T)), H = Math.max(2, Math.ceil((spr.h + 10) / T)), w = new World(W, H, G[ground]);
  w.objs.push({ spr, x: W * 16 + (spr.ax - (spr.w >> 1)), y: H * T - 9 });
  return w;
}
function buildSheet(root, season) {
  if (sheetFor === season) return;
  sheetFor = season; root.textContent = '';
  const S = 2;
  const section = (title, note) => {
    const h = document.createElement('h2'); h.textContent = title;
    if (note) { const sm = document.createElement('small'); sm.textContent = note; h.appendChild(sm); }
    const d = document.createElement('div'); d.className = 'cells';
    root.append(h, d); return d;
  };
  const cell = (d, cv, label) => { const c = document.createElement('div'); c.className = 'cell'; const sp = document.createElement('span'); sp.textContent = label; c.append(cv, sp); d.appendChild(c); };
  const sprCell = (d, spr, label, ground) => cell(d, miniCanvas(sprWorld(spr, ground || 'tall_grass'), season, S), label);

  let d = section('Ground', GROUND.length + ' types at 32 px, drawn in world space so no tile repeats');
  for (const g of GROUND) cell(d, miniCanvas(new World(3, 2, G[g.id]), season, S), g.name);

  d = section('Transitions', 'borders follow noise, not the grid');
  for (const p of [['deep_grass', 'dirt'], ['tall_grass', 'riverbank', 'shallow_water', 'water'], ['mossy_ground', 'tree'], ['savanna', 'rocky'], ['riverbank', 'rapids']]) {
    const w = new World(6, 3, 0);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 6; x++) w.g[y * 6 + x] = G[p[Math.min(p.length - 1, Math.floor(x / 6 * p.length))]];
    cell(d, miniCanvas(w, season, S), p.map(i => GROUND[G[i]].name).join(' / '));
  }

  d = section('Trees', 'foliage is built from shaded leaf clumps; 4 variants each, 3 seasons');
  for (const k in TREES) sprCell(d, mkTree(k, 1, season), TREES[k].name, 'tree');
  for (let i = 0; i < 4; i++) sprCell(d, mkTree('oak', i, season), 'Oak variant ' + (i + 1), 'tree');

  d = section('Plants, fungi and crops');
  for (const k in PLANTS) sprCell(d, mkPlant(k, 1, season), PLANTS[k].name, k === 'reeds' ? 'riverbank' : 'deep_grass');
  for (const k in CROPS) sprCell(d, mkCrop(k, 1, season), CROPS[k].name, 'tilled');

  d = section('Rock, ore and crystal');
  { const w = new World(5, 4, G.rocky); for (let x = 0; x < 5; x++) for (let y = 0; y < 2; y++) w.wall[y * 5 + x] = WL.mountain; w.wall[2 * 5 + 3] = w.wall[2 * 5 + 4] = WL.mountain; cell(d, miniCanvas(w, season, S), 'Mountain Wall'); }
  for (const k of ['hematite', 'malachite', 'gold', 'coal', 'azurite', 'salt']) {
    const w = new World(3, 3, G.rocky);
    for (let x = 0; x < 3; x++) for (let y = 0; y < 2; y++) { w.wall[y * 3 + x] = WL.mountain; w.ore[y * 3 + x] = { ramp: ORE[k], seed: 5, glow: null }; }
    cell(d, miniCanvas(w, season, S), k[0].toUpperCase() + k.slice(1));
  }
  for (const k in ROCKS) sprCell(d, mkRock(k, 1, season), ROCKS[k].name, ROCKS[k].gem ? 'cave' : 'grass');

  d = section('Walls, floors and roofs', 'a lit cap and a front face; door and window sit in the face');
  for (let i = 2; i < WALLS.length; i++) {
    const w = new World(6, 5, G.tall_grass), m = WALLS[i];
    for (let x = 1; x <= 4; x++) { w.wall[1 * 6 + x] = i; w.wall[3 * 6 + x] = i; }
    w.wall[2 * 6 + 1] = i; w.wall[2 * 6 + 4] = i;
    if (!m.thin) { w.feat[3 * 6 + 2] = 1; w.feat[3 * 6 + 3] = 2; w.floor[2 * 6 + 2] = w.floor[2 * 6 + 3] = FL.plank; }
    cell(d, miniCanvas(w, season, S), m.name);
  }
  for (let i = 1; i < FLOORS.length; i++) { const w = new World(3, 2, G.dirt); w.floor.fill(i); cell(d, miniCanvas(w, season, S), FLOORS[i].name); }
  for (const [kind, name] of [['thatch', 'Thatch Roof'], ['tile', 'Tiled Roof']]) {
    const w = new World(6, 5, G.tall_grass); w.room(1, 1, 4, 3, WL.stone, FL.plank, kind);
    cell(d, miniCanvas(w, season, S, true), name);
  }

  d = section('Workstations, furniture and stockpiles', Object.keys(BUILDS).length + ' drawn so far');
  for (const k in BUILDS) sprCell(d, mkBuild(k, 0), BUILDS[k].name, BUILDS[k].cat === 'production' ? 'dirt' : 'tall_grass');

  d = section('Folk', 'one layered generator: body, skin, face, hair, clothing, headgear, tool');
  for (const k in PAWNS) sprCell(d, mkPawn(PAWNS[k].o), PAWNS[k].name, 'tall_grass');

  d = section('Creatures');
  for (const k in BEASTS) sprCell(d, mkBeast(k), BEASTS[k].name, 'grass');
  for (const k in OTHER) sprCell(d, mkBeast(k), OTHER[k], 'grass');
}
