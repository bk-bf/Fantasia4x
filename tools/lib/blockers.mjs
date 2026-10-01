// @ts-nocheck
import { execFileSync } from 'node:child_process';

const BRANCH_ISSUE = /-(\d+)$/;

const gh = (args) =>
  execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

export function issueOfBranch(name) {
  const match = BRANCH_ISSUE.exec(String(name));
  return match ? Number(match[1]) : null;
}

export function openBlockers(n) {
  return JSON.parse(gh(['api', `repos/{owner}/{repo}/issues/${n}/dependencies/blocked_by?per_page=100`]))
    .filter((b) => b.state === 'open')
    .map((b) => ({ number: b.number, title: b.title, state: 'OPEN' }));
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
