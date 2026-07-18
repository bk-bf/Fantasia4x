#!/usr/bin/env node
/**
 * threat-model.mjs — recompute every creature's grounded combat power from the SAME formulas the
 * engine uses, so the `threatLevel` (+ inline `// DPS x | effHP y | profile`) breakdown in
 * creatures.jsonc can be kept honest. This is a CONTROL for balance tweaks: change a natural-weapon
 * damage in items.jsonc, a stat/bodyScale/naturalArmor in creatures.jsonc, or a combat constant
 * below, then re-run to see the new ranking and which annotations went stale.
 *
 *   node scripts/threat-model.mjs            # print the recomputed table (sorted by threat)
 *   node scripts/threat-model.mjs --check    # compare vs committed annotations; exit 1 on drift
 *   pnpm threat        /  pnpm threat:check
 *
 * It reads the data files directly (parsing JSONC), so it is the source of truth — it does NOT
 * hardcode the roster. threatLevel is INFORMATIONAL ONLY and read by nothing at runtime; this
 * script never writes the data file, it only reports.
 *
 * MODEL (mirrors src/lib/game/systems/Combat.ts + core/Creatures.ts):
 *   DPS  = (weighted natural-weapon damage × bodyScale-bump × STR/10) × hit% × attacks/sec × on-hit
 *          effect bump, vs an UNARMORED pawn (worst case — the scary scenario).
 *   effHP= (con×5×bodyScale) blood pool / (1 − torso armour mitigation from naturalArmor).
 *   power= DPS × effHP; threatLevel = compress(power) onto 1..TOP (monotonic; raw ratios are wider).
 *   Pack size and elemental resistances are intentionally excluded (pack is its own field;
 *   resistances only bite vs typed damage). Keep this in sync if Combat.ts changes.
 */
import fs from 'node:fs';
import path from 'node:path';

const DB = path.resolve(import.meta.dirname, '../src/lib/game/database');
const CREATURES = path.join(DB, 'creatures.jsonc');
const ITEMS = path.join(DB, 'items.jsonc');
const LOOTPOOL = path.join(DB, 'lootpool.jsonc');

// §Q quality multiplier table (mirror of core/itemQuality.ts) — a geared mob's looted weapon spawns at a
// rolled quality tier, so the model scales its damage by the pool's EXPECTED tier multiplier.
const QUALITY_MULT = [0.8, 1.0, 1.15, 1.3, 1.5, 1.8];

// ── Combat constants (keep aligned with Combat.ts / stats.jsonc) ──────────────
const STAT_SCALE = 10;
const NATURAL_DAMAGE_BODYSCALE_FACTOR = 0.5;
const BASE_MELEE_HIT = 60;
const DEX_HIT_WEIGHT = 2;
const CRIT_CAP = 0.6;
const CRIT_MULT = 1.5;
const BASE_ATTACK_INTERVAL_TICKS = 120;
const MIN_ATTACK_INTERVAL_TICKS = 72;
const TPS = 60;
const ATTACKER_ARMOR_PEN = 0.12; // representative player early-weapon armorPen vs creature hide
const TOP = 58; // mammoth pins here today; leaves 1..100 headroom for future apex threats
const COMPRESS = 0.55; // power → threat exponent (raw power ratios are ~70× across the roster)

// On-hit conditions add danger the raw DPS misses; bump the creature's score by these factors.
const ONHIT_BUMP = { envenomed: 1.3, bloodletting: 1.25, disoriented: 1.08, ensnared: 1.08 };

// ── Tiny JSONC reader (strip // and /* */ comments + trailing commas, respecting strings) ─────
function parseJsonc(text) {
  let out = '';
  let inStr = false;
  let q = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (inStr) {
      out += c;
      if (c === '\\') {
        out += text[++i] ?? '';
      } else if (c === q) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = true;
      q = c;
      out += c;
      continue;
    }
    if (c === '/' && n === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
      continue;
    }
    if (c === '/' && n === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
      continue;
    }
    out += c;
  }
  out = out.replace(/,(\s*[}\]])/g, '$1'); // trailing commas
  return JSON.parse(out);
}

// ── Load data ─────────────────────────────────────────────────────────────────
const creatures = parseJsonc(fs.readFileSync(CREATURES, 'utf8'));
const items = parseJsonc(fs.readFileSync(ITEMS, 'utf8'));
const lootpools = parseJsonc(fs.readFileSync(LOOTPOOL, 'utf8')).pools ?? {};
const WEAPONS = new Map();
for (const it of items) {
  // Index EVERY weapon (natural + crafted/looted), so a geared humanoid's wielded weapon resolves too
  // (§4b/threat: an armed orc must read as strong as it fights, not as an unarmed baseline).
  if (it.weaponProperties) {
    // ADR-029: procs live in `onHitCondition` (condition layer) + `onHitWound` (injury layer —
    // bloodletting rides there now, folded into the same danger bump).
    WEAPONS.set(it.id, {
      ...it.weaponProperties,
      onHitCondition: it.onHitCondition,
      onHitWound: it.onHitWound
    });
  }
}

