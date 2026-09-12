import { execFileSync } from 'node:child_process';

import { ROOT, BASE } from './harness.mjs';
import { branchProblem } from './branch.mjs';
import { checkPrivate } from './private.mjs';

export const REVIEW_CONTEXT = 'audit/review';
export const PLAYTEST_LABEL = 'needs playtest';

const gh = (args, input) =>
  execFileSync('gh', args, {
    cwd: ROOT,
    encoding: 'utf8',
    input,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe']
  });

let repoName = null;
const repo = () =>
  (repoName ??= JSON.parse(gh(['repo', 'view', '--json', 'nameWithOwner'])).nameWithOwner);

const withLabelNames = (p) => ({ ...p, labels: (p.labels ?? []).map((l) => l.name) });

export function openPulls() {
  return JSON.parse(
    gh([
      'pr', 'list', '--base', BASE, '--state', 'open', '--limit', '100',
      '--json', 'number,url,headRefName,headRefOid,labels,body'
    ])
  )
    .filter((p) => p.headRefName.startsWith('fix/'))
    .map(withLabelNames);
}

export const openPullFor = (branch) =>
  openPulls().find((p) => p.headRefName === branch) ?? null;

export function mergedPulls() {
  return JSON.parse(
    gh([
      'pr', 'list', '--base', BASE, '--state', 'merged', '--limit', '30',
      '--json', 'number,headRefName,body,mergeCommit,mergedAt'
    ])
  ).filter(
    (p) =>
      p.headRefName.startsWith('fix/') ||
      (p.headRefName.includes('/') && !branchProblem(p.headRefName))
  );
}

export function openSubIssues(n) {
  return JSON.parse(gh(['api', `repos/${repo()}/issues/${n}/sub_issues?per_page=100`]))
    .filter((s) => s.state === 'open')
    .map((s) => s.number);
}

const PARENT_QUERY =
  'query($owner:String!,$name:String!,$n:Int!)' +
  '{repository(owner:$owner,name:$name){issue(number:$n){parent{number}}}}';

export function parentOf(n) {
  const [owner, name] = repo().split('/');
  const res = JSON.parse(
    gh([
      'api', 'graphql',
      '-f', `query=${PARENT_QUERY}`,
      '-f', `owner=${owner}`,
      '-f', `name=${name}`,
      '-F', `n=${n}`
    ])
  );
  return res.data.repository.issue?.parent?.number ?? null;
}

export function linkOf(pull) {
  const body = pull.body ?? '';
  const issue = /^(?:Fixes|Part of) #(\d+)\b/m.exec(body)?.[1];
  if (!issue) return null;
  return { issue: Number(issue), step: /^Step: (.+)$/m.exec(body)?.[1]?.trim() ?? null };
}

export function linkProblem(body) {
  const link = linkOf({ body });
  if (!link) return null;
  const open = openSubIssues(link.issue);
  if (!open.length) return null;
  const list = open.map((s) => `#${s}`).join(', ');
  return `#${link.issue} has open sub-issues (${list}): link the pull request to the one it works`;
}

export function editPull(n, body) {
  const problem = checkPrivate(body)[0] || linkProblem(body);
  if (problem) throw new Error(problem);
  return gh(
    ['api', '-X', 'PATCH', `repos/${repo()}/pulls/${n}`, '--input', '-'],
    JSON.stringify({ body })
  );
}

export function createPull({ branch, title, body, labels = [] }) {
  const problem =
    branchProblem(branch) || checkPrivate(`${title}\n${body}`)[0] || linkProblem(body);
  if (problem) throw new Error(problem);
  const args = ['pr', 'create', '--base', BASE, '--head', branch, '--title', title, '--body-file', '-'];
  for (const l of labels) args.push('--label', l);
  const url = gh(args, body).trim();
  return openPullFor(branch) ?? { url };
}

export const commentOnPull = (n, body) =>
  gh(['pr', 'comment', String(n), '--body-file', '-'], body);

export function feedback(n) {
  const view = JSON.parse(gh(['pr', 'view', String(n), '--json', 'comments,reviews']));
  const onLines = JSON.parse(gh(['api', `repos/${repo()}/pulls/${n}/comments?per_page=100`]));
  return [
    ...view.comments.map((c) => c.body),
    ...view.reviews.map((r) => r.body),
    ...onLines.map((c) => `On \`${c.path}\`${c.line ? ` line ${c.line}` : ''}: ${c.body}`)
  ]
    .map((s) => (s ?? '').trim())
    .filter(Boolean);
}

export function reviewState(sha) {
  const statuses = JSON.parse(gh(['api', `repos/${repo()}/commits/${sha}/statuses?per_page=100`]));
  return statuses.find((s) => s.context === REVIEW_CONTEXT)?.state ?? null;
}

export function setReviewState(sha, state, description) {
  gh([
    'api', '-X', 'POST', `repos/${repo()}/statuses/${sha}`,
    '-f', `state=${state}`,
    '-f', `context=${REVIEW_CONTEXT}`,
    '-f', `description=${String(description).slice(0, 140)}`
  ]);
}
