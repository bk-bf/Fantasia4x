// Verdict validation. The evidence contract is enforced here, not in the prompt: a `fail`
// without the evidence its rule demands is rejected and the work item stays open.
// This is what stops "audited" from meaning "an agent said something".

const STATUSES = new Set(['pass', 'fail', 'n/a', 'undecidable']);

export function parseResponse(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('no JSON object in response');
  return JSON.parse(raw.slice(start, end + 1));
}

/** Validate the model's answer against the rules that were actually handed to it.
 *  Returns { ok, rejected }; rejected entries name why, and are written to the run log. */
export function validate(parsed, { expectedRules, symbolKey, hashes }) {
  const ok = [];
  const rejected = [];
  const byId = new Map(expectedRules.map((r) => [r.id, r]));
  const seen = new Set();

  for (const v of parsed?.verdicts ?? []) {
    const rule = byId.get(v.rule_id);
    if (!rule) {
      rejected.push({ rule_id: v.rule_id, reason: 'rule was not part of this batch' });
      continue;
    }
    if (seen.has(v.rule_id)) {
      rejected.push({ rule_id: v.rule_id, reason: 'duplicate verdict for the same rule' });
      continue;
    }
    seen.add(v.rule_id);

    if (!STATUSES.has(v.status)) {
      rejected.push({ rule_id: v.rule_id, reason: `bad status: ${v.status}` });
      continue;
    }
    const required = JSON.parse(rule.fail_requires);
    if (v.status === 'fail') {
      const ev = (v.evidence ?? []).filter((x) => typeof x === 'string' && x.trim().length > 3);
      if (ev.length < required.length) {
        rejected.push({
          rule_id: v.rule_id,
          reason: `fail supplied ${ev.length} of ${required.length} required evidence items`
        });
        continue;
      }
      if (!v.summary || v.summary.trim().length < 8) {
        rejected.push({ rule_id: v.rule_id, reason: 'fail without a summary' });
        continue;
      }
    }
    if (v.status === 'n/a' && !v.na_clause) {
      rejected.push({ rule_id: v.rule_id, reason: 'n/a without naming the trigger clause' });
      continue;
    }
    if (v.status === 'undecidable' && !v.missing) {
      rejected.push({ rule_id: v.rule_id, reason: 'undecidable without naming what was missing' });
      continue;
    }

    ok.push({
      symbol_key: symbolKey,
      rule_id: v.rule_id,
      status: v.status,
      summary: v.summary ?? null,
      evidence: v.evidence ?? [],
      na_clause: v.na_clause ?? null,
      missing: v.missing ?? null,
      ...hashes.get(v.rule_id)
    });
  }

  for (const r of expectedRules) {
    if (!seen.has(r.id)) rejected.push({ rule_id: r.id, reason: 'no verdict returned for this rule' });
  }
  return { ok, rejected };
}
