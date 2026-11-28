#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';
import {
  appendFileSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { availableParallelism, homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const REGISTRY = 'tools/mutants/registry.json';
const TOOL = 'tools/mutants/pins.mjs';
const LINKED = ['node_modules', 'static', 'src/lib/sim-core-pkg', 'src/lib/spatial-core-pkg'];
const COPIED = ['.svelte-kit'];
const TIMEOUT_MS = 10 * 60_000;
const TEST_FILE = /^src\/.+\.(test|spec)\.ts$/;
const RUST_FILE = /^([^/]+)\/src\/.+\.rs$/;
const HOME_CARGO = join(homedir(), '.cargo/bin/cargo');
const CARGO = process.env.CARGO || (existsSync(HOME_CARGO) ? HOME_CARGO : 'cargo');

/** @typedef {{ id: string, file: string, find: string, replace: string, tests: string[] }} Mutant */
/** @typedef {{ code: number, timedOut: boolean, unbuilt?: boolean, seconds: number, failed: string[], errors: string[] }} SuiteRun */
/** @typedef {{ id: string, file: string, line: number, outcome: string, by?: string, seconds: number }} MutantResult */
/** @typedef {(file: string) => string | null} Read */

/** @param {string} file */
const crateOf = (file) => RUST_FILE.exec(file)?.[1] ?? null;
/** @param {string} file */
const isRust = (file) => file.endsWith('.rs');

/** @param {string[]} args @param {string} [cwd] */
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 26 });

/** @param {string} text @param {string} find */
export function occurrences(text, find) {
  let n = 0;
  for (let i = text.indexOf(find); i >= 0; i = text.indexOf(find, i + 1)) n += 1;
  return n;
}

/** @param {string} text @param {string} find */
export const lineOf = (text, find) =>
  text.slice(0, Math.max(0, text.indexOf(find))).split('\n').length;

/** @param {string} root @returns {Read} */
const readOrNull = (root) => (file) => {
  const path = join(root, file);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
};

/** @param {unknown} mutants @param {Read} read @returns {string[]} */
export function registryErrors(mutants, read) {
  if (!Array.isArray(mutants)) return [`${REGISTRY} must hold an array of mutants`];
  /** @type {string[]} */
  const errors = [];
  const ids = new Set();
  for (const entry of mutants) {
    /** @type {Record<string, unknown>} */
    const m = entry;
    const name = typeof m.id === 'string' && m.id ? m.id : JSON.stringify(m).slice(0, 80);
    for (const key of ['id', 'file', 'find'])
      if (typeof m[key] !== 'string' || !m[key]) errors.push(`${name}: ${key} is missing`);
    if (typeof m.replace !== 'string') errors.push(`${name}: replace is missing`);
    if (!Array.isArray(m.tests) || !m.tests.length) errors.push(`${name}: tests is missing`);
    if (ids.has(m.id)) errors.push(`${name}: the id is used twice`);
    ids.add(m.id);
    if (m.find === m.replace) errors.push(`${name}: replace is the same as find`);
    if (typeof m.file === 'string' && typeof m.find === 'string' && m.find) {
      const text = read(m.file);
      if (text === null) errors.push(`${name}: ${m.file} does not exist`);
      else {
        const n = occurrences(text, m.find);
        if (n !== 1) errors.push(`${name}: the find text occurs ${n} times in ${m.file}, not once`);
      }
    }
    const crate = typeof m.file === 'string' && isRust(m.file) ? crateOf(m.file) : undefined;
    if (crate === null || (crate && read(`${crate}/Cargo.toml`) === null))
      errors.push(`${name}: ${m.file} is not under the src/ of a crate`);
    for (const t of Array.isArray(m.tests) ? m.tests : []) {
      if (crate === undefined) {
        if (typeof t !== 'string' || !TEST_FILE.test(t) || read(t) === null)
          errors.push(`${name}: ${t} is not a test file under src/`);
      } else if (
        typeof t !== 'string' ||
        crateOf(t) !== crate ||
        !(read(t) ?? '').includes('#[test]')
      )
        errors.push(`${name}: ${t} holds no #[test] in the crate of ${m.file}`);
    }
  }
  return errors;
}

