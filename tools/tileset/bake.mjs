import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UP, encodePng } from './png.mjs';
import { MAP, PIECES, UNPAINTED } from './map.mjs';
import {
  ARCHETYPES,
  DROP_FOOT,
  contactOf,
  coverOf,
  dropArt,
  loadRegistry,
  registryEntries
} from './registry.mjs';
import { BAKE_ART } from './sources.mjs';
import {
  BLOB_LAYOUTS,
  CELL_H,
  CELL_W,
  CELL_X,
  CELL_Y,
  LIFT,
  NEIGHBOURS,
  TOP_SIZE,
  VEIN_SIZE,
  blobLayout,
  rockArt,
  rockTop,
  rockVeins
} from './rock.mjs';
import { WATER_IMAGE, WATER_SIZE, waterField } from './water.mjs';
import {
  FAR_IMAGE,
  FAR_SIZE,
  FIELD_IMAGE,
  FIELD_SIZE,
  farField,
  fieldSlots,
  groundField,
  groundKinds,
  groundSprites
} from './ground.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', 'static', 'tilesets', 'painted');
const EXPORTS =
  '({ TREES, mkTree, PLANTS, mkPlant, CROPS, mkCrop, ROCKS, mkRock, BUILDS, mkBuild, PAWNS, mkPawn, BEASTS, OTHER, mkBeast, GROUND, TILES, ORE, covAt, soilShade, grassShade, rockTop, rockTone, rockFace, oreAt, veinAt, waterBase, waterCol, decal, dith, hash, clamp, wrap, pn, rp, lit, dark, P })';

const TILE = 32;
const PATCH = 4;
const SIDE = TILE * PATCH;
const ATLAS_W = 4096;
const TOP_IMAGE = 'rock-top.png';
export const LIGHT_IMAGE = 'atlas-light.png';
const SHADED = 255;
const VEIN_IMAGE = 'rock-veins.png';
const TOP_DEFLATE = 6;

export const art = (period = 0) =>
  new Function(
    'ART_PERIOD',
    `'use strict';\n${BAKE_ART.map((f) => readFileSync(join(HERE, 'art', f), 'utf8').replace(/^'use strict';\n/, '')).join('\n')}\nreturn ${EXPORTS};`
  )(period);
const A = art(SIDE);

export const ROCK = rockArt(A);

const refList = (entries = [['', ['']]].slice(1)) => Object.fromEntries(entries);

const sprite = (
  w = 0,
  h = 0,
  ox = 0,
  oy = 0,
  px = new Uint8ClampedArray(0),
  patch = 0,
  cw = 0,
  ch = 0,
  light = new Uint8ClampedArray(0),
  cast = 0,
  emit = [{ x: 0, y: 0, rad: 0, col: [0, 0, 0], flicker: false, night: false }, null][1]
) => ({
  w,
  h,
  ox,
  oy,
  px,
  patch,
  cw,
  ch,
  light,
  cast,
  emit
});

const lightOf = (w = 0, h = 0, glow = new Uint8Array(0)) => {
  const light = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) light[i * 4] = glow[i] ?? 0;
  return light;
};

export const pieceId = (set = '', layout = 0) => `${set}/mass/${layout}`;

const wallTop =
  (
    w = {
      h: 0,
      cap: (x = 0, y = 0, d = 0) => [x, y, d].slice(0, 0),
      face: (x = 0, y = 0, fy = 0, h = 0) => [x, y, fy, h]
    }
  ) =>
  (x = 0, y = 0) => {
    const top = w.cap(x, y, 0);
    return top?.length ? top : w.face(x, y, A.wrap(y, w.h), w.h);
  };

const ramp = (colours = [[0, 0, 0]]) =>
  sprite(colours.length, 1, 0, 0, new Uint8ClampedArray(colours.flatMap((c) => [...c, 255])));

