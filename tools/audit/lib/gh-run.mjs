// @ts-nocheck
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const MAX_BUFFER = 64 * 1024 * 1024;
const GRAPHQL_FAILURE = /graphql|rate limit/i;

let graphqlDown = false;

function run(args, { input, cwd } = {}) {
  const r = spawnSync('gh', args, { encoding: 'utf8', input, cwd, maxBuffer: MAX_BUFFER });
  if (r.error) throw r.error;
  if (r.status === 0) return r;
  const err = new Error(`Command failed: gh ${args.join(' ')}\n${r.stderr ?? ''}`);
  Object.assign(err, { status: r.status, stdout: r.stdout, stderr: r.stderr });
  throw err;
}

export function restIo(cwd) {
  let repoName = null;
  const call = (args, input) => run(args, { input, cwd }).stdout;
  return {
    repo: () => (repoName ??= JSON.parse(call(['api', 'repos/{owner}/{repo}'])).full_name),
    api: (method, path, body) =>
      JSON.parse(
        call(['api', '-X', method, path, ...(body === undefined ? [] : ['--input', '-'])],
          body === undefined ? undefined : JSON.stringify(body)) || 'null'
      ),
    pages: (path) => JSON.parse(call(['api', '--paginate', '--slurp', path])).flat(),
    readFile: (path) => readFileSync(path, 'utf8')
  };
}

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

export const commentFromRest = (c) => ({
  body: c.body ?? '',
  author: { login: c.user?.login ?? '' },
  createdAt: c.created_at,
  url: c.html_url
});

export const reviewFromRest = (r) => ({
  body: r.body ?? '',
  author: { login: r.user?.login ?? '' },
  state: r.state,
  submittedAt: r.submitted_at
});

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

function parse(args, from) {
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

const one = (values, name, fallback) => values[name]?.at(-1) ?? fallback;

export function restPlan(args, input, io) {
  const [group, verb, target] = args;
  const key = `${group} ${verb}`;
  const positional = ['issue view', 'issue edit', 'issue comment', 'issue close', 'issue reopen', 'pr view', 'project item-add'];
  const flags = parse(args, positional.includes(key) ? 3 : 2);
  if (!flags) return null;
  const body = () => {
    const file = one(flags, 'body-file');
    return file === '-' ? input : io.readFile(file);
  };
  const issuePath = () => `repos/${io.repo()}/issues/${target}`;

  if (key === 'repo view')
    return flags.json ? () => JSON.stringify({ nameWithOwner: io.repo() }) : null;

  if (key === 'issue list')
    return () => {
      const q = new URLSearchParams({ state: one(flags, 'state', 'open'), per_page: '100' });
      if (flags.label) q.set('labels', flags.label.join(','));
      const list = io
        .pages(`repos/${io.repo()}/issues?${q}`)
        .filter((i) => !i.pull_request)
        .slice(0, Number(one(flags, 'limit', 30)))
        .map(issueFromRest);
      return JSON.stringify(list);
    };

  if (key === 'issue view')
    return () => {
      const issue = issueFromRest(io.api('GET', issuePath()));
      if (one(flags, 'json', '').split(',').includes('comments'))
        issue.comments = io.pages(`${issuePath()}/comments?per_page=100`).map(commentFromRest);
      return JSON.stringify(issue);
    };

  if (key === 'issue edit')
    return () => {
      const patch = {};
      if (flags.title) patch.title = one(flags, 'title');
      if (flags['body-file']) patch.body = body();
      if (flags.milestone) {
        const title = one(flags, 'milestone');
        const hit = io
          .pages(`repos/${io.repo()}/milestones?state=all&per_page=100`)
          .find((m) => m.title === title);
        if (!hit) throw new Error(`no milestone "${title}"`);
        patch.milestone = hit.number;
      }
      if (Object.keys(patch).length) io.api('PATCH', issuePath(), patch);
      if (flags['add-label']) io.api('POST', `${issuePath()}/labels`, { labels: flags['add-label'] });
      for (const label of flags['remove-label'] ?? []) {
        try {
          io.api('DELETE', `${issuePath()}/labels/${encodeURIComponent(label)}`);
        } catch (e) {
          if (!/404/.test(String(e.stderr ?? e.message))) throw e;
        }
      }
      return `https://github.com/${io.repo()}/issues/${target}\n`;
    };

  if (key === 'issue comment')
    return () => `${io.api('POST', `${issuePath()}/comments`, { body: body() }).html_url}\n`;

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
      const list = io
        .pages(`repos/${io.repo()}/pulls?${q}`)
        .map(pullFromRest)
        .filter((p) => state !== 'merged' || p.mergedAt);
      return JSON.stringify(list.slice(0, Number(one(flags, 'limit', 30))));
    };

  if (key === 'pr view')
    return () => {
      const base = `repos/${io.repo()}`;
      const pull = pullFromRest(io.api('GET', `${base}/pulls/${target}`));
      const wanted = one(flags, 'json', '').split(',');
      if (wanted.includes('comments'))
        pull.comments = io.pages(`${base}/issues/${target}/comments?per_page=100`).map(commentFromRest);
      if (wanted.includes('reviews'))
        pull.reviews = io.pages(`${base}/pulls/${target}/reviews?per_page=100`).map(reviewFromRest);
      return JSON.stringify(pull);
    };

  if (key === 'project item-add')
    return () => {
      const number = one(flags, 'url', '').split('/').pop();
      const issue = io.api('GET', `repos/${io.repo()}/issues/${number}`);
      const item = io.api('POST', `/users/${one(flags, 'owner')}/projectsV2/${target}/items`, {
        type: 'Issue',
        id: issue.id
      });
      return JSON.stringify({ id: item.node_id });
    };

  return null;
}

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
    const fallback = GRAPHQL_FAILURE.test(String(e.stderr ?? '')) ? plan() : null;
    if (!fallback) {
      if (echo && e.stderr) process.stderr.write(e.stderr);
      throw e;
    }
    if (!graphqlDown)
      process.stderr.write(
        `gh: GraphQL failed, using REST for the rest of this run: ${String(e.stderr).trim().split('\n')[0]}\n`
      );
    graphqlDown = true;
    return fallback();
  }
}
