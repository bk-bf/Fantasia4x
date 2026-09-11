import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRules } from './rules.mjs';
import { check, allowedLabels } from './schema.mjs';
import { subareas, subareaFor } from './subarea.mjs';

export const STATUSES = ['open', 'in-progress', 'in-review', 'closed'];
export const KINDS = ['drift', 'correctness', 'performance', 'boundary', 'data', 'test-gap', 'feature'];
export const SEVERITIES = ['critical', 'high', 'medium', 'low'];

const SEVERITY_LABEL = { critical: 'critical', high: 'high', medium: 'medium', low: 'low' };
const KIND_LABEL = {
  drift: 'drift', correctness: 'correctness', performance: 'performance',
  boundary: 'boundary', data: 'data', 'test-gap': 'test gap', feature: 'feature'
};
const ORIGIN_LABEL = { audit: 'found by audit', human: 'found by hand' };
const STATUS_LABEL = { 'in-progress': 'in progress', 'in-review': 'in review' };
const VERIFY_LABEL = { tests: 'verify tests', headless: 'verify headless', playtest: 'needs playtest' };

const unlabel = (map, names) => {
  for (const [k, v] of Object.entries(map)) if (names.includes(v)) return k;
  return undefined;
};

let ruleNames = null;

/** rule id -> the readable name the board shows. The id stays the ledger's key. */
function nameOf(id) {
  if (ruleNames === null) {
    ruleNames = new Map();
    try {
      for (const r of loadRules().rules) ruleNames.set(r.id, r.name ?? r.id);
    } catch {
      /* a rules file that will not parse must not stop an issue being written */
    }
  }
  return ruleNames.get(id) ?? id;
}

export const today = () => new Date().toISOString().slice(0, 10);

function gh(args, { input } = {}) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    input,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe']
  });
}

const WRAPPER = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'issue.mjs');

function issueTool(args, { input } = {}) {
  return execFileSync(process.execPath, [WRAPPER, ...args], {
    encoding: 'utf8',
    input,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe']
  });
}

let knownLabels = null;

function ensureLabels(names) {
  if (knownLabels === null) {
    try {
      knownLabels = new Set(
        JSON.parse(gh(['label', 'list', '--limit', '200', '--json', 'name'])).map((l) => l.name)
      );
    } catch {
      knownLabels = new Set();
    }
  }
  const allowed = allowedLabels();
  for (const n of names) {
    if (knownLabels.has(n)) continue;
    if (!allowed.has(n)) {
      throw new Error(`refusing to create the label "${n}" — it is not in the schema`);
    }
    try {
      issueTool(['sync-labels']);
      knownLabels = null;
    } catch {
      /* a label that cannot be created must not stop the finding being recorded */
    }
    knownLabels?.add(n);
  }
}

const MARKER = (id) => `<!-- audit-id: ${id} -->`;
const META = /<!-- audit-meta: (\{.*?\}) -->/s;

function splitBody(raw) {
  const body = raw ?? '';
  const id = (body.match(/<!-- audit-id: ([^\s]+) -->/) ?? [])[1];
  let meta = {};
  const m = body.match(META);
  if (m) {
    try {
      meta = JSON.parse(m[1]);
    } catch {
      meta = {};
    }
  }
  const prose = body
    .replace(/<!-- audit-id: [^>]*-->\n?/g, '')
    .replace(/<!-- audit-meta: \{.*?\} -->\n?/gs, '')
    .trim();
  return { id, meta, prose };
}

function toIssue(raw) {
  const { id, meta, prose } = splitBody(raw.body);
  const names = (raw.labels ?? []).map((l) => l.name);
  const status =
    raw.state === 'CLOSED' || raw.state === 'closed'
      ? 'closed'
      : (unlabel(STATUS_LABEL, names) ?? 'open');
  return {
    path: String(raw.number),
    number: raw.number,
    data: {
      id: id ?? meta.id ?? String(raw.number),
      title: raw.title,
      status,
      kind: unlabel(KIND_LABEL, names),
      severity: unlabel(SEVERITY_LABEL, names),
      ready: names.includes('ready'),
      origin: unlabel(ORIGIN_LABEL, names) ?? 'audit',
      verify: unlabel(VERIFY_LABEL, names),
      subarea: names.find((n) => subareas().has(n)) ?? null,
      rules: meta.rules ?? [],
      files: meta.files ?? [],
      symbols: meta.symbols ?? [],
      created: meta.created ?? (raw.createdAt ?? '').slice(0, 10),
      updated: meta.updated ?? (raw.updatedAt ?? '').slice(0, 10)
    },
    body: prose
  };
}

let cache = null;

export function listIssues() {
  if (cache) return cache;
  const raw = gh([
    'issue', 'list', '--state', 'all', '--limit', '400',
    '--json', 'number,title,body,state,labels,createdAt,updatedAt'
  ]);
  cache = JSON.parse(raw).map(toIssue).sort((a, b) => a.number - b.number);
  return cache;
}

export const invalidate = () => {
  cache = null;
};

export function readIssue(handle) {
  const n = String(handle);
  const hit = listIssues().find((i) => i.path === n || i.data.id === n);
  if (hit) return hit;
  const raw = gh([
    'issue', 'view', n,
    '--json', 'number,title,body,state,labels,createdAt,updatedAt'
  ]);
  return toIssue(JSON.parse(raw));
}