function pieceSprites(
  add = (id = '', spr = sprite()) => {
    void [id, spr];
  }
) {
  add('rock/ramp', ramp(A.P.rock));
  add('snow/ramp', ramp(A.P.snow));
  for (const [ore, colours] of Object.entries(A.ORE)) add(`vein/${ore}`, ramp(colours));
  const veins = Object.fromEntries(
    Object.entries(MAP.resource)
      .flatMap(([id, refs]) => {
        const ore = refs.length === 1 && refs[0].startsWith('ore/') ? refs[0].slice(4) : '';
        return ore in A.ORE ? [[id, `vein/${ore}`]] : [];
      })
      .sort(([a], [b]) => (a < b ? -1 : 1))
  );
  for (const layout of BLOB_LAYOUTS)
    add(
      pieceId('rock', layout),
      sprite(
        PATCH * CELL_W,
        PATCH * CELL_H,
        CELL_X,
        CELL_Y,
        ROCK.piece(layout),
        PATCH,
        CELL_W,
        CELL_H,
        undefined,
        LIFT
      )
    );
  return Object.fromEntries(
    Object.entries(PIECES).map(([set, resources]) => [
      set,
      {
        resources: [...resources].sort(),
        neighbours: NEIGHBOURS,
        top: {
          image: TOP_IMAGE,
          veins: VEIN_IMAGE,
          size: TOP_SIZE,
          veinSize: VEIN_SIZE,
          lift: LIFT,
          ramp: 'rock/ramp',
          snow: 'snow/ramp'
        },
        veins,
        layouts: Array.from({ length: 1 << NEIGHBOURS.length }, (_, m) =>
          pieceId(set, blobLayout(m))
        )
      }
    ])
  );
}

function patch(colour = A.rockTop, decals = A.GROUND[0].dec.slice(0, 0)) {
  const px = new Uint8ClampedArray(SIDE * SIDE * 4);
  const put = (x = 0, y = 0, c = [0, 0, 0]) => {
    if (!c) return;
    const i = (A.wrap(Math.round(y), SIDE) * SIDE + A.wrap(Math.round(x), SIDE)) * 4;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
    px[i + 3] = 255;
  };
  for (let y = 0; y < SIDE; y++) for (let x = 0; x < SIDE; x++) put(x, y, colour(x, y));
  for (let ty = 0; ty < PATCH; ty++)
    for (let tx = 0; tx < PATCH; tx++) {
      let k = 0;
      for (const [kind, dens, ramp] of decals) {
        const cnt = Math.floor(dens + A.hash(tx, ty, 201 + k));
        for (let j = 0; j < cnt; j++) {
          k++;
          const x = tx * TILE + Math.floor(A.hash(tx, ty, 300 + k) * TILE);
          const y = ty * TILE + Math.floor(A.hash(tx, ty, 400 + k) * TILE);
          A.decal(kind, x, y, A.hash(tx, ty, 500 + k), ramp, put, false);
        }
      }
    }
  return sprite(SIDE, SIDE, 0, 0, px, PATCH);
}

const CONTACT_SHADE = { rx: 2.4, ry: 1.15, k: 0.95 };

function shaded(cx = 0, cy = 0, sh = CONTACT_SHADE) {
  const out = [];
  for (let y = Math.floor(cy - sh.ry); y <= cy + sh.ry; y++)
    for (let x = Math.floor(cx - sh.rx); x <= cx + sh.rx; x++) {
      const nx = (x - cx) / sh.rx,
        ny = (y - cy) / sh.ry,
        q = nx * nx + ny * ny;
      if (q >= 1) continue;
      const v = (sh.k || 1) * A.clamp((1 - q) * 3.2, 0, 1);
      if (v > A.dith(A.wrap(x, 4), A.wrap(y, 4)) * 0.7 + 0.15) out.push({ x, y });
    }
  return out;
}

function object(s = A.mkPawn({}), footX = 0, footY = 0, contact = [{ x: 0, y: 0 }].slice(1)) {
  const pts = [];
  for (let j = 0; j < s.h; j++)
    for (let i = 0; i < s.w; i++) {
      const c = s.c[j * s.w + i];
      if (c) pts.push({ x: footX - s.ax + i, y: footY - s.ay + j, c, e: s.e?.[j * s.w + i] ?? 0 });
    }
  const sh = s.sh;
  const shade = [
    ...(sh ? shaded(footX + sh.dx, footY + sh.dy, sh) : []),
    ...contact.flatMap((at) => shaded(footX + at.x, footY + at.y))
  ];
  if (!pts.length) throw new Error('empty sprite');
  const all = [...pts, ...shade];
  const x0 = Math.min(...all.map((p) => p.x)),
    y0 = Math.min(...all.map((p) => p.y));
  const w = Math.max(...all.map((p) => p.x)) - x0 + 1,
    h = Math.max(...all.map((p) => p.y)) - y0 + 1;
  const px = new Uint8ClampedArray(w * h * 4);
  const light = new Uint8ClampedArray(w * h * 4);
  for (const { x, y, c, e } of pts) {
    const i = ((y - y0) * w + (x - x0)) * 4;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
    px[i + 3] = 255;
    light[i] = e;
  }
  for (const { x, y } of shade) light[((y - y0) * w + (x - x0)) * 4 + 1] = SHADED;
  const e = s.emit;
  const emit = e
    ? {
        x: footX + e.dx,
        y: footY + e.dy,
        rad: e.rad,
        col: e.col,
        flicker: !!e.flicker,
        night: !!e.night
      }
    : null;
  return sprite(w, h, x0, y0, px, 0, 0, 0, light, 0, emit);
}

