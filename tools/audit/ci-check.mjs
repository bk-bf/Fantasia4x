#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

import { verifyTests } from './lib/harness.mjs';
import { annotation } from './warnings.mjs';

const base = process.env.CHECK_BASE;
const from = base && !/^0+$/.test(base) ? base : 'HEAD^1';
const files = execFileSync('git', ['diff', '--name-only', from, 'HEAD'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);
process.stdout.write(`${files.length} file(s) changed against ${from}\n`);

const { results } = await verifyTests(process.cwd(), files);
const notes = process.env.WARNINGS_NOTES;
if (notes && existsSync(notes))
  for (const line of readFileSync(notes, 'utf8').split('\n').filter(Boolean))
    for (const finding of JSON.parse(line).annotate) process.stdout.write(`${annotation(finding)}\n`);
const ran = results.filter((r) => !(r.name === 'tests' && r.code === 2));
for (const r of ran) {
  process.stdout.write(`${r.code === 0 ? 'pass' : 'FAIL'}  ${r.name}\n`);
  if (r.code !== 0) process.stdout.write(`${r.tail}\n`);
}
process.exit(ran.every((r) => r.code === 0) ? 0 : 1);
