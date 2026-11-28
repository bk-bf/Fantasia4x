import { execFileSync } from 'node:child_process';

const BRANCH_ISSUE = /-(\d+)$/;

/** @typedef {{ number: number, title: string, state: string }} Blocker */

/** @param {string[]} args @returns {string} */
const gh = (args) =>
  execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** @param {string} name @returns {number | null} */
export function issueOfBranch(name) {
  const match = BRANCH_ISSUE.exec(String(name));
  return match ? Number(match[1]) : null;
}

/** @param {number} n @returns {Blocker[]} */
export function openBlockers(n) {
  /** @type {Blocker[]} */
  const blockers = JSON.parse(gh(['api', `repos/{owner}/{repo}/issues/${n}/dependencies/blocked_by?per_page=100`]));
  return blockers
    .filter((b) => b.state === 'open')
    .map((b) => ({ number: b.number, title: b.title, state: 'OPEN' }));
}

/** @param {number} n @param {Blocker[]} blockers @returns {string | null} */
export function blockedMessage(n, blockers) {
  if (!blockers.length) return null;
  const names = blockers.map((b) => `#${b.number} (${b.title})`).join(', ');
  const until = blockers.length > 1 ? 'those close' : 'it closes';
  return (
    `#${n} is blocked by ${names}. Work on it locally; pushing its branch and ` +
    `opening its pull request wait until ${until}.`
  );
}

/** @param {string} branch @param {(n: number) => Blocker[]} [lookup] @returns {string | null} */
export function blockProblem(branch, lookup = openBlockers) {
  const n = issueOfBranch(branch);
  return n === null ? null : blockedMessage(n, lookup(n));
}
