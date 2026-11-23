import { animNow } from '$lib/stores/fx/animClock';
import { combatFeedback } from '$lib/stores/fx/combatFeedback';
import { projectiles } from '$lib/stores/fx/projectiles';
import { gradeFromWeights, gradeGen, setGrade } from '$lib/pixelArt/fx/bake';
import { FxPainter } from '$lib/pixelArt/fx/painter';
import { bar } from '$lib/pixelArt/fx/marks';
import {
  brackets,
  pant,
  path,
  reel,
  rest,
  rings,
  route,
  sleep,
  trader
} from '$lib/pixelArt/fx/effects';
import type { BubbleSkin } from '$lib/pixelArt/fx/bubble';
import { ART_TILE } from './figure';
import { collectScene, type FxWorld, type Mark, type Scene } from './scene';
import { drawFloats, floatersLive, type FloaterMode } from './floats';
import { drawSpeech } from './speech';
import { drawFlights, flying } from './flights';
import { conditionState } from './onsets';
import type { EffectToggles } from '$lib/stores/fx/effectToggles';
import type { CombatTextEvent } from '$lib/stores/fx/combatFeedback';
import type { ProjectileEvent } from '$lib/stores/fx/projectiles';

export interface FxView {
  vx: number;
  vy: number;
  tW: number;
  tH: number;
  paused: boolean;
}

const BAR_W = 24;
const BACKING = 1;

export const textScale = (k: number, dpr: number): number =>
  Math.max(1, Math.round(Math.min(k, dpr)));
const PRUNE_MS = 500;

const MARKS: Record<Mark['kind'], (p: FxPainter, x: number, y: number, t: number) => void> = {
  sleep,
  rest,
  reel,
  coin: trader,
  winded: pant
};

class WorldFxLayer {
  private skin: BubbleSkin = 'timber';
  private bubbles = true;
  private floaters: FloaterMode = { icons: true, text: true };
  private on: EffectToggles = {
    marks: true,
    work: true,
    health: true,
    draft: true,
    text: true,
    speech: true,
    projectiles: true
  };
  private canvas: HTMLCanvasElement | null = null;
  private painter: FxPainter | null = null;
  private painted = false;
  private key = '';
  private pruneAt = 0;

  configure(o: {
    skin: BubbleSkin;
    bubbles: boolean;
    floaters: FloaterMode;
    on: EffectToggles;
  }): void {
    this.skin = o.skin;
    this.bubbles = o.bubbles;
    this.floaters = o.floaters;
    this.on = o.on;
    this.key = '';
  }

  attach(c: HTMLCanvasElement): void {
    const g = c.getContext('2d');
    if (!g) return;
    this.canvas = c;
    this.painter = new FxPainter(g);
    this.painted = false;
  }

  detach(c: HTMLCanvasElement): void {
    if (this.canvas !== c) return;
    this.canvas = null;
    this.painter = null;
  }

  frame(w: Omit<FxWorld, 'view'>, v: FxView): void {
    const c = this.canvas;
    const p = this.painter;
    if (!c || !p) return;
    const now = animNow();
    const W = c.clientWidth;
    const H = c.clientHeight;
    const view = [v.vx, v.vy, v.vx + W / v.tW, v.vy + H / v.tH] as const;
    const scene = collectScene({ ...w, view }, this.on);
    const texts = this.texts(now);
    const shots: readonly ProjectileEvent[] = this.on.projectiles ? projectiles.live(now) : [];
    if (this.on.text && combatFeedback.hasOnsets() && now >= this.pruneAt) {
      this.pruneAt = now + PRUNE_MS;
      combatFeedback.pruneOnsets(now, conditionState(w));
    }
    const moving =
      scene.routes.length > 0 ||
      texts.length > 0 ||
      floatersLive() ||
      (shots.length > 0 && flying(shots, now)) ||
      scene.marks.length > 0;
    if (!moving && scene.bars.length === 0) {
      if (this.painted) p.g.clearRect(0, 0, c.width, c.height);
      p.forget();
      this.painted = false;
      this.key = '';
      return;
    }
    const dpr = BACKING;
    const bw = Math.round(W * dpr);
    const bh = Math.round(H * dpr);
    if (c.width !== bw || c.height !== bh) {
      c.width = bw;
      c.height = bh;
      p.forget();
      this.painted = false;
    }
    if (w.renderer) setGrade(gradeFromWeights(w.renderer.gradeWeights()), now);
    if (!moving || v.paused) {
      const key = stillKey(scene, v, texts.length, shots.length, gradeGen(), moving ? now : 0);
      if (this.painted && key === this.key) return;
      this.key = key;
    } else this.key = '';
    const k = (v.tW / ART_TILE) * dpr;
    p.view(k, -v.vx * v.tW * dpr, -v.vy * v.tH * dpr, textScale(k, dpr));
    this.paint(p, w, scene, texts, shots, now);
    p.end();
    this.painted = true;
  }

  private texts(now: number): readonly CombatTextEvent[] {
    const speech = this.on.speech && this.bubbles;
    const conditions = this.floaters.icons || this.floaters.text;
    if (!speech && !this.on.text) return [];
    const list = combatFeedback.live(now);
    if (list.length === 0) return list;
    return list.filter((e) =>
      e.kind === 'social' ? speech : this.on.text && (conditions || e.kind !== 'condition')
    );
  }

  private paint(
    p: FxPainter,
    w: Omit<FxWorld, 'view'>,
    s: Scene,
    texts: readonly CombatTextEvent[],
    shots: readonly ProjectileEvent[],
    now: number
  ): void {
    const t = now / 1000;
    for (const r of s.routes) {
      path(p, route(r.stops, r.from), r.col, t);
      rings(p, r.stops, r.col, r.attack);
      for (const b of r.boxes) brackets(p, b, r.col, t);
    }
    for (const b of s.bars) p.put(bar(BAR_W, b.v, b.ramp, b.pegs), b.x, b.y);
    for (const m of s.marks) MARKS[m.kind](p, m.x, m.y, t);
    drawFlights(p, w.renderer, shots, now);
    drawFloats(p, w.renderer, texts, now, this.floaters);
    drawSpeech(p, w.renderer, texts, now, this.skin);
  }
}

function stillKey(
  s: Scene,
  v: FxView,
  texts: number,
  shots: number,
  gen: number,
  clock: number
): string {
  let k = `${v.vx.toFixed(3)},${v.vy.toFixed(3)},${v.tW},${gen},${texts},${shots},${clock}`;
  for (const b of s.bars) k += `|${b.x},${b.y},${Math.round(b.v * 100)}`;
  for (const m of s.marks) k += `|${m.kind}${m.x},${m.y}`;
  for (const r of s.routes) k += `|r${r.from}${r.stops.join(';')}`;
  return k;
}

export const worldFx = new WorldFxLayer();
