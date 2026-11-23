import type { Attachment } from 'svelte/attachments';
import { get } from 'svelte/store';
import { uiTheme } from '$lib/stores/uiPrefs';
import type { ThemeId } from '$lib/components/UI/theme/themes';
import { artImage, toArt, type Art } from './picture';
import { SKINS, type ChromeKind } from './skins';
import './chrome.css';

const KEEP = 24;
const SETTLE_MS = 120;
interface PaintedArt {
  base: Art;
  lit?: Art;
}

const painted = new Map<string, PaintedArt | null>();

function paintedFor(theme: ThemeId, kind: ChromeKind, w: number, h: number): PaintedArt | null {
  const key = `${theme}|${kind}|${w}|${h}`;
  if (painted.has(key)) {
    const hit = painted.get(key) ?? null;
    painted.delete(key);
    painted.set(key, hit);
    return hit;
  }
  const out = SKINS[theme].chrome[kind](w, h);
  const made = out && { base: toArt(out.base), lit: out.lit && toArt(out.lit) };
  painted.set(key, made);
  if (painted.size > KEEP) painted.delete(painted.keys().next().value as string);
  return made;
}

export function chrome(kind: ChromeKind): Attachment<HTMLElement> {
  return (el) => {
    el.classList.add('chrome');
    el.dataset.chrome = kind;
    let theme = get(uiTheme);
    let w = 0;
    let h = 0;
    let shown: HTMLImageElement[] = [];
    let drawnAt = 0;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const draw = () => {
      for (const c of shown) c.remove();
      shown = [];
      if (w < 2 || h < 2) return;
      const out = paintedFor(theme, kind, w, h);
      if (!out) return;
      shown = out.lit
        ? [artImage(out.base, 'skin'), artImage(out.lit, 'lit')]
        : [artImage(out.base, 'skin')];
      el.prepend(...shown);
    };
    const seen = new ResizeObserver(() => {
      const nw = el.offsetWidth;
      const nh = el.offsetHeight;
      if (nw === w && nh === h) return;
      w = nw;
      h = nh;
      clearTimeout(settle);
      const now = performance.now();
      if (!shown.length || now - drawnAt >= SETTLE_MS) {
        drawnAt = now;
        draw();
        return;
      }
      settle = setTimeout(() => {
        drawnAt = performance.now();
        draw();
      }, SETTLE_MS);
    });
    seen.observe(el);
    const stop = uiTheme.subscribe((t) => {
      if (t === theme) return;
      theme = t;
      draw();
    });
    return () => {
      clearTimeout(settle);
      seen.disconnect();
      stop();
      for (const c of shown) c.remove();
      el.classList.remove('chrome');
    };
  };
}