// A geared humanoid (Combat.attackerProfile) swings its equipped mainHand weapon INSTEAD of natural
// weapons — with no bodyScale bump (that scales natural weapons only). Return the expected wielded-weapon
// damage-per-landed-hit + danger bump for a creature's lootpool, blended by the mainHand slot `chance`
// against its natural fallback. Null when the creature has no pool / no mainHand slot.
function expectedWieldedDamage(lootPool, str, dex, per) {
  const pool = lootPool ? lootpools[lootPool] : null;
  const mh = pool?.slots?.mainHand;
  if (!mh || !mh.pick?.length) return null;
  const qmult = expectedQualityMult(pool);
  let dmgW = 0;
  let wsum = 0;
  let bump = 1;
  for (const pk of mh.pick) {
    const w = WEAPONS.get(pk.id);
    if (!w) continue;
    const wt = Math.max(0, pk.w ?? 1);
    const { dmg, bump: b } = weaponDamage(w, str, dex, per, 1, false);
    dmgW += dmg * qmult * wt;
    wsum += wt;
    bump = Math.max(bump, b);
  }
  if (wsum <= 0) return null;
  return { dmgPerLanded: dmgW / wsum, bump, chance: mh.chance ?? 1 };
}

// Expected §Q quality multiplier for a pool's drawn pieces (weighted by its `quality` table; default 1.0).
function expectedQualityMult(pool) {
  const table = pool.quality;
  if (!table || table.length === 0) return 1.0;
  let tw = 0;
  let acc = 0;
  for (const [q, w] of table) {
    const ww = Math.max(0, w);
    tw += ww;
    acc += ww * (QUALITY_MULT[q] ?? 1.0);
  }
  return tw > 0 ? acc / tw : 1.0;
}

// One weapon's damage-per-landed-hit (crit-weighted) + on-hit danger bump. `isNatural` applies the
// bodyScale bump (natural weapons only, per Combat.ts:509-512); a wielded weapon ignores bodyScale.
function weaponDamage(w, str, dex, per, scale, isNatural) {
  const bd = w.damage * (isNatural ? 1 + (scale - 1) * NATURAL_DAMAGE_BODYSCALE_FACTOR : 1);
  const raw = (bd * str) / STAT_SCALE;
  let crit = 0.05 + (dex - 10) * 0.005 + (per - 10) * 0.0025 + (w.critMod ?? 0);
  crit = Math.max(0, Math.min(CRIT_CAP, crit));
  let bump = 1;
  if (w.onHitCondition) bump = Math.max(bump, ONHIT_BUMP[w.onHitCondition.condition] ?? 1);
  if (w.onHitWound?.some((x) => x.wound === 'bloodletting'))
    bump = Math.max(bump, ONHIT_BUMP.bloodletting);
  return { dmg: raw * (1 + crit * 0.5), bump };
}

// A creature authors EITHER a fixed `stats` block OR a symmetric `statRanges` band (an individual rolls
// within it at spawn — CREATURE-COMBAT-OVERHAUL §2a). The model uses the band MIDPOINT (the intended
// average) so the ranking tracks the typical individual.
function midStats(c) {
  if (c.stats) return c.stats;
  const sr = c.statRanges ?? {};
  const mid = (r, f) => (Array.isArray(r) ? Math.round((r[0] + r[1]) / 2) : f);
  return { str: mid(sr.str, 10), dex: mid(sr.dex, 10), con: mid(sr.con, 10), per: mid(sr.per, 10) };
}

// ── Per-creature model ──────────────────────────────────────────────────────────
function model(c) {
  const { str, dex, con, per } = midStats(c);
  const scale = c.bodyScale ?? 1;
  const arm = c.naturalArmor ?? 0;
  const wpns = c.naturalWeapons ?? [];

  let dmgW = 0;
  let wsum = 0;
  let natBump = 1;
  for (const id of wpns) {
    const w = WEAPONS.get(id);
    if (!w) continue;
    const wt = Math.max(0, w.weight ?? 1);
    const { dmg, bump } = weaponDamage(w, str, dex, per, scale, true);
    dmgW += dmg * wt;
    wsum += wt;
    natBump = Math.max(natBump, bump);
  }
  const natDmgPerLanded = wsum > 0 ? dmgW / wsum : 0;

  // §4b/threat: a geared humanoid swings its looted weapon `chance` of the time (natural fallback
  // otherwise). Blend the two damage×danger contributions so an armed orc scores as it actually fights.
  const wielded = expectedWieldedDamage(c.lootPool, str, dex, per);
  let contribution = natDmgPerLanded * natBump;
  if (wielded) {
    const wpn = wielded.dmgPerLanded * wielded.bump;
    contribution = wielded.chance * wpn + (1 - wielded.chance) * contribution;
  }

  const hit = Math.max(5, Math.min(95, BASE_MELEE_HIT + (dex - 10) * DEX_HIT_WEIGHT)) / 100;
  const aspd = Math.max(0.1, 1 + (dex - 10) * 0.03);
  const interval = Math.max(MIN_ATTACK_INTERVAL_TICKS, BASE_ATTACK_INTERVAL_TICKS / aspd);
  const aps = TPS / interval;
  const dps = contribution * hit * aps;

  const pool = con * 5 * scale;
  const torsoMitig = Math.min(0.9, (arm / 100) * (1 - ATTACKER_ARMOR_PEN));
  const effHP = pool / (1 - torsoMitig);

  return { id: c.id, dps, effHP, power: dps * effHP };
}

