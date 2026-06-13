// @ts-check
/**
 * Codebase call-graph extractor.
 *
 * Walks every non-test TypeScript source file under src/lib using the
 * TypeScript compiler API, registers each function / method / arrow-function
 * as a graph node, and resolves call expressions through the type checker to
 * build accurate caller -> callee edges.
 *
 * Output: tools/codegraph/graph.json  (consumed by build-html.mjs)
 *
 * Run with:  node tools/codegraph/extract.mjs
 */
import ts from 'typescript';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src', 'lib');

/** Files we treat as graph sources (definitions + logic), excluding tests. */
function isSourceFile(fileName) {
  const f = fileName.replace(/\\/g, '/');
  if (!f.includes('/src/lib/')) return false;
  if (!f.endsWith('.ts')) return false;
  if (f.endsWith('.d.ts')) return false;
  if (f.endsWith('.test.ts')) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Build the TypeScript program from the project's tsconfig (so $lib aliases
// and module resolution behave exactly like the real build).
// ---------------------------------------------------------------------------
const configPath = path.join(ROOT, 'tsconfig.json');
const parsed = ts.getParsedCommandLineOfConfigFile(
  configPath,
  {},
  {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      console.error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    }
  }
);
if (!parsed) {
  console.error('Could not parse tsconfig.json');
  process.exit(1);
}

const program = ts.createProgram({
  rootNames: parsed.fileNames,
  options: { ...parsed.options, noEmit: true }
});
const checker = program.getTypeChecker();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');

/** Module label e.g. "game/services/JobService" (drop src/lib/ and .ts). */
function moduleOf(fileName) {
  return rel(fileName)
    .replace(/^src\/lib\//, '')
    .replace(/\.ts$/, '');
}

/** Top-level group used for colour / clustering (services, systems, core...). */
function groupOf(fileName) {
  const m = moduleOf(fileName); // e.g. game/services/JobService
  const parts = m.split('/');
  if (parts[0] === 'game') return parts[1] ?? 'game';
  return parts[0]; // stores, components, spatial-core-pkg, ...
}

/** Turn camelCase / PascalCase identifiers into a readable phrase. */
function humanize(name) {
  const base = name.replace(/Impl$/, '').replace(/Service$/, '');
  const words = base
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_\-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Extract the leading JSDoc / line-comment block of a node as a description. */
function leadingDoc(node, sf) {
  const full = sf.getFullText();
  const ranges = ts.getLeadingCommentRanges(full, node.getFullStart()) || [];
  if (!ranges.length) return '';
  const text = ranges
    .map((r) => full.slice(r.pos, r.end))
    .join('\n')
    .replace(/^\s*\/\*\*?/, '')
    .replace(/\*\/\s*$/, '')
    .split('\n')
    .map((l) =>
      l
        .replace(/^\s*\*\s?/, '')
        .replace(/^\s*\/\/\s?/, '')
        .trim()
    )
    .filter((l) => l && !l.startsWith('@') && !l.startsWith('eslint') && !l.startsWith('@ts-'))
    .join(' ')
    .trim();
  return text;
}

/** First line of the declaration's source, trimmed, used as a signature hint. */
function signatureOf(node, sf) {
  let txt = node.getText(sf);
  const brace = txt.indexOf('{');
  const arrow = txt.indexOf('=>');
  let cut = txt.length;
  if (brace >= 0) cut = Math.min(cut, brace);
  if (arrow >= 0) cut = Math.min(cut, arrow + 2);
  txt = txt.slice(0, cut).replace(/\s+/g, ' ').trim();
  if (txt.length > 160) txt = txt.slice(0, 157) + '...';
  return txt;
}

// ---------------------------------------------------------------------------
// Pass 1 — register nodes
// ---------------------------------------------------------------------------
/** @type {Map<ts.Node, string>} declaration AST node -> node id */
const declToId = new Map();
/** @type {Map<string, any>} id -> node record */
const nodes = new Map();
/** list of { id, decl, body } to scan for calls in pass 2 */
const scanList = [];

let idCounter = 0;
function makeId(fileName, qualName, line) {
  return `${moduleOf(fileName)}::${qualName}@${line}#${idCounter++}`;
}

function register(decl, qualName, kind, className, sf) {
  const fileName = sf.fileName;
  const { line } = sf.getLineAndCharacterOfPosition(decl.getStart(sf));
  const id = makeId(fileName, qualName, line + 1);
  declToId.set(decl, id);
  const doc = leadingDoc(decl, sf);
  nodes.set(id, {
    id,
    name: qualName,
    short: className ? `${className}.${qualName.split('.').pop()}` : qualName,
    file: rel(fileName),
    module: moduleOf(fileName),
    group: groupOf(fileName),
    line: line + 1,
    kind,
    className: className || null,
    exported: isExported(decl),
    signature: signatureOf(decl, sf),
    doc,
    humanized: humanize(qualName.split('.').pop() || qualName)
  });
  const body = /** @type {any} */ (decl).body;
  if (body) scanList.push({ id, body, decl });
}

function isExported(decl) {
  const mods = ts.canHaveModifiers(decl) ? ts.getModifiers(decl) : undefined;
  if (mods && mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) return true;
  // exported via variable statement
  let p = decl.parent;
  while (p) {
    if (ts.isVariableStatement(p)) {
      const vm = ts.getModifiers(p);
      return !!vm && vm.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    }
    if (ts.isSourceFile(p)) break;
    p = p.parent;
  }
  return false;
}

function isFunctionLike(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isGetAccessor(node) ||
    ts.isSetAccessor(node) ||
    ts.isConstructorDeclaration(node)
  );
}

function collectNodes(sf) {
  const visit = (node, ctx) => {
    // class context for method naming
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      const cname = node.name ? node.name.text : ctx.className || 'Anonymous';
      ts.forEachChild(node, (c) => visit(c, { ...ctx, className: cname }));
      return;
    }
    if (ts.isFunctionDeclaration(node) && node.name) {
      register(node, node.name.text, 'function', null, sf);
    } else if (ts.isMethodDeclaration(node) && node.name) {
      const m = node.name.getText(sf);
      register(node, ctx.className ? `${ctx.className}.${m}` : m, 'method', ctx.className, sf);
    } else if ((ts.isGetAccessor(node) || ts.isSetAccessor(node)) && node.name) {
      const m = node.name.getText(sf);
      const tag = ts.isGetAccessor(node) ? 'get ' : 'set ';
      register(
        node,
        ctx.className ? `${ctx.className}.${tag}${m}` : tag + m,
        'accessor',
        ctx.className,
        sf
      );
    } else if (ts.isConstructorDeclaration(node)) {
      register(
        node,
        ctx.className ? `${ctx.className}.constructor` : 'constructor',
        'method',
        ctx.className,
        sf
      );
    } else if (
      (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) &&
      node.name
    ) {
      const nm = node.name.getText(sf);
      const kind = ts.isPropertyDeclaration(node) ? 'method' : 'function';
      register(
        node.initializer,
        ctx.className ? `${ctx.className}.${nm}` : nm,
        kind,
        ctx.className || null,
        sf
      );
      // still descend into the function body for nested fns
    }
    ts.forEachChild(node, (c) => visit(c, ctx));
  };
  ts.forEachChild(sf, (n) => visit(n, { className: null }));
}