const compactEmit = ({ flicker = false, night = false, ...at }) => ({
  ...at,
  ...(flicker ? { flicker } : {}),
  ...(night ? { night } : {})
});

function sprites(ground = groundSprites(A, [], [])) {
  const DBX = loadRegistry();
  const casts = new Map(
    DBX.walls
      .filter((w = DBX.walls[1]) => w && !w.rock)
      .map((w = DBX.walls[1]) => [`wall/${w.id}`, w.h])
  );
  const out = new Map(Object.entries({ '': sprite() }).slice(1));
  const roles = new Map(Object.entries({ '': '' }).slice(1));
  const add = (id = '', spr = sprite()) => {
    if (out.has(id)) throw new Error(`duplicate sprite ${id}`);
    out.set(id, spr);
  };
  for (const g of A.GROUND) add(`ground/${g.id}`, patch(g.f, g.dec ?? []));
  for (const [id, s] of ground.sprites) add(id, s);
  for (const [id, f] of Object.entries(A.TILES))
    add(id, { ...patch(f, []), cast: casts.get(id) ?? 0 });
  const named = new Set(Object.values(MAP.building).flat());
  for (const w of DBX.walls)
    if (w && !w.rock && named.has(`wall/${w.id}`) && !out.has(`wall/${w.id}`))
      add(`wall/${w.id}`, { ...patch(wallTop(w), []), cast: w.h });
  for (const [kind, f] of Object.entries(DBX.roofs))
    add(
      `roof/${kind}`,
      patch((x = 0, y = 0) => f(x, y, 0), [])
    );
  for (const [id, ramp] of Object.entries(A.ORE))
    add(
      `ore/${id}`,
      patch((x = 0, y = 0) => {
        const c = A.rockTop(x, y);
        return A.oreAt(ramp, 5, x, y, c) ?? c;
      }, [])
    );
  for (const k of Object.keys(A.TREES))
    for (let v = 0; v < 4; v++) add(`tree/${k}/${v}`, object(A.mkTree(k, v, 'summer'), 16, 23));
  for (const k of Object.keys(A.PLANTS))
    for (let v = 0; v < 3; v++) add(`plant/${k}/${v}`, object(A.mkPlant(k, v, 'summer'), 16, 23));
  for (const k of Object.keys(A.CROPS))
    for (let v = 0; v < 3; v++) add(`crop/${k}/${v}`, object(A.mkCrop(k, v, 'summer'), 16, 31));
  for (const k of Object.keys(A.ROCKS))
    for (let v = 0; v < 3; v++) add(`rock/${k}/${v}`, object(A.mkRock(k, v, 'summer'), 16, 23));
  for (const [k, b] of Object.entries(A.BUILDS))
    add(`building/${k}`, object(A.mkBuild(k, 0), 16, b.tall ? 31 : 23));
  const races = new Map(Object.entries({ '': 0 }).slice(1));
  for (const [k, p] of Object.entries(A.PAWNS)) {
    const race = p.o.race || 'human',
      n = races.has(race) ? (races.get(race) ?? 0) + 1 : 0;
    races.set(race, n);
    add(`folk/${race}/${n}`, object(A.mkPawn(p.o), 16, 27));
    roles.set(k, `folk/${race}/${n}`);
  }
  for (const k of [...Object.keys(A.BEASTS), ...Object.keys(A.OTHER)])
    add(`creature/${k}`, object(A.mkBeast(k), 16, 27));
  const pieces = pieceSprites(add);
  const extra = registrySprites(add, out, roles, DBX);
  const drops = dropSprites(add, DBX);
  const grass = DBX.list
    .filter((e = DBX.list[0]) => e.cat === 'plant' && e.layer === 'cover')
    .map((e = DBX.list[0]) => e.dbId);
  return { all: out, roles, extra, pieces, drops, grass: [...new Set(grass)].sort() };
}

