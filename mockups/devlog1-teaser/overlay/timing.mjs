export const DEFAULTS = {
  charsPerSecond: 22,
  pauses: { '.': 0.28, '!': 0.28, '?': 0.28, ',': 0.12, ';': 0.16, ':': 0.16, '—': 0.18 },
  shakeStep: 1 / 15,
  shakePx: 2,
  layouts: {
    '1920x1080': { pawnScale: 8, bubbleScale: 4, right: 96, bottom: 72, gap: 12, edge: 48 },
    '1080x1920': { pawnScale: 8, bubbleScale: 4, right: 72, bottom: 260, gap: 12, edge: 40 }
  }
};

export function config(raw) {
  const cfg = { ...DEFAULTS, ...raw, pauses: { ...DEFAULTS.pauses, ...(raw.pauses || {}) }, layouts: { ...DEFAULTS.layouts, ...(raw.layouts || {}) } };
  cfg.lines = (raw.lines || []).map(line => ({ ...line, letters: lettersOf(line, cfg) }));
  cfg.duration = raw.duration ?? Math.max(0, ...cfg.lines.map(l => l.end));
  return cfg;
}

export const sounds = ch => /[\p{L}\p{N}]/u.test(ch);

function lettersOf(line, cfg) {
  const out = [], step = 1 / (line.charsPerSecond || cfg.charsPerSecond);
  let t = line.start;
  for (const ch of [...line.text]) {
    out.push({ ch, t: Math.min(t, line.end), sounds: sounds(ch) });
    t += step + (cfg.pauses[ch] || 0);
  }
  return out;
}

export const typedEnd = line => line.letters.length ? line.letters[line.letters.length - 1].t + 1 / 60 : line.start;

function hash(n) {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

export function shakeAt(cfg, t) {
  const k = Math.floor(t / cfg.shakeStep), h = hash(k), s = cfg.shakePx;
  const pick = v => [-s, -1, 0, 1, s][v % 5];
  const dx = pick(h), dy = pick(h >>> 8);
  return dx === 0 && dy === 0 ? { dx: s, dy: 0 } : { dx, dy };
}

export function pitchOf(i) {
  return 0.92 + (hash(i * 7919 + 13) % 1000) / 1000 * 0.18;
}

export function stateAt(cfg, t) {
  const line = cfg.lines.find(l => t >= l.start && t < l.end) || null;
  if (!line) return { line: null, shown: 0, typing: false, dx: 0, dy: 0 };
  const shown = line.letters.filter(l => l.t <= t).length;
  const typing = t < typedEnd(line);
  const { dx, dy } = typing ? shakeAt(cfg, t) : { dx: 0, dy: 0 };
  return { line, shown, typing, dx, dy };
}

export function blipTimes(cfg) {
  const out = [];
  let i = 0;
  for (const line of cfg.lines) for (const l of line.letters) {
    if (l.sounds && l.t < line.end) out.push({ t: l.t, rate: pitchOf(i) });
    i++;
  }
  return out;
}
