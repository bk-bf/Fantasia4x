import {
  buildTileset,
  parseManifest,
  type PaintedKind,
  type PaintedManifest,
  type PaintedTileset
} from './manifest.js';
import { setPaintedTileset } from './tileset.js';

export const PAINTED_BASE_URL = '/tilesets/painted/';

export interface LoadedPaintedTileset {
  tileset: PaintedTileset;
  texture: WebGLTexture;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`could not load ${url}`));
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
    return { manifest, tileset, image };
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
    setPaintedTileset(loaded.tileset);
    return { tileset: loaded.tileset, texture };
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
