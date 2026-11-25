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
import {
  PAWN_BAND_H,
  bindPawnTexels,
  readPawnBand,
  resendPawnBand,
  setPawnBand,
  takePawnUploads
} from './pawnBand.js';
import { swayTable } from './wind.js';

export const PAINTED_BASE_URL = '/tilesets/painted/';
const LIGHT_IMAGE = 'atlas-light.png';

export interface LoadedPieceTop {
  texture: WebGLTexture;
  veins: WebGLTexture;
  lift: number;
  ramp: { x: number; y: number };
}

export interface LoadedGroundField {
  field: WebGLTexture;
  far: WebGLTexture;
}

export interface LoadedPaintedTileset {
  tileset: PaintedTileset;
  texture: WebGLTexture;
  light: WebGLTexture;
  top: LoadedPieceTop | null;
  water: WebGLTexture | null;
  ground: LoadedGroundField | null;
  texels: () => AtlasTexels | null;
  cell: (x: number, y: number, w: number, h: number) => Uint8ClampedArray | null;
  uploadPawns?: () => void;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const settle = (done: () => void) => () => {
      image.onload = image.onerror = null;
      done();
    };
    image.onload = settle(() => resolve(image));
    image.onerror = settle(() => reject(new Error(`could not load ${url}`)));
    image.src = url;
  });
}

function readTexels(image: HTMLImageElement, height: number): () => AtlasTexels | null {
  let texels: AtlasTexels | null | undefined;
  return () => {
    if (texels !== undefined) return texels;
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx?.drawImage(image, 0, 0);
    const data = ctx?.getImageData(0, 0, canvas.width, canvas.height).data;
    const drawn = data ? atlasTexels(data, canvas.width, canvas.height) : null;
    const kinds = drawn && new Uint8Array(drawn.w * height);
    kinds?.set(drawn!.kinds);
    texels = drawn && kinds ? { w: drawn.w, h: height, kinds } : null;
    if (texels) bindPawnTexels(texels);
    return texels;
  };
}

function readCell(image: HTMLImageElement) {
  return (x: number, y: number, w: number, h: number): Uint8ClampedArray | null => {
    if (y >= image.naturalHeight) return readPawnBand(x, y, w, h);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(image, x, y, w, h, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h).data;
  };
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

function uploadAtlas(
  gl: WebGL2RenderingContext,
  image: HTMLImageElement | ImageBitmap,
  height?: number
): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error('could not create the painted atlas texture');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (height === undefined)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, image.width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, image);
  }
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

function pawnUploader(gl: WebGL2RenderingContext, texture: WebGLTexture, light: WebGLTexture | null) {
  return () => {
    const uploads = takePawnUploads();
    if (uploads.length === 0) return;
    for (const [target, of] of [
      [texture, 'px'],
      [light, 'light']
    ] as const) {
      if (!target) continue;
      gl.bindTexture(gl.TEXTURE_2D, target);
      for (const { x, y, sprite } of uploads)
        gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, sprite.w, sprite.h, gl.RGBA, gl.UNSIGNED_BYTE, sprite[of]);
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
  };
}

function unlitTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error('could not create the painted light texture');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 255])
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

interface PaintedSource {
  manifest: PaintedManifest;
  atlasTop: number;
  tileset: PaintedTileset;
  image: HTMLImageElement;
  light: HTMLImageElement | null;
  top: { image: HTMLImageElement; veins: HTMLImageElement; piece: PaintedPieceTop } | null;
  water: HTMLImageElement | null;
  ground: { field: ImageBitmap; far: ImageBitmap } | null;
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
        if (loaded.naturalWidth !== size || loaded.naturalHeight !== size)
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
    if (image.naturalWidth !== field.size || image.naturalHeight !== field.size)
      throw new Error(`${field.image} is not ${field.size} px square`);
    return image;
  } catch (err) {
    console.warn('[painted tiles] water field off:', err);
    return null;
  }
}