/** @param {Mutant[]} mutants @param {Set<string>} changed @param {Mutant[]} baseMutants */
export function selectMutants(mutants, changed, baseMutants) {
  if (changed.has(TOOL)) return mutants;
  const before = new Map(baseMutants.map((m) => [m.id, JSON.stringify(m)]));
  return mutants.filter(
    (m) =>
      changed.has(m.file) ||
      m.tests.some((t) => changed.has(t)) ||
      before.get(m.id) !== JSON.stringify(m)
  );
}

/** @param {string} text @param {Pick<Mutant, 'find' | 'replace'>} m */
export function mutate(text, m) {
  const i = text.indexOf(m.find);
  return text.slice(0, i) + m.replace + text.slice(i + m.find.length);
}

/** @param {string} file @param {string} text @returns {Promise<string[]>} */
async function syntaxErrors(file, text) {
  if (isRust(file)) return [];
  const ts = (await import('typescript')).default;
  const kind = file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const source = /** @type {import('typescript').SourceFile & { parseDiagnostics: import('typescript').DiagnosticWithLocation[] }} */ (
    ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, kind)
  );
  return source.parseDiagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

/** @param {string} root @param {string[]} files */
function scratchTree(root, files) {
  const dir = mkdtempSync(join(tmpdir(), 'mutant-pins-'));
  for (const f of files) {
    if (LINKED.some((l) => f === l || f.startsWith(`${l}/`)) || !existsSync(join(root, f)))
      continue;
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    copyFileSync(join(root, f), join(dir, f));
  }
  for (const l of LINKED) {
    if (!existsSync(join(root, l))) continue;
    mkdirSync(dirname(join(dir, l)), { recursive: true });
    symlinkSync(realpathSync(join(root, l)), join(dir, l));
  }
  for (const c of COPIED)
    if (existsSync(join(root, c))) cpSync(join(root, c), join(dir, c), { recursive: true });
  return dir;
}

/** @typedef {{ testResults?: { status: string, message?: string, assertionResults?: { status: string, fullName: string }[] }[] }} VitestReport */

/** @param {string} reportFile @returns {{ failed: string[], errors: string[] }} */
function failures(reportFile) {
  if (!existsSync(reportFile)) return { failed: [], errors: [] };
  /** @type {VitestReport} */
  const report = JSON.parse(readFileSync(reportFile, 'utf8'));
  const results = report.testResults ?? [];
  return {
    failed: results.flatMap((r) =>
      (r.assertionResults ?? []).filter((a) => a.status === 'failed').map((a) => a.fullName)
    ),
    errors: results
      .filter((r) => r.status === 'failed' && r.message)
      .map((r) => (r.message ?? '').split('\n')[0])
  };
}

/** @param {string} dir @param {string[]} tests @param {number} workers @returns {Promise<SuiteRun>} */
function runTests(dir, tests, workers) {
  const reportFile = join(dir, `.mutant-pins-${process.hrtime.bigint()}.json`);
  const start = Date.now();
  return new Promise((resolve) => {
    let timedOut = false;
    const child = spawn(
      join(dir, 'node_modules/.bin/vitest'),
      ['run', '--bail=1', '--reporter=json', `--outputFile=${reportFile}`, ...tests],
      {
        cwd: dir,
        env: { ...process.env, VITEST_MAX_WORKERS: String(workers) },
        stdio: 'ignore',
        detached: true
      }
    );
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-(child.pid ?? 0), 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }, TIMEOUT_MS);
    child.on('exit', (code) => {
      clearTimeout(timer);
      const found = failures(reportFile);
      rmSync(reportFile, { force: true });
      resolve({ code: code ?? 1, timedOut, seconds: (Date.now() - start) / 1000, ...found });
    });
  });
}

