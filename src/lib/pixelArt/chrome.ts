import type { Attachment } from 'svelte/attachments';
import { get } from 'svelte/store';
import { uiTheme } from '$lib/stores/uiPrefs';
import type { ThemeId } from '$lib/components/UI/theme/themes';
import { blank } from './canvas';
import { SKINS, type ChromeKind, type Painted } from './skins';
import './chrome.css';

const KEEP = 24;
const painted = new Map<string, Painted | null>();

function paintedFor(theme: ThemeId, kind: ChromeKind, w: number, h: number): Painted | null {
  const key = `${theme}|${kind}|${w}|${h}`;
  if (painted.has(key)) {
    const hit = painted.get(key) ?? null;
    painted.delete(key);
    painted.set(key, hit);
    return hit;
  }
  const made = SKINS[theme].chrome[kind](w, h);
  painted.set(key, made);
  if (painted.size > KEEP) painted.delete(painted.keys().next().value as string);
  return made;
}

function copy(src: HTMLCanvasElement, cls: string): HTMLCanvasElement {
  const c = blank(src.width, src.height);
  c.className = cls;
  c.getContext('2d')?.drawImage(src, 0, 0);
  return c;
}

export function chrome(kind: ChromeKind): Attachment<HTMLElement> {
  return (el) => {
    el.classList.add('chrome');
    el.dataset.chrome = kind;
    let theme = get(uiTheme);
    let w = 0;
    let h = 0;
    let shown: HTMLCanvasElement[] = [];
    const draw = () => {
      for (const c of shown) c.remove();
      shown = [];
      if (w < 2 || h < 2) return;
      const out = paintedFor(theme, kind, w, h);
      if (!out) return;
      shown = out.lit ? [copy(out.base, 'skin'), copy(out.lit, 'lit')] : [copy(out.base, 'skin')];
      el.prepend(...shown);
    };
    const seen = new ResizeObserver(() => {
      const nw = el.offsetWidth;
      const nh = el.offsetHeight;
      if (nw === w && nh === h) return;
      w = nw;
      h = nh;
      draw();
    });
    seen.observe(el);
    const stop = uiTheme.subscribe((t) => {
      if (t === theme) return;
      theme = t;
      draw();
    });
    return () => {
      seen.disconnect();
      stop();
      for (const c of shown) c.remove();
      el.classList.remove('chrome');
    };
  };
}
