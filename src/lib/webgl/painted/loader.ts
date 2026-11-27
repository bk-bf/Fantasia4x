import {
  buildTileset,
  parseManifest,
  type ManifestField,
  type PaintedGround,
  type PaintedKind,
  type PaintedManifest,
  type PaintedPieceTop,
  type PaintedTileset
} from './manifest.js';
import { setPaintedTileset } from './tileset.js';
import { pawnLook, type PawnLookOf, type PawnLookPool } from './pawnLook.js';
import { atlasTexels, type AtlasTexels } from '../drawnSprites.js';
import { swayTable } from './wind.js';
import { TextureUsage, type GpuDevice, type GpuTexture } from '../../gpu/device.js';
import { decodePng, type DecodedImage } from './png.js';

export const PAINTED_BASE_URL = '/tilesets/painted/';
const LIGHT_IMAGE = 'atlas-light.png';

export interface LoadedPieceTop {
  texture: GpuTexture;
  veins: GpuTexture;
  lift: number;
  ramp: { x: number; y: number };
  snow: { x: number; y: number };
}

export interface LoadedGroundField {
  field: GpuTexture;
  far: GpuTexture;
}

export interface LoadedPaintedTileset {
  tileset: PaintedTileset;
  texture: GpuTexture;
  light: GpuTexture;
  top: LoadedPieceTop | null;
  water: GpuTexture | null;
  ground: LoadedGroundField | null;
  texels: () => AtlasTexels | null;
  cell: (x: number, y: number, w: number, h: number) => Uint8ClampedArray | null;
}

