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
import { extractRust } from './rust.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src', 'lib');

// ---------------------------------------------------------------------------
// Svelte support: each .svelte component gets a virtual TypeScript twin holding
// just its <script> contents (line positions preserved) so the compiler can
// resolve the calls it makes into stores/services. The twin's path is the real
// .svelte path + this suffix; we map it back when labelling nodes.
// ---------------------------------------------------------------------------
const SV_SUFFIX = '.cg.ts';
/** @type {Map<string,string>} virtual twin path -> TS content */
const svelteVirtual = new Map();
const realPath = (f) => (f.endsWith(SV_SUFFIX) ? f.slice(0, -SV_SUFFIX.length) : f);

/** Keep only <script> contents; blank the rest but preserve newlines (so line numbers map back to the .svelte). */
function svelteToVirtualTs(src) {
  const arr = new Array(src.length);
  for (let i = 0; i < src.length; i++) arr[i] = src[i] === '\n' ? '\n' : ' ';
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(src))) {
    const openEnd = m.index + m[0].indexOf('>') + 1;
    for (let i = 0; i < m[1].length; i++) arr[openEnd + i] = src[openEnd + i];
  }
  return arr.join('');
}

function findSvelteFiles() {
  const root = path.join(ROOT, 'src');
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { recursive: true })
    .map((f) => path.join(root, String(f)))
    .filter((f) => f.endsWith('.svelte'));
}

