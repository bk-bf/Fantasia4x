import { SourceMap } from 'node:module';

const MODULE_WRAPPER = 'async (__vite_ssr_import__';
const EXPORTS_OBJECT = '__vite_ssr_exports__';
const INLINE_MAP =
  /\/\/# sourceMappingURL=data:application\/json;(?:charset=utf-8;)?base64,([A-Za-z0-9+/=]+)/g;

function lineStarts(source) {
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

function position(starts, offset) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo, column: offset - starts[lo] };
}

function inlineSourceMap(source) {
  const found = [...source.matchAll(INLINE_MAP)].pop();
  if (!found) return null;
  return new SourceMap(JSON.parse(Buffer.from(found[1], 'base64').toString('utf8')));
}

function sourceLineResolver(source) {
  const starts = lineStarts(source);
  const map = inlineSourceMap(source);
  return (offset) => {
    const pos = position(starts, offset);
    const entry = map?.findEntry(pos.line, pos.column);
    return entry && 'originalLine' in entry ? entry.originalLine + 1 : pos.line + 1;
  };
}

function spansOf(fns) {
  return fns
    .map((f) => ({
      name: f.functionName || '(anonymous)',
      start: f.ranges[0].startOffset,
      end: f.ranges[0].endOffset,
      count: f.ranges[0].count
    }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
}

function isTransformArtifact(source, s) {
  if (s.start === 0 || source.startsWith(MODULE_WRAPPER, s.start)) return true;
  if (s.name !== 'get') return false;
  const before = source.slice(Math.max(0, s.start - 300), s.start);
  const statement = before.slice(Math.max(before.lastIndexOf(';'), before.lastIndexOf('\n')) + 1);
  return statement.includes(EXPORTS_OBJECT);
}

function nestedKeys(spans) {
  const stack = [];
  const top = new Map();
  const out = [];
  for (const s of spans) {
    while (stack.length && s.start >= stack[stack.length - 1].end) stack.pop();
    const parent = stack[stack.length - 1];
    const seen = parent ? parent.seen : top;
    const nth = (seen.get(s.name) ?? 0) + 1;
    seen.set(s.name, nth);
    const own = nth > 1 ? `${s.name}#${nth}` : s.name;
    const key = parent ? `${parent.key} > ${own}` : own;
    stack.push({ end: s.end, key, seen: new Map() });
    out.push({ ...s, key });
  }
  return out;
}

export async function functionPins(coverage, sourceOf, fileOf) {
  const pins = {};
  for (const script of coverage) {
    const file = fileOf(script.url);
    if (!file || !script.functions.some((f) => f.ranges[0].count > 0)) continue;
    const source = await sourceOf(script.scriptId);
    const spans = spansOf(script.functions).filter((s) => !isTransformArtifact(source, s));
    const lineOf = sourceLineResolver(source);
    for (const s of nestedKeys(spans)) {
      if (s.count <= 0) continue;
      const key = `${file} :: ${s.key}`;
      const count = (pins[key]?.count ?? 0) + s.count;
      pins[key] = { file, line: lineOf(s.start), name: s.key, count };
    }
  }
  return pins;
}