async function readBitmap(baseUrl: string, field: ManifestField): Promise<ImageBitmap> {
  const res = await fetch(`${baseUrl}${field.image}`);
  if (!res.ok) throw new Error(`${field.image} answered ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob(), {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none'
  });
  if (bitmap.width !== field.size || bitmap.height !== field.size)
    throw new Error(`${field.image} is not ${field.size} px square`);
  return bitmap;
}

async function readGroundField(baseUrl: string, ground: PaintedGround | undefined) {
  if (!ground) return null;
  try {
    const [field, far] = await Promise.all([
      readBitmap(baseUrl, ground.field),
      readBitmap(baseUrl, ground.far)
    ]);
    return { field, far };
  } catch (err) {
    console.warn('[painted tiles] ground field off:', err);
    return null;
  }
}

async function readLight(baseUrl: string, manifest: PaintedManifest, atlasTop: number) {
  try {
    const image = await loadImage(`${baseUrl}${LIGHT_IMAGE}`);
    if (image.naturalWidth !== manifest.atlas.w || image.naturalHeight !== atlasTop)
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
    if (image.naturalWidth !== manifest.atlas.w || image.naturalHeight !== manifest.atlas.h)
      throw new Error(
        `atlas.png is ${image.naturalWidth}x${image.naturalHeight}, the manifest says ${manifest.atlas.w}x${manifest.atlas.h}`
      );
    const atlasTop = manifest.atlas.h;
    manifest.atlas.h += PAWN_BAND_H;
    const wind = swayTable(sway, Object.keys(manifest.sprites));
    const { tileset, problems } = buildTileset(manifest, wind);
    if (problems.length > 0) console.warn(`[painted tiles] ${problems.join('; ')}`);
    const [top, light, water, ground] = await Promise.all([
      readTop(baseUrl, pieceTop(tileset)),
      readLight(baseUrl, manifest, atlasTop),
      readWater(baseUrl, manifest.water),
      readGroundField(baseUrl, tileset.ground)
    ]);
    if (!top) for (const [set, p] of tileset.pieces) if (p.top) tileset.pieces.delete(set);
    if (!ground) delete tileset.ground;
    return { manifest, atlasTop, tileset, image, light, top, water, ground };
  } catch (err) {
    console.warn('[painted tiles] off, drawing the glyph tiles instead:', err);
    return null;
  }
}

export async function loadPaintedTileset(
  gl: WebGL2RenderingContext,
  baseUrl = PAINTED_BASE_URL
): Promise<LoadedPaintedTileset | null> {
  source ??= readSource(baseUrl);
  const loaded = await source;
  setPaintedTileset(null);
  if (!loaded) return null;
  try {
    const height = loaded.manifest.atlas.h;
    const texture = uploadAtlas(gl, loaded.image, height);
    const top = loaded.top
      ? {
          texture: uploadAtlas(gl, loaded.top.image),
          veins: uploadAtlas(gl, loaded.top.veins),
          lift: loaded.top.piece.lift,
          ramp: loaded.top.piece.ramp
        }
      : null;
    const light = loaded.light ? uploadAtlas(gl, loaded.light, height) : null;
    const water = loaded.water ? uploadAtlas(gl, loaded.water) : null;
    const ground = loaded.ground
      ? { field: uploadAtlas(gl, loaded.ground.field), far: uploadAtlas(gl, loaded.ground.far) }
      : null;
    setPaintedTileset(loaded.tileset);
    setPawnBand({
      tile: loaded.manifest.tile,
      w: loaded.manifest.atlas.w,
      top: loaded.atlasTop,
      h: height
    });
    resendPawnBand();
    return {
      tileset: loaded.tileset,
      texture,
      light: light ?? unlitTexture(gl),
      top,
      water,
      ground,
      texels: readTexels(loaded.image, height),
      cell: readCell(loaded.image),
      uploadPawns: pawnUploader(gl, texture, light)
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
    ?.drawImage(loaded.image, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h);
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