/** @param {string} dir @param {string} crate @returns {Promise<SuiteRun>} */
function runCargo(dir, crate) {
  const start = Date.now();
  return new Promise((resolve) => {
    let out = '';
    let timedOut = false;
    const child = spawn(CARGO, ['test', '--lib', '--color', 'never'], {
      cwd: join(dir, crate),
      env: { ...process.env, CARGO_TARGET_DIR: join(dir, '.mutant-pins-cargo', crate) },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true
    });
    child.stdout.on('data', (/** @type {Buffer} */ d) => (out += d));
    child.stderr.on('data', (/** @type {Buffer} */ d) => (out += d));
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-(child.pid ?? 0), 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }, TIMEOUT_MS);
    /** @param {number | null} code */
    const finish = (code) => {
      clearTimeout(timer);
      const unbuilt = /^error: could not compile/m.test(out) || code === null;
      resolve({
        code: code ?? 1,
        timedOut,
        unbuilt: unbuilt && !timedOut,
        seconds: (Date.now() - start) / 1000,
        failed: [...out.matchAll(/^test (\S+) \.\.\. FAILED$/gm)].map((f) => `${crate} ${f[1]}`),
        errors: unbuilt ? [out.match(/^error.*$/m)?.[0] ?? `${CARGO} test did not run`] : []
      });
    };
    child.on('error', (e) => {
      out += `error: ${e.message}\n`;
      finish(null);
    });
    child.on('close', finish);
  });
}

/** @param {string} dir @param {string[]} tests @param {number} workers @returns {Promise<SuiteRun>} */
async function runSuite(dir, tests, workers) {
  /** @type {SuiteRun[]} */
  const runs = [];
  const vitest = tests.filter((t) => !isRust(t));
  if (vitest.length) runs.push(await runTests(dir, vitest, workers));
  for (const crate of new Set(tests.filter(isRust).map(crateOf))) {
    if (runs.some((r) => r.code !== 0)) break;
    if (crate === null) continue;
    runs.push(await runCargo(dir, crate));
  }
  return {
    code: runs.find((r) => r.code !== 0)?.code ?? 0,
    timedOut: runs.some((r) => r.timedOut),
    unbuilt: runs.some((r) => r.unbuilt),
    seconds: runs.reduce((s, r) => s + r.seconds, 0),
    failed: runs.flatMap((r) => r.failed),
    errors: runs.flatMap((r) => r.errors)
  };
}

/** @param {string} name */
function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** @param {string | undefined} base @param {string} root */
function changedSince(base, root) {
  if (!base || /^0+$/.test(base)) return null;
  try {
    return new Set(git(['diff', '--name-only', base], root).split('\n').filter(Boolean));
  } catch {
    return null;
  }
}

/** @param {string} base @param {string} root @returns {Mutant[]} */
function baseRegistry(base, root) {
  try {
    return JSON.parse(git(['show', `${base}:${REGISTRY}`], root));
  } catch {
    return [];
  }
}

/** @param {MutantResult[]} results @param {number} seconds @param {string} scope */
function summaryText(results, seconds, scope) {
  const survivors = results.filter((r) => r.outcome !== 'killed');
  const lines = [
    `### Mutant pins: ${results.length - survivors.length} of ${results.length} killed, ${scope}, in ${Math.round(seconds)}s`,
    ''
  ];
  if (results.length)
    lines.push(
      '| mutant | file | result | killed by |',
      '|---|---|---|---|',
      ...results.map(
        (r) => `| \`${r.id}\` | \`${r.file}:${r.line}\` | ${r.outcome} | ${(r.by ?? '').replaceAll('|', '\\|')} |`
      ),
      ''
    );
  return lines.join('\n');
}

/** @param {{ scope: string, seconds: number, ran: number, survivors: { id: string, file: string, line: number }[] }} note */
const writeNotes = (note) => {
  if (process.env.MUTANT_NOTES)
    appendFileSync(process.env.MUTANT_NOTES, `${JSON.stringify(note)}\n`);
};

/** @param {string} s */
const escapeData = (s) => s.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');

