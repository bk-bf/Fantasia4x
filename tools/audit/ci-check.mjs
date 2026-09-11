#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

import { verifyTests } from './lib/harness.mjs';

const base = process.env.CHECK_BASE;
const from = base && !/^0+$/.test(base) ? base : 'HEAD^1';
const files = execFileSync('git', ['diff', '--name-only', from, 'HEAD'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);
process.stdout.write(`${files.length} file(s) changed against ${from}\n`);

const { results } = await verifyTests(process.cwd(), files);
const ran = results.filter((r) => !(r.name === 'tests' && r.code === 2));
for (const r of ran) {
  process.stdout.write(`${r.code === 0 ? 'pass' : 'FAIL'}  ${r.name}\n`);
  if (r.code !== 0) process.stdout.write(`${r.tail}\n`);
}
process.exit(ran.every((r) => r.code === 0) ? 0 : 1);
