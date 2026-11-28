const INDEX_KEY = /^(?:0|[1-9]\d*)$/;
const UNSORTABLE = new Error('unsortable');
const MAX_SHAPES = 10_000;

/** @typedef {ReadonlySet<string> | undefined} Drop */

/** @type {Map<string, string[] | null>} */
const orders = new Map();
/** @type {{ keys: string[], drop: Drop, order: string[] | null }[]} */
const recent = [];

/** @param {string[]} a @param {string[]} b */
function sameKeys(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** @param {string[]} keys @param {Drop} drop @param {number} depth */
function orderOf(keys, drop, depth) {
  const hit = recent[depth];
  if (hit && hit.drop === drop && sameKeys(hit.keys, keys)) return hit.order;
  const shape = (drop ? `${[...drop].join('\u0000')}\u0001` : '') + keys.join('\u0000');
  let order = orders.get(shape);
  if (order === undefined) {
    order = keys.some((k) => INDEX_KEY.test(k) || k === '__proto__') ? null : keys.filter((k) => !drop?.has(k)).sort();
    if (orders.size >= MAX_SHAPES) orders.clear();
    orders.set(shape, order);
  }
  recent[depth] = { keys, drop, order };
  return order;
}

/** @param {unknown[]} list @param {number} depth @param {Drop} [drop] */
function copyArray(list, depth, drop) {
  const out = new Array(list.length);
  for (let i = 0; i < list.length; i++) {
    const v = list[i];
    if (v === undefined && !(i in list)) throw UNSORTABLE;
    out[i] = sortedCopy(v, depth, drop);
  }
  return out;
}

/** @param {unknown} value @param {number} depth @param {Drop} [drop] @returns {unknown} */
function sortedCopy(value, depth, drop) {
  if (value === null || typeof value !== 'object') return value;
  const record = /** @type {Record<string, unknown> & { toJSON?: () => unknown }} */ (value);
  if (typeof record.toJSON === 'function') return sortedCopy(record.toJSON(), depth);
  if (Array.isArray(record)) return copyArray(record, depth + 1);
  const order = orderOf(Object.keys(record), drop, depth);
  if (order === null) throw UNSORTABLE;
  /** @type {Record<string, unknown>} */
  const out = {};
  for (let i = 0; i < order.length; i++) out[order[i]] = sortedCopy(record[order[i]], depth + 1);
  return out;
}

/** @param {() => unknown} copy */
function viaCopy(copy) {
  try {
    return { text: JSON.stringify(copy()) };
  } catch (err) {
    if (err === UNSORTABLE) return null;
    throw err;
  }
}

/** @param {unknown} value @returns {boolean} */
const omitted = (value) => value === undefined || typeof value === 'function' || typeof value === 'symbol';

/** @param {unknown[]} list @param {Drop} drop */
function listByHand(list, drop) {
  let out = '[';
  list.forEach((v, i) => {
    if (i) out += ',';
    out += canonicalJson(v, drop) ?? 'null';
  });
  return out + ']';
}

/** @param {unknown} value @param {Drop} drop @returns {string | undefined} */
function byHand(value, drop) {
  if (omitted(value)) return undefined;
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  const record = /** @type {Record<string, unknown> & { toJSON?: () => unknown }} */ (value);
  if (typeof record.toJSON === 'function') return canonicalJson(record.toJSON());
  if (Array.isArray(record)) return listByHand(record, undefined);
  let out = '{';
  let first = true;
  for (const key of Object.keys(record).sort()) {
    if (drop?.has(key)) continue;
    const text = canonicalJson(record[key]);
    if (text === undefined) continue;
    out += `${first ? '' : ','}${JSON.stringify(key)}:${text}`;
    first = false;
  }
  return out + '}';
}

/** @param {unknown} value @param {Drop} [drop] @returns {string | undefined} */
export function canonicalJson(value, drop) {
  return viaCopy(() => sortedCopy(value, 0, drop))?.text ?? byHand(value, drop);
}

/** @param {unknown[]} row @param {Drop} [drop] @returns {string} */
export function canonicalRow(row, drop) {
  return viaCopy(() => copyArray(row, 0, drop))?.text ?? listByHand(row, drop);
}

/** @param {unknown[]} world */
function allRows(world) {
  for (let y = 0; y < world.length; y++) if (!Array.isArray(world[y])) return false;
  return true;
}

/**
 * @param {{ dynamic?: unknown, world?: unknown }} snapshot
 * @param {(chunk: string) => void} push
 * @param {Drop} [tileDrop]
 */
export function snapshotBody({ dynamic, world }, push, tileDrop) {
  let first = true;
  const field = (/** @type {string} */ name) => {
    push(`${first ? '' : ','}"${name}":`);
    first = false;
  };
  const dyn = canonicalJson(dynamic);
  if (dyn !== undefined) {
    field('dynamic');
    push(dyn);
  }
  if (Array.isArray(world) && allRows(world)) {
    field('world');
    push('[');
    for (let y = 0; y < world.length; y++) {
      if (y) push(',');
      push(canonicalRow(world[y], tileDrop));
    }
    push(']');
  } else {
    const text = canonicalJson(world);
    if (text !== undefined) {
      field('world');
      push(text);
    }
  }
  push('}');
}

export const SAVE_HEAD = '{"v":1,';
export const HASH_HEAD = '{';