function grassRamps() {
  const ramps = [[[0, 0, 0]]].slice(1);
  const kinds = Object.fromEntries([['', 0]].slice(1));
  for (const g of A.GROUND) {
    const tuft = (g.dec ?? []).find((d = ['', 0, [[0, 0, 0]]]) => d[0] === 'tuft');
    if (!tuft) continue;
    const key = JSON.stringify(tuft[2]);
    const known = ramps.findIndex((r) => JSON.stringify(r) === key);
    kinds[g.id] = known < 0 ? ramps.push(tuft[2]) - 1 : known;
  }
  return { ramps, kinds };
}

function dropSprites(
  add = (id = '', spr = sprite()) => {
    void [id, spr];
  },
  DBX = loadRegistry()
) {
  const [footX, footY] = DROP_FOOT;
  const { ramps, kinds } = grassRamps();
  const covers = new Map(Object.entries({ '': '' }).slice(1));
  const cover = Object.fromEntries([['', '']].slice(1));
  const coverId = (kind = '', drawn = DBX.list[0].out) => {
    const blades = ramps.map((ramp) => coverOf(DBX, kind, drawn, ramp));
    if (!blades[0]) return '';
    const first = object(blades[0], footX, footY);
    const key = [first.w, first.h, first.ox, first.oy, Buffer.from(first.px).toString('base64')];
    const known = covers.get(key.join());
    if (known) return known;
    const id = `cover/${covers.size}`;
    covers.set(key.join(), id);
    blades.forEach((b, ramp) => add(`${id}/${ramp}`, object(b, footX, footY)));
    return id;
  };
  const place = (item = '', part = { name: '', s: DBX.list[0].out, cover: '', contact: false }) => {
    const id = `item/${item}/${part.name}`;
    add(id, object(part.s, footX, footY, part.contact ? contactOf(DBX, part.s) : []));
    const blades = part.cover && coverId(part.cover, part.s);
    if (blades) cover[id] = blades;
    return id;
  };
  const items = Object.fromEntries(
    dropArt(DBX).map(({ id, parts }) => [
      id,
      Object.fromEntries(
        Object.entries(parts).map(([pose, drawn]) => [
          pose,
          Array.isArray(drawn) ? drawn.map((part) => place(id, part)) : place(id, drawn)
        ])
      )
    ])
  );
  return { grass: kinds, items, cover };
}

