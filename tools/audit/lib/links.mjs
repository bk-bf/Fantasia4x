// @ts-nocheck
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = process.env.AUDIT_ROOT || join(HERE, '..', '..', '..');

export const REPO = process.env.AUDIT_GH_REPO || 'bk-bf/Fantasia4x';
const BASE = `https://github.com/${REPO}`;

/** The commit the evidence was read at. A citation names a line, and a line only means
 *  something at one revision, so every blob link is pinned rather than following a branch. */
export function indexedSha(db) {
  try {
    const row = db?.prepare(`SELECT v FROM meta WHERE k='indexed_sha'`).get();
    if (row?.v) return row.v;
  } catch {
    /* fall through to the working tree */
  }
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

export const blobUrl = (file, line, sha) =>
  `${BASE}/blob/${sha ?? 'main'}/${file}${line ? `#L${line}` : ''}`;

export const issueUrl = (n) => `${BASE}/issues/${n}`;

/** GitHub auto-links a bare `#12`, and renders a backticked URL as code. Anything that names
 *  an issue in this repo becomes the bare reference. */
export function issueRef(text) {
  return String(text)
    .replace(/`?https?:\/\/github\.com\/[^/\s`]+\/[^/\s`]+\/issues\/(\d+)`?/g, '#$1')
    .replace(/`#(\d+)`/g, '#$1');
}

const PATH_RE =
  /(?<![\w/[(`])((?:src|tools|scripts|docs|electron)\/[A-Za-z0-9._/-]+\.[A-Za-z]{1,8})(?::(\d+))?/g;

const BACKTICK_PATH_RE =
  /`((?:src|tools|scripts|docs|electron)\/[A-Za-z0-9._/-]+\.[A-Za-z]{1,8})(?::(\d+))?`/g;

/** Turn `src/lib/x.ts:41` written in prose into a permalink, leaving anything already inside
 *  a markdown link alone. A backtick-wrapped path that does not resolve at the commit, or that
 *  `git check-ignore` matches, is not evidence -- a model citing its own scratch file, or a
 *  test the finding asks to be written, reads as proof otherwise. The backticks come off so it
 *  stops looking like a citation `check-links` would follow; the words stay. */
export function linkify(text, sha) {
  if (!text) return text;

  const linkSpans = [];
  for (const m of text.matchAll(/\[[^\]]*\]\([^)]*\)/g)) linkSpans.push([m.index, m.index + m[0].length]);
  const withinLink = (i) => linkSpans.some(([a, b]) => i >= a && i < b);

  const out = text.replace(BACKTICK_PATH_RE, (whole, file, line, offset) => {
    if (withinLink(offset)) return whole;
    const real = resolveRepoPath(file, sha);
    if (!real) return line ? `${file}:${line}` : file;
    const label = line ? `${real}:${line}` : real;
    return `[\`${label}\`](${blobUrl(real, line, sha)})`;
  });

  const spans = [];
  const guard = /\[[^\]]*\]\([^)]*\)|`[^`]*`/g;
  for (let m; (m = guard.exec(out)); ) spans.push([m.index, m.index + m[0].length]);
  const inside = (i) => spans.some(([a, b]) => i >= a && i < b);

  return out.replace(PATH_RE, (whole, file, line, offset) => {
    if (inside(offset)) return whole;
    const real = resolveRepoPath(file, sha);
    if (!real) return whole;
    const label = line ? `${real}:${line}` : real;
    return `[\`${label}\`](${blobUrl(real, line, sha)})`;
  });
}

/** A rule's `authority` names where its invariant is written down. Only an issue reference
 *  reaches a reader: a doc path is a moving target -- it gets renamed, folded into another
 *  file or deleted, and the citation then points at nothing while still looking authoritative.
 *  The rule still carries the field, and `prompt.mjs` still reads the document for the model;
 *  it just does not become a link somebody clicks. */
export function authorityLink(authority) {
  if (!authority) return null;
  const issue = /github\.com\/[^/]+\/[^/]+\/issues\/(\d+)/.exec(authority);
  return issue ? `#${issue[1]}` : null;
}

let treeCache = null;

/** Every path in the repo at a commit, plus a basename index, so a citation written as
 *  `Culture.ts:40` or `types/culture.ts:5` can be resolved to a real file. */
export function repoTree(sha) {
  if (treeCache?.sha === sha) return treeCache;
  let files = [];
  try {
    files = execFileSync('git', ['ls-tree', '-r', '--name-only', sha ?? 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024
    })
      .split('\n')
      .filter(Boolean);
  } catch {
    files = [];
  }
  const byBase = new Map();
  for (const f of files) {
    const b = f.split('/').pop();
    byBase.set(b, [...(byBase.get(b) ?? []), f]);
  }
  treeCache = { sha, files: new Set(files), byBase };
  return treeCache;
}

/** `git ls-tree` already excludes anything gitignored and never committed, but a citation
 *  naming an ignored path that *was* once tracked, or one a basename match resolves onto by
 *  accident, would slip past that check alone. Ask git directly rather than trust the tree. */
export function isGitIgnored(path) {
  try {
    execFileSync('git', ['check-ignore', '-q', '--', path], { cwd: ROOT });
    return true;
  } catch {
    return false;
  }
}

function findInTree(raw, sha) {
  const tree = repoTree(sha);
  const clean = String(raw).replace(/^\.{1,2}\//, '').replace(/^(\.\.\/)+/, '').replace(/^\//, '');
  if (tree.files.has(clean)) return clean;
  const suffix = [...tree.files].filter((f) => f.endsWith('/' + clean));
  if (suffix.length === 1) return suffix[0];
  const base = clean.split('/').pop();
  const hits = tree.byBase.get(base) ?? [];
  if (hits.length === 1) return hits[0];
  const narrowed = hits.filter((f) => f.endsWith(clean));
  if (narrowed.length === 1) return narrowed[0];
  // the data files were .jsonc until they became strict json; older evidence still says jsonc
  if (clean.endsWith('.jsonc')) return findInTree(clean.replace(/\.jsonc$/, '.json'), sha);
  return null;
}

/** Resolve however a citation was written to a real repo path, or null if it cannot be. */
export function resolveRepoPath(raw, sha) {
  if (!raw) return null;
  const real = findInTree(raw, sha);
  if (real && isGitIgnored(real)) return null;
  return real;
}
