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
const WEAPONS = new Map();
for (const it of items) {
  if (it.category === 'natural_weapon' && it.weaponProperties) {
    // ADR-029: procs live in `onHitCondition` (condition layer) + `onHitWound` (injury layer —
    // bloodletting rides there now, folded into the same danger bump).
    WEAPONS.set(it.id, {
      ...it.weaponProperties,
      onHitCondition: it.onHitCondition,
      onHitWound: it.onHitWound
    });
  }
}

// ── Per-creature model ──────────────────────────────────────────────────────────
function model(c) {
  const { str, dex, con, per } = c.stats;
  const scale = c.bodyScale ?? 1;
  const arm = c.naturalArmor ?? 0;
  const wpns = c.naturalWeapons ?? [];

  let dmgW = 0;
  let wsum = 0;
  let effBump = 1;
  for (const id of wpns) {
    const w = WEAPONS.get(id);
    if (!w) continue;
    const wt = Math.max(0, w.weight ?? 1);
    const bd = w.damage * (1 + (scale - 1) * NATURAL_DAMAGE_BODYSCALE_FACTOR);
    const raw = (bd * str) / STAT_SCALE;
    let crit = 0.05 + (dex - 10) * 0.005 + (per - 10) * 0.0025 + (w.critMod ?? 0);
    crit = Math.max(0, Math.min(CRIT_CAP, crit));
    dmgW += raw * (1 + crit * 0.5) * wt;
    wsum += wt;
    if (w.onHitCondition)
      effBump = Math.max(effBump, ONHIT_BUMP[w.onHitCondition.condition] ?? 1);
    if (w.onHitWound?.some((x) => x.wound === 'bloodletting'))
      effBump = Math.max(effBump, ONHIT_BUMP.bloodletting);
  }
  const dmgPerLanded = wsum > 0 ? dmgW / wsum : 0;
  const hit = Math.max(5, Math.min(95, BASE_MELEE_HIT + (dex - 10) * DEX_HIT_WEIGHT)) / 100;
  const aspd = Math.max(0.1, 1 + (dex - 10) * 0.03);
  const interval = Math.max(MIN_ATTACK_INTERVAL_TICKS, BASE_ATTACK_INTERVAL_TICKS / aspd);
  const aps = TPS / interval;
  const dps = dmgPerLanded * hit * aps * effBump;

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
    console.error('\nUpdate the inline `// DPS x | effHP y | profile` + threatLevel in creatures.jsonc.');
    process.exit(1);
  }
  console.log(`✓ all ${rows.length} creatures match their committed threatLevel annotations.`);
  process.exit(0);
}

// ── Default: print the recomputed table sorted by threat ────────────────────────
rows.sort((a, b) => a.threat - b.threat);
console.log(
  'id'.padEnd(18),
  'thr'.padStart(3),
  'DPS'.padStart(6),
  'effHP'.padStart(6),
  'profile'
);
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
