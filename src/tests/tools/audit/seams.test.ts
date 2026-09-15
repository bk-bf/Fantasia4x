import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
const auditLib = (file: string) => new URL(`../../../../tools/audit/lib/${file}`, import.meta.url).href;
const { seamViolations } = await import(auditLib('t0.mjs'));
const { extractRepo } = await import(auditLib('extract.mjs'));

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function repoWith(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'seams-'));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const frameLoopCallers = (root: string): string[] =>
  seamViolations(root, extractRepo(root))
    .findings.filter((f: { adr: string }) => f.adr === '#77')
    .map((f: { where: string }) => f.where.split('  ')[0]);

describe('the requestAnimationFrame seam', () => {
  it('names a call inside an anonymous callback after its file', () => {
    const root = repoWith({
      'src/lib/Scroll.svelte':
        '<script lang="ts">\n  $effect(() => {\n    requestAnimationFrame(() => {});\n  });\n</script>\n\n<div></div>\n'
    });
    expect(frameLoopCallers(root)).toEqual(['src/lib/Scroll.svelte::<top level>']);
  });

  it('names a call inside a named function after that function only', () => {
    const root = repoWith({
      'src/lib/loop.ts': 'export function frame(): void {\n  requestAnimationFrame(frame);\n}\n'
    });
    expect(frameLoopCallers(root)).toEqual(['src/lib/loop.ts::frame']);
  });

  it('ignores a call named in a comment', () => {
    const root = repoWith({
      'src/lib/notes.ts': '// requestAnimationFrame(frame) is not called here\nexport const x = 1;\n'
    });
    expect(frameLoopCallers(root)).toEqual([]);
  });
});