async function loadImage(url: string): Promise<DecodedImage> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not load ${url}: ${res.status}`);
  return decodePng(new Uint8Array(await res.arrayBuffer()));
}

function region(image: DecodedImage, x: number, y: number, w: number, h: number) {
  const out = new Uint8ClampedArray(w * h * 4);
  const x0 = Math.max(x, 0);
  const x1 = Math.min(x + w, image.width);
  if (x1 <= x0) return out;
  for (let row = 0; row < h; row++) {
    const sy = y + row;
    if (sy < 0 || sy >= image.height) continue;
    const from = (sy * image.width + x0) * 4;
    out.set(image.data.subarray(from, from + (x1 - x0) * 4), (row * w + x0 - x) * 4);
  }
  return out;
}

function readTexels(image: DecodedImage): () => AtlasTexels {
  let texels: AtlasTexels | undefined;
  return () => (texels ??= atlasTexels(image.data, image.width, image.height));
}

function readCell(image: DecodedImage) {
  return (x: number, y: number, w: number, h: number): Uint8ClampedArray =>
    region(image, x, y, w, h);
}

async function fetchManifest(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}

async function fetchSway(url: string): Promise<unknown> {
  try {
    return await fetchManifest(url);
  } catch (err) {
    console.warn('[painted tiles] wind sway off:', err);
    return null;
  }
}

const ATLAS_USAGE = TextureUsage.TEXTURE_BINDING | TextureUsage.COPY_DST;

function uploadAtlas(gpu: GpuDevice, image: DecodedImage): GpuTexture {
  const size = { width: image.width, height: image.height };
  const texture = gpu.createTexture({ format: 'rgba8unorm', ...size, usage: ATLAS_USAGE });
  gpu.queue.writeTexture({ texture }, image.data, { bytesPerRow: image.width * 4 }, size);
  return texture;
}

function unlitTexture(gpu: GpuDevice): GpuTexture {
  const size = { width: 1, height: 1 };
  const texture = gpu.createTexture({ format: 'rgba8unorm', ...size, usage: ATLAS_USAGE });
  gpu.queue.writeTexture({ texture }, new Uint8Array([0, 0, 0, 255]), { bytesPerRow: 4 }, size);
  return texture;
}

interface PaintedSource {
  manifest: PaintedManifest;
  tileset: PaintedTileset;
  image: DecodedImage;
  light: DecodedImage | null;
  top: { image: DecodedImage; veins: DecodedImage; piece: PaintedPieceTop } | null;
  water: DecodedImage | null;
  ground: { field: DecodedImage; far: DecodedImage } | null;
}

const pieceTop = (tileset: PaintedTileset) =>
  [...tileset.pieces.values()].find((p) => p.top)?.top ?? null;

async function readTop(baseUrl: string, piece: PaintedPieceTop | null) {
  if (!piece) return null;
  try {
    const [image, veins] = await Promise.all(
      [
        [piece.image, piece.size],
        [piece.veins, piece.veinSize]
      ].map(async ([name, size]) => {
        const loaded = await loadImage(`${baseUrl}${name}`);
        if (loaded.width !== size || loaded.height !== size)
          throw new Error(`${name} is not ${size} px square`);
        return loaded;
      })
    );
    return { image, veins, piece };
  } catch (err) {
    console.warn('[painted tiles] rock tops off:', err);
    return null;
  }
}

async function readWater(baseUrl: string, field: ManifestField | undefined) {
  if (!field) return null;
  try {
    const image = await loadImage(`${baseUrl}${field.image}`);
    if (image.width !== field.size || image.height !== field.size)
      throw new Error(`${field.image} is not ${field.size} px square`);
    return image;
  } catch (err) {
    console.warn('[painted tiles] water field off:', err);
    return null;
  }
}

async function readField(baseUrl: string, field: ManifestField): Promise<DecodedImage> {
  const image = await loadImage(`${baseUrl}${field.image}`);
  if (image.width !== field.size || image.height !== field.size)
    throw new Error(`${field.image} is not ${field.size} px square`);
  return image;
}

async function readGroundField(baseUrl: string, ground: PaintedGround | undefined) {
  if (!ground) return null;
  try {
    const [field, far] = await Promise.all([
      readField(baseUrl, ground.field),
      readField(baseUrl, ground.far)
    ]);
    return { field, far };
  } catch (err) {
    console.warn('[painted tiles] ground field off:', err);
    return null;
  }
}

async function readLight(baseUrl: string, manifest: PaintedManifest) {
  try {
    const image = await loadImage(`${baseUrl}${LIGHT_IMAGE}`);
    if (image.width !== manifest.atlas.w || image.height !== manifest.atlas.h)
      throw new Error(`${LIGHT_IMAGE} is not the size of the atlas`);
    return image;
  } catch (err) {
    console.warn('[painted tiles] glow and shadows off:', err);
    return null;
  }
}

let source: Promise<PaintedSource | null> | null = null;

async function readSource(baseUrl: string): Promise<PaintedSource | null> {
  try {
    const [raw, image, sway] = await Promise.all([
      fetchManifest(`${baseUrl}manifest.json`),
      loadImage(`${baseUrl}atlas.png`),
      fetchSway(`${baseUrl}sway.json`)
    ]);
    const manifest = parseManifest(raw);
    if (image.width !== manifest.atlas.w || image.height !== manifest.atlas.h)
      throw new Error(
        `atlas.png is ${image.width}x${image.height}, the manifest says ${manifest.atlas.w}x${manifest.atlas.h}`
      );
    const wind = swayTable(sway, Object.keys(manifest.sprites));
    const { tileset, problems } = buildTileset(manifest, wind);
    if (problems.length > 0) console.warn(`[painted tiles] ${problems.join('; ')}`);
    const [top, light, water, ground] = await Promise.all([
      readTop(baseUrl, pieceTop(tileset)),
      readLight(baseUrl, manifest),
      readWater(baseUrl, manifest.water),
      readGroundField(baseUrl, tileset.ground)
    ]);
    if (!top) for (const [set, p] of tileset.pieces) if (p.top) tileset.pieces.delete(set);
    if (!ground) delete tileset.ground;
    return { manifest, tileset, image, light, top, water, ground };
  } catch (err) {
    console.warn('[painted tiles] off, drawing the glyph tiles instead:', err);
    return null;
  }
}

export async function loadPaintedTileset(
  gpu: GpuDevice,
  baseUrl = PAINTED_BASE_URL
): Promise<LoadedPaintedTileset | null> {
  source ??= readSource(baseUrl);
  const loaded = await source;
  setPaintedTileset(null);
  if (!loaded) return null;
  try {
    const texture = uploadAtlas(gpu, loaded.image);
    const top = loaded.top
      ? {
          texture: uploadAtlas(gpu, loaded.top.image),
          veins: uploadAtlas(gpu, loaded.top.veins),
          lift: loaded.top.piece.lift,
          ramp: loaded.top.piece.ramp,
          snow: loaded.top.piece.snow
        }
      : null;
    const light = loaded.light ? uploadAtlas(gpu, loaded.light) : unlitTexture(gpu);
    const water = loaded.water ? uploadAtlas(gpu, loaded.water) : null;
    const ground = loaded.ground
      ? { field: uploadAtlas(gpu, loaded.ground.field), far: uploadAtlas(gpu, loaded.ground.far) }
      : null;
    setPaintedTileset(loaded.tileset);
    return {
      tileset: loaded.tileset,
      texture,
      light,
      top,
      water,
      ground,
      texels: readTexels(loaded.image),
      cell: readCell(loaded.image)
    };
  } catch (err) {
    console.warn('[painted tiles] off, drawing the glyph tiles instead:', err);
    return null;
  }
}

function cropSprite(loaded: PaintedSource, spriteId: string | undefined): HTMLCanvasElement | null {
  const s = spriteId ? loaded.manifest.sprites[spriteId] : undefined;
  if (!s) return null;
  const canvas = document.createElement('canvas');
  canvas.width = s.w;
  canvas.height = s.h;
  canvas
    .getContext('2d', { willReadFrequently: true })
    ?.putImageData(new ImageData(region(loaded.image, s.x, s.y, s.w, s.h), s.w, s.h), 0, 0);
  return canvas;
}

export async function paintedSpriteCanvas(
  kind: PaintedKind,
  id: string,
  baseUrl = PAINTED_BASE_URL
): Promise<HTMLCanvasElement | null> {
  source ??= readSource(baseUrl);
  const loaded = await source;
  return loaded && cropSprite(loaded, loaded.manifest.map[kind]?.[id]?.[0]);
}

export async function paintedPawnLook(
  pawn: PawnLookOf,
  pool: PawnLookPool,
  baseUrl = PAINTED_BASE_URL
): Promise<string | undefined> {
  source ??= readSource(baseUrl);
  const loaded = await source;
  return loaded ? pawnLook(loaded.manifest.map, pawn, pool) : undefined;
}

export async function paintedLookCanvas(
  look: string,
  baseUrl = PAINTED_BASE_URL
): Promise<HTMLCanvasElement | null> {
  source ??= readSource(baseUrl);
  const loaded = await source;
  return loaded && cropSprite(loaded, look);
}
