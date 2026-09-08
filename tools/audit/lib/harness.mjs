import { spawn, execFileSync } from 'node:child_process';
import { cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = process.env.AUDIT_ROOT || join(HERE, '..', '..', '..');
export const PNPM = process.env.AUDIT_PNPM || 'pnpm';
export const CLAUDE = process.env.AUDIT_CLAUDE || 'claude';

export function run(cmd, args, { cwd = ROOT, input, timeoutMs = 1_800_000 } = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
    let o = '',
      e = '',
      settled = false;
    const t = setTimeout(() => {
      try {
        process.kill(-p.pid, 'SIGKILL');
      } catch {
        p.kill('SIGKILL');
      }
    }, timeoutMs);
    const done = (r) => {
      if (!settled) {
        settled = true;
        clearTimeout(t);
        resolve(r);
      }
    };
    p.stdout.on('data', (d) => (o += d));
    p.stderr.on('data', (d) => (e += d));
    p.on('error', (err) => done({ code: -1, out: o, err: `${e}spawn ${cmd}: ${err.message}` }));
    p.on('close', (code) => done({ code, out: o, err: e }));
    p.stdin.on('error', () => {});
    if (input !== undefined) {
      p.stdin.write(input);
      p.stdin.end();
    }
  });
}

export const git = (args, cwd = ROOT, quiet = false) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: quiet ? ['ignore', 'pipe', 'ignore'] : ['ignore', 'pipe', 'pipe']
  }).trim();

export const tail = (s, n = 40) => s.trim().split('\n').slice(-n).join('\n');

/** svelte-check and vitest both bury their errors in a wall of warnings; a reviewer needs
 *  the error lines, not the last forty lines of whatever scrolled past. */
export const errorLines = (s, n = 25) => {
  const hits = s.split('\n').filter((l) => /\bERROR\b|✕|FAIL|Error:|failed/i.test(l));
  return (hits.length ? hits : s.trim().split('\n')).slice(0, n).join('\n');
};

export function changedFiles(cwd) {
  const s = execFileSync('git', ['status', '--porcelain', '-uall', '--no-renames', '-z'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });
  return s
    .split('\0')
    .filter(Boolean)
    .map((l) => l.slice(3))
    .filter(Boolean);
}

export const committedFiles = (cwd, base = 'origin/main') =>
  git(['diff', '--name-only', `${base}...HEAD`], cwd).split('\n').filter(Boolean);

/** A fresh worktree has no node_modules, no .svelte-kit/tsconfig.json for tsconfig to extend,
 *  and no wasm packages -- they are gitignored build output of the Rust crates. Without all
 *  three, svelte-check dies before it reads a line of source. The wasm bytes are copied from
 *  the checkout the worktree was cut from: same committed Rust source, same output. */
export async function prepareWorktree(wt, log = () => {}) {
  log('--- pnpm install');
  const inst = await run(PNPM, ['install', '--prefer-offline'], { cwd: wt, timeoutMs: 900_000 });
  if (inst.code !== 0) throw new Error(`pnpm install failed:\n${tail(inst.out + inst.err)}`);

  log('--- svelte-kit sync');
  const sync = await run(join(wt, 'node_modules', '.bin', 'svelte-kit'), ['sync'], {
    cwd: wt,
    timeoutMs: 300_000
  });
  if (sync.code !== 0) log(`    [warn] sync exited ${sync.code}; verification may not run`);

  for (const pkg of ['sim-core-pkg', 'spatial-core-pkg']) {
    const from = join(ROOT, 'src', 'lib', pkg);
    const to = join(wt, 'src', 'lib', pkg);
    if (existsSync(from) && !existsSync(to)) cpSync(from, to, { recursive: true });
  }
  log('--- wasm packages staged');
}

export async function verifyTests(cwd, files) {
  const results = [];
  const check = await run(PNPM, ['check'], { cwd, timeoutMs: 900_000 });
  results.push({
    name: `${PNPM} check`,
    code: check.code,
    tail: errorLines(check.out + check.err)
  });

  const src = files.filter((f) => /^src\/.*\.(ts|svelte)$/.test(f) && !/\.test\.ts$/.test(f));
  const tests = files.filter((f) => /^src\/.*\.test\.ts$/.test(f));

  if (src.length) {
    const t = await run(PNPM, ['test:related', ...src], { cwd, timeoutMs: 1_800_000 });
    results.push({ name: `${PNPM} test:related`, code: t.code, tail: errorLines(t.out + t.err) });
  }
  if (tests.length) {
    const t = await run(PNPM, ['vitest', 'run', ...tests], { cwd, timeoutMs: 1_800_000 });
    results.push({
      name: `${PNPM} vitest run ${tests.join(' ')}`,
      code: t.code,
      tail: errorLines(t.out + t.err)
    });
  }
  if (!src.length && !tests.length) {
    results.push({
      name: 'tests',
      code: 2,
      tail:
        'no .ts, .svelte or .test.ts file changed, so nothing was executed. A data-only or ' +
        'doc-only change is not verified until a test names it.'
    });
  }
  return { ok: results.every((r) => r.code === 0), results };
}

export const failureDetail = (results) =>
  results
    .filter((r) => r.code !== 0)
    .map((r) => `**${r.name}** exited ${r.code}\n\n\`\`\`\n${r.tail}\n\`\`\``)
    .join('\n\n');
