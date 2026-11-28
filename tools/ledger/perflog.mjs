const STAMP = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{3}) (.*)$/;
const TAGGED = /^\[T(\d+)\] \[(\w+)\] (.*)$/;
const RESET = /^=== log reset at (\S+) /;
const TPS = /^tps=(\d+(?:\.\d+)?) speed=(\S+) pawns=(\d+) mobs=(\d+)/;
const FPS = /^render fps=(\d+(?:\.\d+)?) /;
const CAPTURE = /^ledger (save=\S+|save cap=\S+|failed) /;
const LEDGER_SESSION = /^ledger capture=\S+ .*\bsession=(\S+)/;
const TOKEN = /(\w+)=("(?:[^"]*)"|\S+)/g;
const HOUR = 3600_000;

/** @typedef {{ raw: string, at: number | null, stamp: string | null, turn: number | null, msg: string, type?: string }} Line */
/** @typedef {{ start: Line, lines: Line[], last?: boolean }} Session */
/** @typedef {{ median: number, p10: number, p90: number, n: number }} Stats */
/** @typedef {{ save: string | null, capture: string | null, reason: string | null, turn: number | null, at: string | null, ms: number, entry: string | null, index?: number | null }} LogCheckpoint */
/** @typedef {(capture: string) => { save: string | null, entry: string } | null} Resolve */
/** @typedef {ReturnType<typeof sessionHeader>} Header */

/** @param {string[]} fields @param {string | null | undefined} timeZone */
export function localToUtc(fields, timeZone) {
  const [y, mo, d, h, mi, s, ms] = fields.map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi, s, ms);
  if (!timeZone || timeZone === 'UTC' || timeZone === 'Etc/UTC') return guess;
  /** @param {number} t */
  const offsetAt = (t) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
        .formatToParts(new Date(t))
        .map((p) => [p.type, p.value])
    );
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    return asUtc - Math.floor(t / 1000) * 1000;
  };
  const first = guess - offsetAt(guess);
  return guess - offsetAt(first);
}

/** @param {string} raw @param {string | null | undefined} timeZone @returns {Line} */
export function parseLine(raw, timeZone) {
  /** @type {Line} */
  const line = { raw, at: null, stamp: null, turn: null, msg: raw };
  const st = STAMP.exec(raw);
  let rest = raw;
  if (st) {
    line.stamp = raw.slice(0, 23);
    line.at = localToUtc(st.slice(1, 8), timeZone);
    rest = st[8];
  }
  const tg = TAGGED.exec(rest);
  if (tg) {
    line.turn = Number(tg[1]);
    line.msg = tg[3];
  } else line.msg = rest;
  const reset = RESET.exec(raw);
  if (reset) {
    line.type = 'reset';
    line.at = Date.parse(reset[1]);
    line.stamp = reset[1];
  } else if (!tg && line.msg.startsWith('host ')) line.type = 'host';
  else if (line.msg.startsWith('session ')) line.type = 'session';
  else if (CAPTURE.test(line.msg)) line.type = 'capture';
  else if (TPS.test(line.msg)) line.type = 'tps';
  else if (FPS.test(line.msg)) line.type = 'fps';
  else line.type = 'other';
  return line;
}

/** @param {string} msg */
export function tokens(msg) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const m of msg.matchAll(TOKEN)) {
    if (out[m[1]] !== undefined) continue;
    out[m[1]] = m[2].startsWith('"') ? m[2].slice(1, -1) : m[2];
  }
  return out;
}

