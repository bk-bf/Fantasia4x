import {
  buildTileset,
  parseManifest,
  type PaintedKind,
  type PaintedManifest,
  type PaintedPieceTop,
  type PaintedTileset
} from './manifest.js';
import { setPaintedTileset } from './tileset.js';

export const PAINTED_BASE_URL = '/tilesets/painted/';

export interface LoadedPieceTop {
  texture: WebGLTexture;
  lift: number;
  ramp: { x: number; y: number };
}

export interface LoadedPaintedTileset {
  tileset: PaintedTileset;
  texture: WebGLTexture;
  top: LoadedPieceTop | null;
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

async function fetchManifest(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}

function uploadAtlas(gl: WebGL2RenderingContext, image: HTMLImageElement): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error('could not create the painted atlas texture');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

interface PaintedSource {
  manifest: PaintedManifest;
  tileset: PaintedTileset;
  image: HTMLImageElement;
  top: { image: HTMLImageElement; piece: PaintedPieceTop } | null;
}

const pieceTop = (tileset: PaintedTileset) =>
  [...tileset.pieces.values()].find((p) => p.top)?.top ?? null;

async function readTop(baseUrl: string, piece: PaintedPieceTop | null) {
  if (!piece) return null;
  try {
    const image = await loadImage(`${baseUrl}${piece.image}`);
    if (image.naturalWidth !== piece.size || image.naturalHeight !== piece.size)
      throw new Error(`${piece.image} is not ${piece.size} px square`);
    return { image, piece };
  } catch (err) {
    console.warn('[painted tiles] rock tops off:', err);
    return null;
  }
}

let source: Promise<PaintedSource | null> | null = null;

async function readSource(baseUrl: string): Promise<PaintedSource | null> {
  try {
    const [raw, image] = await Promise.all([
      fetchManifest(`${baseUrl}manifest.json`),
      loadImage(`${baseUrl}atlas.png`)
    ]);
    const manifest = parseManifest(raw);
    if (image.naturalWidth !== manifest.atlas.w || image.naturalHeight !== manifest.atlas.h)
      throw new Error(
        `atlas.png is ${image.naturalWidth}x${image.naturalHeight}, the manifest says ${manifest.atlas.w}x${manifest.atlas.h}`
      );
    const { tileset, problems } = buildTileset(manifest);
    if (problems.length > 0) console.warn(`[painted tiles] ${problems.join('; ')}`);
    const top = await readTop(baseUrl, pieceTop(tileset));
    if (!top) for (const [set, p] of tileset.pieces) if (p.top) tileset.pieces.delete(set);
    return { manifest, tileset, image, top };
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
    const texture = uploadAtlas(gl, loaded.image);
    const top = loaded.top
      ? {
          texture: uploadAtlas(gl, loaded.top.image),
          lift: loaded.top.piece.lift,
          ramp: loaded.top.piece.ramp
        }
      : null;
    setPaintedTileset(loaded.tileset);
    return { tileset: loaded.tileset, texture, top };
  } catch (err) {
    console.warn('[painted tiles] off, drawing the glyph tiles instead:', err);
    return null;
  }
}

export async function paintedSpriteCanvas(
  kind: PaintedKind,
  id: string,
  baseUrl = PAINTED_BASE_URL
): Promise<HTMLCanvasElement | null> {
  source ??= readSource(baseUrl);
  const loaded = await source;
  const spriteId = loaded?.manifest.map[kind]?.[id]?.[0];
  const s = loaded && spriteId ? loaded.manifest.sprites[spriteId] : undefined;
  if (!loaded || !s) return null;
  const canvas = document.createElement('canvas');
  canvas.width = s.w;
  canvas.height = s.h;
  canvas.getContext('2d')?.drawImage(loaded.image, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h);
  return canvas;
}
