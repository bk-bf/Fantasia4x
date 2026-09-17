// @ts-nocheck
import { execFileSync } from 'node:child_process';

const BRANCH_ISSUE = /-(\d+)$/;

const BLOCKERS_QUERY =
  'query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){issue(number:$n){' +
  'blockedBy(first:20){nodes{number title state}}}}}';

const gh = (args) =>
  execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

let repoParts = null;
const ownerAndRepo = () =>
  (repoParts ??= gh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'])
    .trim()
    .split('/'));

export function issueOfBranch(name) {
  const match = BRANCH_ISSUE.exec(String(name));
  return match ? Number(match[1]) : null;
}

export function openBlockers(n) {
  const [owner, repo] = ownerAndRepo();
  const out = JSON.parse(
    gh(['api', 'graphql', '-f', `query=${BLOCKERS_QUERY}`, '-f', `o=${owner}`, '-f', `r=${repo}`, '-F', `n=${n}`])
  );
  return (out.data.repository.issue?.blockedBy.nodes ?? []).filter((b) => b.state === 'OPEN');
}

export function blockedMessage(n, blockers) {
  if (!blockers.length) return null;
  const names = blockers.map((b) => `#${b.number} (${b.title})`).join(', ');
  const until = blockers.length > 1 ? 'those close' : 'it closes';
  return (
    `#${n} is blocked by ${names}. Work on it locally; pushing its branch and ` +
    `opening its pull request wait until ${until}.`
  );
}

export function blockProblem(branch, lookup = openBlockers) {
  const n = issueOfBranch(branch);
  return n === null ? null : blockedMessage(n, lookup(n));
}