const sourceFiles = program.getSourceFiles().filter((sf) => isSourceFile(sf.fileName));
console.error(`Scanning ${sourceFiles.length} source files...`);
for (const sf of sourceFiles) collectNodes(sf);
console.error(`Registered ${nodes.size} function nodes.`);

// ---------------------------------------------------------------------------
// Pass 2 — resolve calls into edges
// ---------------------------------------------------------------------------
/** @type {Map<string, {from:string,to:string,count:number}>} */
const edges = new Map();

function resolveTargetId(symbol) {
  if (!symbol) return null;
  let s = symbol;
  if (s.flags & ts.SymbolFlags.Alias) {
    try {
      s = checker.getAliasedSymbol(s);
    } catch {
      /* ignore */
    }
  }
  const decls = s.declarations || [];
  for (const d of decls) {
    if (declToId.has(d)) return declToId.get(d);
    // arrow/function assigned to a variable: symbol decl is the VariableDeclaration
    if (
      (ts.isVariableDeclaration(d) || ts.isPropertyDeclaration(d)) &&
      d.initializer &&
      declToId.has(d.initializer)
    ) {
      return declToId.get(d.initializer);
    }
  }
  return null;
}

function addEdge(from, to) {
  if (!from || !to || from === to) return;
  const key = `${from} ${to}`;
  const e = edges.get(key);
  if (e) e.count++;
  else edges.set(key, { from, to, count: 1 });
}

function scanCalls(body, ownerId) {
  const visit = (node) => {
    // do not descend into nested registered functions; they own their calls
    if (node !== body && isFunctionLike(node) && declToId.has(node)) return;

    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const callee = node.expression;
      let sym = checker.getSymbolAtLocation(callee);
      if (!sym && ts.isPropertyAccessExpression(callee)) {
        sym = checker.getSymbolAtLocation(callee.name);
      }
      const targetId = resolveTargetId(sym);
      if (targetId) addEdge(ownerId, targetId);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
}

for (const { id, body } of scanList) scanCalls(body, id);
console.error(`Resolved ${edges.size} edges.`);

// ---------------------------------------------------------------------------
// Module-level rollup (file -> file dependency graph for the overview)
// ---------------------------------------------------------------------------
const moduleEdges = new Map();
for (const e of edges.values()) {
  const fromMod = nodes.get(e.from).module;
  const toMod = nodes.get(e.to).module;
  if (fromMod === toMod) continue;
  const key = `${fromMod} ${toMod}`;
  const me = moduleEdges.get(key);
  if (me) me.count += e.count;
  else moduleEdges.set(key, { from: fromMod, to: toMod, count: e.count });
}

const moduleNodes = new Map();
for (const n of nodes.values()) {
  if (!moduleNodes.has(n.module)) {
    moduleNodes.set(n.module, { module: n.module, group: n.group, file: n.file, fns: 0 });
  }
  moduleNodes.get(n.module).fns++;
}

// degree stats for sizing / "hub" detection
const indeg = new Map();
const outdeg = new Map();
for (const e of edges.values()) {
  outdeg.set(e.from, (outdeg.get(e.from) || 0) + 1);
  indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
}
for (const n of nodes.values()) {
  n.inDegree = indeg.get(n.id) || 0;
  n.outDegree = outdeg.get(n.id) || 0;
}

const out = {
  generatedAt: new Date().toISOString(),
  root: ROOT,
  stats: {
    files: sourceFiles.length,
    functions: nodes.size,
    edges: edges.size,
    modules: moduleNodes.size
  },
  nodes: [...nodes.values()],
  edges: [...edges.values()],
  moduleNodes: [...moduleNodes.values()],
  moduleEdges: [...moduleEdges.values()]
};

const outPath = path.join(__dirname, 'graph.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 0));
console.error(`Wrote ${outPath}`);
console.error(JSON.stringify(out.stats, null, 2));