async function main() {
  const root = git(['rev-parse', '--show-toplevel']).trim();
  const read = readOrNull(root);
  /** @type {Mutant[]} */
  const mutants = JSON.parse(read(REGISTRY) ?? '[]');
  const errors = registryErrors(mutants, read);
  if (errors.length) {
    process.stderr.write(
      `${REGISTRY} has ${errors.length} problem(s):\n${errors.map((e) => `  ${e}`).join('\n')}\n`
    );
    process.exit(1);
  }

  const only = arg('--only')?.split(',');
  const base = arg('--base');
  const changed = only || !base ? null : changedSince(base, root);
  const selected = only
    ? mutants.filter((m) => only.includes(m.id))
    : changed && base
      ? selectMutants(mutants, changed, baseRegistry(base, root))
      : mutants;
  const scope = only
    ? 'the named mutants'
    : changed && base
      ? `the mutants this change reaches since ${base.slice(0, 8)}`
      : 'the whole registry';
  if (!selected.length) {
    process.stdout.write(`No mutant in ${REGISTRY} names a file changed since ${base}.\n`);
    writeNotes({ scope, seconds: 0, ran: 0, survivors: [] });
    return;
  }

  for (const m of selected) {
    const problems = await syntaxErrors(m.file, mutate(read(m.file) ?? '', m));
    if (problems.length) {
      process.stderr.write(`${m.id}: the mutated ${m.file} does not parse: ${problems[0]}\n`);
      process.exit(1);
    }
  }

  const jobs = Math.max(1, Number(arg('--jobs')) || Math.floor(availableParallelism() / 4) || 1);
  const workers = Math.max(1, Number(arg('--workers')) || 2);
  const files = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], root)
    .split('\0')
    .filter(Boolean);
  const start = Date.now();
  const dirs = [scratchTree(root, files)];
  const tests = [...new Set(selected.flatMap((m) => m.tests))];

  try {
    process.stdout.write(`Running ${tests.length} test file(s) without a mutant in ${dirs[0]}\n`);
    const baseline = await runSuite(dirs[0], tests, Math.max(workers, jobs));
    if (baseline.code !== 0) {
      process.stderr.write(
        `The tests fail with no mutant applied, so no mutant can be judged:\n${[...baseline.failed, ...baseline.errors].map((f) => `  ${f}`).join('\n')}\n`
      );
      process.exitCode = 1;
      return;
    }
    while (dirs.length < Math.min(jobs, selected.length)) dirs.push(scratchTree(root, files));

    const queue = [...selected];
    /** @type {MutantResult[]} */
    const results = [];
    await Promise.all(
      dirs.map(async (dir) => {
        for (let m = queue.shift(); m; m = queue.shift()) {
          const path = join(dir, m.file);
          const original = readFileSync(path, 'utf8');
          writeFileSync(path, mutate(original, m));
          const run = await runSuite(dir, m.tests, workers);
          writeFileSync(path, original);
          const killed = run.code !== 0 && !run.unbuilt;
          const by = run.timedOut ? 'timeout' : (run.failed[0] ?? run.errors[0]);
          const result = {
            id: m.id,
            file: m.file,
            line: lineOf(original, m.find),
            outcome: killed ? 'killed' : run.unbuilt ? 'does not compile' : 'survived',
            by,
            seconds: run.seconds
          };
          results.push(result);
          process.stdout.write(
            `${killed ? 'killed  ' : run.unbuilt ? 'UNBUILT ' : 'SURVIVED'} ${m.id} (${Math.round(run.seconds)}s)${by ? ` by ${by}` : ''}\n`
          );
          if (!killed && process.env.GITHUB_ACTIONS === 'true')
            process.stdout.write(
              `::error file=${m.file},line=${result.line},title=Mutant survived::${escapeData(`${m.id}: replacing ${JSON.stringify(m.find)} with ${JSON.stringify(m.replace)} ${run.unbuilt ? 'does not compile' : `passes ${m.tests.join(', ')}`}`)}\n`
            );
        }
      })
    );

    const order = new Map(selected.map((m, i) => [m.id, i]));
    results.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    const seconds = (Date.now() - start) / 1000;
    const text = summaryText(results, seconds, scope);
    const survivors = results.filter((r) => r.outcome !== 'killed');
    process.stdout.write(`\n${text}\n`);
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
    writeNotes({
      scope,
      seconds,
      ran: results.length,
      survivors: survivors.map(({ id, file, line }) => ({ id, file, line }))
    });
    if (survivors.length) {
      process.stderr.write(
        `${survivors.length} mutant(s) survived: ${survivors.map((s) => s.id).join(', ')}\n`
      );
      process.exitCode = 1;
    }
  } finally {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
