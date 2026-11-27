import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { open, api, sleep } from './harness.mjs';
import { WORLDS } from './plan.mjs';

const [TREE, OUT] = process.argv.slice(2);
const ONLY = process.env.WORLDS?.split(',');
const W = 1920, H = 1080;
const HIDE = `body *{visibility:hidden!important}.map-area,.map-area *{visibility:visible!important}canvas.desig-layer{visibility:hidden!important}`;

const g = await open({ tree: TREE, harness: process.env.HARNESS ?? TREE, out: OUT, query: process.env.F4X_QUERY ?? '' });
const a = api(g.page);
const t0 = Date.now();
const log = (m) => console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s ${m}`);
const manifestPath = join(OUT, 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : [];
const used = new Set(manifest.map((m) => m.file));

const clickText = (t) => a.ev((t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().toUpperCase() === t)?.click(), t);

function finder(gs, at) {
  const map = gs.worldMap, mh = map.length, mw = map[0].length;
  const vw = Math.ceil(at.vw), vh = Math.ceil(at.vh);
  const k = at.k ?? 0;
  const pos = (e) => [e.position?.x ?? e.x, e.position?.y ?? e.y];
  if (at.whole) return { cx: mw / 2, cy: mh / 2 };
  if (at.spot) {
    const v = globalThis.__shotsSetup?.[at.spot];
    const p = Array.isArray(v?.[0]) ? v[k % v.length] : v;
    if (!Array.isArray(p)) return null;
    return { cx: p[0] + (at.dx ?? 2), cy: p[1] + (at.dy ?? 2) };
  }
  if (at.planned) {
    const b = (gs.buildings ?? []).filter((b) => b.status !== 'complete')[k];
    return b ? { cx: b.x, cy: b.y } : null;
  }
  if (at.pawns || at.pawn !== undefined) {
    const ps = gs.pawns.map(pos).filter((p) => p[0] != null);
    if (at.pawn !== undefined) { const p = ps[at.pawn % ps.length]; return { cx: p[0], cy: p[1] }; }
    return { cx: ps.reduce((s, p) => s + p[0], 0) / ps.length, cy: ps.reduce((s, p) => s + p[1], 0) / ps.length };
  }
  if (at.buildings) {
    const bs = (gs.buildings ?? []).map((b) => [b.x, b.y]).filter((p) => p[0] != null);
    const all = bs.length ? bs : gs.pawns.map(pos);
    return { cx: all.reduce((s, p) => s + p[0], 0) / all.length, cy: all.reduce((s, p) => s + p[1], 0) / all.length };
  }
  if (at.building) {
    const b = (gs.buildings ?? []).filter((b) => b.type === at.building)[k];
    if (!b) return null;
    return { cx: b.x, cy: b.y };
  }
  let pts = null;
  if (at.mob) pts = gs.mobs.filter((m) => (m.creatureId ?? '').includes(at.mob)).map(pos);
  if (at.mobs) pts = gs.mobs.map(pos);
  if (at.fight) pts = [...gs.mobs.map(pos), ...gs.pawns.map(pos)];
  if (pts) {
    pts = pts.filter((p) => p[0] != null);
    if (!pts.length) return null;
    const scored = pts.map((p) => [pts.filter((q) => Math.abs(q[0] - p[0]) < vw / 3 && Math.abs(q[1] - p[1]) < vh / 3).length, p]);
    scored.sort((x, y) => y[0] - x[0]);
    const picks = [];
    for (const [, p] of scored) if (picks.every((q) => Math.abs(q[0] - p[0]) > vw || Math.abs(q[1] - p[1]) > vh)) picks.push(p);
    const p = picks[k % picks.length];
    return { cx: p[0], cy: p[1] };
  }
  const isWater = (t) => t.subType === 'water' || t.subType === 'shallow_water' || t.type === 'water';
  let weight;
  if (at.res) weight = (t) => (t.resources && t.resources[at.res] ? 1 : 0);
  else if (at.terrain) weight = (t) => (t.terrainType === at.terrain ? 1 : 0);
  else if (at.river) weight = (t) => (t.river || t.riverCourse ? 1 : 0);
  else if (at.water) weight = (t) => (isWater(t) ? 1 : 0);
  else if (at.shore) weight = (t) => (isWater(t) ? 1 : 0);
  else if (at.edge) weight = (t) => (t.terrainType === at.edge ? 1 : 0);
  const sum = new Float64Array((mw + 1) * (mh + 1));
  const mnt = new Float64Array((mw + 1) * (mh + 1));
  for (let y = 0; y < mh; y++)
    for (let x = 0; x < mw; x++) {
      const t = map[y][x];
      const i = (y + 1) * (mw + 1) + x + 1;
      sum[i] = weight(t) + sum[i - 1] + sum[i - mw - 1] - sum[i - mw - 2];
      mnt[i] = (t.terrainType === 'mountain' ? 1 : 0) + mnt[i - 1] + mnt[i - mw - 1] - mnt[i - mw - 2];
    }
  const rect = (arr, x0, y0, x1, y1) => arr[y1 * (mw + 1) + x1] - arr[y0 * (mw + 1) + x1] - arr[y1 * (mw + 1) + x0] + arr[y0 * (mw + 1) + x0];
  const cands = [];
  if (at.res) {
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) if (weight(map[y][x])) {
      const r = 3;
      const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(mw, x + r + 1), y1 = Math.min(mh, y + r + 1);
      const inside = x - vw / 2 >= 0 && y - vh / 2 >= 0 && x + vw / 2 <= mw && y + vh / 2 <= mh;
      cands.push([rect(sum, x0, y0, x1, y1) + (inside ? 100 : 0), x, y]);
    }
  } else {
    const step = Math.max(2, Math.floor(Math.min(vw, vh) / 6));
    for (let y0 = 0; y0 + vh <= mh; y0 += step)
      for (let x0 = 0; x0 + vw <= mw; x0 += step) {
        const area = vw * vh;
        const f = rect(sum, x0, y0, x0 + vw, y0 + vh) / area;
        const m = rect(mnt, x0, y0, x0 + vw, y0 + vh) / area;
        let score;
        if (at.shore || at.edge) score = Math.min(f, 1 - f) - (at.shore ? m * 0.6 : 0);
        else if (at.river) score = f - m * 0.3;
        else score = f;
        cands.push([score, x0 + vw / 2, y0 + vh / 2]);
      }
  }
  cands.sort((p, q) => q[0] - p[0]);
  const picks = [];
  const sep = at.res ? Math.max(vw, vh) : Math.max(vw, vh) * 0.8;
  for (const c of cands) {
    if (picks.every((p) => Math.hypot(p[1] - c[1], p[2] - c[2]) > sep)) picks.push(c);
    if (picks.length > k) break;
  }
  const p = picks[k] ?? picks[picks.length - 1];
  if (!p) return null;
  return { cx: p[1], cy: p[2], score: p[0] };
}

async function setup(s, opts) {
  let gs; s.gameState.subscribe((v) => (gs = v))();
  const map = gs.worldMap, mh = map.length, mw = map[0].length;
  const cmd = (type, payload) => s.gameState.command({ type, payload, save: false });
  const ps = gs.pawns.map((p) => [p.position?.x ?? p.x, p.position?.y ?? p.y]).filter((p) => p[0] != null);
  const cx = Math.round(ps.reduce((t, p) => t + p[0], 0) / ps.length), cy = Math.round(ps.reduce((t, p) => t + p[1], 0) / ps.length);
  const taken = new Set((gs.buildings ?? []).map((b) => b.x + ',' + b.y));
  const reserved = new Set();
  const isWater = (t) => t.type === 'water' || /water|rapids/.test(t.subType);
  const clearTile = (x, y) => {
    const t = map[y]?.[x];
    if (!t || !t.walkable || isWater(t) || t.terrainType === 'mountain' || taken.has(x + ',' + y) || reserved.has(x + ',' + y)) return false;
    return Object.keys(t.resources ?? {}).every((k) => k.endsWith('_patch') || k === 'savanna');
  };
  const near = (r0, r1, test) => {
    const out = [];
    for (let y = Math.max(0, cy - r1); y < Math.min(mh, cy + r1); y++)
      for (let x = Math.max(0, cx - r1); x < Math.min(mw, cx + r1); x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d >= r0 && d <= r1 && test(map[y][x], x, y)) out.push([d, x, y]);
      }
    return out.sort((p, q) => p[0] - q[0]).map((p) => [p[1], p[2]]);
  };
  const spot = (w, h, r0) => {
    for (const [x0, y0] of near(r0, 30, () => true)) {
      let ok = true;
      for (let y = y0; y < y0 + h && ok; y++) for (let x = x0; x < x0 + w && ok; x++) ok = clearTile(x, y);
      if (ok) {
        for (let y = y0 - 1; y <= y0 + h; y++) for (let x = x0 - 1; x <= x0 + w; x++) reserved.add(x + ',' + y);
        return [x0, y0];
      }
    }
    return null;
  };
  const done = { center: [cx, cy] };
  if (opts.blueprint) {
    for (const [i, bp] of opts.blueprint.entries()) {
      const at = spot(bp.w, bp.h, 4 + i * 2);
      if (!at) continue;
      const walls = [], floors = [];
      for (let y = at[1]; y < at[1] + bp.h; y++)
        for (let x = at[0]; x < at[0] + bp.w; x++) {
          const edge = x === at[0] || y === at[1] || x === at[0] + bp.w - 1 || y === at[1] + bp.h - 1;
          if (edge && !(y === at[1] + bp.h - 1 && x === at[0] + (bp.w >> 1))) walls.push([x, y]);
          else if (!edge && bp.floor) floors.push([x, y]);
        }
      await cmd('placeBuildings', { bid: bp.wall, tiles: walls });
      await cmd('placeBuilding', { bid: 'door', x: at[0] + (bp.w >> 1), y: at[1] + bp.h - 1 });
      if (bp.floor) await cmd('placeBuildings', { bid: bp.floor, tiles: floors });
      if (bp.inside) await cmd('placeBuilding', { bid: bp.inside, x: at[0] + 1, y: at[1] + 1 });
      (done.blueprints ??= []).push(at);
    }
  }
  if (opts.field) {
    const at = spot(opts.field[0], opts.field[1], 5);
    if (at) {
      await cmd('createZoneInstance', { type: 'grow', label: 'Field', id: 'shots-field' });
      await cmd('designateRect', { x1: at[0], y1: at[1], x2: at[0] + opts.field[0] - 1, y2: at[1] + opts.field[1] - 1, type: 'grow', instanceId: 'shots-field' });
      done.field = at;
    }
  }
  if (opts.woodcut) {
    const trees = near(3, 18, (t) => Object.keys(t.resources ?? {}).some((k) => k.endsWith('_tree'))).slice(0, opts.woodcut);
    await cmd('designateTiles', { tiles: trees, type: 'woodcut' });
    done.woodcut = trees.length;
  }
  if (opts.mine) {
    const walls = near(2, 40, (t) => Object.keys(t.resources ?? {}).some((k) => k.endsWith('_wall'))).slice(0, opts.mine);
    await cmd('designateTiles', { tiles: walls, type: 'mine' });
    done.mine = walls.length ? walls[0] : 0;
  }
  if (opts.forage) {
    const bushes = near(2, 20, (t) => Object.keys(t.resources ?? {}).some((k) => /berry|wild_|mushroom/.test(k))).slice(0, opts.forage);
    await cmd('designateTiles', { tiles: bushes, type: 'forage' });
    done.forage = bushes.length;
  }
  if (opts.hunt) {
    const mobs = gs.mobs.filter((m) => m.entityClass === 'animal').map((m) => [Math.hypot(m.x - cx, m.y - cy), m.id]).sort((p, q) => p[0] - q[0]).slice(0, opts.hunt).map((p) => p[1]);
    await cmd('markMobsForHunt', { ids: mobs });
    done.hunt = mobs.length;
  }
  if (opts.spawn) for (const [creatureId, dx, dy] of opts.spawn) await cmd('devSpawnMobAt', { creatureId, x: cx + dx, y: cy + dy });
  globalThis.__shotsSetup = done;
  return done;
}

async function loadWorld(world) {
  const L = world.load;
  if (L.fixture) {
    if (world !== WORLDS[0]) throw new Error('fixture must be first');
  } else if (L.regen) {
    await a.store((s, [w, h, seed]) => { s.gameState.setMapSize(w, h); s.gameState.regenWorld(seed); }, [L.w, L.h, L.regen]);
    await sleep(Math.max(5000, (L.w * L.h) / 10));
  } else {
    const preset = L.preset ?? null;
    await a.ev(async ([preset, id]) => {
      const m = await import('/src/lib/game/headless/scenarios/presets.ts');
      if (preset && !m.SCENARIO_PRESETS.some((p) => p.id === preset.id)) m.SCENARIO_PRESETS.push(preset);
      const s = await import('/src/lib/stores/gameState.ts');
      const ok = await s.gameState.loadScenarioPreset(preset ? preset.id : id);
      if (!ok) throw new Error('preset not loaded');
    }, [preset, L.presetId]);
    await sleep(4000);
  }
  await a.cmd('devSetMapSnow', { value: 0 });
  await a.cmd('devSetMapIce', { value: 0 });
  await a.cmd('setWeather', { type: 'clear' });
  await a.cmd('setSeason', { season: world.season });
  await a.cmd('setAllZoneColorHidden', { hidden: true });
  await a.cmd('devInfiniteFuel', { on: true });
  if (L.setup) log('setup ' + JSON.stringify(await a.store(setup, L.setup)));
  if (L.run) {
    await a.camera({ viewX: 0, viewY: 0, tileWidth: 24 });
    await a.paused(false);
    await clickText(L.speed ?? '4X');
    await sleep(L.run * 1000);
    await a.paused(true);
  }
  const info = await a.state((gs) => ({ seed: gs.seed, w: gs.worldMap[0].length, h: gs.worldMap.length, pawns: gs.pawns.length, mobs: gs.mobs.length, buildings: (gs.buildings ?? []).length, turn: gs.turn }));
  log(`world ${world.id} ${JSON.stringify(info)}`);
  return info;
}

async function shoot(world, info, shot, hud) {
  const base = `game-${shot.biome}-${shot.subject}-${shot.time}-${shot.zoom}`;
  let name = base + (hud ? '-hud' : '');
  for (let i = 2; used.has(name + '.png'); i++) name = base + (hud ? '-hud' : '') + '-' + i;
  const vw = W / shot.tile, vh = H / shot.tile;
  await a.cmd('setSeason', { season: shot.season ?? world.season });
  await a.cmd('setWeather', { type: shot.weather ?? 'clear' });
  await a.cmd('setTimeOfDay', { timeOfDay: shot.tod });
  await a.cmd('setAllZoneColorHidden', { hidden: true });
  const c = await a.state(finder, { ...shot.at, vw, vh });
  if (!c) { log(`SKIP ${name} nothing found for ${JSON.stringify(shot.at)}`); return; }
  let viewX = Math.round(c.cx - vw / 2), viewY = Math.round(c.cy - vh / 2);
  if (!shot.at.whole) {
    viewX = Math.max(0, Math.min(info.w - Math.ceil(vw), viewX));
    viewY = Math.max(0, Math.min(info.h - Math.ceil(vh), viewY));
  } else { viewX = Math.round((info.w - vw) / 2); viewY = Math.round((info.h - vh) / 2); }
  const camera = { viewX, viewY, tileWidth: shot.tile };
  await a.camera(camera);
  const t1 = Date.now();
  while (await a.ev(() => !!document.querySelector('.loading-screen'))) {
    if (Date.now() - t1 > 120_000) throw new Error('loading screen stuck');
    await sleep(250);
  }
  await sleep(2000);
  await a.paused(false);
  await sleep((shot.run ?? 0.6) * 1000);
  await a.paused(true);
  await a.ev(() => [...document.querySelectorAll('button')].filter((b) => /^welcome/i.test(b.textContent.trim())).forEach((b) => b.click()));
  await sleep(1800);
  const style = await g.page.addStyleTag({ content: hud ? 'canvas.desig-layer:not(.mark-layer){visibility:hidden!important}' : HIDE });
  await sleep(300);
  const box = await a.ev(() => { const r = document.querySelector('.map-area').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  if (hud && shot.click) {
    const c2 = (await a.state(finder, { ...shot.at, vw, vh })) ?? c;
    await g.page.mouse.click(box.x + (c2.cx - viewX + 0.5) * shot.tile, box.y + (c2.cy - viewY + 0.5) * shot.tile);
    await sleep(1200);
  }
  const clip = hud ? { x: 0, y: 0, width: W, height: H } : { x: box.x, y: box.y, width: W, height: H };
  const variants = shot.windows ? shot.windows : [[null, hud ? shot.key : null]];
  for (const [label, key] of variants) {
    let file = name;
    if (label) {
      const b = `game-${shot.biome}-${label}-window-${shot.time}-${shot.zoom}-hud`;
      file = b;
      for (let i = 2; used.has(file + '.png'); i++) file = b + '-' + i;
    }
    if (key) {
      await a.ev(() => document.querySelector('[aria-label="World map"]')?.focus());
      await g.page.keyboard.press(key);
      await sleep(1500);
    }
    await g.page.screenshot({ path: join(OUT, file + '.png'), clip });
    if (key) { await g.page.keyboard.press(key); await sleep(900); }
    record(file, key, label);
  }
  if (style) await style.evaluate((n) => n.remove());
  async function record(file, key, label) {
  used.add(file + '.png');
  manifest.push({
    file: file + '.png', world: world.id, load: world.load.preset ? { preset: world.load.preset.id } : world.load,
    seed: info.seed, map: [info.w, info.h], biome: shot.biome, subject: shot.subject, time: shot.time, timeOfDay: shot.tod,
    season: shot.season ?? world.season, weather: shot.weather ?? 'clear', zoom: shot.zoom, camera,
    hud: !!hud, window: key ?? null, subject: label ? label + '-window' : shot.subject, selected: hud && shot.click ? true : undefined, find: shot.at, run: shot.run
  });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
  log(`SHOT ${file} ${JSON.stringify(camera)}`);
  }
}

try {
  await a.paused(true);
  for (const world of WORLDS) {
    if (ONLY && !ONLY.includes(world.id)) continue;
    const shots = world.shots;
    if (!shots.length) continue;
    try {
      const info = await loadWorld(world);
      for (const shot of shots) {
        try {
          if (shot.hud !== true) await shoot(world, info, shot, false);
          if (shot.hud) await shoot(world, info, shot, true);
        } catch (e) { log(`FAIL shot ${shot.subject}: ${e.message}`); }
      }
    } catch (e) { log(`FAIL world ${world.id}: ${e.stack}`); }
  }
  log('errors ' + JSON.stringify(g.errors.slice(0, 10)));
} catch (e) { log('FAIL ' + e.stack); } finally { await g.stop(); }
log('DONE');
process.exit(0);
