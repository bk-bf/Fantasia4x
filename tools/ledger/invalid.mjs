// @ts-nocheck
import { spawnSync } from 'node:child_process';

const REPO = new URL('../..', import.meta.url).pathname;
const SPEED_NOT_SET = 'tps: speed not set, fixed in 30487224/1c851dac';

export const FIXES = {
  'frame-cost': { commit: '30487224b8ede8a91872899b19fc841b290696c4', at: '2026-11-27T02:47:15Z', reason: SPEED_NOT_SET },
  steady: { commit: '1c851dacf7353ee56e4dcc60b25d4b9d96d01812', at: '2026-11-27T03:12:53Z', reason: SPEED_NOT_SET }
};

const known = new Map();

export function contains(commit, fix, repo = REPO) {
  const key = `${fix}..${commit}`;
  if (!known.has(key)) {
    const r = spawnSync('git', ['-C', repo, 'merge-base', '--is-ancestor', fix, commit], { stdio: 'ignore' });
    known.set(key, r.status === 0 ? true : r.status === 1 ? false : null);
  }
  return known.get(key);
}

export function invalidReasons(entry, has = contains) {
  const fix = FIXES[entry.tool];
  if (!fix) return [];
  const found = entry.commit ? has(entry.commit, fix.commit) : null;
  if (found === true) return [];
  if (found === false) return [fix.reason];
  return entry.at && Date.parse(entry.at) < Date.parse(fix.at) ? [fix.reason] : [];
}

export function withInvalid(entry, has = contains) {
  const reasons = [...new Set([...(entry.invalid ?? []), ...invalidReasons(entry, has)])];
  if (!reasons.length) {
    const { invalid, ...rest } = entry;
    return invalid === undefined ? entry : rest;
  }
  return { ...entry, invalid: reasons };
}

export function recheckInvalid(entry, has = contains) {
  const fixed = new Set(Object.values(FIXES).map((f) => f.reason));
  const { invalid, ...rest } = entry;
  const kept = (invalid ?? []).filter((r) => !fixed.has(r));
  return withInvalid(kept.length ? { ...rest, invalid: kept } : rest, has);
}
