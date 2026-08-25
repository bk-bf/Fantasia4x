// Trigger evaluation. A rule's `trigger` is data, never code, so rules stay reviewable
// and a rule file cannot reach into the harness.
//
// The harness decides which rules apply to a symbol. The agent never sees a rule that
// did not trigger, and never gets to decide that a rule does not apply to it -- an `n/a`
// verdict must name the clause it believes failed, which is then checkable against this.

// JS has no inline (?i); rule authors write it as a prefix and it becomes the `i` flag.
function re(pattern, extra = '') {
  const ci = pattern.startsWith('(?i)');
  return new RegExp(ci ? pattern.slice(4) : pattern, extra + (ci ? 'i' : ''));
}

const clauseHandlers = {
  file_glob: (s, v) => globMatch(s.file, v),
  file_not_glob: (s, v) => !globMatch(s.file, v),
  kind_in: (s, v) => v.includes(s.kind),
  lang_in: (s, v) => v.includes(s.lang),
  layer_in: (s, v) => v.includes(s.layer),
  group_in: (s, v) => v.includes(s.grp ?? s.group),
  module_matches: (s, v) => re(v).test(s.module ?? ''),
  name_matches: (s, v) => re(v).test(s.name),
  exported: (s, v) => !!s.exported === !!v,
  tested: (s, v) => !!s.tested === !!v,
  min_loc: (s, v) => s.loc >= v,
  max_loc: (s, v) => s.loc <= v,
  flag: (s, v, ctx) => ctx.flags(s).includes(v),
  any_flag: (s, v, ctx) => v.some((f) => ctx.flags(s).includes(f)),
  no_flag: (s, v, ctx) => !ctx.flags(s).includes(v),
  matches: (s, v, ctx) => re(v, 'm').test(ctx.text(s)),
  not_matches: (s, v, ctx) => !re(v, 'm').test(ctx.text(s)),
  reachable_from: (s, v, ctx) => {
    const entries = v.entries ?? [v.entry];
    const max = v.max_hops ?? Infinity;
    return entries.some((e) => {
      const h = ctx.hops(e, s.key);
      return h !== undefined && h <= max;
    });
  },
  has_callers: (s, v, ctx) => ctx.callerCount(s.key) > 0 === !!v,
  min_callers: (s, v, ctx) => ctx.callerCount(s.key) >= v
};

function globMatch(path, pattern) {
  const pats = Array.isArray(pattern) ? pattern : [pattern];
  return pats.some((p) => new RegExp(globToRegex(p)).test(path));
}

// Hand-rolled rather than a dependency, but built by scanning tokens instead of chained
// replaces: a replace pipeline rewrites the `?` it just emitted for `(?:.*/)?`.
function globToRegex(glob) {
  let re = '^';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') {
        re += '(?:[^/]*/)*';
        i += 2;
      } else {
        re += '.*';
        i += 1;
      }
    } else if (c === '*') {
      re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else if ('.+^${}()|[]\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return re + '$';
}

/** Evaluate one trigger node. Returns { ok, failed } where `failed` names the first
 *  clause that did not hold -- that string is what an `n/a` verdict must cite. */
export function evaluate(trigger, symbol, ctx) {
  if (!trigger || Object.keys(trigger).length === 0) return { ok: true, failed: null };

  if (trigger.all) {
    for (const t of trigger.all) {
      const r = evaluate(t, symbol, ctx);
      if (!r.ok) return r;
    }
    return { ok: true, failed: null };
  }
  if (trigger.any) {
    const fails = [];
    for (const t of trigger.any) {
      const r = evaluate(t, symbol, ctx);
      if (r.ok) return { ok: true, failed: null };
      fails.push(r.failed);
    }
    return { ok: false, failed: `any(${fails.join(', ')})` };
  }
  if (trigger.not) {
    const r = evaluate(trigger.not, symbol, ctx);
    return r.ok
      ? { ok: false, failed: `not(${describe(trigger.not)})` }
      : { ok: true, failed: null };
  }

  for (const [k, v] of Object.entries(trigger)) {
    const h = clauseHandlers[k];
    if (!h) throw new Error(`unknown trigger clause: ${k}`);
    if (!h(symbol, v, ctx)) return { ok: false, failed: `${k}: ${JSON.stringify(v)}` };
  }
  return { ok: true, failed: null };
}

const describe = (t) => JSON.stringify(t);

/** Build the evaluation context once per plan, so clauses stay O(1). */
export function makeContext({ symbols, edges, reach, readSlice }) {
  const flagCache = new Map();
  const textCache = new Map();
  const hopMap = new Map();
  for (const r of reach) hopMap.set(`${r.entry} ${r.symbol_key ?? r.key}`, r.hops);
  const callerCount = new Map();
  for (const [, b] of edges) callerCount.set(b, (callerCount.get(b) ?? 0) + 1);

  return {
    flags: (s) => {
      if (!flagCache.has(s.key)) {
        flagCache.set(s.key, typeof s.flags === 'string' ? JSON.parse(s.flags) : (s.flags ?? []));
      }
      return flagCache.get(s.key);
    },
    text: (s) => {
      if (!textCache.has(s.key)) textCache.set(s.key, s.text ?? readSlice(s));
      return textCache.get(s.key);
    },
    hops: (entry, key) => hopMap.get(`${entry} ${key}`),
    callerCount: (key) => callerCount.get(key) ?? 0,
    symbols
  };
}

/** Cross rules against symbols. Returns the work items and, for auditability, the
 *  per-rule trigger-miss reason distribution. */
export function match(rules, symbols, ctx) {
  const items = [];
  const misses = new Map();
  for (const s of symbols) {
    for (const r of rules) {
      const res = evaluate(r.trigger, s, ctx);
      if (res.ok) {
        items.push({
          symbol_key: s.key,
          rule_id: r.id,
          content_hash: s.content_hash ?? s.contentHash,
          dep_hash: s.dep_hash ?? s.depHash ?? '',
          rule_hash: r.rule_hash
        });
      } else {
        const m = misses.get(r.id) ?? new Map();
        m.set(res.failed, (m.get(res.failed) ?? 0) + 1);
        misses.set(r.id, m);
      }
    }
  }
  return { items, misses };
}
