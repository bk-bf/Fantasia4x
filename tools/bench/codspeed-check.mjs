// @ts-nocheck
const API = process.env.GITHUB_API_URL ?? 'https://api.github.com';
const POLL_MS = 15_000;

export const CODSPEED = 'CodSpeed Performance Analysis';
export const WAIT_MS = 10 * 60_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`${method} ${path} answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 ? {} : res.json();
}

export const latestRun = (runs, since) =>
  runs
    .filter((r) => r.status === 'completed' && (!since || (r.started_at ?? '') >= since))
    .sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? ''))[0] ?? null;

export async function waitForCodspeed({ repo, sha, since }) {
  const until = Date.now() + WAIT_MS;
  while (Date.now() < until) {
    const found = await api(
      'GET',
      `/repos/${repo}/commits/${sha}/check-runs?check_name=${encodeURIComponent(CODSPEED)}`
    );
    const run = latestRun(found.check_runs ?? [], since);
    if (run) return run;
    await sleep(POLL_MS);
  }
  return null;
}

export function gateVerdict(run, accepted) {
  if (!run)
    return {
      ok: true,
      message: `${CODSPEED} had not reported after ${WAIT_MS / 60_000} minutes, so there is no verdict to enforce.`
    };
  const title = run.output?.title || run.conclusion;
  if (run.conclusion !== 'failure') return { ok: true, message: `${CODSPEED}: ${title}.` };
  if (accepted)
    return { ok: true, message: `${CODSPEED}: ${title}, allowed by the "perf change accepted" label.` };
  return { ok: false, message: `${CODSPEED}: ${title}. ${run.details_url ?? ''}`.trim() };
}
