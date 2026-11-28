// @ts-nocheck
const PRECHECK_JOB = 'Pre-check';

export function chainRefOf(branch) {
  return `chain/${branch.replaceAll('/', '-')}`;
}

export function runBranch(event, branch) {
  return event === 'push' ? chainRefOf(branch) : branch;
}

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

export function precheckSkipped(jobs) {
  const precheck = jobs.find((j) => j.name.startsWith(PRECHECK_JOB));
  return !precheck || precheck.conclusion === 'skipped';
}

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
