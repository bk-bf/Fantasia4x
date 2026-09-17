#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
import { gateVerdict, waitForCodspeed } from './codspeed-check.mjs';

const run = await waitForCodspeed({
  repo: process.env.GITHUB_REPOSITORY,
  sha: process.env.HEAD_SHA,
  since: process.env.CODSPEED_SINCE
});
const { ok, message } = gateVerdict(run, process.env.PERF_CHANGE_ACCEPTED === 'true');
process.stdout.write(`${message}\n`);
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## CodSpeed verdict\n\n${message}\n`);
process.exit(ok ? 0 : 1);
