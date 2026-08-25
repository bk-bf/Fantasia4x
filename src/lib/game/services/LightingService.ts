import type { PlacedBuilding, WorldTile } from '../core/types.js';
import { buildingService } from './BuildingService';
import { resourceObjectService } from './ResourceObjectService';

export interface LightEmitter {
  x: number;
  y: number;
  color: [number, number, number];
  radius: number;
  intensity: number;
  flicker?: boolean;
}

export const FIRE_COLOR: [number, number, number] = [1.0, 0.55, 0.22];
export const FIRE_INTENSITY = 1.1;

export function buildingLight(b: {
  type: string;
  status: string;
  lit?: boolean;
}): { radius: number; intensity: number; color: [number, number, number] } | null {
  if (b.status !== 'complete') return null;
  const def = buildingService.getBuildingById(b.type);
  if (!def?.lightRadius) return null;
  const needsFuel = (def.maxFuel ?? 0) > 0;
  if (needsFuel && b.lit !== true) return null;
  return {
    radius: def.lightRadius,
    intensity: def.lightIntensity ?? FIRE_INTENSITY,
    color: def.lightColor ?? FIRE_COLOR
  };
}

const MAX_LIGHT = 1.6;

class LightingServiceImpl {
  private emitters: LightEmitter[] = [];
  private ambientLight = 1.0;
  private ambientTint: [number, number, number] = [1.0, 1.0, 1.0];
  private emittersVersion = 0;
  private emittersSignature = '';

  private _lcData: Float32Array | null = null;
  private _lcVersion = -1;
  private _lcMinX = 0;
  private _lcMinY = 0;
  private _lcW = 0;
  private _lcH = 0;

  setEmitters(emitters: LightEmitter[]): void {
    this.emitters = emitters;
    let sig = '';
    for (const e of emitters) sig += `${e.x},${e.y},${e.radius},${e.intensity}|`;
    if (sig !== this.emittersSignature) {
      this.emittersSignature = sig;
      this.emittersVersion++;
    }
  }

  getEmittersVersion(): number {
    return this.emittersVersion;
  }

  flicker(time: number): number {
    return fireFlicker(time, 0);
  }

  setAmbient(light: number, tint: [number, number, number]): void {
    this.ambientLight = light;
    this.ambientTint = tint;
  }

  collectEmitters(buildings: PlacedBuilding[]): LightEmitter[] {
    const out: LightEmitter[] = [];
    for (const b of buildings) {
      const light = buildingLight(b);
      if (!light) continue;
      out.push({
        x: b.x,
        y: b.y,
        color: light.color,
        radius: light.radius,
        intensity: light.intensity,
        flicker: true
      });
    }
    return out;
  }

  collectResourceEmitters(worldMap: WorldTile[][]): LightEmitter[] {
    const out: LightEmitter[] = [];
    for (const row of worldMap) {
      for (const tile of row) {
        const e = this.emitterForTile(tile);
        if (e) out.push(e);
      }
    }
    return out;
  }

  emitterForTile(tile: WorldTile): LightEmitter | null {
    const res = tile.resources;
    if (!res) return null;
    for (const id in res) {
      if ((res[id] ?? 0) <= 0) continue;
      const glow = resourceObjectService.getById(id)?.glow;
      if (glow)
        return {
          x: tile.x,
          y: tile.y,
          color: glow.color,
          radius: glow.radius,
          intensity: glow.intensity,
          flicker: glow.flicker ?? false
        };
    }
    return null;
  }

  sample(wx: number, wy: number, time: number): [number, number, number] {
    let r = this.ambientLight * this.ambientTint[0];
    let g = this.ambientLight * this.ambientTint[1];
    let b = this.ambientLight * this.ambientTint[2];

    for (let i = 0; i < this.emitters.length; i++) {
      const e = this.emitters[i];
      const dx = wx - e.x - 0.5;
      const dy = wy - e.y - 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= e.radius) continue;

      const d = dist / e.radius;
      const falloff = (1 - d) * (1 - d);

      const flick = e.flicker ? fireFlicker(time, i) : 1.0;
      const add = e.intensity * falloff * flick;

      r += e.color[0] * add;
      g += e.color[1] * add;
      b += e.color[2] * add;
    }

