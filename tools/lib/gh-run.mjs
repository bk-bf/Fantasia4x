import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const MAX_BUFFER = 64 * 1024 * 1024;
const GRAPHQL_FAILURE = /graphql|rate limit/i;

/** @typedef {Error & { status?: number | null, stdout?: string, stderr?: string }} GhError */
/** @typedef {{ title: string, number: number }} RestMilestone */
/** @typedef {{ name: string }} RestLabel */
/** @typedef {{ number: number, title: string, body?: string | null, state: string, labels?: RestLabel[], created_at: string, updated_at: string, html_url: string, milestone?: RestMilestone | null, pull_request?: unknown }} RestIssue */
/** @typedef {{ body?: string | null, user?: { login: string } | null, created_at: string, html_url: string }} RestComment */
/** @typedef {{ body?: string | null, user?: { login: string } | null, state: string, submitted_at: string }} RestReview */
/** @typedef {{ number: number, title: string, body?: string | null, html_url: string, state: string, merged_at?: string | null, merge_commit_sha?: string | null, head?: { ref: string, sha: string }, base?: { ref: string }, draft?: boolean, labels?: RestLabel[], milestone?: RestMilestone | null }} RestPull */
/** @typedef {{ filename: string, additions: number, deletions: number }} RestFile */
/** @typedef {{ repo: () => string, api: (method: string, path: string, body?: unknown) => unknown, pages: (path: string) => unknown[], readFile: (path: string) => string }} Io */
/** @typedef {Record<string, string[]>} Flags */

let graphqlDown = false;

/** @param {string[]} args @param {{ input?: string, cwd?: string }} [options] */
function run(args, { input, cwd } = {}) {
  const r = spawnSync('gh', args, { encoding: 'utf8', input, cwd, maxBuffer: MAX_BUFFER });
  if (r.error) throw r.error;
  if (r.status === 0) return r;
  const err = new Error(`Command failed: gh ${args.join(' ')}\n${r.stderr ?? ''}`);
  Object.assign(err, { status: r.status, stdout: r.stdout, stderr: r.stderr });
  throw err;
}

/** @param {string | undefined} cwd @returns {Io} */
export function restIo(cwd) {
  /** @type {string | null} */
  let repoName = null;
  /** @param {string[]} args @param {string} [input] @returns {string} */
  const call = (args, input) => run(args, { input, cwd }).stdout;
  return {
    repo: () => (repoName ??= JSON.parse(call(['api', 'repos/{owner}/{repo}'])).full_name),
    api: (method, path, body) =>
      JSON.parse(
        call(['api', '-X', method, path, ...(body === undefined ? [] : ['--input', '-'])],
          body === undefined ? undefined : JSON.stringify(body)) || 'null'
      ),
    pages: (path) => /** @type {unknown[][]} */ (JSON.parse(call(['api', '--paginate', '--slurp', path]))).flat(),
    readFile: (path) => readFileSync(path, 'utf8')
  };
}

/** @param {RestIssue} i */
export const issueFromRest = (i) => ({
  number: i.number,
  title: i.title,
  body: i.body ?? '',
  state: i.state === 'closed' ? 'CLOSED' : 'OPEN',
  labels: (i.labels ?? []).map((l) => ({ name: l.name })),
  createdAt: i.created_at,
  updatedAt: i.updated_at,
  url: i.html_url,
  milestone: i.milestone ? { title: i.milestone.title, number: i.milestone.number } : null
});

/** @param {RestComment} c */
export const commentFromRest = (c) => ({
  body: c.body ?? '',
  author: { login: c.user?.login ?? '' },
  createdAt: c.created_at,
  url: c.html_url
});

/** @param {RestReview} r */
export const reviewFromRest = (r) => ({
  body: r.body ?? '',
  author: { login: r.user?.login ?? '' },
  state: r.state,
  submittedAt: r.submitted_at
});

/** @param {RestPull} p */
export const pullFromRest = (p) => ({
  number: p.number,
  title: p.title,
  body: p.body ?? '',
  url: p.html_url,
  state: p.merged_at ? 'MERGED' : p.state === 'closed' ? 'CLOSED' : 'OPEN',
  headRefName: p.head?.ref,
  headRefOid: p.head?.sha,
  baseRefName: p.base?.ref,
  isDraft: Boolean(p.draft),
  labels: (p.labels ?? []).map((l) => ({ name: l.name })),
  mergedAt: p.merged_at ?? null,
  mergeCommit: p.merged_at && p.merge_commit_sha ? { oid: p.merge_commit_sha } : null,
  milestone: p.milestone ? { title: p.milestone.title, number: p.milestone.number } : null
});

