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
import { availableParallelism, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const REGISTRY = 'tools/mutants/registry.json';
const TOOL = 'tools/mutants/pins.mjs';
const LINKED = ['node_modules', 'static', 'src/lib/sim-core-pkg', 'src/lib/spatial-core-pkg'];
const COPIED = ['.svelte-kit'];
const TIMEOUT_MS = 10 * 60_000;
const TEST_FILE = /^src\/.+\.(test|spec)\.ts$/;

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 26 });

export function occurrences(text, find) {
  let n = 0;
  for (let i = text.indexOf(find); i >= 0; i = text.indexOf(find, i + 1)) n += 1;
  return n;
}

export const lineOf = (text, find) =>
  text.slice(0, Math.max(0, text.indexOf(find))).split('\n').length;

const readOrNull = (root) => (file) => {
  const path = join(root, file);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
};

export function registryErrors(mutants, read) {
  if (!Array.isArray(mutants)) return [`${REGISTRY} must hold an array of mutants`];
  const errors = [];
  const ids = new Set();
  for (const m of mutants) {
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
    for (const t of Array.isArray(m.tests) ? m.tests : [])
      if (typeof t !== 'string' || !TEST_FILE.test(t) || read(t) === null)
        errors.push(`${name}: ${t} is not a test file under src/`);
  }
  return errors;
}

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

export function mutate(text, m) {
  const i = text.indexOf(m.find);
  return text.slice(0, i) + m.replace + text.slice(i + m.find.length);
}

async function syntaxErrors(file, text) {
  const ts = (await import('typescript')).default;
  const kind = file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, kind);
  return source.parseDiagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

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

function failures(reportFile) {
  if (!existsSync(reportFile)) return { failed: [], errors: [] };
  const report = JSON.parse(readFileSync(reportFile, 'utf8'));
  const results = report.testResults ?? [];
  return {
    failed: results.flatMap((r) =>
      (r.assertionResults ?? []).filter((a) => a.status === 'failed').map((a) => a.fullName)
    ),
    errors: results
      .filter((r) => r.status === 'failed' && r.message)
      .map((r) => r.message.split('\n')[0])
  };
}

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

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function changedSince(base, root) {
  if (!base || /^0+$/.test(base)) return null;
  try {
    return new Set(git(['diff', '--name-only', base], root).split('\n').filter(Boolean));
  } catch {
    return null;
  }
}

function baseRegistry(base, root) {
  try {
    return JSON.parse(git(['show', `${base}:${REGISTRY}`], root));
  } catch {
    return [];
  }
}

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

const writeNotes = (note) => {
  if (process.env.MUTANT_NOTES)
    appendFileSync(process.env.MUTANT_NOTES, `${JSON.stringify(note)}\n`);
};

const escapeData = (s) => s.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');

async function main() {
  const root = git(['rev-parse', '--show-toplevel']).trim();
  const read = readOrNull(root);
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
  const changed = only ? null : changedSince(base, root);
  const selected = only
    ? mutants.filter((m) => only.includes(m.id))
    : changed
      ? selectMutants(mutants, changed, baseRegistry(base, root))
      : mutants;
  const scope = only
    ? 'the named mutants'
    : changed
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
    const baseline = await runTests(dirs[0], tests, Math.max(workers, jobs));
    if (baseline.code !== 0) {
      process.stderr.write(
        `The tests fail with no mutant applied, so no mutant can be judged:\n${[...baseline.failed, ...baseline.errors].map((f) => `  ${f}`).join('\n')}\n`
      );
      process.exitCode = 1;
      return;
    }
    while (dirs.length < Math.min(jobs, selected.length)) dirs.push(scratchTree(root, files));

    const queue = [...selected];
    const results = [];
    await Promise.all(
      dirs.map(async (dir) => {
        for (let m = queue.shift(); m; m = queue.shift()) {
          const path = join(dir, m.file);
          const original = readFileSync(path, 'utf8');
          writeFileSync(path, mutate(original, m));
          const run = await runTests(dir, m.tests, workers);
          writeFileSync(path, original);
          const killed = run.code !== 0;
          const by = run.timedOut ? 'timeout' : (run.failed[0] ?? run.errors[0]);
          const result = {
            id: m.id,
            file: m.file,
            line: lineOf(original, m.find),
            outcome: killed ? 'killed' : 'survived',
            by,
            seconds: run.seconds
          };
          results.push(result);
          process.stdout.write(
            `${killed ? 'killed  ' : 'SURVIVED'} ${m.id} (${Math.round(run.seconds)}s)${by ? ` by ${by}` : ''}\n`
          );
          if (!killed && process.env.GITHUB_ACTIONS === 'true')
            process.stdout.write(
              `::error file=${m.file},line=${result.line},title=Mutant survived::${escapeData(`${m.id}: replacing ${JSON.stringify(m.find)} with ${JSON.stringify(m.replace)} passes ${m.tests.join(', ')}`)}\n`
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
