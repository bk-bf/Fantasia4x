// @ts-nocheck
const symbolIdentity = (key) => {
  const plain = key.replace(/^\[`([^`]+)`\]\([^)]*\)/, '$1');
  const at = plain.indexOf('::');
  return at < 0 ? plain : `${plain.slice(0, at).split('/').pop()}${plain.slice(at)}`;
};

export function planGeneration(baseId, issues, findings) {
  const later = new RegExp(`^${baseId}-\\d+$`);
  const generations = issues.filter((i) => i.data.id === baseId || later.test(i.data.id));
  const closed = generations.filter((i) => i.data.status === 'closed');
  const current = generations.find((i) => i.data.status !== 'closed') ?? null;
  const coveredBy = new Map();
  for (const i of closed) {
    for (const s of i.data.symbols) coveredBy.set(symbolIdentity(s), i.path);
  }
  const coveringPath = (f) => coveredBy.get(symbolIdentity(f.symbol_key));
  const own = findings.filter((f) => !coveringPath(f));
  const settled = new Map();
  for (const f of findings) {
    const path = coveringPath(f);
    if (path) settled.set(path, [...(settled.get(path) ?? []), f]);
  }
  const id =
    current?.data.id ?? (generations.length ? `${baseId}-${generations.length + 1}` : baseId);
  return { id, current, closed, own, settled };
}