/** @param {string | null | undefined} v */
const num = (v) => (v == null || v === '-' || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

/** @param {string} msg */
export function sessionHeader(msg) {
  const t = tokens(msg);
  const at = (t.build ?? '').lastIndexOf('@');
  const branch = at >= 0 ? t.build.slice(0, at) : null;
  return {
    branch: branch && branch !== 'detached' ? branch : null,
    commit: at >= 0 ? t.build.slice(at + 1) || null : null,
    refs: t.refs && t.refs !== '-' ? t.refs : '',
    dirty: num(t.dirty),
    save: t.save && t.save !== '-' ? t.save : null,
    map: t.map ?? null,
    pawns: num(t.pawns),
    mobs: num(t.mobs),
    buildings: num(t.buildings),
    turn: num(t.turn),
    speed: t.speed ?? null,
    renderer: t.renderer ?? null,
    client: {
      version: t.version ?? null,
      mode: t.mode ?? null,
      serverStarted: t.serverStarted ?? null,
      shell: t.shell ?? null,
      query: t.query && t.query !== '-' ? t.query : null,
      switches: t.switches && t.switches !== '-' ? t.switches : null,
      gpu: t.gpu ?? null,
      window: t.window ?? null,
      screen: t.screen ?? null,
      cores: num(t.cores),
      memoryGb: num(t.memoryGb)
    },
    host: {
      power: t.power ?? null,
      profile: t.profile ?? null,
      governor: t.governor ?? null,
      load: t.load ?? null,
      freeGb: t.freeGb ?? null
    }
  };
}

/** @param {string} text @param {string | null | undefined} timeZone @returns {Session[]} */
export function splitSessions(text, timeZone) {
  /** @type {Session[]} */
  const sessions = [];
  /** @type {Session | null} */
  let cur = null;
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  /** @type {string | null} */
  let previous = null;
  for (const raw of lines) {
    const repeated = raw === previous && cur?.lines.length === 1;
    previous = raw;
    if (repeated) continue;
    const line = parseLine(raw, timeZone);
    if (line.type === 'session' || line.type === 'reset' || !cur) {
      cur = { start: line, lines: [] };
      sessions.push(cur);
    }
    cur.lines.push(line);
  }
  return sessions.map((s, i) => ({ ...s, last: i === sessions.length - 1 }));
}

/** @param {number[]} values @returns {Stats | null} */
export function stats(values) {
  if (!values.length) return null;
  const xs = [...values].sort((a, b) => a - b);
  /** @param {number} q */
  const at = (q) => xs[Math.min(xs.length - 1, Math.floor(q * xs.length))];
  return { median: at(0.5), p10: at(0.1), p90: at(0.9), n: xs.length };
}

/** @param {Line} line */
function running(line) {
  const t = tokens(line.msg);
  if (t.paused === 'true') return false;
  if (t.paused === 'false') return true;
  return line.type === 'tps' ? Number(TPS.exec(line.msg)?.[1]) > 0 : false;
}

/** @param {{ speed: string, value: number }[]} samples @returns {Record<string, Stats | null>} */
function bySpeed(samples) {
  /** @type {Record<string, number[]>} */
  const groups = {};
  for (const s of samples) (groups[s.speed] ??= []).push(s.value);
  return Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, stats(v)]));
}

/** @param {Record<string, Stats | null>} groups @returns {string | null} */
function dominant(groups) {
  /** @type {string | null} */
  let best = null;
  for (const [speed, st] of Object.entries(groups)) if (!best || (st?.n ?? 0) > (groups[best]?.n ?? 0)) best = speed;
  return best;
}

/** @param {Pick<Session, 'lines'>} session */
export function ledgerSession(session) {
  for (const l of session.lines) {
    const m = LEDGER_SESSION.exec(l.msg);
    if (m) return m[1];
  }
  return null;
}

/** @param {Session} session */
function failedCaptures(session) {
  return session.lines.filter((l) => l.type === 'capture' && l.msg.startsWith('ledger failed')).map((l) => ({ line: l, t: tokens(l.msg) }));
}

/** @param {Session} session @param {Resolve} resolve @returns {LogCheckpoint[]} */
function logCheckpoints(session, resolve) {
  const failed = new Set(failedCaptures(session).map((f) => f.t.cap).filter(Boolean));
  /** @type {LogCheckpoint[]} */
  const out = [];
  session.lines.forEach((line, index) => {
    if (line.type !== 'capture' || line.msg.startsWith('ledger failed')) return;
    const t = tokens(line.msg);
    if (!t.save && !t.cap) return;
    if (t.cap && failed.has(t.cap)) return;
    const found = t.cap ? resolve(t.cap) : null;
    out.push({
      save: t.save ?? found?.save ?? null,
      capture: t.cap ?? null,
      reason: t.reason ?? null,
      turn: num(t.turn) ?? line.turn,
      at: t.at ?? (line.at == null ? null : new Date(line.at).toISOString()),
      ms: num(t.ms) ?? 0,
      entry: t.entry ?? found?.entry ?? null,
      index
    });
  });
  return out;
}

