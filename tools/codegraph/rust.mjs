// @ts-check
/**
 * Lightweight Rust extractor for the WASM crates (spatial-core).
 *
 * The TypeScript compiler API obviously can't read Rust, and the TS↔Rust call
 * crosses the wasm-bindgen boundary opaquely (the wrapper casts the dynamic
 * import to a hand-written interface), so there is no type-resolvable edge.
 * This module parses the `.rs` source syntactically to give:
 *   - one node per Rust fn / impl method (group 'rust'),
 *   - intra-crate call edges (caller -> callee by name),
 *   - which fns are `#[wasm_bindgen]` exports (the boundary surface),
 * so extract.mjs can draw a TS-wrapper -> Rust edge and you can compare a Rust
 * module against the TS modules it sits next to (size, fan-in, what calls it).
 *
 * Syntactic, not type-resolved: fine for the small, self-contained spatial
 * crates. If a crate grows complex, swap this for a `syn`-based cargo tool or
 * tree-sitter-rust — same output shape, see README.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Find the index of the `}` matching the `{` at openIdx (skips comments and strings). */
function matchBrace(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i++; continue; }
    if (c === '"') { i++; while (i < src.length && src[i] !== '"') { if (src[i] === '\\') i++; i++; } continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return src.length - 1;
}

const lineAt = (src, idx) => src.slice(0, idx).split('\n').length;

/** Pull the leading `///` doc-comment block immediately above a position. */
function docAbove(lines, startLine) {
  const out = [];
  for (let i = startLine - 2; i >= 0; i--) {
    const l = lines[i].trim();
    if (l.startsWith('///') || l.startsWith('//!')) out.unshift(l.replace(/^\/\/[/!]\s?/, ''));
    else if (l.startsWith('#[') || l === '') continue; // skip attributes / blank lines
    else break;
  }
  return out.join(' ').replace(/^#.*$/g, '').replace(/\s+/g, ' ').trim();
}

const humanize = (name) =>
  name.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/**
 * @param {string} ROOT repo root
 * @param {(f:string)=>string} rel  ROOT-relative path helper
 * @returns {{nodes:any[], edges:{from:string,to:string}[], exports:Map<string,string>}}
 */
export function extractRust(ROOT, rel) {
  const crateRoots = [path.join(ROOT, 'spatial-core')].filter((d) => fs.existsSync(path.join(d, 'src')));
  const nodes = [];
  const edges = [];
  const exports = new Map();

  for (const crateDir of crateRoots) {
    const crate = path.basename(crateDir);
    const srcDir = path.join(crateDir, 'src');
    const rsFiles = fs.readdirSync(srcDir, { recursive: true })
      .map((f) => path.join(srcDir, String(f)))
      .filter((f) => f.endsWith('.rs'));

    for (const file of rsFiles) {
      const src = fs.readFileSync(file, 'utf8');
      const lines = src.split('\n');
      const moduleName = `${crate}/${path.basename(file, '.rs')}`;
      const relFile = rel(file);

      // impl blocks → map a position to its Self type (so methods get Type.name)
      const impls = [];
      const implRe = /impl\b(?:\s*<[^>]*>)?\s+(?:[A-Za-z0-9_:<>, ]+\s+for\s+)?([A-Za-z_][A-Za-z0-9_]*)/g;
      let im;
      while ((im = implRe.exec(src))) {
        const brace = src.indexOf('{', im.index);
        if (brace < 0) continue;
        impls.push({ type: im[1], start: brace, end: matchBrace(src, brace) });
      }
      const typeAt = (idx) => {
        let best = null;
        for (const b of impls) if (idx > b.start && idx < b.end && (!best || b.start > best.start)) best = b;
        return best ? best.type : null;
      };

      // function / method definitions
      const fns = [];
      const fnRe = /\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>]*>)?\s*\(/g;
      let m;
      while ((m = fnRe.exec(src))) {
        const name = m[1];
        const startLine = lineAt(src, m.index);
        // body: first { at/after the params
        const paren = src.indexOf('(', m.index);
        let depth = 0, i = paren, bodyOpen = -1;
        for (; i < src.length; i++) {
          if (src[i] === '(') depth++;
          else if (src[i] === ')') depth--;
          else if (src[i] === '{' && depth === 0) { bodyOpen = i; break; }
        }
        if (bodyOpen < 0) continue;
        const bodyEnd = matchBrace(src, bodyOpen);
        const cls = typeAt(m.index);
        const isPub = /\bpub\s+(?:async\s+|unsafe\s+|extern[^\n]*)*fn\s*$/.test(src.slice(Math.max(0, m.index - 30), m.index + 3)) ||
          /\bpub\b/.test(src.slice(lineStart(src, m.index), m.index));
        const wasm = /#\[\s*wasm_bindgen/.test(src.slice(Math.max(0, m.index - 200), m.index));
        const sig = src.slice(m.index, bodyOpen).replace(/\s+/g, ' ').trim();
        fns.push({ name, cls, startLine, bodyStart: bodyOpen, bodyEnd, isPub, wasm, sig });
      }

      const localNames = new Set(fns.map((f) => f.name));
      const idOf = (f) => `rust:${moduleName}::${f.cls ? f.cls + '.' : ''}${f.name}@${f.startLine}`;

      for (const f of fns) {
        const short = f.cls ? `${f.cls}.${f.name}` : f.name;
        const doc = docAbove(lines, f.startLine);
        const id = idOf(f);
        nodes.push({
          id, name: short, short, file: relFile, module: moduleName, group: 'rust',
          line: f.startLine, kind: f.cls ? 'method' : 'function', className: f.cls || null,
          exported: f.isPub, lang: 'rust', wasmExport: f.wasm,
          signature: f.sig.slice(0, 160),
          doc,
          humanized: humanize(f.name),
          desc: doc || `${humanize(f.name)}${f.wasm ? ' (WASM export)' : ''} — Rust.`,
          loc: lineAt(src, f.bodyEnd) - f.startLine + 1,
          chars: f.bodyEnd - f.bodyStart,
          numeric: 0,
          tested: false,
        });
        if (f.wasm) exports.set(f.name, id);
      }

      // intra-crate edges: scan each body for calls to local fn/method names
      for (const f of fns) {
        const body = src.slice(f.bodyStart, f.bodyEnd);
        const fromId = idOf(f);
        for (const g of fns) {
          if (g === f) continue;
          // `name(` for free fns, `.name(` for methods
          const re = new RegExp(`(?:\\.|\\b)${g.name}\\s*\\(`);
          if (re.test(body)) edges.push({ from: fromId, to: idOf(g) });
        }
      }
    }
  }
  return { nodes, edges, exports };
}

function lineStart(src, idx) { const i = src.lastIndexOf('\n', idx); return i + 1; }
