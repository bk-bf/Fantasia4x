import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const dirs: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function runDir(calls: number): string {
  const dir = mkdtempSync(join(tmpdir(), 'work-pins-'));
  dirs.push(dir);
  const run = {
    scenario: 'move',
    turn: 10,
    functions: { step: { name: 'stepBody', file: 'src/a.ts', line: 1, count: calls } },
    messages: {}
  };
  writeFileSync(join(dir, 'move.json'), JSON.stringify(run));
  return dir;
}

async function compare(headCalls: number, accepted: boolean) {
  vi.resetModules();
  vi.stubEnv('PERF_CHANGE_ACCEPTED', accepted ? 'true' : '');
  vi.stubEnv('GITHUB_STEP_SUMMARY', '');
  vi.stubEnv('WORK_PINS_NOTES', '');
  const printed: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    printed.push(String(chunk));
    return true;
  });
  const { report } = await import('../../../../tools/work-pins/compare.mjs');
  const passed = report(runDir(100), runDir(headCalls));
  vi.mocked(process.stdout.write).mockRestore();
  return { passed, text: printed.join('') };
}

describe('the work pins budget and the perf change accepted label', () => {
  it('fails a total that grew by 10% without the label', async () => {
    const r = await compare(110, false);
    expect(r.passed).toBe(false);
    expect(r.text).toContain('which fails the check');
  });

  it('passes the same growth with the label and still prints the table', async () => {
    const r = await compare(110, true);
    expect(r.passed).toBe(true);
    expect(r.text).toContain('allowed by the "perf change accepted" label');
    expect(r.text).toContain('| move | `all calls` |');
  });

  it('passes a 3% growth without the label', async () => {
    expect((await compare(103, false)).passed).toBe(true);
  });
});