function registrySprites(
  add = (id = '', spr = sprite()) => {
    void [id, spr];
  },
  ours = new Map(Object.entries({ '': sprite() })),
  roles = new Map(Object.entries({ '': '' })),
  DBX = loadRegistry()
) {
  const expand = expander(ours, roles);
  const byId = new Map();
  const skipped = new Set(
    Object.entries(UNPAINTED).flatMap(([c, ids]) => ids.map((id) => `${c}/${id}`))
  );
  const unpainted = (cat = '', dbId = '') => skipped.has(`${cat}/${dbId}`);
  const refsOf = new Map(
    Object.entries(MAP).flatMap(([c, e]) =>
      Object.entries(e).map(([id, refs]) => [`${c}/${id}`, [...refs]])
    )
  );
  for (const r of registryEntries(DBX, unpainted)) {
    const spr = registrySprite(DBX, r.entry);
    if (!spr) continue;
    const key = `${r.cat}/${r.dbId}${r.state ? `:${r.state}` : ''}`;
    byId.set(key, [...(byId.get(key) ?? []), { ...r, spr }]);
  }
  const body = (s = sprite()) => s.px.map((v, i) => (s.px[i | 3] === 255 ? v : 0));
  const same = (a = sprite(), b = sprite()) =>
    a.w === b.w && a.h === b.h && Buffer.from(body(a)).equals(Buffer.from(body(b)));
  const mappedSprites = (cat = '', dbId = '') =>
    (refsOf.get(`${cat}/${dbId}`) ?? []).flatMap(expand).map((id) => ours.get(id));
  const keepsMap = (cat = '', dbId = '', drawn = [{ spr: sprite() }]) => {
    const refs = refsOf.get(`${cat}/${dbId}`);
    if (cat === 'building' && dbId.startsWith('lay_')) return true;
    if (!refs) return false;
    if (refs.some((ref) => ref.startsWith('ground/'))) return true;
    const mapped = mappedSprites(cat, dbId);
    if (mapped.some((m) => m?.patch)) return true;
    return mapped.length === drawn.length && mapped.every((m, i) => m && same(m, drawn[i].spr));
  };
  const placed = (old = sprite(), spr = sprite()) =>
    old && old.w === spr.w && old.h === spr.h ? { ...spr, ox: old.ox, oy: old.oy } : spr;
  const besideBase = (cat = '', dbId = '', spr = sprite()) => {
    const base = byId.get(`${cat}/${dbId}`)?.[0]?.spr;
    const old = mappedSprites(cat, dbId)[0];
    if (!base || !old || base.w !== old.w || base.h !== old.h) return spr;
    const dx = old.ox - base.ox,
      dy = old.oy - base.oy;
    const emit = spr.emit && { ...spr.emit, x: spr.emit.x + dx, y: spr.emit.y + dy };
    return { ...spr, ox: spr.ox + dx, oy: spr.oy + dy, emit };
  };
  const extra = Object.fromEntries(
    ['resource', 'building', 'creature', 'pawn', 'item'].map((c) => [c, refList()])
  );
  for (const drawn of byId.values()) {
    const { cat, dbId, state } = drawn[0];
    if (state) {
      for (const { spriteId, spr } of drawn) {
        add(spriteId, besideBase(cat, dbId, spr));
        (extra[cat][`${dbId}:${state}`] ??= []).push(spriteId);
      }
      continue;
    }
    if (keepsMap(cat, dbId, drawn)) continue;
    const mapped = mappedSprites(cat, dbId);
    for (const [i, { spriteId, spr }] of drawn.entries()) {
      add(spriteId, mapped.length === drawn.length ? placed(mapped[i], spr) : spr);
      const key = cat === 'pawn' ? (ARCHETYPES.get(dbId) ?? '*') : dbId;
      (extra[cat][key] ??= []).push(spriteId);
    }
  }
  return extra;
}

function registrySprite(DBX = loadRegistry(), e = loadRegistry().list[0]) {
  if (e.kind === 'sprite') {
    const [fx, fy] = e.at || DBX.anchor[e.cat];
    return object(DBX.built(e), fx, fy);
  }
  if (e.dbId.endsWith('_floor')) {
    if (e.variant !== '0') return null;
    const world = DBX.flat(PATCH + 2, PATCH + 2, 'dirt');
    world.floor.fill(DBX.built(e).world.floor[0]);
    const px = DBX.crop({ world, rect: [TILE, TILE, SIDE, SIDE] });
    return sprite(SIDE, SIDE, 0, 0, px.rgba, PATCH, 0, 0, lightOf(SIDE, SIDE, px.emissive));
  }
  const b = DBX.bake(e);
  return sprite(b.w, b.h, b.ox, b.oy, b.rgba, 0, 0, 0, lightOf(b.w, b.h, b.emissive));
}

function pack(list = Object.entries({ '': sprite() })) {
  const placed = [];
  let x = 0,
    y = 0,
    row = 0;
  for (const [id, s] of list) {
    if (x + s.w > ATLAS_W) {
      x = 0;
      y += row + 1;
      row = 0;
    }
    placed.push({ id, s, x, y });
    x += s.w + 1;
    row = Math.max(row, s.h);
  }
  return { placed, h: y + row };
}

function expander(
  all = new Map(Object.entries({ '': sprite() })),
  roles = new Map(Object.entries({ '': '' }))
) {
  return (ref = '') => {
    if (ref.startsWith('role:')) return [roles.get(ref.slice(5)) ?? ref];
    if (!ref.endsWith('/*')) return [ref];
    return [...all.keys()].filter((k) => k.startsWith(ref.slice(0, -1))).sort();
  };
}

function merged(extra = Object.fromEntries([['pawn', refList()]])) {
  const out = Object.fromEntries(
    Object.entries(MAP).map(([cat, e]) => [cat, refList(Object.entries(e))])
  );
  for (const [cat, entries] of Object.entries(extra))
    for (const [id, refs] of Object.entries(entries))
      (out[cat] ??= refList())[id] = cat === 'pawn' ? [...(out[cat][id] ?? []), ...refs] : refs;
  return out;
}

