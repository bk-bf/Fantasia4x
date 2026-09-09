import { spawn, execFileSync } from 'node:child_process';
import { cpSync, existsSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = process.env.AUDIT_ROOT || join(HERE, '..', '..', '..');
export const PNPM = process.env.AUDIT_PNPM || 'pnpm';
export const BASE = process.env.AUDIT_BASE || 'dev';
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

export const committedFiles = (cwd, base = `origin/${BASE}`) =>
  git(['diff', '--name-only', `${base}...HEAD`], cwd).split('\n').filter(Boolean);

const CRATES = [
  ['sim-core', 'sim-core-pkg'],
  ['spatial-core', 'spatial-core-pkg']
];

/** The wasm bytes are copied rather than rebuilt, which is only sound while both trees hold the
 *  same Rust. A crate that differs, or a dirty crate in the source tree, means the copy would be
 *  compiled from other source than the code under test -- and a headless number measured against
 *  it is wrong with nothing to show for it. */
function crateMatches(crate, from, to) {
  const treeOf = (dir) => {
    try {
      return git(['rev-parse', `HEAD:${crate}`], dir, true);
    } catch {
      return null;
    }
  };
  const dirty = (dir) => {
    try {
      return git(['status', '--porcelain', '--', crate], dir, true) !== '';
    } catch {
      return true;
    }
  };
  const a = treeOf(from);
  const b = treeOf(to);
  if (a === null || b === null) return { ok: false, why: `${crate} has no tree in one of them` };
  if (a !== b) return { ok: false, why: `${crate} is ${a.slice(0, 8)} here and ${b.slice(0, 8)} there` };
  if (dirty(from)) return { ok: false, why: `${crate} is uncommitted in ${from}` };
  return { ok: true };
}

async function buildWasm(wt, log) {
  for (const script of ['add:wasm', 'add:wasm:sim']) {
    const r = await run(PNPM, [script], { cwd: wt, timeoutMs: 1_800_000 });
    if (r.code !== 0) throw new Error(`${PNPM} ${script} failed:\n${tail(r.out + r.err)}`);
  }
  log('--- wasm packages built from this tree');
}

/** A fresh worktree has no node_modules, no .svelte-kit/tsconfig.json for tsconfig to extend,
 *  and no wasm packages -- they are gitignored build output of the Rust crates. Without all
 *  three, svelte-check dies before it reads a line of source. */
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

  const mismatched = [];
  for (const [crate, pkg] of CRATES) {
    const to = join(wt, 'src', 'lib', pkg);
    if (existsSync(to)) continue;
    const from = join(ROOT, 'src', 'lib', pkg);
    const same = crateMatches(crate, ROOT, wt);
    if (!same.ok) {
      mismatched.push(same.why);
      continue;
    }
    if (existsSync(from)) cpSync(from, to, { recursive: true });
  }

  if (mismatched.length) {
    log(`--- not copying wasm: ${mismatched.join('; ')}`);
    await buildWasm(wt, log);
  } else {
    log('--- wasm packages staged from the checkout, same crate revision');
  }
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

const canBind = (port) =>
  new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '0.0.0.0');
  });

/** dev.sh reads `.devport` from its own directory, so a worktree given one runs its own dev
 *  server and never competes with the checkout it was cut from. `.devport` is gitignored. */
export async function assignDevPort(wt, from = 5174) {
  for (let port = from; port < from + 40; port += 1) {
    if (await canBind(port)) {
      writeFileSync(join(wt, '.devport'), `${port}\n`);
      return port;
    }
  }
  throw new Error(`no free port between ${from} and ${from + 39}`);
}
