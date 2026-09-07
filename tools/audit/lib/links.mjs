import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = process.env.AUDIT_ROOT || join(HERE, '..', '..');

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

/** Turn `src/lib/x.ts:41` written in prose into a permalink, leaving anything already inside
 *  a markdown link or a code span alone. */
export function linkify(text, sha) {
  if (!text) return text;
  const spans = [];
  const guard = /\[[^\]]*\]\([^)]*\)|`[^`]*`/g;
  for (let m; (m = guard.exec(text)); ) spans.push([m.index, m.index + m[0].length]);
  const inside = (i) => spans.some(([a, b]) => i >= a && i < b);

  return text.replace(PATH_RE, (whole, file, line, offset) => {
    if (inside(offset)) return whole;
    const label = line ? `${file}:${line}` : file;
    return `[\`${label}\`](${blobUrl(file, line, sha)})`;
  });
}

/** A rule's `authority` is either a doc path in the repo or an issue URL. */
export function authorityLink(authority, sha) {
  if (!authority) return null;
  const issue = /github\.com\/[^/]+\/[^/]+\/issues\/(\d+)/.exec(authority);
  if (issue) return `#${issue[1]}`;
  const [path, anchor] = authority.split('#');
  return `[\`${path}\`](${blobUrl(path, null, sha)}${anchor ? `#${anchor}` : ''})`;
}
