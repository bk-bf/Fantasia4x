// KingdomService (KINGDOMS-TRADE) — the world political layer's runtime logic:
//   · daily facet drift (leaders die, wealth shifts, famed items change hands) — what makes
//     revealed knowledge go stale (§2)
//   · hidden knowledge xp + contact snapshots (tiered lore reveal, staleness)
//   · visitor/caravan cadence + arrival scheduling, weighted by relations AND colony wealth (§3)
//   · barter pricing: item values shifted by the trading pawn's `trade` stat and by kingdom
//     relations — gold bars anchor (skill/relation-independent) (§4)
// Runs once per in-game DAY from the engine's events phase — never per tick (no hot-path cost).

import type {
  CaravanGood,
  GameState,
  Item,
  Kingdom,
  KingdomParty,
  KingdomRelation,
  Mob
} from '../core/types';
import { COLONY_RELATION_ID } from '../core/types';
import {
  WEALTH_BANDS,
  dispositionForScore,
  findKingdomRelation,
  generateFamedItemName,
  generateLeaderName,
  knowledgeTier,
  stepWealthBand
} from '../core/Kingdom';
import { allItemDefs, itemDefById } from '../core/itemDefs';
import { baseItemValue } from '../core/itemValue';
import { clamp } from '../core/math';
import { rng } from '../core/rng';
import { TICKS_PER_SECOND } from '../core/time';
import { TURNS_PER_DAY } from './EnvironmentService';
import { spawnKingdomParty, despawnKingdomParty } from './entity/kingdomParties';

const TICKS_PER_DAY = TURNS_PER_DAY * TICKS_PER_SECOND;

/** Mutable-facet knowledge greys out after ~a month without contact (§2). */
const STALE_AFTER_TICKS = 30 * TICKS_PER_DAY;

/** Base arrival cadence (~bi-weekly), squeezed by relations + colony wealth. */
const BASE_CADENCE_DAYS = 14;

/** Knowledge xp awards. */
export const KNOWLEDGE_XP = {
  arrival: 6, // a party arrives and is received
  presencePerDay: 2, // pawns mingle while a party is on the map
  tradeCompleted: 8 // a barter deal closed (scaled by the pawn's trade stat)
};

/** Colony-wealth tier 0–4 (mirrors kingdom wealth bands) from total stockpile value. */
const WEALTH_TIER_THRESHOLDS = [0, 300, 1000, 3000, 8000];

class KingdomServiceImpl {
  // ─── Daily tick (events phase) ─────────────────────────────────────────────

  /** Everything kingdom-flavoured that happens once per in-game day. */
  processKingdomsDaily(state: GameState): GameState {
    if (!state.kingdoms || state.kingdoms.length === 0) return state;
    let s = state;
    s = this.driftFacets(s);
    s = this.tickParties(s);
    s = this.maybeScheduleArrival(s);
    return s;
  }

  /** Mutable facets drift: successions, fortunes, treasures changing hands (§1/§2). */
  private driftFacets(state: GameState): GameState {
    let changed = false;
    const kingdoms = state.kingdoms!.map((k) => {
      let lore = k.lore;
      if (rng.random() < 1 / 120) {
        lore = { ...lore, leaderName: generateLeaderName(k.relationBias === 'always_hostile') };
      }
      if (rng.random() < 1 / 90) {
        lore = { ...lore, wealthBand: stepWealthBand(lore.wealthBand, rng.random() < 0.5 ? 1 : -1) };
      }
      if (rng.random() < 1 / 100) {
        const famed = { created: [...lore.famedItems.created], held: [...lore.famedItems.held] };
        if (famed.held.length > 0 && rng.random() < 0.6) {
          famed.held[rng.int(0, famed.held.length - 1)] = generateFamedItemName();
        } else {
          famed.held.push(generateFamedItemName());
        }
        lore = { ...lore, famedItems: famed };
      }
      if (lore === k.lore) return k;
      changed = true;
      return { ...k, lore };
    });
    return changed ? { ...state, kingdoms } : state;
  }

