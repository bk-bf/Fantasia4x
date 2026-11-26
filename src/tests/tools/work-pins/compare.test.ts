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
  const { report } = await import(
    new URL('../../../../tools/work-pins/compare.mjs', import.meta.url).href
  );
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

function creatureRun(scenario: string, placed: number, upserts: number) {
  return {
    scenario,
    turn: 10,
    functions: {
      step: {
        name: 'stepHunger',
        file: 'src/lib/game/services/entity/a.ts',
        line: 1,
        count: upserts * 10
      }
    },
    messages: {},
    counters: { 'mob upserts': upserts },
    creatures: { family: 'mobs', placed, added: 0, alive: placed }
  };
}

function creatureDir(
  upsertsAt200: number,
  upsertsAt50 = 5000
): Map<string, ReturnType<typeof creatureRun>> {
  return new Map([
    ['mobs-50', creatureRun('mobs-50', 50, upsertsAt50)],
    ['mobs-200', creatureRun('mobs-200', 200, upsertsAt200)]
  ]);
}

describe('the creature pins', () => {
  it('divides each creature measure by the creatures placed and compares 200 with 50', async () => {
    const { compareRuns } = await import(
      new URL('../../../../tools/work-pins/compare.mjs', import.meta.url).href
    );
    const { creatures } = compareRuns(creatureDir(20000), creatureDir(20000));
    const row = (scenario: string, fn: string) =>
      creatures.rows.find(
        (r: { scenario: string; fn: string }) => r.scenario === scenario && r.fn === fn
      );
    expect(row('mobs-200', 'counter mob upserts per creature').head).toBe(100);
    expect(row('mobs-200', 'creature calls per creature').head).toBe(1000);
    expect(row('mobs-200 / mobs-50', 'counter mob upserts per creature').head).toBe(1);
  });

  it('fails when the cost per creature grows faster than the count', async () => {
    const { compareRuns } = await import(
      new URL('../../../../tools/work-pins/compare.mjs', import.meta.url).href
    );
    const { over } = compareRuns(creatureDir(20000), creatureDir(24000));
    expect(over.map((r: { scenario: string; fn: string }) => `${r.scenario} ${r.fn}`)).toContain(
      'mobs-200 / mobs-50 counter mob upserts per creature'
    );
  });

  it('passes when both sizes get cheaper and the smaller one more so', async () => {
    const { compareRuns } = await import(
      new URL('../../../../tools/work-pins/compare.mjs', import.meta.url).href
    );
    const { over } = compareRuns(creatureDir(20000), creatureDir(19200, 4500));
    expect(over).toEqual([]);
  });
});
