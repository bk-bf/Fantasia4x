const PRECHECK_JOB = 'Pre-check';

/** @typedef {{ event: string, headBranch: string, headSha: string, createdAt: string }} RunSummary */
/** @typedef {{ name: string, conclusion: string }} Job */
/** @typedef {{ status: string, conclusion: string, jobs?: Job[] }} Run */

/** @param {string} branch */
export function chainRefOf(branch) {
  return `chain/${branch.replaceAll('/', '-')}`;
}

/** @param {string} event @param {string} branch */
export function runBranch(event, branch) {
  return event === 'push' ? chainRefOf(branch) : branch;
}

/**
 * @template {RunSummary} R
 * @param {R[]} runs
 * @param {{ event: string, headBranch: string, sha: string, since: number }} want
 * @returns {R | null}
 */
export function pickRun(runs, { event, headBranch, sha, since }) {
  return (
    runs.find(
      (r) =>
        r.event === event &&
        r.headBranch === headBranch &&
        r.headSha === sha &&
        (event === 'pull_request' || Date.parse(r.createdAt) >= since)
    ) ?? null
  );
}

/** @param {Job[]} jobs */
export function precheckSkipped(jobs) {
  const precheck = jobs.find((j) => j.name.startsWith(PRECHECK_JOB));
  return !precheck || precheck.conclusion === 'skipped';
}

/** @param {Run} run @returns {{ green: boolean, reason: string }} */
export function verdict(run) {
  if (run.status !== 'completed')
    return { green: false, reason: `the run is still ${run.status || 'unknown'}` };
  if (run.conclusion !== 'success')
    return { green: false, reason: `the run concluded ${run.conclusion || 'nothing'}` };
  if (precheckSkipped(run.jobs ?? []))
    return {
      green: false,
      reason: 'the run passed without running its pre-check, so it checked nothing'
    };
  return { green: true, reason: '' };
}