function profile(dps, effHP) {
  const r = dps / effHP;
  if (dps >= 12 && effHP >= 150) return 'bruiser';
  if (effHP >= 90 && r <= 0.09) return 'tank';
  if (dps >= 6 && r >= 0.18) return 'glass-cannon';
  if (dps < 3 && effHP < 60) return 'harmless';
  return 'skirmisher';
}

const rows = creatures.map(model);
const maxP = Math.max(...rows.map((r) => r.power));
for (const r of rows) {
  r.threat = Math.max(1, Math.round(TOP * Math.pow(r.power / maxP, COMPRESS)));
  r.dpsR = Math.round(r.dps * 10) / 10;
  r.effHPR = Math.round(r.effHP);
  r.profile = profile(r.dps, r.effHP);
}

// ── --check: compare against the committed inline annotations + threatLevel ─────
function readAnnotations() {
  const raw = fs.readFileSync(CREATURES, 'utf8');
  const ann = new Map();
  // Walk entries: capture id, then the threatLevel line + its inline breakdown comment.
  const re =
    /"id"\s*:\s*"([^"]+)"[\s\S]*?"threatLevel"\s*:\s*(\d+)\s*,?\s*(?:\/\/\s*DPS\s*([\d.]+)\s*\|\s*effHP\s*(\d+)\s*\|\s*([a-z-]+))?/g;
  let m;
  while ((m = re.exec(raw))) {
    ann.set(m[1], {
      threat: m[2] != null ? Number(m[2]) : null,
      dps: m[3] != null ? Number(m[3]) : null,
      effHP: m[4] != null ? Number(m[4]) : null,
      profile: m[5] ?? null
    });
  }
  return ann;
}

const args = process.argv.slice(2);
if (args.includes('--check')) {
  const ann = readAnnotations();
  const drift = [];
  for (const r of rows) {
    const a = ann.get(r.id);
    if (!a) {
      drift.push(`${r.id}: no committed annotation found`);
      continue;
    }
    const issues = [];
    if (a.threat !== r.threat) issues.push(`threatLevel ${a.threat} → ${r.threat}`);
    if (a.dps == null || Math.abs(a.dps - r.dpsR) > 0.05) issues.push(`DPS ${a.dps} → ${r.dpsR}`);
    if (a.effHP !== r.effHPR) issues.push(`effHP ${a.effHP} → ${r.effHPR}`);
    if (a.profile !== r.profile) issues.push(`profile ${a.profile} → ${r.profile}`);
    if (issues.length) drift.push(`${r.id}: ${issues.join(', ')}`);
  }
  if (drift.length) {
    console.error(`✗ ${drift.length} creature(s) drifted from the committed annotations:\n`);
    for (const d of drift) console.error('  ' + d);
    console.error(
      '\nUpdate the inline `// DPS x | effHP y | profile` + threatLevel in creatures.jsonc.'
    );
    process.exit(1);
  }
  console.log(`✓ all ${rows.length} creatures match their committed threatLevel annotations.`);
  process.exit(0);
}

// ── Default: print the recomputed table sorted by threat ────────────────────────
rows.sort((a, b) => a.threat - b.threat);
console.log('id'.padEnd(18), 'thr'.padStart(3), 'DPS'.padStart(6), 'effHP'.padStart(6), 'profile');
for (const r of rows) {
  console.log(
    r.id.padEnd(18),
    String(r.threat).padStart(3),
    String(r.dpsR.toFixed(1)).padStart(6),
    String(r.effHPR).padStart(6),
    r.profile
  );
}
console.log(
  `\nmodel: DPS vs unarmored pawn · effHP @ attackerPen ${ATTACKER_ARMOR_PEN} · ` +
    `threat = compress(DPS×effHP)^${COMPRESS} → max ${TOP}. Pack & resistances excluded.`
);