  /** Party upkeep: passive contact/knowledge while present, departure on schedule or wipe. */
  private tickParties(state: GameState): GameState {
    const parties = state.kingdomParties;
    if (!parties || parties.length === 0) return state;
    let s = state;
    for (const party of parties) {
      const members = (s.mobs ?? []).filter((m) => party.mobIds.includes(m.id));
      const anyAlive = members.some((m) => m.isAlive !== false);
      if (!anyAlive || s.turn >= party.departTurn) {
        s = despawnKingdomParty(s, party.id);
        continue;
      }
      s = this.recordContact(s, party.kingdomId, KNOWLEDGE_XP.presencePerDay);
    }
    return s;
  }

  /** Roll the next visitor/caravan arrival when the cadence clock comes due (§3). */
  private maybeScheduleArrival(state: GameState): GameState {
    const turn = state.turn;
    if (state.nextKingdomVisitTurn == null) {
      // First-ever clock: give the young colony a few quiet days.
      return { ...state, nextKingdomVisitTurn: turn + rng.int(4, 8) * TICKS_PER_DAY };
    }
    if (turn < state.nextKingdomVisitTurn) return state;
    // One party at a time, and never while another decision is pending.
    if (state.pendingEvent || (state.kingdomParties?.length ?? 0) > 0) {
      return { ...state, nextKingdomVisitTurn: turn + TICKS_PER_DAY };
    }

    const eligible = this.eligibleSenders(state);
    if (eligible.length === 0) {
      return { ...state, nextKingdomVisitTurn: turn + 7 * TICKS_PER_DAY };
    }
    // Relation-weighted pick — friendlier kingdoms visit more often.
    const weights = eligible.map((e) => Math.max(1, e.relation.score + 40));
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = rng.random() * total;
    let picked = eligible[0];
    for (let i = 0; i < eligible.length; i++) {
      roll -= weights[i];
      if (roll < 0) {
        picked = eligible[i];
        break;
      }
    }

    const kind: KingdomParty['kind'] = rng.random() < 0.65 ? 'caravan' : 'visitor';
    const wealthTier = this.colonyWealthTier(state);
    const stock = kind === 'caravan' ? this.generateCaravanStock(picked.kingdom, wealthTier) : [];

    const spawned = spawnKingdomParty(state, picked.kingdom, kind, stock, 0);
    if (!spawned) {
      return { ...state, nextKingdomVisitTurn: turn + 2 * TICKS_PER_DAY };
    }
    let s = spawned.state;
    s = this.recordContact(s, picked.kingdom.id, KNOWLEDGE_XP.arrival);
    s = {
      ...s,
      pendingEvent: {
        kind: 'kingdom-arrival',
        id: `kingdom-arrival-${turn}`,
        turn,
        kingdomId: picked.kingdom.id,
        partyKind: kind,
        partyId: spawned.party.id
      },
      nextKingdomVisitTurn: turn + this.nextCadenceTicks(state, picked.relation.score, wealthTier)
    };
    return s;
  }

  /** Non-hostile kingdoms with a colony relation — raiders never visit or trade. */
  private eligibleSenders(state: GameState): { kingdom: Kingdom; relation: KingdomRelation }[] {
    const out: { kingdom: Kingdom; relation: KingdomRelation }[] = [];
    for (const k of state.kingdoms ?? []) {
      if (k.relationBias === 'always_hostile') continue;
      const rel = findKingdomRelation(state.kingdomRelations ?? [], COLONY_RELATION_ID, k.id);
      if (!rel) continue;
      // Neutral-or-better sends caravans/visitors; wary/hostile stay away (raids are future work).
      if (rel.score <= -20) continue;
      out.push({ kingdom: k, relation: rel });
    }
    return out;
  }

