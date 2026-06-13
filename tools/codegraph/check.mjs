// @ts-check
/**
 * Architecture rule checks over the codebase graph (`pnpm graph:check`).
 *
 * Rules live in analysis.mjs (shared with the API + browser). This file just
 * loads graph.json, runs them, prints a report, and sets the exit code:
 * non-zero on ERROR findings (--strict also fails on warnings).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChecks } from './analysis.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const STRICT = process.argv.includes('--strict');

const graphPath = path.join(DIR, 'graph.json');
if (!fs.existsSync(graphPath)) {
  console.error('graph.json missing — run `node tools/codegraph/extract.mjs` first.');
  process.exit(2);
}
const G = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
const { findings, errors, warnings } = runChecks(G);

const RULES = ['ADR-008', 'cycle', 'layers', 'god-module', 'orphan'];
const C = { red: '\x1b[31m', yel: '\x1b[33m', dim: '\x1b[2m', grn: '\x1b[32m', bold: '\x1b[1m', off: '\x1b[0m' };

console.log(`\n${C.bold}Codebase graph — architecture check${C.off}  (${G.stats.functions} fns, ${G.stats.modules} modules)\n`);
for (const rule of RULES) {
  const fs_ = findings.filter((f) => f.rule === rule);
  if (!fs_.length) { console.log(`  ${C.grn}✓${C.off} ${rule}`); continue; }
  const err = fs_.some((f) => f.level === 'error');
  console.log(`  ${err ? C.red + '✗' : C.yel + '!'}${C.off} ${rule} ${C.dim}(${fs_.length})${C.off}`);
  for (const f of fs_.slice(0, 25)) {
    const loc = f.file ? ` ${C.dim}— ${f.file}:${f.line}${C.off}` : '';
    console.log(`      ${f.level === 'error' ? C.red : C.yel}•${C.off} ${f.msg}${loc}`);
  }
  if (fs_.length > 25) console.log(`      ${C.dim}… +${fs_.length - 25} more${C.off}`);
}
console.log(`\n  ${errors ? C.red : C.grn}${errors} error(s)${C.off}, ${warnings ? C.yel : C.dim}${warnings} warning(s)${C.off}${STRICT ? ' (strict)' : ''}\n`);

process.exit(errors > 0 || (STRICT && warnings > 0) ? 1 : 0);
