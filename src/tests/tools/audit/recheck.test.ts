import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const AUDIT = join(process.cwd(), 'tools/audit/audit.mjs');
const SYMBOL = 'src/a.ts::isTended#0';

const root = mkdtempSync(join(tmpdir(), 'audit-recheck-'));
mkdirSync(join(root, 'src/tests'), { recursive: true });
writeFileSync(join(root, 'src/a.ts'), 'export function isTended(w: number) { return w > 0; }\n');
writeFileSync(join(root, 'src/tests/other.test.ts'), 'healLimbs(1);\n');
const env = {
  ...process.env,
  AUDIT_ROOT: root,
  AUDIT_DB: join(root, 'ledger.db'),
  AUDIT_WORKER: 't'
};

const audit = (...args: string[]) =>
  execFileSync(process.execPath, [AUDIT, ...args], { env, encoding: 'utf8', stdio: 'pipe' });
const writeTest = (name: string, text: string) =>
  writeFileSync(join(root, 'src/tests', name), text);

function replan() {
  audit('index');
  audit('plan');
}

function workState() {
  const db = new DatabaseSync(env.AUDIT_DB, { readOnly: true });
  const row = db.prepare(`SELECT state FROM work WHERE symbol_key=? AND rule_id='F01'`).get(SYMBOL);
  db.close();
  return (row as { state: string }).state;
}

function finding() {
  const db = new DatabaseSync(env.AUDIT_DB, { readOnly: true });
  const row = db.prepare(`SELECT state, summary FROM finding WHERE symbol_key=?`).get(SYMBOL);
  db.close();
  return row as { state: string; summary: string } | undefined;
}

function judge(verdict: object) {
  const task = audit('next', '--symbol', SYMBOL).trim().split('\n').pop() as string;
  const taskFile = join(root, 'task.json');
  const respFile = join(root, 'resp.json');
  writeFileSync(taskFile, task);
  writeFileSync(respFile, JSON.stringify({ verdicts: [{ rule_id: 'F01', ...verdict }] }));
  audit('submit', respFile, '--task', taskFile);
}

const fail = (summary: string) => ({
  status: 'fail',
  summary,
  evidence: ['src/tests/a.test.ts:1', 'the bound at zero', 'isTended(0) returning true']
});

describe('a tests-family rule after its tests change', () => {
  it('stays done while only a test file that does not name the symbol changes', () => {
    writeTest('a.test.ts', 'expect(isTended(1)).toBe(true);\n');
    replan();
    judge(fail('asserts only one positive input'));
    expect(finding()).toEqual({ state: 'open', summary: 'asserts only one positive input' });

    writeTest('other.test.ts', 'healLimbs(2);\n');
    replan();
    expect(workState()).toBe('done');
  });

  it('re-opens when a test file naming the symbol changes, and a pass marks the finding fixed', () => {
    writeTest('a.test.ts', 'expect(isTended(1)).toBe(true);\nexpect(isTended(0)).toBe(false);\n');
    replan();
    expect(workState()).toBe('pending');

    judge({ status: 'pass', summary: 'both sides of the bound are asserted' });
    expect(finding()?.state).toBe('fixed');
  });

  it('reopens the finding with the new text when a later recheck fails', () => {
    writeTest('a.test.ts', 'expect(isTended(2)).toBe(true);\n');
    replan();
    judge(fail('the zero case was dropped'));
    expect(finding()).toEqual({ state: 'open', summary: 'the zero case was dropped' });
  });
});