  /** Cadence squeeze: wealthier colonies and warmer relations pull more frequent parties. */
  private nextCadenceTicks(state: GameState, relationScore: number, wealthTier: number): number {
    const freq = clamp(1 - 0.06 * wealthTier - relationScore / 400, 0.45, 1.3);
    const jitterDays = rng.range(-2, 2);
    return Math.max(3, Math.round((BASE_CADENCE_DAYS * freq + jitterDays) * TICKS_PER_DAY));
  }

  // ─── Knowledge & contact (§2) ──────────────────────────────────────────────

  /** Positive contact: discover, gain knowledge xp, refresh the known-facts snapshot + clock.
   *  Also grows the CULTURE pokédex (RACE-SYSTEM Phase 2): meeting a kingdom's people introduces
   *  their dominant culture on first contact; the rest of the mix once the colony is familiar. */
  recordContact(state: GameState, kingdomId: string, xp: number): GameState {
    let contacted: Kingdom | undefined;
    const kingdoms = (state.kingdoms ?? []).map((k) => {
      if (k.id !== kingdomId) return k;
      contacted = {
        ...k,
        discovered: true,
        knowledge: k.knowledge + xp,
        lastContactTurn: state.turn,
        known: {
          leaderName: k.lore.leaderName,
          wealthBand: k.lore.wealthBand,
          famedItems: {
            created: [...k.lore.famedItems.created],
            held: [...k.lore.famedItems.held]
          },
          asOfTurn: state.turn
        }
      };
      return contacted;
    });
    if (!contacted) return state;
    const familiar = knowledgeTier(contacted.knowledge) >= 2;
    const metCultureIds = new Set(
      (familiar ? contacted.cultureMix : contacted.cultureMix.slice(0, 1)).map((s) => s.cultureId)
    );
    const pool = state.culturePool ?? [];
    const anyNew = pool.some((c) => metCultureIds.has(c.id) && !c.discovered);
    return {
      ...state,
      kingdoms,
      ...(anyNew
        ? {
            culturePool: pool.map((c) =>
              metCultureIds.has(c.id) && !c.discovered ? { ...c, discovered: true } : c
            )
          }
        : {})
    };
  }

  /** True when the mutable facets should render greyed — "as last you knew" (§2). */
  isKnowledgeStale(kingdom: Kingdom, turn: number): boolean {
    if (kingdom.lastContactTurn == null) return true;
    return turn - kingdom.lastContactTurn > STALE_AFTER_TICKS;
  }

  // ─── Relations ─────────────────────────────────────────────────────────────

  colonyRelationTo(state: GameState, kingdomId: string): KingdomRelation | undefined {
    return findKingdomRelation(state.kingdomRelations ?? [], COLONY_RELATION_ID, kingdomId);
  }

  adjustColonyRelation(state: GameState, kingdomId: string, delta: number): GameState {
    const relations = (state.kingdomRelations ?? []).map((r) => {
      const isColonyRow =
        (r.a === COLONY_RELATION_ID && r.b === kingdomId) ||
        (r.b === COLONY_RELATION_ID && r.a === kingdomId);
      if (!isColonyRow) return r;
      const score = clamp(Math.round(r.score + delta), -100, 100);
      return { ...r, score, disposition: dispositionForScore(score) };
    });
    return { ...state, kingdomRelations: relations };
  }

  /** A colonist harmed a kingdom's entity — an act of war against the sender (§3). */
  onKingdomMobKilled(state: GameState, mob: Mob): GameState {
    if (!mob.kingdomId) return state;
    return this.adjustColonyRelation(state, mob.kingdomId, -45);
  }

  // ─── Colony wealth (§3) ────────────────────────────────────────────────────

  /** Total base value of the colony stockpile. */
  colonyWealth(state: GameState): number {
    let total = 0;
    for (const [itemId, qty] of Object.entries(state.stockpile ?? {})) {
      if (qty <= 0) continue;
      const def = itemDefById(itemId);
      if (!def || def.hidden) continue;
      total += baseItemValue(def) * qty;
    }
    return Math.round(total);
  }

