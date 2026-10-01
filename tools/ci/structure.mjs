import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { walkFiles, extractRepo } from './extract.mjs';

/** Drop comments, so prose naming a function is not read as a call to it. */
const stripComments = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

const stripCommentsKeepPositions = (t = '') =>
  t
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

/**
 * Architecture seams, checked by reading the code rather than a map of it.
 *
 * A chokepoint is only a chokepoint while nothing routes around it, and routing around one
 * is invisible in review: the new call site looks like every other call site. Each rule
 * names a function (or a module) and the exact symbols allowed to reach it; every other
 * symbol whose body calls it is a finding. Symbol bodies come from the same AST spans the
 * ledger is built from, so "which function is this call inside" is exact.
 */
export function seamViolations(root, symbols) {
  const rulePath = join(dirname(fileURLToPath(import.meta.url)), 'seams.json');
  if (!existsSync(rulePath)) return { rules: 0, findings: [] };
  const rules = JSON.parse(readFileSync(rulePath, 'utf8'));
  const findings = [];
  const spans = new Map();
  for (const s of symbols) {
    if (!spans.has(s.file)) spans.set(s.file, []);
    spans.get(s.file).push([s.startByte, s.endByte]);
  }
  const sources = [];
  for (const abs of walkFiles(join(root, 'src'), ['.ts', '.svelte'])) {
    const file = abs.slice(root.length + 1);
    if (/\.(test|spec)\.ts$/.test(file) || file.includes('/tests/')) continue;
    const text = stripCommentsKeepPositions(readFileSync(abs, 'utf8'));
    sources.push({ file, text, inside: spans.get(file) ?? [] });
  }

  for (const r of rules) {
    const allow = new Set(r.allow ?? []);
    if (r.kind === 'module') {
      const re = new RegExp(`from\\s*['"\`][^'"\`]*${r.target}['"\`]`);
      for (const abs of walkFiles(join(root, 'src'), ['.ts', '.svelte'])) {
        const file = abs.slice(root.length + 1);
        if (allow.has(file) || file.endsWith(`${r.target}.ts`)) continue;
        if (re.test(stripComments(readFileSync(abs, 'utf8'))))
          findings.push({ adr: r.adr, where: file, detail: r.msg, blocks: r.blocks === true });
      }
      continue;
    }
    const re = new RegExp(`(?:\\.|\\b)${r.target}\\s*\\(`);
    for (const s of symbols) {
      const id = `${s.file}::${s.className ? s.className + '.' : ''}${s.name}`;
      if (allow.has(id) || s.name === r.target) continue;
      if (re.test(stripComments(s.text ?? ''))) {
        findings.push({
          adr: r.adr,
          where: `${id}  ${s.file}:${s.startLine}`,
          detail: r.msg,
          blocks: r.blocks === true
        });
      }
    }
    const call = new RegExp(`(?:\\.|\\b)${r.target}\\s*\\(`, 'g');
    for (const { file, text, inside } of sources) {
      calls: for (const m of text.matchAll(call)) {
        for (const [a, b] of inside) if (m.index >= a && m.index < b) continue calls;
        const id = `${file}::<top level>`;
        if (allow.has(id)) continue;
        const line = text.slice(0, m.index).split('\n').length;
        findings.push({ adr: r.adr, where: `${id}  ${file}:${line}`, detail: r.msg, blocks: r.blocks === true });
      }
    }
  }
  return { rules: rules.length, findings };
}

export const COMPONENT_LINE_LIMIT = 200;

const lineCount = (text) => (text.match(/\n/g) ?? []).length;

export function componentSizeViolations(root) {
  const basePath = join(dirname(fileURLToPath(import.meta.url)), 'component-sizes.json');
  const frozen = existsSync(basePath) ? JSON.parse(readFileSync(basePath, 'utf8')) : {};
  const findings = [];
  const notes = [];
  const present = new Set();

  for (const abs of walkFiles(join(root, 'src'), ['.svelte'])) {
    const file = abs.slice(root.length + 1);
    const lines = lineCount(readFileSync(abs, 'utf8'));
    const cap = frozen[file];
    if (cap !== undefined) present.add(file);
    if (lines <= COMPONENT_LINE_LIMIT) {
      if (cap !== undefined)
        notes.push({ where: file, detail: `${lines} lines, under the limit now; drop it from component-sizes.json` });
      continue;
    }
    if (cap === undefined)
      findings.push({ where: file, detail: `${lines} lines, over the ${COMPONENT_LINE_LIMIT}-line component limit` });
    else if (lines > cap)
      findings.push({ where: file, detail: `grew from ${cap} to ${lines} lines; a component over the limit may only shrink` });
    else if (lines < cap)
      notes.push({ where: file, detail: `shrank from ${cap} to ${lines} lines; lower its entry in component-sizes.json` });
  }
  for (const file of Object.keys(frozen))
    if (!present.has(file)) notes.push({ where: file, detail: 'no longer exists; drop it from component-sizes.json' });

  return { frozen: Object.keys(frozen).length, findings, notes };
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const out = (line) => process.stdout.write(`${line}\n`);
  const inActions = process.env.GITHUB_ACTIONS === 'true';
  const warn = (props, text) => {
    if (inActions) out(`::warning ${props}::${text}`);
  };

  const seams = seamViolations(root, extractRepo(root));
  out(`seams: ${seams.rules} chokepoint(s) checked`);
  for (const f of seams.findings) {
    out(`  [seam${f.blocks ? ', blocks' : ''}] ${f.adr} ${f.where}: ${f.detail}`);
    if (!f.blocks) warn('title=Seam', `${f.adr} ${f.where}: ${f.detail}`);
    else if (inActions) out(`::error title=Speed seam::${f.adr} ${f.where}: ${f.detail}`);
  }
  if (seams.findings.length === 0) out('  no violations');

  const sizes = componentSizeViolations(root);
  out('');
  out(`component-sizes: ${sizes.frozen} component(s) over ${COMPONENT_LINE_LIMIT} lines frozen at their size`);
  for (const f of sizes.findings) {
    out(`  [size] ${f.where}: ${f.detail}`);
    warn(`file=${f.where},title=Component size`, f.detail);
  }
  for (const f of sizes.notes) out(`  [note] ${f.where}: ${f.detail}`);
  if (sizes.findings.length === 0) out('  no violations');

  if (seams.findings.some((f) => f.blocks)) process.exit(1);
  if ((seams.findings.length || sizes.findings.length) && process.argv.includes('--strict'))
    process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