function resolveMap(
  all = new Map(Object.entries({ '': sprite() })),
  roles = new Map(Object.entries({ '': '' })),
  extra = Object.fromEntries([['pawn', refList()]])
) {
  const expand = expander(all, roles);
  return Object.fromEntries(
    Object.entries(merged(extra)).map(([cat, entries]) => [
      cat,
      Object.fromEntries(
        Object.entries(entries)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([id, refs]) => {
            const ids = refs.flatMap(expand);
            for (const s of ids)
              if (!all.has(s)) throw new Error(`${cat}.${id} names a missing sprite ${s}`);
            return [id, ids];
          })
      )
    ])
  );
}

function ground() {
  const kinds = groundKinds(A.GROUND);
  const field = groundField(art(FIELD_SIZE), fieldSlots(kinds));
  const made = groundSprites(
    A,
    kinds,
    field.palettes,
    (w, h, ox, oy, px) => sprite(w, h, ox, oy, px),
    (f) => patch(f, [])
  );
  return { field: field.px, ...made };
}

export function bake() {
  const laid = ground();
  const { all, roles, extra, pieces, drops, grass } = sprites(laid);
  const order = [...all].sort(
    ([a, sa], [b, sb]) => sb.patch - sa.patch || sb.h - sa.h || (a < b ? -1 : 1)
  );
  const { placed, h } = pack(order);
  const atlas = new Uint8Array(ATLAS_W * h * 4);
  const light = new Uint8Array(ATLAS_W * h * 4);
  for (const { s, x, y } of placed)
    for (let j = 0; j < s.h; j++) {
      atlas.set(s.px.subarray(j * s.w * 4, (j + 1) * s.w * 4), ((y + j) * ATLAS_W + x) * 4);
      if (s.light.length)
        light.set(s.light.subarray(j * s.w * 4, (j + 1) * s.w * 4), ((y + j) * ATLAS_W + x) * 4);
    }
  for (let i = 3; i < light.length; i += 4) light[i] = 255;
  const rects = placed
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map(({ id, s, x, y }) => [
      id,
      {
        x,
        y,
        w: s.w,
        h: s.h,
        ox: s.ox,
        oy: s.oy,
        ...(s.patch ? { patch: s.patch } : {}),
        ...(s.cw ? { cw: s.cw, ch: s.ch } : {}),
        ...(s.cast ? { cast: s.cast } : {}),
        ...(s.emit ? { emit: compactEmit(s.emit) } : {})
      }
    ]);
  const manifest = {
    tile: TILE,
    atlas: { w: ATLAS_W, h },
    sprites: Object.fromEntries(rects),
    map: resolveMap(all, roles, extra),
    pieces,
    drops,
    water: { image: WATER_IMAGE, size: WATER_SIZE },
    ground: {
      field: { image: FIELD_IMAGE, size: FIELD_SIZE },
      far: { image: FAR_IMAGE, size: FAR_SIZE },
      pieces: 'ground/pieces',
      grass,
      kinds: laid.kinds
    }
  };
  const wide = art(TOP_SIZE);
  const veinArt = art(VEIN_SIZE);
  return {
    png: encodePng(ATLAS_W, h, atlas),
    light: encodePng(ATLAS_W, h, light),
    manifest,
    top: encodePng(TOP_SIZE, TOP_SIZE, rockTop(wide), TOP_DEFLATE),
    veins: encodePng(VEIN_SIZE, VEIN_SIZE, rockVeins(veinArt)),
    water: encodePng(WATER_SIZE, WATER_SIZE, waterField(art(WATER_SIZE)), TOP_DEFLATE),
    field: encodePng(FIELD_SIZE, FIELD_SIZE, laid.field, TOP_DEFLATE, UP),
    far: encodePng(FAR_SIZE, FAR_SIZE, farField(laid.field), TOP_DEFLATE, UP)
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { png, light, manifest, top, veins, water, field, far } = bake();
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'atlas.png'), png);
  writeFileSync(join(OUT, LIGHT_IMAGE), light);
  writeFileSync(join(OUT, TOP_IMAGE), top);
  writeFileSync(join(OUT, VEIN_IMAGE), veins);
  writeFileSync(join(OUT, WATER_IMAGE), water);
  writeFileSync(join(OUT, FIELD_IMAGE), field);
  writeFileSync(join(OUT, FAR_IMAGE), far);
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(
    `${Object.keys(manifest.sprites).length} sprites, atlas ${manifest.atlas.w}x${manifest.atlas.h}`
  );
}
