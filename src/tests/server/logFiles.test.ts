import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendToLog, rotatedName } from '$lib/server/logFiles';

const dirs: string[] = [];
const scratch = () => {
  const dir = mkdtempSync(join(tmpdir(), 'f4x-logfiles-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('a category log past its size limit', () => {
  it('is kept under a timestamped name and a new log starts with the next lines', () => {
    const dir = scratch();
    const log = join(dir, 'perf.log');
    appendToLog(log, ['first session'], 20);
    appendToLog(log, ['still the first'], 20);
    appendToLog(log, ['second session'], 20);
    const rotated = readdirSync(dir).filter((f) => f !== 'perf.log');
    expect(rotated).toHaveLength(1);
    expect(rotated[0]).toMatch(/^perf\.log\.\d{8}T\d{6}Z$/);
    expect(readFileSync(join(dir, rotated[0]), 'utf8')).toBe('first session\nstill the first\n');
    expect(readFileSync(log, 'utf8')).toBe('second session\n');
  });

  it('keeps every rotated log, for every category', () => {
    const dir = scratch();
    for (const cat of ['perf', 'crash']) {
      const log = join(dir, `${cat}.log`);
      for (let i = 0; i < 4; i++) appendToLog(log, [`${cat} line ${i} padded past the limit`], 10);
    }
    const files = readdirSync(dir).sort();
    expect(files.filter((f) => f.startsWith('perf.log.'))).toHaveLength(3);
    expect(files.filter((f) => f.startsWith('crash.log.'))).toHaveLength(3);
    const kept = files.map((f) => readFileSync(join(dir, f), 'utf8')).join('');
    for (let i = 0; i < 4; i++) expect(kept).toContain(`perf line ${i}`);
  });

  it('never reuses the name of a log already rotated in the same second', () => {
    const dir = scratch();
    const log = join(dir, 'perf.log');
    const at = new Date('2026-11-27T16:52:00.123Z');
    writeFileSync(`${log}.20261127T165200Z`, '');
    writeFileSync(`${log}.20261127T165200Z-1`, '');
    const taken = (p: string) => readdirSync(dir).includes(p.slice(dir.length + 1));
    expect(rotatedName(log, at, taken)).toBe(`${log}.20261127T165200Z-2`);
  });
});