/** @param {Session} session @param {Resolve} [resolve] @param {LogCheckpoint[]} [fromEntries] */
export function sessionPerf(session, resolve = () => null, fromEntries = []) {
  const header = session.start.type === 'session' ? sessionHeader(session.start.msg) : null;
  const logged = logCheckpoints(session, resolve);
  const seen = new Set(logged.map((c) => c.capture).filter(Boolean));
  /** @type {LogCheckpoint[]} */
  const checkpoints = [...logged, ...fromEntries.filter((c) => !seen.has(c.capture)).map((c) => ({ ...c, index: null }))].sort(
    (a, b) => (Date.parse(a.at ?? '') || 0) - (Date.parse(b.at ?? '') || 0) || (a.turn ?? 0) - (b.turn ?? 0)
  );
  const timed = checkpoints.every((c) => !Number.isNaN(Date.parse(c.at ?? '')));
  /** @type {[number, number][]} */
  const starts = [
    ...checkpoints.map((c) => /** @type {[number, number]} */ ([Date.parse(c.at ?? ''), c.ms ?? 0])),
    ...session.lines
      .filter((l) => l.type === 'capture')
      .map((l) => tokens(l.msg))
      .map((t) => /** @type {[number, number]} */ ([Date.parse(t.at ?? ''), num(t.ms) ?? 0]))
  ];
  const windows = starts.filter(([a]) => !Number.isNaN(a)).map(([a, ms]) => [a, a + ms]);
  /** @param {number} from @param {number} to */
  const stalled = (from, to) => windows.some(([a, b]) => a < to && b > from);
  /** @param {Line} line @param {number} index */
  const stretchOf = (line, index) => {
    const at = line.at;
    return timed && at != null
      ? checkpoints.filter((c) => Date.parse(c.at ?? '') < at).length
      : checkpoints.filter((c) => c.index != null && c.index < index).length;
  };
  /** @type {{ value: number, speed: string, turn: number | null, stretch: number }[]} */
  const tps = [];
  /** @type {{ value: number, speed: string, running: boolean }[]} */
  const fps = [];
  /** @type {number | null} */
  let lastTps = null;
  /** @type {Record<string, string | null>[]} */
  const changes = [];
  /** @type {Record<string, string | null>} */
  let power = header?.host ?? {};
  session.lines.forEach((line, index) => {
    if (line.type === 'tps') {
      const since = lastTps;
      if (line.at != null) {
        lastTps = line.at;
        if (stalled(since ?? line.at - 1000, line.at)) return;
      }
      if (!running(line)) return;
      const [, value, speed] = TPS.exec(line.msg) ?? [];
      tps.push({ value: Number(value), speed, turn: line.turn, stretch: stretchOf(line, index) });
    } else if (line.type === 'fps') {
      const t = tokens(line.msg.split('|')[1] ?? '');
      fps.push({
        value: Number(FPS.exec(line.msg)?.[1]),
        speed: t.speed ?? '?',
        running: t.paused === 'false'
      });
    } else if (line.type === 'host') {
      power = { ...power, ...tokens(line.msg) };
      changes.push({ at: line.at == null ? null : new Date(line.at).toISOString(), ...tokens(line.msg) });
    }
  });
  for (const c of checkpoints) delete c.index;
  const speeds = bySpeed(tps);
  const speed = dominant(speeds);
  const turns = session.lines
    .filter((l) => l.type === 'tps' || l.type === 'fps')
    .map((l) => l.turn)
    .concat(header?.turn ?? [])
    .filter((t) => t != null);
  const started = checkpoints.find((c) => c.reason === 'session');
  /** @type {{ from: { save: string | null, capture: string | null, turn: number | null, at: string | null }, to: { save: string | null, capture: string | null, turn: number | null, at: string | null } | null, tps: Record<string, Stats | null> }[]} */
  const stretches = [];
  for (let k = 0; k <= checkpoints.length; k++) {
    const inside = tps.filter((s) => s.stretch === k);
    const from = k === 0 ? null : checkpoints[k - 1];
    const to = checkpoints[k] ?? null;
    if (!checkpoints.length) break;
    stretches.push({
      from: from ? { save: from.save, capture: from.capture, turn: from.turn, at: from.at } : { save: header?.save ?? started?.save ?? null, capture: started?.capture ?? null, turn: header?.turn ?? null, at: null },
      to: to ? { save: to.save, capture: to.capture, turn: to.turn, at: to.at } : null,
      tps: bySpeed(inside)
    });
  }
  const runningFps = fps.filter((f) => f.running);
  const loads = (header?.host?.load ?? '').split('/').map(num);
  return {
    header,
    save: header?.save ?? started?.save ?? null,
    host: {
      load: loads.length === 3 && loads.every((l) => l != null) ? loads : null,
      loadEnd: null,
      cores: header?.client?.cores ?? null,
      others: null,
      power: power.power ?? null,
      profile: power.profile ?? null,
      governor: power.governor ?? null,
      freeGb: header?.host?.freeGb ?? null,
      changes
    },
    perf: {
      tps: speed ? speeds[speed] : null,
      speed,
      tpsBySpeed: speeds,
      fps: stats(runningFps.map((f) => f.value)),
      fpsBySpeed: bySpeed(runningFps),
      fpsPaused: stats(fps.filter((f) => !f.running).map((f) => f.value)),
      turns: turns.length ? { first: Math.min(...turns), last: Math.max(...turns) } : null,
      renderer: header?.renderer ?? null,
      client: header?.client ?? null,
      checkpoints,
      stretches
    }
  };
}

/** @param {Pick<Session, 'start' | 'lines'>} session @param {number} [fallbackMs] */
export function sessionTimes(session, fallbackMs) {
  const stamped = session.lines.filter((l) => l.at != null);
  return {
    start: session.start.at ?? stamped[0]?.at ?? null,
    end: stamped.length ? stamped[stamped.length - 1].at : fallbackMs ?? null
  };
}

/** @param {Session} session @param {number} now @param {number} [fallbackMs] */
export function isOpen(session, now, fallbackMs) {
  if (!session.last) return false;
  const { end } = sessionTimes(session, fallbackMs);
  return end != null && now - end < HOUR;
}