const VALUE_FLAGS = new Set([
  'state', 'limit', 'json', 'label', 'base', 'head', 'title', 'body-file', 'add-label',
  'remove-label', 'milestone', 'reason', 'comment', 'owner', 'url', 'format'
]);

/** @param {string[]} args @param {number} from @returns {Flags | null} */
function parse(args, from) {
  /** @type {Flags} */
  const values = {};
  for (let i = from; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) return null;
    const name = a.slice(2);
    if (!VALUE_FLAGS.has(name)) return null;
    (values[name] ??= []).push(args[++i]);
  }
  return values;
}

/**
 * @template {string | undefined} [F=undefined]
 * @param {Flags} values @param {string} name @param {F} [fallback]
 * @returns {string | F}
 */
const one = (values, name, fallback) => values[name]?.at(-1) ?? /** @type {F} */ (fallback);

/** @param {string[]} args @param {string | undefined} input @param {Io} io @returns {(() => string) | null} */
export function restPlan(args, input, io) {
  const [group, verb, target] = args;
  const key = `${group} ${verb}`;
  const positional = ['issue view', 'issue edit', 'issue comment', 'issue close', 'issue reopen', 'pr view', 'pr comment'];
  const flags = parse(args, positional.includes(key) ? 3 : 2);
  if (!flags) return null;
  const body = () => {
    const file = one(flags, 'body-file');
    if (file === undefined) throw new Error('--body-file is required');
    return file === '-' ? (input ?? '') : io.readFile(file);
  };
  const issuePath = () => `repos/${io.repo()}/issues/${target}`;
  /** @param {string | undefined} title */
  const milestoneNumber = (title) => {
    const hit = /** @type {RestMilestone[]} */ (io.pages(`repos/${io.repo()}/milestones?state=all&per_page=100`))
      .find((m) => m.title === title);
    if (!hit) throw new Error(`no milestone "${title}"`);
    return hit.number;
  };

  if (key === 'repo view')
    return flags.json ? () => JSON.stringify({ nameWithOwner: io.repo() }) : null;

  if (key === 'issue list')
    return () => {
      const q = new URLSearchParams({ state: one(flags, 'state', 'open'), per_page: '100' });
      if (flags.label) q.set('labels', flags.label.join(','));
      const list = /** @type {RestIssue[]} */ (io.pages(`repos/${io.repo()}/issues?${q}`))
        .filter((i) => !i.pull_request)
        .slice(0, Number(one(flags, 'limit', '30')))
        .map(issueFromRest);
      return JSON.stringify(list);
    };

  if (key === 'issue view')
    return () => {
      const issue = issueFromRest(/** @type {RestIssue} */ (io.api('GET', issuePath())));
      if (!one(flags, 'json', '').split(',').includes('comments')) return JSON.stringify(issue);
      const comments = /** @type {RestComment[]} */ (io.pages(`${issuePath()}/comments?per_page=100`));
      return JSON.stringify({ ...issue, comments: comments.map(commentFromRest) });
    };

  if (key === 'issue edit')
    return () => {
      /** @type {Record<string, unknown>} */
      const patch = {};
      if (flags.title) patch.title = one(flags, 'title');
      if (flags['body-file']) patch.body = body();
      if (flags.milestone) patch.milestone = milestoneNumber(one(flags, 'milestone'));
      if (Object.keys(patch).length) io.api('PATCH', issuePath(), patch);
      if (flags['add-label']) io.api('POST', `${issuePath()}/labels`, { labels: flags['add-label'] });
      for (const label of flags['remove-label'] ?? []) {
        try {
          io.api('DELETE', `${issuePath()}/labels/${encodeURIComponent(label)}`);
        } catch (e) {
          const err = /** @type {GhError} */ (e);
          if (!/404/.test(String(err.stderr ?? err.message))) throw e;
        }
      }
      return `https://github.com/${io.repo()}/issues/${target}\n`;
    };

  if (key === 'issue comment')
    return () => `${/** @type {RestComment} */ (io.api('POST', `${issuePath()}/comments`, { body: body() })).html_url}\n`;

  if (key === 'issue close')
    return () => {
      if (flags.comment) io.api('POST', `${issuePath()}/comments`, { body: one(flags, 'comment') });
      const reason = one(flags, 'reason', 'completed') === 'not planned' ? 'not_planned' : 'completed';
      io.api('PATCH', issuePath(), { state: 'closed', state_reason: reason });
      return `Closed issue ${io.repo()}#${target}\n`;
    };

  if (key === 'issue reopen')
    return () => {
      io.api('PATCH', issuePath(), { state: 'open' });
      return `Reopened issue ${io.repo()}#${target}\n`;
    };

  if (key === 'pr list')
    return () => {
      const state = one(flags, 'state', 'open');
      const q = new URLSearchParams({ state: state === 'merged' ? 'closed' : state, per_page: '100' });
      if (flags.base) q.set('base', one(flags, 'base'));
      if (flags.head) q.set('head', `${io.repo().split('/')[0]}:${one(flags, 'head')}`);
      const list = /** @type {RestPull[]} */ (io.pages(`repos/${io.repo()}/pulls?${q}`))
        .map(pullFromRest)
        .filter((p) => state !== 'merged' || p.mergedAt)
        .slice(0, Number(one(flags, 'limit', '30')));
      if (!one(flags, 'json', '').split(',').includes('files')) return JSON.stringify(list);
      /** @param {number} n */
      const filesOf = (n) => /** @type {RestFile[]} */ (io.pages(`repos/${io.repo()}/pulls/${n}/files?per_page=100`))
        .map((f) => ({ path: f.filename, additions: f.additions, deletions: f.deletions }));
      return JSON.stringify(list.map((pull) => ({ ...pull, files: filesOf(pull.number) })));
    };

  if (key === 'pr view')
    return () => {
      const base = `repos/${io.repo()}`;
      const pull = pullFromRest(/** @type {RestPull} */ (io.api('GET', `${base}/pulls/${target}`)));
      const wanted = one(flags, 'json', '').split(',');
      const comments = wanted.includes('comments')
        ? { comments: /** @type {RestComment[]} */ (io.pages(`${base}/issues/${target}/comments?per_page=100`)).map(commentFromRest) }
        : {};
      const reviews = wanted.includes('reviews')
        ? { reviews: /** @type {RestReview[]} */ (io.pages(`${base}/pulls/${target}/reviews?per_page=100`)).map(reviewFromRest) }
        : {};
      return JSON.stringify({ ...pull, ...comments, ...reviews });
    };

  if (key === 'pr comment')
    return () => `${/** @type {RestComment} */ (io.api('POST', `${issuePath()}/comments`, { body: body() })).html_url}\n`;

  if (key === 'pr create')
    return () => {
      const pull = /** @type {RestPull} */ (io.api('POST', `repos/${io.repo()}/pulls`, {
        base: one(flags, 'base'),
        head: one(flags, 'head'),
        title: one(flags, 'title'),
        body: body()
      }));
      /** @type {Record<string, unknown>} */
      const patch = {};
      if (flags.milestone) patch.milestone = milestoneNumber(one(flags, 'milestone'));
      if (flags.label) patch.labels = flags.label;
      if (Object.keys(patch).length)
        io.api('PATCH', `repos/${io.repo()}/issues/${pull.number}`, patch);
      return `${pull.html_url}\n`;
    };

  return null;
}

/** @param {string[]} args @param {string} [stdin] @param {string} [dir] @param {boolean} [echo] @returns {string} */
export function runGh(args, stdin = '', dir = '', echo = false) {
  const input = stdin === '' ? undefined : stdin;
  const cwd = dir || undefined;
  const plan = () => restPlan(args, input, restIo(cwd));
  if (graphqlDown) {
    const fallback = plan();
    if (fallback) return fallback();
  }
  try {
    const r = run(args, { input, cwd });
    if (echo && r.stderr) process.stderr.write(r.stderr);
    return r.stdout;
  } catch (e) {
    const err = /** @type {GhError} */ (e);
    const fallback = GRAPHQL_FAILURE.test(String(err.stderr ?? '')) ? plan() : null;
    if (!fallback) {
      if (echo && err.stderr) process.stderr.write(err.stderr);
      throw e;
    }
    if (!graphqlDown)
      process.stderr.write(
        `gh: GraphQL failed, using REST for the rest of this run: ${String(err.stderr).trim().split('\n')[0]}\n`
      );
    graphqlDown = true;
    return fallback();
  }
}