function labelsFor(d) {
  const out = [];
  if (d.severity && SEVERITY_LABEL[d.severity]) out.push(SEVERITY_LABEL[d.severity]);
  if (d.kind && KIND_LABEL[d.kind]) out.push(KIND_LABEL[d.kind]);
  if (d.origin && ORIGIN_LABEL[d.origin]) out.push(ORIGIN_LABEL[d.origin]);
  if (d.subarea && subareas().has(d.subarea)) out.push(d.subarea);
  if (d.verify && VERIFY_LABEL[d.verify]) out.push(VERIFY_LABEL[d.verify]);
  for (const r of d.rules ?? []) out.push(nameOf(r));
  if (d.ready === true) out.push('ready');
  if (STATUS_LABEL[d.status]) out.push(STATUS_LABEL[d.status]);
  return out;
}

function composeBody(data, body) {
  const meta = {
    id: data.id,
    rules: data.rules ?? [],
    files: data.files ?? [],
    symbols: data.symbols ?? [],
    created: data.created ?? today(),
    updated: data.updated ?? today()
  };
  return `${MARKER(data.id)}\n\n${body.trim()}\n\n<!-- audit-meta: ${JSON.stringify(meta)} -->\n`;
}

export function writeIssue(_root, { data, body }) {
  if (!data.subarea) data.subarea = subareaFor(data.files ?? []);
  // validate before any network call: an invalid write should cost nothing and fail the same
  // way whether or not GitHub is reachable
  const labels = labelsFor(data);
  const errors = check({ labels, body, allowReady: data.ready === true });
  if (errors.length) {
    throw new Error(`refusing to write ${data.id}:\n  - ${errors.join('\n  - ')}`);
  }
  const existing = listIssues().find((i) => i.data.id === data.id);
  ensureLabels(labels);
  const args = existing
    ? ['edit', existing.path, '--title', data.title, '--body-file', '-']
    : [
        'create', '--title', data.title, '--body-file', '-', '--type', data.type ?? 'fix',
        '--area', data.area ?? '', '--size', data.size ?? ''
      ];
  for (const l of labels) args.push(existing ? '--add-label' : '--label', l);
  const outText = issueTool(args, { input: composeBody(data, body) });
  invalidate();
  const url = outText.trim().split('\n').filter(Boolean).pop() ?? '';
  return existing ? existing.path : url.split('/').pop();
}

export function patchIssue(handle, patch) {
  const cur = readIssue(handle);
  const next = { ...cur.data, ...patch };
  const args = ['edit', cur.path];
  if (patch.title) args.push('--title', patch.title);
  const before = new Set(labelsFor(cur.data));
  const after = new Set(labelsFor(next));
  ensureLabels([...after]);
  for (const l of after) args.push('--add-label', l);
  for (const l of before) if (!after.has(l)) args.push('--remove-label', l);
  const bodyChanged =
    patch.body !== undefined ||
    JSON.stringify(next.files) !== JSON.stringify(cur.data.files) ||
    JSON.stringify(next.symbols) !== JSON.stringify(cur.data.symbols);
  if (bodyChanged) args.push('--body-file', '-');
  const labelsChanged =
    [...after].some((l) => !before.has(l)) || [...before].some((l) => !after.has(l));
  if (bodyChanged || labelsChanged || patch.title) {
    issueTool(args, bodyChanged ? { input: composeBody(next, patch.body ?? cur.body) } : {});
  }
  if (next.status === 'closed' && cur.data.status !== 'closed') {
    gh(['issue', 'close', cur.path, '--reason', 'completed']);
  }
  if (next.status !== 'closed' && cur.data.status === 'closed') {
    gh(['issue', 'reopen', cur.path]);
  }
  invalidate();
  return cur.path;
}

export function comment(handle, text) {
  issueTool(['comment', String(handle), '--body-file', '-'], { input: text });
  invalidate();
}

export function closeWithCommit(handle, sha) {
  issueTool(['close', String(handle), '--commit', sha]);
  invalidate();
}

const checkboxKey = (s) => s.trim().replace(/\s+/g, ' ');

/** A session is told to quote the checkbox text exactly, and routinely appends its reasoning to
 *  the same line. Matching on a prefix ticks what was actually done instead of silently
 *  ticking nothing. */
export function tickRemediation(handle, account) {
  const done = (account.match(/^[ \t]*DONE:[ \t]*(.+)$/gm) ?? []).map((l) =>
    checkboxKey(l.replace(/^[ \t]*DONE:[ \t]*/, ''))
  );
  if (done.length === 0) return 0;
  const cur = readIssue(handle);
  let ticked = 0;
  const next = cur.body.replace(/^([ \t]*)- \[ \] (.+)$/gm, (line, indent, text) => {
    const key = checkboxKey(text);
    if (!done.some((d) => d === key || d.startsWith(key))) return line;
    ticked += 1;
    return `${indent}- [x] ${text}`;
  });
  if (ticked) patchIssue(cur.path, { body: next, updated: today() });
  return ticked;
}

export function featureSteps(body) {
  const section = (body ?? '').split(/^##\s+Steps\s*$/im)[1];
  if (section === undefined) return [];
  return [...section.split(/^##\s+/m)[0].matchAll(/^[ \t]*- \[([ x])\] (.+)$/gm)].map((m) => ({
    done: m[1] === 'x',
    text: m[2].trim()
  }));
}

export function validate(issue) {
  const errors = [];
  const d = issue.data;
  if (!d.title) errors.push(`${d.id}: no title`);
  if (d.status && !STATUSES.includes(d.status)) errors.push(`${d.id}: bad status ${d.status}`);
  if (d.kind && !KINDS.includes(d.kind)) errors.push(`${d.id}: bad kind ${d.kind}`);
  if (d.severity && !SEVERITIES.includes(d.severity))
    errors.push(`${d.id}: bad severity ${d.severity}`);
  return errors;
}
