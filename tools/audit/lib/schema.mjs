import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRules } from './rules.mjs';
import { ROOT } from './links.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Every label a writer may use: the fixed vocabulary plus one per rule name. Anything else
 *  is a typo or an invention, and both pollute the board the same way. */
export function allowedLabels() {
  const out = new Set();
  try {
    for (const group of Object.values(JSON.parse(readFileSync(join(HERE, '..', 'labels.json'), 'utf8')))) {
      for (const l of group) out.add(l);
    }
  } catch {
    /* a missing vocabulary must not silently allow everything */
  }
  try {
    for (const r of loadRules().rules) if (r.name) out.add(r.name);
  } catch {
    /* same */
  }
  return out;
}

const distance = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return d[a.length][b.length];
};

const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
// a reordering is the common invention -- test-missing for missing-test -- and edit distance
// scores those as far apart, so compare the word bag as well as the string
const bag = (s) => s.toLowerCase().split(/[^a-z]+/).filter(Boolean).sort().join('');

const nearest = (name, allowed) => {
  for (const a of allowed) if (bag(a) === bag(name)) return a;
  let best = null;
  let score = Infinity;
  for (const a of allowed) {
    const d = distance(norm(name), norm(a));
    if (d < score) {
      score = d;
      best = a;
    }
  }
  return score <= Math.max(3, Math.round(name.length / 2)) ? best : null;
};

export function checkLabels(labels, { allowReady = false } = {}) {
  const allowed = allowedLabels();
  const errors = [];
  for (const l of labels ?? []) {
    if (allowed.has(l)) continue;
    const near = nearest(l, allowed);
    errors.push(
      `label "${l}" is not in the schema` + (near ? ` — did you mean "${near}"?` : '') +
        ' (tools/audit/labels.json, plus one per rule name)'
    );
  }
  if (!allowReady && (labels ?? []).includes('ready')) {
    errors.push('a new issue may not be labelled "ready" — raise it into Backlog and promote it deliberately');
  }
  return errors;
}

const atSha = (sha, path) => {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}:${path}`], { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const linesAt = (sha, path) => {
  try {
    return execFileSync('git', ['show', `${sha}:${path}`], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024
    }).split('\n').length;
  } catch {
    return null;
  }
};

export function checkBody(body) {
  const errors = [];
  const text = body ?? '';

  for (const m of text.matchAll(/\[[^\]]*\]\((?!https?:)([^)]+)\)/g)) {
    errors.push(
      `relative link "${m[1]}" — an issue body is not a file, so it must be an absolute URL or a bare #123`
    );
  }
  for (const m of text.matchAll(/https:\/\/github\.com\/[^/]+\/[^/]+\/projects\/\d+\/views\/\d+/g)) {
    errors.push(`project view link "${m[0]}" — views are renumbered, link the issue or the project itself`);
  }
  for (const m of text.matchAll(/`https?:\/\/github\.com\/[^`]*\/issues\/(\d+)`/g)) {
    errors.push(`issue ${m[1]} is inside a code span, so it will not link — write #${m[1]}`);
  }

  const seen = new Set();
  for (const m of text.matchAll(
    /https:\/\/github\.com\/[^/]+\/[^/]+\/blob\/([0-9a-f]{7,40})\/([^)#\s]+)(?:#L(\d+))?/g
  )) {
    const [, sha, path, line] = m;
    const key = `${sha}:${path}:${line ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!atSha(sha, path)) {
      errors.push(`${path} does not exist at ${sha.slice(0, 8)}`);
      continue;
    }
    if (line) {
      const n = linesAt(sha, path);
      if (n !== null && Number(line) > n) {
        errors.push(`${path}:${line} is past the end of the file at ${sha.slice(0, 8)} (${n} lines)`);
      }
    }
  }
  return errors;
}

export function check({ labels, body, allowReady = false } = {}) {
  return [...checkLabels(labels, { allowReady }), ...checkBody(body)];
}
