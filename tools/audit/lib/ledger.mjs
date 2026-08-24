// SQLite ledger: open/migrate, atomic claim, verdict submission, coverage queries.
// Uses node:sqlite (Node >= 22.5) so the tool needs no native dependency.

import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const TOOL_DIR = join(HERE, '..');
export const DB_PATH = process.env.AUDIT_DB || join(TOOL_DIR, '.ledger', 'audit.db');

export const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
export const nowIso = () => new Date().toISOString();

export function open(path = DB_PATH) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(readFileSync(join(TOOL_DIR, 'schema.sql'), 'utf8'));
  db.exec('PRAGMA busy_timeout = 10000');
  return db;
}

// --- symbols -----------------------------------------------------------------

export function replaceSymbols(db, symbols) {
  const ts = nowIso();
  const up = db.prepare(`
    INSERT INTO symbol (key,file,module,grp,layer,lang,name,class_name,kind,exported,tested,
                        start_line,end_line,start_byte,end_byte,loc,chars,content_hash,dep_hash,
                        flags,signature,first_seen,last_seen,alive)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
    ON CONFLICT(key) DO UPDATE SET
      file=excluded.file, module=excluded.module, grp=excluded.grp, layer=excluded.layer,
      lang=excluded.lang, name=excluded.name, class_name=excluded.class_name, kind=excluded.kind,
      exported=excluded.exported, tested=excluded.tested,
      start_line=excluded.start_line, end_line=excluded.end_line,
      start_byte=excluded.start_byte, end_byte=excluded.end_byte,
      loc=excluded.loc, chars=excluded.chars, content_hash=excluded.content_hash,
      flags=excluded.flags, signature=excluded.signature, last_seen=excluded.last_seen, alive=1
  `);
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`UPDATE symbol SET alive = 0`);
    for (const s of symbols) {
      up.run(
        s.key, s.file, s.module ?? null, s.group ?? null, s.layer ?? null, s.lang,
        s.name, s.className ?? null, s.kind, s.exported ? 1 : 0, s.tested ? 1 : 0,
        s.startLine, s.endLine, s.startByte, s.endByte, s.loc, s.chars, s.contentHash,
        s.depHash ?? '', JSON.stringify(s.flags ?? []), s.signature ?? null, ts, ts
      );
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function setDepHashes(db, pairs) {
  const up = db.prepare('UPDATE symbol SET dep_hash = ? WHERE key = ?');
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const [key, h] of pairs) up.run(h, key);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function replaceEdges(db, edges) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('DELETE FROM symbol_edge');
    const ins = db.prepare('INSERT OR IGNORE INTO symbol_edge (caller,callee) VALUES (?,?)');
    for (const [a, b] of edges) ins.run(a, b);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function replaceReach(db, rows) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('DELETE FROM reach');
    const ins = db.prepare('INSERT OR REPLACE INTO reach (entry,symbol_key,hops) VALUES (?,?,?)');
    for (const r of rows) ins.run(r.entry, r.key, r.hops);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function liveSymbols(db) {
  return db.prepare('SELECT * FROM symbol WHERE alive = 1').all();
}

// --- rules -------------------------------------------------------------------

export function ruleHash(r) {
  return sha(JSON.stringify([r.question, r.trigger, r.fail_requires ?? [], r.not_a_finding ?? []]));
}

export function upsertRules(db, rules) {
  const ts = nowIso();
  const up = db.prepare(`
    INSERT INTO rule (id,family,tier,title,authority,question,fail_requires,not_a_finding,
                      trigger_json,demotable,status,demoted_to,rule_hash,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      family=excluded.family, tier=excluded.tier, title=excluded.title,
      authority=excluded.authority, question=excluded.question,
      fail_requires=excluded.fail_requires, not_a_finding=excluded.not_a_finding,
      trigger_json=excluded.trigger_json, demotable=excluded.demotable,
      status=excluded.status, demoted_to=excluded.demoted_to,
      rule_hash=excluded.rule_hash, updated_at=excluded.updated_at
  `);
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const r of rules) {
      up.run(
        r.id, r.family, r.tier ?? 'T2', r.title, r.authority ?? null, r.question,
        JSON.stringify(r.fail_requires ?? []), JSON.stringify(r.not_a_finding ?? []),
        JSON.stringify(r.trigger ?? {}), r.demotable === false ? 0 : 1,
        r.status ?? 'active', r.demoted_to ?? null, ruleHash(r), ts
      );
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function activeRules(db, tier = 'T2') {
  return db
    .prepare(`SELECT * FROM rule WHERE status = 'active' AND tier = ?`)
    .all(tier)
    .map((r) => ({ ...r, trigger: JSON.parse(r.trigger_json) }));
}

// --- work planning -----------------------------------------------------------

/** Rebuild `work` from the trigger matches. Rows already satisfied by a verdict at the
 *  same hash triple are marked done; everything else is pending. Claims on rows whose
 *  hashes moved are dropped, so an in-flight agent can never write a stale verdict. */
export function plan(db, matches) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('DELETE FROM work');
    const ins = db.prepare(`
      INSERT INTO work (symbol_key, rule_id, content_hash, dep_hash, rule_hash, state)
      VALUES (?,?,?,?,?, CASE WHEN EXISTS (
        SELECT 1 FROM verdict v
         WHERE v.symbol_key = ? AND v.rule_id = ? AND v.content_hash = ?
           AND v.dep_hash = ? AND v.rule_hash = ?
      ) THEN 'done' ELSE 'pending' END)
    `);
    for (const m of matches) {
      ins.run(m.symbol_key, m.rule_id, m.content_hash, m.dep_hash, m.rule_hash,
              m.symbol_key, m.rule_id, m.content_hash, m.dep_hash, m.rule_hash);
    }
    db.exec(`
      DELETE FROM claim WHERE NOT EXISTS (
        SELECT 1 FROM work w
         WHERE w.symbol_key = claim.symbol_key AND w.rule_id = claim.rule_id
           AND w.state = 'claimed')
    `);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/** Atomically claim every pending rule for ONE symbol. The source slice dominates the
 *  prompt, so paying for it once per symbol instead of once per rule is where the batching
 *  saving comes from. Safe across processes: BEGIN IMMEDIATE takes the write lock, and the
 *  per-row `changes()` check means two workers cannot both win the same item. */
export function claimBatch(db, { worker, runId, limit = 40, leaseMinutes = 30, file = null, symbol = null }) {
  const ts = Date.now();
  const claimedAt = new Date(ts).toISOString();
  const expiresAt = new Date(ts + leaseMinutes * 60_000).toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`DELETE FROM claim WHERE expires_at < ?`).run(claimedAt);
    db.exec(`
      UPDATE work SET state = 'pending'
       WHERE state = 'claimed'
         AND NOT EXISTS (SELECT 1 FROM claim c
                          WHERE c.symbol_key = work.symbol_key AND c.rule_id = work.rule_id)
    `);

    let target = symbol;
    if (!target) {
      target = file
        ? db.prepare(`
            SELECT w.symbol_key k FROM work w JOIN symbol s ON s.key = w.symbol_key
             WHERE w.state = 'pending' AND s.file = ?
             ORDER BY w.symbol_key LIMIT 1`).get(file)?.k
        : db.prepare(`
            SELECT symbol_key k FROM work
             WHERE state = 'pending' ORDER BY symbol_key LIMIT 1`).get()?.k;
    }
    if (!target) { db.exec('COMMIT'); return []; }

    const pick = db.prepare(`
      SELECT * FROM work WHERE state = 'pending' AND symbol_key = ?
       ORDER BY rule_id LIMIT ?`).all(target, limit);

    const mark = db.prepare(`UPDATE work SET state='claimed', attempts=attempts+1
                              WHERE symbol_key=? AND rule_id=? AND state='pending'`);
    const ins = db.prepare(`INSERT OR REPLACE INTO claim
      (symbol_key,rule_id,worker,run_id,claimed_at,expires_at) VALUES (?,?,?,?,?,?)`);
    const got = [];
    for (const w of pick) {
      if (mark.run(w.symbol_key, w.rule_id).changes === 1) {
        ins.run(w.symbol_key, w.rule_id, worker, runId ?? null, claimedAt, expiresAt);
        got.push(w);
      }
    }
    db.exec('COMMIT');
    return got;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function releaseClaims(db, worker) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const rows = db.prepare('SELECT symbol_key, rule_id FROM claim WHERE worker = ?').all(worker);
    const back = db.prepare(`UPDATE work SET state='pending'
                              WHERE symbol_key=? AND rule_id=? AND state='claimed'`);
    for (const r of rows) back.run(r.symbol_key, r.rule_id);
    db.prepare('DELETE FROM claim WHERE worker = ?').run(worker);
    db.exec('COMMIT');
    return rows.length;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/** Write verdicts. Rejects any row whose hash triple no longer matches the work item —
 *  that is the guard against an agent reporting on source that moved under it. */
export function submit(db, verdicts, { worker, runId, model }) {
  const ts = nowIso();
  const accepted = [];
  const rejected = [];
  const ins = db.prepare(`
    INSERT OR REPLACE INTO verdict
      (symbol_key,rule_id,content_hash,dep_hash,rule_hash,status,evidence,na_clause,missing,
       summary,tier,model,worker,run_id,tokens,ms,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const done = db.prepare(`UPDATE work SET state='done' WHERE symbol_key=? AND rule_id=?`);
  const unclaim = db.prepare('DELETE FROM claim WHERE symbol_key=? AND rule_id=?');
  const cur = db.prepare(`SELECT content_hash, dep_hash, rule_hash FROM work
                           WHERE symbol_key=? AND rule_id=?`);
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const v of verdicts) {
      const w = cur.get(v.symbol_key, v.rule_id);
      if (!w || w.content_hash !== v.content_hash || w.dep_hash !== v.dep_hash ||
          w.rule_hash !== v.rule_hash) {
        rejected.push({ ...v, reason: w ? 'hash moved since claim' : 'no such work item' });
        continue;
      }
      ins.run(v.symbol_key, v.rule_id, v.content_hash, v.dep_hash, v.rule_hash, v.status,
              JSON.stringify(v.evidence ?? []), v.na_clause ?? null, v.missing ?? null,
              v.summary ?? null, v.tier ?? 'T2', model ?? null, worker ?? null,
              runId ?? null, v.tokens ?? null, v.ms ?? null, ts);
      done.run(v.symbol_key, v.rule_id);
      unclaim.run(v.symbol_key, v.rule_id);
      accepted.push(v);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { accepted, rejected };
}

export function openFindings(db, verdicts) {
  const ts = nowIso();
  const ins = db.prepare(`INSERT OR IGNORE INTO finding
    (id,verdict_id,symbol_key,rule_id,summary,evidence,state,created_at)
    VALUES (?,?,?,?,?,?, 'open', ?)`);
  const vid = db.prepare(`SELECT id FROM verdict WHERE symbol_key=? AND rule_id=?
                           AND content_hash=? ORDER BY id DESC LIMIT 1`);
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const v of verdicts.filter((x) => x.status === 'fail')) {
      const row = vid.get(v.symbol_key, v.rule_id, v.content_hash);
      if (!row) continue;
      const id = `${v.rule_id}:${sha(v.symbol_key)}`;
      ins.run(id, row.id, v.symbol_key, v.rule_id, v.summary ?? '',
              JSON.stringify(v.evidence ?? []), ts);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// --- reporting ---------------------------------------------------------------

export function coverage(db) {
  const total = db.prepare(`SELECT count(*) n FROM work`).get().n;
  const done = db.prepare(`SELECT count(*) n FROM work WHERE state='done'`).get().n;
  const claimed = db.prepare(`SELECT count(*) n FROM work WHERE state='claimed'`).get().n;
  const byStatus = db.prepare(`
    SELECT v.status, count(*) n FROM work w
      JOIN verdict v ON v.symbol_key=w.symbol_key AND v.rule_id=w.rule_id
       AND v.content_hash=w.content_hash AND v.dep_hash=w.dep_hash AND v.rule_hash=w.rule_hash
     GROUP BY v.status`).all();
  const symbols = db.prepare(`SELECT count(*) n FROM symbol WHERE alive=1`).get().n;
  const touched = db.prepare(`
    SELECT count(DISTINCT w.symbol_key) n FROM work w WHERE w.state='done'`).get().n;
  const inScope = db.prepare(`SELECT count(DISTINCT symbol_key) n FROM work`).get().n;
  return { total, done, claimed, pending: total - done - claimed, byStatus, symbols, inScope, touched };
}

export function perRule(db) {
  return db.prepare(`
    SELECT r.id, r.family, r.title, r.status, r.demotable,
           sum(w.state='done') done, count(*) total,
           sum(v.status='fail') fails, sum(v.status='undecidable') undecidable,
           sum(v.status='n/a') na
      FROM rule r LEFT JOIN work w ON w.rule_id = r.id
      LEFT JOIN verdict v ON v.symbol_key=w.symbol_key AND v.rule_id=w.rule_id
       AND v.content_hash=w.content_hash AND v.dep_hash=w.dep_hash AND v.rule_hash=w.rule_hash
     GROUP BY r.id ORDER BY r.id`).all();
}
