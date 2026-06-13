/**
 * parseDebugLine — turn a raw `.debug/*.log` line into structured fields for the
 * in-game Debug Log viewer (dev-only). Mirrors the format written by gameLogger
 * and the /api/debug-log + /api/activity-log routes:
 *
 *   2026-06-13T20:33:47.450Z [T12436] [COMBAT] (warning) actor: message → target
 *   └ ISO timestamp            └ turn  └ tag    └ severity└ message ──────────────
 *
 * Lines that don't match (e.g. rotation banners) fall back to a raw message.
 */

export interface ParsedDebugLine {
  raw: string;
  /** Parsed timestamp, or null if the line had no ISO prefix. */
  ts: Date | null;
  /** Display time `HH:MM:SS.mmm` (empty when unparsed). */
  tsStr: string;
  /** Game turn from the `[T0000]` token, or null. */
  turn: number | null;
  /** Bracketed tag, e.g. `PAWN-TICK`, `COMBAT`. */
  tag: string | null;
  /** Lowercase severity from a `(warning)`-style token, or null. */
  severity: string | null;
  /** Everything after the tag (and optional severity). */
  message: string;
  /** Stable render key, assigned by the caller's counter. */
  key: number;
}

// ISO-ts  [Tn]  [TAG]  (severity)?  message
const LINE_RE = /^(\S+)\s+\[T(\d+)\]\s+\[([A-Z][A-Z0-9_-]*)\]\s*(?:\(([a-z]+)\)\s*)?(.*)$/;

export function parseDebugLine(raw: string, key: number): ParsedDebugLine {
  const m = LINE_RE.exec(raw);
  if (!m) {
    return { raw, ts: null, tsStr: '', turn: null, tag: null, severity: null, message: raw, key };
  }
  const [, isoStr, turnStr, tag, severity, message] = m;
  const ts = new Date(isoStr);
  const valid = !Number.isNaN(ts.getTime());
  return {
    raw,
    ts: valid ? ts : null,
    // ISO `…T20:33:47.450Z` → `20:33:47.450`
    tsStr: valid ? isoStr.slice(11, 23) : '',
    turn: Number(turnStr),
    tag,
    severity: severity ?? null,
    message,
    key
  };
}

/**
 * Deterministic per-tag colour so each tag reads as a stable, distinct hue.
 * Saturation/lightness are tuned for the dark amber terminal background.
 */
export function tagColor(tag: string | null): string {
  if (!tag) return '#7a5c20';
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) % 360;
  return `hsl(${h}, 60%, 62%)`;
}

/** Severity → colour. Anything unknown/absent falls back to the muted token. */
export function severityColor(severity: string | null): string {
  switch (severity) {
    case 'error':
    case 'critical':
      return '#c83018';
    case 'warning':
      return '#f08828';
    case 'info':
      return '#68b030';
    case 'debug':
      return '#7a5c20';
    default:
      return '#7a5c20';
  }
}