  /** Colony wealth tier 0–4 — caps caravan goods quality and pulls frequency. */
  colonyWealthTier(state: GameState): number {
    const wealth = this.colonyWealth(state);
    let tier = 0;
    for (let i = WEALTH_TIER_THRESHOLDS.length - 1; i >= 0; i--) {
      if (wealth >= WEALTH_TIER_THRESHOLDS[i]) {
        tier = i;
        break;
      }
    }
    return tier;
  }

  // ─── Caravan stock (§3/§4) ─────────────────────────────────────────────────

  /** A caravan only hauls wares up to the tier the colony can plausibly afford —
   *  and never beyond what its kingdom's wealth supports. */
  generateCaravanStock(kingdom: Kingdom, colonyWealthTier: number): CaravanGood[] {
    const kingdomWealthIdx = WEALTH_BANDS.indexOf(kingdom.lore.wealthBand);
    const tierCap = clamp(Math.min(colonyWealthTier + 1, kingdomWealthIdx + 2), 1, 5);
    const tradeable = allItemDefs().filter((d) => this.isTradeableDef(d, tierCap));
    if (tradeable.length === 0) return [];
    const lines = rng.int(6, 10 + kingdomWealthIdx);
    // Gold bars lead the manifest — the stable intermediate for settling lopsided deals (§4).
    const stock: CaravanGood[] = [
      { itemId: 'gold_bar', qty: kingdomWealthIdx * 3 + rng.int(1, 4) }
    ];
    const used = new Set<string>(['gold_bar']);
    let guard = 0;
    while (stock.length < lines && guard < lines * 20) {
      guard++;
      const def = tradeable[rng.int(0, tradeable.length - 1)];
      if (used.has(def.id)) continue;
      used.add(def.id);
      const value = baseItemValue(def);
      const baseQty = clamp(Math.round(60 / value), 1, 25);
      const qty = Math.max(1, Math.round(baseQty * rng.range(0.5, 1.5)));
      stock.push({ itemId: def.id, qty });
    }
    return stock;
  }

  private isTradeableDef(def: Item, tierCap: number): boolean {
    if (def.hidden) return false;
    if (def.type === 'currency') return false; // gold rides the party's `gold` float
    if ((def.tier ?? 1) > tierCap) return false;
    if (def.id.endsWith('_carcass')) return false;
    if (def.category === 'natural_weapon' || def.category === 'organic') return false;
    return (
      def.type === 'material' ||
      def.type === 'consumable' ||
      def.type === 'tool' ||
      def.type === 'weapon' ||
      def.type === 'armor'
    );
  }

  // ─── Barter pricing (§4) ───────────────────────────────────────────────────

  /**
   * Effective unit price of a good in a deal with `kingdomId`, negotiated by a pawn whose
   * `trade` stat is `tradeStat` (≈0.8–2.0). `side` is from the COLONY's view: goods the colony
   * RECEIVES cost more, goods it GIVES fetch less — the spread narrows with skill + relations.
   * Gold bars anchor: their value ignores both (§4 — the most liquid barter good).
   */
  effectiveTradePrice(
    state: GameState,
    kingdomId: string,
    good: CaravanGood,
    side: 'receive' | 'give',
    tradeStat: number
  ): number {
    const def = itemDefById(good.itemId);
    if (!def) return 0;
    const base = baseItemValue(def) * this.qualityMult(good.quality);
    if (def.type === 'currency' || def.id === 'gold_bar') return Math.round(base);
    const relation = this.colonyRelationTo(state, kingdomId);
    const margin = clamp(
      0.4 - 0.25 * (tradeStat - 1) - (relation?.score ?? 0) * 0.001,
      0.05,
      0.6
    );
    const price = side === 'receive' ? base * (1 + margin) : base * (1 - margin);
    return Math.max(1, Math.round(price));
  }

  private qualityMult(quality: number | undefined): number {
    // Mirrors core/itemQuality tiers without importing the full table here.
    const mults = [0.8, 1.0, 1.15, 1.3, 1.5, 1.8];
    return mults[clamp(quality ?? 1, 0, 5)];
  }
}

export const kingdomService = new KingdomServiceImpl();