/** Files we treat as graph sources (definitions + logic), excluding tests. */
function isSourceFile(fileName) {
  if (svelteVirtual.has(fileName)) return true; // virtual .svelte twin
  const f = fileName.replace(/\\/g, '/');
  if (!f.includes('/src/lib/')) return false;
  if (!f.endsWith('.ts')) return false;
  if (f.endsWith('.d.ts')) return false;
  if (f.endsWith('.test.ts')) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Build the TypeScript program from the project's tsconfig (so $lib aliases
// and module resolution behave exactly like the real build), plus the virtual
// Svelte twins served through a custom compiler host.
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

for (const sv of findSvelteFiles()) {
  try {
    svelteVirtual.set(sv + SV_SUFFIX, svelteToVirtualTs(fs.readFileSync(sv, 'utf8')));
  } catch {
    /* unreadable component — skip */
  }
}

const compilerOptions = { ...parsed.options, noEmit: true };
const host = ts.createCompilerHost(compilerOptions);
const _getSourceFile = host.getSourceFile.bind(host);
host.getSourceFile = (fn, langVer, onErr, shouldCreate) => {
  if (svelteVirtual.has(fn)) return ts.createSourceFile(fn, svelteVirtual.get(fn), langVer, true);
  return _getSourceFile(fn, langVer, onErr, shouldCreate);
};
const _readFile = host.readFile.bind(host);
host.readFile = (fn) => (svelteVirtual.has(fn) ? svelteVirtual.get(fn) : _readFile(fn));
const _fileExists = host.fileExists.bind(host);
host.fileExists = (fn) => svelteVirtual.has(fn) || _fileExists(fn);

const program = ts.createProgram({
  rootNames: [...parsed.fileNames, ...svelteVirtual.keys()],
  options: compilerOptions,
  host
});
const checker = program.getTypeChecker();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const rel = (f) => path.relative(ROOT, realPath(f)).replace(/\\/g, '/');

/** Module label e.g. "game/services/JobService" or "components/screens/WorkScreen". */
function moduleOf(fileName) {
  return rel(fileName)
    .replace(/^src\/lib\//, '')
    .replace(/^src\//, '') // routes/* live outside src/lib
    .replace(/\.(ts|svelte)$/, '');
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

// Common abbreviations expanded for readable auto-descriptions.
// Null-prototype so a word like "constructor" can't hit Object.prototype.
const ABBR = Object.assign(Object.create(null), {
  calc: 'calculate', gen: 'generate', init: 'initialize', cfg: 'configure',
  config: 'configuration', ctx: 'context', pos: 'position', dir: 'direction',
  coord: 'coordinate', coords: 'coordinates', prev: 'previous', src: 'source',
  dest: 'destination', msg: 'message', evt: 'event', def: 'definition',
  desc: 'description', util: 'utility', dist: 'distance', req: 'request',
  env: 'environment', sim: 'simulation', stat: 'stat', stats: 'stats',
  num: 'number', avg: 'average', idx: 'index', refuel: 'refuel',
});
function nameWords(name) {
  return name
    .replace(/^_+/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_\-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ABBR[w.toLowerCase()] || w);
}

// Leading-verb → sentence templates for inferring what a function does.
const VERB = Object.assign(Object.create(null), {
  get: 'Return', return: 'Return', find: 'Find', fetch: 'Fetch', lookup: 'Look up',
  read: 'Read', list: 'List', collect: 'Collect', gather: 'Gather', resolve: 'Resolve',
  calculate: 'Compute', compute: 'Compute', derive: 'Derive', evaluate: 'Evaluate',
  estimate: 'Estimate', measure: 'Measure', score: 'Score', roll: 'Roll',
  update: 'Update', set: 'Set', apply: 'Apply', assign: 'Assign', adjust: 'Adjust',
  modify: 'Modify', change: 'Change', tweak: 'Adjust', recalc: 'Recompute',
  create: 'Create', generate: 'Generate', make: 'Create', build: 'Build', spawn: 'Spawn',
  initialize: 'Initialize', construct: 'Construct', produce: 'Produce',
  add: 'Add', insert: 'Insert', register: 'Register', append: 'Append', attach: 'Attach',
  remove: 'Remove', delete: 'Delete', clear: 'Clear', destroy: 'Destroy', drop: 'Drop',
  release: 'Release', detach: 'Detach', discard: 'Discard',
  consume: 'Consume', spend: 'Spend', pay: 'Pay', deduct: 'Deduct', drain: 'Drain',
  handle: 'Handle', process: 'Process', dispatch: 'Dispatch', route: 'Route',
  render: 'Render', draw: 'Draw', paint: 'Paint', display: 'Display', show: 'Show',
  tick: 'Advance', step: 'Advance', advance: 'Advance', run: 'Run', execute: 'Execute',
  simulate: 'Simulate', progress: 'Progress',
  save: 'Save', write: 'Write', persist: 'Persist', store: 'Store', flush: 'Flush',
  sync: 'Synchronize', ensure: 'Ensure', validate: 'Validate', check: 'Check',
  verify: 'Verify', assert: 'Assert',
  toggle: 'Toggle', reset: 'Reset', refresh: 'Refresh', rebuild: 'Rebuild',
  recompute: 'Recompute', reload: 'Reload', restore: 'Restore',
  move: 'Move', place: 'Place', equip: 'Equip', unequip: 'Unequip', wield: 'Wield',
  start: 'Start', stop: 'Stop', begin: 'Begin', end: 'End', open: 'Open', close: 'Close',
  cancel: 'Cancel', pause: 'Pause', resume: 'Resume', complete: 'Complete', finish: 'Finish',
  select: 'Select', pick: 'Pick', choose: 'Choose', filter: 'Filter', sort: 'Sort',
  group: 'Group', merge: 'Merge', combine: 'Combine', split: 'Split',
  parse: 'Parse', format: 'Format', serialize: 'Serialize', deserialize: 'Deserialize',
  encode: 'Encode', decode: 'Decode', convert: 'Convert', normalize: 'Normalize',
  emit: 'Emit', notify: 'Notify', log: 'Log', report: 'Report', count: 'Count',
  sum: 'Sum', total: 'Total', mark: 'Mark', flag: 'Flag', queue: 'Queue',
  load: 'Load', grant: 'Grant', award: 'Award', gain: 'Gain', lose: 'Lose',
  damage: 'Apply damage from', heal: 'Heal', hit: 'Resolve a hit on', attack: 'Resolve an attack by',
});
const PREDICATE = new Set(['is', 'has', 'can', 'should', 'are', 'was', 'will', 'does', 'did', 'must', 'needs', 'wants']);

/** Infer a readable sentence for a function from its name when it has no JSDoc. */
function autoDescribe(baseName) {
  const ws = nameWords(baseName);
  if (!ws.length) return 'Unnamed function.';
  const lc = ws.map((w) => w.toLowerCase());
  const verb = lc[0];
  const restWs = ws.slice(1);
  const rest = restWs.join(' ').toLowerCase();
  const full = lc.join(' ');
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // getXById / findXById → "Look up the X with the given id."
  if (['get', 'find', 'fetch', 'lookup', 'load'].includes(verb) && lc.includes('by') && lc[lc.length - 1] === 'id') {
    const x = lc.slice(1, lc.indexOf('by')).join(' ') || 'record';
    return `Look up the ${x} with the given id.`;
  }
  // predicates → "Report whether …"
  if (PREDICATE.has(verb)) {
    const tail = restWs.length ? rest : full;
    return `Report whether ${tail}.`;
  }
  if (verb === 'to' && restWs.length) return `Convert to ${rest}.`;
  if (verb === 'from' && restWs.length) return `Build from ${rest}.`;
  if (verb === 'on' && restWs.length) return `Handle the ${rest} event.`;
  if (VERB[verb]) return restWs.length ? `${VERB[verb]} ${rest}.` : `${VERB[verb]}.`;
  return cap(full) + '.';
}

/** A comment line that's just a divider/separator (---- / ==== / //// / ****). */
const isDivider = (l) => /^[\s\-=*_/#~.]+$/.test(l);
/** An ALL-CAPS section banner like "PUBLIC API" or "PRIVATE — JOB GENERATION". */
const isBanner = (l) => l.length <= 48 && /^[A-Z0-9 _\-—&/().]+$/.test(l) && /[A-Z]/.test(l);

/**
 * Extract a clean description from a declaration's leading comment.
 * Prefers the JSDoc block nearest the declaration; falls back to trailing
 * `//` lines. Section banners and divider rules are stripped so they don't
 * leak into descriptions.
 */
function leadingDoc(node, sf) {
  const full = sf.getFullText();
  const ranges = ts.getLeadingCommentRanges(full, node.getFullStart()) || [];
  if (!ranges.length) return '';

  // Prefer the block comment (/* */ or /** */) closest to the declaration —
  // that's the real doc; the // banners above it are noise.
  const block = [...ranges].reverse().find((r) => r.kind === ts.SyntaxKind.MultiLineCommentTrivia);
  const chosen = block ? [block] : ranges.filter((r) => r.kind === ts.SyntaxKind.SingleLineCommentTrivia);

  const lines = chosen
    .map((r) => full.slice(r.pos, r.end))
    .join('\n')
    .replace(/^\s*\/\*\*?/, '')
    .replace(/\*\/\s*$/, '')
    .split('\n')
    .map((l) =>
      l
        .replace(/^\s*\*\s?/, '')
        .replace(/^\s*\/\/\s?/, '')
        // strip surrounding divider runs (=====, -----, ////, ****) that wrap banners
        .replace(/^[=\-*_/#~\s]+/, '')
        .replace(/[=\-*_/#~\s]+$/, '')
        .trim()
    )
    .filter((l) => l && !isDivider(l) && !isBanner(l) && !l.startsWith('@') && !l.startsWith('eslint'));

  let text = lines.join(' ').replace(/\s+/g, ' ').trim();
  if (text.length > 280) text = text.slice(0, 277).replace(/\s+\S*$/, '') + '…';
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
/** list of { id, sf } Svelte components — every call in their script is an edge */
const componentScan = [];

let idCounter = 0;
function makeId(fileName, qualName, line) {
  return `${moduleOf(fileName)}::${qualName}@${line}#${idCounter++}`;
}

const ARITH = new Set([
  ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskToken,
  ts.SyntaxKind.SlashToken, ts.SyntaxKind.PercentToken, ts.SyntaxKind.AsteriskAsteriskToken,
]);
/** Lines-of-code span and a "numeric heaviness" score (arithmetic, indexing, loops). */
function bodyMetrics(decl, sf) {
  const start = sf.getLineAndCharacterOfPosition(decl.getStart(sf)).line;
  const end = sf.getLineAndCharacterOfPosition(decl.getEnd()).line;
  let numeric = 0;
  const visit = (n) => {
    if (ts.isBinaryExpression(n) && ARITH.has(n.operatorToken.kind)) numeric++;
    else if (ts.isElementAccessExpression(n)) numeric++; // arr[i]
    else if (ts.isForStatement(n) || ts.isForOfStatement(n) || ts.isWhileStatement(n)) numeric += 2;
    else if (ts.isPrefixUnaryExpression(n) && (n.operator === ts.SyntaxKind.MinusToken || n.operator === ts.SyntaxKind.PlusToken)) numeric++;
    ts.forEachChild(n, visit);
  };
  visit(decl);
  return { loc: Math.max(1, end - start + 1), chars: decl.getEnd() - decl.getStart(sf), numeric };
}

function register(decl, qualName, kind, className, sf) {
  const fileName = sf.fileName;
  const { line } = sf.getLineAndCharacterOfPosition(decl.getStart(sf));
  const id = makeId(fileName, qualName, line + 1);
  declToId.set(decl, id);
  const doc = leadingDoc(decl, sf);
  const met = bodyMetrics(decl, sf);
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
    humanized: humanize(qualName.split('.').pop() || qualName),
    // Description shown in the viewer: JSDoc if the function has one, else a
    // verb-aware sentence inferred from its name. Curated overrides live in
    // descriptions.json and win over this at display time.
    desc: doc || autoDescribe(qualName.split('.').pop() || qualName),
    loc: met.loc,
    chars: met.chars,
    numeric: met.numeric,
    tested: false
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

const STORE_FACTORIES = /^(writable|readable|derived|writableLocal|persisted|tweened|spring)$/;
function isStoreFactory(expr) {
  const name = ts.isIdentifier(expr) ? expr.text
    : ts.isPropertyAccessExpression(expr) ? expr.name.text : '';
  return STORE_FACTORIES.test(name);
}
/** A store: writable/derived/… call, or a custom object implementing `subscribe`. */
function isStoreInit(init) {
  if (ts.isCallExpression(init)) return isStoreFactory(init.expression);
  if (ts.isObjectLiteralExpression(init)) {
    return init.properties.some((p) => p.name && p.name.getText() === 'subscribe');
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
    } else if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      node.name &&
      ts.isIdentifier(node.name) &&
      isStoreInit(node.initializer)
    ) {
      // a reactive store: `writable(...)`, `derived(...)`, or a custom store object
      register(node, node.name.text, 'store', null, sf);
    }
    ts.forEachChild(node, (c) => visit(c, ctx));
  };
  ts.forEachChild(sf, (n) => visit(n, { className: null }));
}

// A Svelte component is registered as a single node; every call its <script>
// makes into a store/service becomes an edge (component -> function it uses).
function registerComponent(sf) {
  const fileName = sf.fileName;
  const base = path.basename(realPath(fileName), '.svelte');
  const id = makeId(fileName, base, 1);
  const txt = sf.getFullText(); // line-preserving twin → same size as the .svelte file
  nodes.set(id, {
    id,
    name: base,
    short: base,
    file: rel(fileName),
    module: moduleOf(fileName),
    group: groupOf(fileName),
    line: 1,
    kind: 'component',
    className: null,
    exported: true,
    signature: '<svelte component>',
    doc: '',
    humanized: humanize(base),
    desc: `${humanize(base)} — Svelte UI component.`,
    loc: txt.split('\n').length,
    chars: txt.length,
    numeric: 0,
    tested: false,
    // Svelte 5 best practice: prefer runes. Count legacy `$:` reactive statements.
    legacyReactive: (txt.match(/(^|\n)[ \t]*\$:/g) || []).length
  });
  componentScan.push({ id, sf });
}

const sourceFiles = program.getSourceFiles().filter((sf) => isSourceFile(sf.fileName));
const svelteCount = sourceFiles.filter((sf) => svelteVirtual.has(sf.fileName)).length;
console.error(`Scanning ${sourceFiles.length} source files (${svelteCount} Svelte)...`);
for (const sf of sourceFiles) {
  if (svelteVirtual.has(sf.fileName)) registerComponent(sf);
  else collectNodes(sf);
}

// Rust (WASM crates): add Rust fn/method nodes + intra-crate edges, and set up
// the TS↔Rust boundary bridge (the wasm-bindgen export surface, matched by name).
const rust = extractRust(ROOT, rel);
for (const n of rust.nodes) nodes.set(n.id, n);
const rustExports = rust.exports; // exportName -> rust node id
const rustExportNames = new Set(rust.exports.keys());
const wasmFiles = new Set(
  sourceFiles
    .filter((sf) => /spatial-core-pkg|spatial_core/.test(sf.getFullText()))
    .map((sf) => sf.fileName)
);
console.error(`Registered ${nodes.size} nodes (${rust.nodes.length} Rust).`);

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

// TS↔Rust boundary: a call like `mod.find_path(...)` in a file that imports the
// wasm-bindgen package is an edge into the Rust export of that name.
function maybeRustBoundary(node, ownerId) {
  const callee = node.expression;
  if (
    ts.isPropertyAccessExpression(callee) &&
    rustExportNames.has(callee.name.text) &&
    wasmFiles.has(node.getSourceFile().fileName)
  ) {
    addEdge(ownerId, rustExports.get(callee.name.text));
  }
}

// A method call on a store variable (`gameState.update(...)`, `.set`, `.subscribe`)
// is an edge into that store node — captures who writes/reads the store.
function maybeStoreEdge(node, ownerId) {
  const callee = node.expression;
  if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression)) return;
  const id = resolveTargetId(checker.getSymbolAtLocation(callee.expression));
  if (id && nodes.get(id)?.kind === 'store') addEdge(ownerId, id);
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
      else maybeRustBoundary(node, ownerId);
      maybeStoreEdge(node, ownerId);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
}

for (const { id, body } of scanList) scanCalls(body, id);

// Components: attribute every resolvable call in the whole <script> to the
// component node (UI logic lives at top level / in handlers, not just in fns).
function scanAllCalls(sf, ownerId) {
  const visit = (node) => {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const callee = node.expression;
      let sym = checker.getSymbolAtLocation(callee);
      if (!sym && ts.isPropertyAccessExpression(callee)) sym = checker.getSymbolAtLocation(callee.name);
      const targetId = resolveTargetId(sym);
      if (targetId) addEdge(ownerId, targetId);
      else maybeRustBoundary(node, ownerId);
      maybeStoreEdge(node, ownerId);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
}

// Svelte reactive reads: `$gameState` auto-subscribes to the gameState store.
// These aren't calls, so match them textually against the component's store imports.
function componentStoreReads(sf, ownerId) {
  const local = new Map(); // imported name -> store node id
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause) continue;
    const nb = st.importClause.namedBindings;
    if (nb && ts.isNamedImports(nb)) {
      for (const el of nb.elements) {
        const id = resolveTargetId(checker.getSymbolAtLocation(el.name));
        if (id && nodes.get(id)?.kind === 'store') local.set(el.name.text, id);
      }
    }
  }
  if (!local.size) return;
  const text = sf.getFullText();
  const re = /\$([A-Za-z_]\w*)/g;
  let m;
  while ((m = re.exec(text))) {
    const id = local.get(m[1]);
    if (id) addEdge(ownerId, id);
  }
}

for (const { id, sf } of componentScan) {
  scanAllCalls(sf, id);
  componentStoreReads(sf, id);
}
for (const e of rust.edges) addEdge(e.from, e.to); // intra-Rust call edges

// Test coverage: mark any node directly called from a *.test.ts file as tested.
const testFiles = program
  .getSourceFiles()
  .filter((sf) => /\.test\.ts$/.test(sf.fileName) && sf.fileName.replace(/\\/g, '/').includes('/src/'));
function markTested(sf) {
  const visit = (node) => {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const callee = node.expression;
      let sym = checker.getSymbolAtLocation(callee);
      if (!sym && ts.isPropertyAccessExpression(callee)) sym = checker.getSymbolAtLocation(callee.name);
      const id = resolveTargetId(sym);
      if (id && nodes.has(id)) nodes.get(id).tested = true;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
}
for (const sf of testFiles) markTested(sf);
console.error(`Resolved ${edges.size} edges (${testFiles.length} test files scanned).`);

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

// Full file list (incl. node-less definition files not present as module nodes).
const fnsByModule = new Map();
for (const n of nodes.values()) fnsByModule.set(n.module, (fnsByModule.get(n.module) || 0) + 1);
const fileList = [];
for (const sf of sourceFiles) {
  const mod = moduleOf(sf.fileName);
  fileList.push({
    file: rel(sf.fileName), module: mod, group: groupOf(sf.fileName),
    fns: fnsByModule.get(mod) || 0, lang: svelteVirtual.has(sf.fileName) ? 'svelte' : 'ts',
  });
}
for (const rf of new Set(rust.nodes.map((n) => n.file))) {
  const rn = rust.nodes.filter((n) => n.file === rf);
  fileList.push({ file: rf, module: rn[0].module, group: 'rust', fns: rn.length, lang: 'rust' });
}

// ADRs declared in DECISIONS.md — so the checker can flag any not onboarded.
let adrs = [];
try {
  const dec = fs.readFileSync(path.join(ROOT, '.docs/game/DECISIONS.md'), 'utf8');
  adrs = [...dec.matchAll(/^#{2,4}\s+(ADR-\d+)\b[^:\n]*:\s*(.+?)\s*$/gm)].map((m) => ({ id: m[1], title: m[2].trim() }));
} catch {
  /* no DECISIONS.md */
}

const out = {
  generatedAt: new Date().toISOString(),
  root: ROOT,
  adrs,
  stats: {
    files: fileList.length,
    functions: nodes.size,
    edges: edges.size,
    modules: moduleNodes.size
  },
  nodes: [...nodes.values()],
  edges: [...edges.values()],
  moduleNodes: [...moduleNodes.values()],
  moduleEdges: [...moduleEdges.values()],
  files: fileList
};

const outPath = path.join(__dirname, 'graph.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 0));
console.error(`Wrote ${outPath}`);
console.error(JSON.stringify(out.stats, null, 2));
