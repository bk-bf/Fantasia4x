// @ts-nocheck
const STAMP = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{3}) (.*)$/;
const TAGGED = /^\[T(\d+)\] \[(\w+)\] (.*)$/;
const RESET = /^=== log reset at (\S+) /;
const TPS = /^tps=(\d+(?:\.\d+)?) speed=(\S+) pawns=(\d+) mobs=(\d+)/;
const FPS = /^render fps=(\d+(?:\.\d+)?) /;
const CAPTURE = /^ledger (save=\S+|failed) /;
const TOKEN = /(\w+)=("(?:[^"]*)"|\S+)/g;
const HOUR = 3600_000;

export function localToUtc(fields, timeZone) {
  const [y, mo, d, h, mi, s, ms] = fields.map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi, s, ms);
  if (!timeZone || timeZone === 'UTC' || timeZone === 'Etc/UTC') return guess;
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

export function parseLine(raw, timeZone) {
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

export function tokens(msg) {
  const out = {};
  for (const m of msg.matchAll(TOKEN)) {
    if (out[m[1]] !== undefined) continue;
    out[m[1]] = m[2].startsWith('"') ? m[2].slice(1, -1) : m[2];
  }
  return out;
}

const num = (v) => (v == null || v === '-' || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

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

export function splitSessions(text, timeZone) {
  const sessions = [];
  let cur = null;
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  for (const raw of lines) {
    const line = parseLine(raw, timeZone);
    if (line.type === 'session' || line.type === 'reset' || !cur) {
      cur = { start: line, lines: [] };
      sessions.push(cur);
    }
    cur.lines.push(line);
  }
  return sessions.map((s, i) => ({ ...s, last: i === sessions.length - 1 }));
}

export function stats(values) {
  if (!values.length) return null;
  const xs = [...values].sort((a, b) => a - b);
  const at = (q) => xs[Math.min(xs.length - 1, Math.floor(q * xs.length))];
  return { median: at(0.5), p10: at(0.1), p90: at(0.9), n: xs.length };
}

function running(line) {
  const t = tokens(line.msg);
  if (t.paused === 'true') return false;
  if (t.paused === 'false') return true;
  return line.type === 'tps' ? Number(TPS.exec(line.msg)[1]) > 0 : false;
}

function bySpeed(samples) {
  const groups = {};
  for (const s of samples) (groups[s.speed] ??= []).push(s.value);
  return Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, stats(v)]));
}

function dominant(groups) {
  let best = null;
  for (const [speed, st] of Object.entries(groups)) if (!best || st.n > groups[best].n) best = speed;
  return best;
}

export function sessionPerf(session) {
  const header = session.start.type === 'session' ? sessionHeader(session.start.msg) : null;
  const checkpoints = [];
  const tps = [];
  const fps = [];
  const windows = session.lines
    .filter((l) => l.type === 'capture')
    .map((l) => {
      const t = tokens(l.msg);
      const ms = num(t.ms) ?? 0;
      const from = Date.parse(t.at ?? '') || (l.at == null ? null : l.at - ms);
      return from == null ? null : [from, from + ms];
    })
    .filter(Boolean);
  const stalled = (from, to) => windows.some(([a, b]) => a < to && b > from);
  let lastTps = null;
  const changes = [];
  let power = header?.host ?? {};
  for (const line of session.lines) {
    if (line.type === 'capture') {
      const t = tokens(line.msg);
      const ms = num(t.ms) ?? 0;
      if (!t.save) continue;
      checkpoints.push({
        save: t.save,
        reason: t.reason ?? null,
        turn: num(t.turn) ?? line.turn,
        at: t.at ?? (line.at == null ? null : new Date(line.at).toISOString()),
        ms,
        entry: t.entry ?? null
      });
    } else if (line.type === 'tps') {
      const since = lastTps ?? (line.at == null ? null : line.at - 1000);
      if (line.at != null) lastTps = line.at;
      if (line.at != null && stalled(since, line.at)) continue;
      if (!running(line)) continue;
      const [, value, speed] = TPS.exec(line.msg);
      tps.push({ value: Number(value), speed, turn: line.turn, stretch: checkpoints.length });
    } else if (line.type === 'fps') {
      const t = tokens(line.msg.split('|')[1] ?? '');
      fps.push({
        value: Number(FPS.exec(line.msg)[1]),
        speed: t.speed ?? '?',
        running: t.paused === 'false'
      });
    } else if (line.type === 'host') {
      power = { ...power, ...tokens(line.msg) };
      changes.push({ at: line.at == null ? null : new Date(line.at).toISOString(), ...tokens(line.msg) });
    }
  }
  const speeds = bySpeed(tps);
  const speed = dominant(speeds);
  const turns = session.lines
    .filter((l) => l.type === 'tps' || l.type === 'fps')
    .map((l) => l.turn)
    .concat(header?.turn ?? [])
    .filter((t) => t != null);
  const started = checkpoints.find((c) => c.reason === 'session');
  const stretches = [];
  for (let k = 0; k <= checkpoints.length; k++) {
    const inside = tps.filter((s) => s.stretch === k);
    const from = k === 0 ? null : checkpoints[k - 1];
    const to = checkpoints[k] ?? null;
    if (!checkpoints.length) break;
    stretches.push({
      from: from ? { save: from.save, turn: from.turn, at: from.at } : { save: header?.save ?? started?.save ?? null, turn: header?.turn ?? null, at: null },
      to: to ? { save: to.save, turn: to.turn, at: to.at } : null,
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

export function sessionTimes(session, fallbackMs) {
  const stamped = session.lines.filter((l) => l.at != null);
  return {
    start: session.start.at ?? stamped[0]?.at ?? null,
    end: stamped.length ? stamped[stamped.length - 1].at : fallbackMs ?? null
  };
}

export function isOpen(session, now, fallbackMs) {
  if (!session.last) return false;
  const { end } = sessionTimes(session, fallbackMs);
  return end != null && now - end < HOUR;
}
