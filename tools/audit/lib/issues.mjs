// The issue board: docs/issues/*.md, frontmatter + body.
//
// These files are the only record of a defect — nothing is projected anywhere else. Writing
// back is field-level rather than a full re-serialise, so a hand-edited body survives the
// loop touching `status:` or `pr:`.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const ISSUES_DIR = (root) => join(root, 'docs', 'issues');

const LISTS = new Set(['rules', 'files', 'symbols']);

export const STATUSES = ['open', 'in-progress', 'in-review', 'closed'];
export const KINDS = ['drift', 'correctness', 'performance', 'boundary', 'data', 'test-gap'];
export const SEVERITIES = ['critical', 'high', 'medium', 'low'];

// A deliberately small YAML reader: scalars, inline [a, b] lists, and `- item` blocks. The
// board's schema is fixed, so a general parser would only add a dependency and failure modes.
export function parseFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) return { data: {}, body: text };
  const body = text.slice(m[0].length);
  const data = {};
  let listKey = null;
  for (const raw of m[1].split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line || /^\s*#/.test(line)) continue;
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && listKey) {
      data[listKey].push(unquote(item[1]));
      continue;
    }
    const kv = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, rest] = kv;
    if (rest === '' || rest === '[]') {
      if (LISTS.has(key)) {
        data[key] = [];
        listKey = key;
      } else {
        data[key] = null;
        listKey = null;
      }
      continue;
    }
    listKey = null;
    const inline = /^\[(.*)\]$/.exec(rest);
    if (inline) {
      data[key] = inline[1].trim() ? inline[1].split(',').map((s) => unquote(s.trim())) : [];
    } else {
      data[key] = coerce(unquote(rest));
    }
  }
  return { data, body };
}

const unquote = (s) => s.replace(/^["'](.*)["']$/, '$1');
function coerce(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  if (/^-?\d+$/.test(v)) return Number(v);
  return v;
}

function needsQuote(s) {
  return typeof s === 'string' && /^[\s>|&*!%@`{}[\]#-]|:\s|^$|["']/.test(s);
}
const emit = (v) => (needsQuote(v) ? JSON.stringify(v) : String(v));

export function serializeFrontmatter(data) {
  const order = [
    'id',
    'title',
    'status',
    'kind',
    'severity',
    'ready',
    'origin',
    'rules',
    'files',
    'symbols',
    'branch',
    'pr',
    'created',
    'updated'
  ];
  const keys = [
    ...order.filter((k) => k in data),
    ...Object.keys(data).filter((k) => !order.includes(k))
  ];
  const out = ['---'];
  for (const k of keys) {
    const v = data[k];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) out.push(`${k}: []`);
      else {
        out.push(`${k}:`);
        for (const x of v) out.push(`  - ${emit(x)}`);
      }
    } else {
      out.push(`${k}: ${emit(v)}`);
    }
  }
  out.push('---');
  return out.join('\n') + '\n';
}

export function readIssue(path) {
  const text = readFileSync(path, 'utf8');
  const { data, body } = parseFrontmatter(text);
  return { path, data, body };
}

export function listIssues(root) {
  const dir = ISSUES_DIR(root);
  if (!existsSync(dir)) return [];
  const keep = (f) => f.endsWith('.md') && f !== 'README.md' && !f.startsWith('_');
  const found = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      const sub = join(dir, e.name);
      for (const f of readdirSync(sub)) if (keep(f)) found.push(join(sub, f));
    } else if (keep(e.name)) found.push(join(dir, e.name));
  }
  return found
    .map((p) => readIssue(p))
    .sort(
      (a, b) =>
        String(a.data.created).localeCompare(String(b.data.created)) ||
        String(a.data.id).localeCompare(String(b.data.id))
    );
}

export function writeIssue(root, { data, body }) {
  const dir = ISSUES_DIR(root);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${data.id}.md`);
  writeFileSync(path, serializeFrontmatter(data) + '\n' + body.replace(/^\n+/, ''));
  return path;
}

/** Change named fields without touching the body or the other fields. */
export function patchIssue(path, patch) {
  const { data, body } = readIssue(path);
  const next = { ...data, ...patch, updated: patch.updated ?? today() };
  writeFileSync(path, serializeFrontmatter(next) + '\n' + body.replace(/^\n+/, ''));
  return next;
}

export const today = () => new Date().toISOString().slice(0, 10);

const checkboxKey = (s) => s.trim().replace(/\s+/g, ' ');

export function tickRemediation(path, account) {
  const done = new Set(
    (account.match(/^[ \t]*DONE:[ \t]*(.+)$/gm) ?? []).map((l) =>
      checkboxKey(l.replace(/^[ \t]*DONE:[ \t]*/, ''))
    )
  );
  if (done.size === 0) return 0;
  const { data, body } = readIssue(path);
  let ticked = 0;
  const next = body.replace(/^([ \t]*)- \[ \] (.+)$/gm, (line, indent, text) => {
    if (!done.has(checkboxKey(text))) return line;
    ticked += 1;
    return `${indent}- [x] ${text}`;
  });
  if (ticked) {
    writeFileSync(path, serializeFrontmatter({ ...data, updated: today() }) + '\n' + next.replace(/^\n+/, ''));
  }
  return ticked;
}

export function validate(issue) {
  const e = [];
  const d = issue.data;
  const base = issue.path.split('/').pop().replace(/\.md$/, '');
  if (!d.id) e.push('missing id');
  else if (d.id !== base) e.push(`id "${d.id}" does not match filename "${base}"`);
  if (!d.title) e.push('missing title');
  if (!STATUSES.includes(d.status)) e.push(`bad status: ${d.status}`);
  if (!KINDS.includes(d.kind)) e.push(`bad kind: ${d.kind}`);
  if (!SEVERITIES.includes(d.severity)) e.push(`bad severity: ${d.severity}`);
  if (typeof d.ready !== 'boolean') e.push('ready must be true or false');
  if (!['human', 'audit'].includes(d.origin)) e.push(`bad origin: ${d.origin}`);
  for (const s of ['## What breaks', '## Evidence', '## Why nothing caught it', '## Remediation']) {
    if (!issue.body.includes(s)) e.push(`missing section: ${s}`);
  }
  // An issue the fixer may take has to say what "done" is, or it will decide for itself.
  if (d.ready === true) {
    const tasks = (issue.body.match(/^\s*- \[[ x]\]/gm) ?? []).length;
    if (tasks === 0) e.push('ready: true but the remediation list has no checkboxes');
  }
  return e;
}