    return [Math.min(r, MAX_LIGHT), Math.min(g, MAX_LIGHT), Math.min(b, MAX_LIGHT)];
  }

  samplePointOnly(wx: number, wy: number, time: number): [number, number, number] {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < this.emitters.length; i++) {
      const e = this.emitters[i];
      const dx = wx - e.x - 0.5;
      const dy = wy - e.y - 0.5;
      if (dx <= -e.radius || dx >= e.radius || dy <= -e.radius || dy >= e.radius) continue;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= e.radius) continue;

      const d = dist / e.radius;
      const falloff = (1 - d) * (1 - d);
      const flick = e.flicker ? fireFlicker(time, i) : 1.0;
      const add = e.intensity * falloff * flick;

      r += e.color[0] * add;
      g += e.color[1] * add;
      b += e.color[2] * add;
    }
    return [r, g, b];
  }

  hasEmitters(): boolean {
    return this.emitters.length > 0;
  }

  getLitBounds(): { minX: number; minY: number; maxX: number; maxY: number } | null {
    if (this.emitters.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < this.emitters.length; i++) {
      const e = this.emitters[i];
      const cx = e.x + 0.5;
      const cy = e.y + 0.5;
      if (cx - e.radius < minX) minX = cx - e.radius;
      if (cy - e.radius < minY) minY = cy - e.radius;
      if (cx + e.radius > maxX) maxX = cx + e.radius;
      if (cy + e.radius > maxY) maxY = cy + e.radius;
    }
    return { minX, minY, maxX, maxY };
  }

  samplePointStatic(wx: number, wy: number): [number, number, number] {
    this.ensureStaticLightCache();
    const lc = this._lcData;
    if (!lc) return [0, 0, 0];
    const lx = (wx | 0) - this._lcMinX;
    const ly = (wy | 0) - this._lcMinY;
    if (lx < 0 || ly < 0 || lx >= this._lcW || ly >= this._lcH) return [0, 0, 0];
    const idx = (ly * this._lcW + lx) * 3;
    return [lc[idx], lc[idx + 1], lc[idx + 2]];
  }

  private ensureStaticLightCache(): void {
    if (this._lcVersion === this.emittersVersion) return;
    this._lcVersion = this.emittersVersion;
    const em = this.emitters;
    if (em.length === 0) {
      this._lcData = null;
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const e of em) {
      const ex = e.x + 0.5;
      const ey = e.y + 0.5;
      minX = Math.min(minX, Math.floor(ex - e.radius));
      maxX = Math.max(maxX, Math.ceil(ex + e.radius));
      minY = Math.min(minY, Math.floor(ey - e.radius));
      maxY = Math.max(maxY, Math.ceil(ey + e.radius));
    }
    const W = maxX - minX + 1;
    const H = maxY - minY + 1;
    const lc = new Float32Array(W * H * 3);
    for (const e of em) {
      const r = e.radius;
      const ex = e.x + 0.5;
      const ey = e.y + 0.5;
      const cy0 = Math.max(minY, Math.floor(ey - r));
      const cy1 = Math.min(maxY, Math.ceil(ey + r));
      const cx0 = Math.max(minX, Math.floor(ex - r));
      const cx1 = Math.min(maxX, Math.ceil(ex + r));
      const i0 = e.color[0] * e.intensity;
      const i1 = e.color[1] * e.intensity;
      const i2 = e.color[2] * e.intensity;
      for (let cy = cy0; cy <= cy1; cy++) {
        const dy = cy - ey;
        if (dy <= -r || dy >= r) continue;
        for (let cx = cx0; cx <= cx1; cx++) {
          const dx = cx - ex;
          if (dx <= -r || dx >= r) continue;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist >= r) continue;
          const d = dist / r;
          const falloff = (1 - d) * (1 - d);
          const idx = ((cy - minY) * W + (cx - minX)) * 3;
          lc[idx] += i0 * falloff;
          lc[idx + 1] += i1 * falloff;
          lc[idx + 2] += i2 * falloff;
        }
      }
    }
    this._lcData = lc;
    this._lcMinX = minX;
    this._lcMinY = minY;
    this._lcW = W;
    this._lcH = H;
  }
}

function fireFlicker(time: number, seed: number): number {
  const n = Math.sin(time * 6.0 + seed * 1.7) * 0.5 + Math.sin(time * 11.3 + seed * 0.9) * 0.5;
  return 0.85 + 0.15 * (0.5 + 0.5 * n);
}

export const lightingService = new LightingServiceImpl();
