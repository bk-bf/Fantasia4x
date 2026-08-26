import type {
  CaravanGood,
  GameState,
  Item,
  Kingdom,
  KingdomParty,
  KingdomRelation,
  Mob,
  Pawn
} from '../core/types';
import { COLONY_RELATION_ID } from '../core/types';
import {
  SEED_KNOWLEDGE_CAP,
  getBackgroundById,
  backgroundHomeKnowledge,
  backgroundWorldliness
} from '../core/defs/backgrounds';
import {
  WEALTH_BANDS,
  dispositionForScore,
  findKingdomRelation,
  generateFamedItemName,
  generateLeaderName,
  knowledgeTier,
  stepWealthBand
} from '../core/gen/kingdom';
import { allItemDefs, itemDefById } from '../core/defs/items';
import { baseItemValue } from '../core/rules/gear/itemValue';
import { clamp } from '../core/util/math';
import { rng } from '../core/util/rng';
import { kinRelationPhrase } from '../core/rules/social/social';
import { simLog } from '../core/util/logSink';
import { TICKS_PER_SECOND } from '../core/util/time';
import { TURNS_PER_DAY } from './EnvironmentService';
import { spawnKingdomParty, despawnKingdomParty } from './entity/kingdomParties';
import events from '../database/social/events.jsonc';

const TICKS_PER_DAY = TURNS_PER_DAY * TICKS_PER_SECOND;

const STALE_AFTER_TICKS = 30 * TICKS_PER_DAY;

const ARRIVAL = events as {
  visitors: {
    baseCadenceDays: number;
    firstArrivalDays: [number, number];
    cadenceWealthSqueeze: number;
    cadenceRelationDivisor: number;
    cadenceClamp: [number, number];
    cadenceJitterDays: number;
    cadenceFloorTicks: number;
    busyBackoffDays: number;
    spawnFailBackoffDays: number;
    noSenderBackoffDays: number;
  };
  caravan: { tradeChance: number };
};
const V = ARRIVAL.visitors;

export const KNOWLEDGE_XP = {
  arrival: 6,
  presencePerDay: 2,
  tradeCompleted: 8
};

const WEALTH_TIER_THRESHOLDS = [0, 300, 1000, 3000, 8000];

class KingdomServiceImpl {
  processKingdomsDaily(state: GameState): GameState {
    if (!state.kingdoms || state.kingdoms.length === 0) return state;
    let s = state;
    s = this.driftFacets(s);
    s = this.tickParties(s);
    s = this.maybeScheduleArrival(s);
    return s;
  }

  private driftFacets(state: GameState): GameState {
    let changed = false;
    const kingdoms = state.kingdoms!.map((k) => {
      let lore = k.lore;
      if (rng.random() < 1 / 120) {
        lore = {
          ...lore,
          leaderName: generateLeaderName(
            k.relationBias === 'always_hostile',
            WEALTH_BANDS.indexOf(lore.wealthBand)
          )
        };
      }
      if (rng.random() < 1 / 90) {
        lore = {
          ...lore,
          wealthBand: stepWealthBand(lore.wealthBand, rng.random() < 0.5 ? 1 : -1)
        };
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

  private maybeScheduleArrival(state: GameState): GameState {
    const turn = state.turn;
    if (state.nextKingdomVisitTurn == null) {
      return {
        ...state,
        nextKingdomVisitTurn:
          turn + rng.int(V.firstArrivalDays[0], V.firstArrivalDays[1]) * TICKS_PER_DAY
      };
    }
    if (turn < state.nextKingdomVisitTurn) return state;
    if (state.pendingEvent || (state.kingdomParties?.length ?? 0) > 0) {
      return { ...state, nextKingdomVisitTurn: turn + V.busyBackoffDays * TICKS_PER_DAY };
    }

    const eligible = this.eligibleSenders(state);
    if (eligible.length === 0) {
      return { ...state, nextKingdomVisitTurn: turn + V.noSenderBackoffDays * TICKS_PER_DAY };
    }
    const weights = eligible.map(
      (e) =>
        Math.max(1, e.relation.score + 40) +
        (this.colonyKinInKingdom(state, e.kingdom.id).length > 0 ? 25 : 0)
    );
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

    const canTrade = WEALTH_BANDS.indexOf(picked.kingdom.lore.wealthBand) >= 2;
    const kind: KingdomParty['kind'] =
      canTrade && rng.random() < ARRIVAL.caravan.tradeChance ? 'caravan' : 'visitor';
    const wealthTier = this.colonyWealthTier(state);
    const stock =
      kind === 'caravan'
        ? this.generateCaravanStock(picked.kingdom, wealthTier, picked.relation.score)
        : [];

    const spawned = spawnKingdomParty(state, picked.kingdom, kind, stock, 0);
    if (!spawned) {
      return { ...state, nextKingdomVisitTurn: turn + V.spawnFailBackoffDays * TICKS_PER_DAY };
    }
    let s = spawned.state;
    s = this.recordContact(s, picked.kingdom.id, KNOWLEDGE_XP.arrival);
    s = this.reuniteKin(s, picked.kingdom.id, spawned.party);
    const lead = this.partyLead(s, spawned.party);
    this.logArrival(
      turn,
      picked.kingdom.name,
      kind,
      lead ? { x: lead.x, y: lead.y, entityId: lead.id } : undefined
    );
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

  forceArrival(state: GameState, kind?: KingdomParty['kind']): GameState {
    const nonRaider = (state.kingdoms ?? []).filter((k) => k.relationBias !== 'always_hostile');
    if (nonRaider.length === 0) return state;
    const traders = nonRaider.filter((k) => WEALTH_BANDS.indexOf(k.lore.wealthBand) >= 2);
    const wantCaravan = kind === 'caravan' || (kind == null && traders.length > 0);
    const pool = wantCaravan && traders.length > 0 ? traders : nonRaider;
    const kingdom = pool[rng.int(0, pool.length - 1)];
    const partyKind: KingdomParty['kind'] = wantCaravan ? 'caravan' : 'visitor';
    const stock =
      partyKind === 'caravan'
        ? this.generateCaravanStock(
            kingdom,
            this.colonyWealthTier(state),
            (state.kingdomRelations ?? []).find((r) => r.a === kingdom.id || r.b === kingdom.id)
              ?.score ?? 0
          )
        : [];
    const spawned = spawnKingdomParty(state, kingdom, partyKind, stock, 0);
    if (!spawned) return state;
    let s = spawned.state;
    s = this.recordContact(s, kingdom.id, KNOWLEDGE_XP.arrival);
    const lead = this.partyLead(s, spawned.party);
    this.logArrival(
      s.turn,
      kingdom.name,
      partyKind,
      lead ? { x: lead.x, y: lead.y, entityId: lead.id } : undefined
    );
    return {
      ...s,
      pendingEvent: {
        kind: 'kingdom-arrival',
        id: `kingdom-arrival-${s.turn}-dev`,
        turn: s.turn,
        kingdomId: kingdom.id,
        partyKind,
        partyId: spawned.party.id
      }
    };
  }

  private logArrival(
    turn: number,
    kingdomName: string,
    kind: KingdomParty['kind'],
    focus?: { x: number; y: number; entityId: string }
  ): void {
    simLog.logActivity({
      turn,
      type: 'event',
      actor: 'system',
      action:
        kind === 'caravan'
          ? `A trade caravan from ${kingdomName} enters your lands`
          : `Visitors from ${kingdomName} arrive at the colony`,
      result: '',
      severity: 'info',
      ...(focus ? { focusX: focus.x, focusY: focus.y, entityIds: [focus.entityId] } : {})
    });
  }

  private partyLead(state: GameState, party: KingdomParty): Mob | undefined {
    const id = party.traderMobId ?? party.mobIds[0];
    return (state.mobs ?? []).find((m) => m.id === id);
  }

  private colonyKinInKingdom(state: GameState, kingdomId: string): Pawn[] {
    const worldKin = (state.worldPawns ?? []).filter((w) => w.homeKingdomId === kingdomId);
    if (worldKin.length === 0) return [];
    const kinIds = new Set<string>();
    for (const p of state.pawns) {
      if (p.isAlive === false) continue;
      for (const k of p.kin ?? []) kinIds.add(k.pawnId);
    }
    return worldKin.filter((w) => kinIds.has(w.id));
  }

  private reuniteKin(state: GameState, kingdomId: string, party: KingdomParty): GameState {
    const candidates = this.colonyKinInKingdom(state, kingdomId);
    if (candidates.length === 0 || rng.random() > 0.6) return state;
    const visitor = rng.pick(candidates);
    const turn = state.turn;
    const founder = state.pawns.find((p) => (p.kin ?? []).some((k) => k.pawnId === visitor.id));
    const tie = founder?.kin?.find((k) => k.pawnId === visitor.id);
    const phrase =
      founder && tie
        ? kinRelationPhrase(tie.kind, founder.name.split(' ')[0], visitor.sex)
        : 'a relative';
    const worldPawns = (state.worldPawns ?? []).map((p) =>
      p.id === visitor.id ? { ...p, lastSeenTurn: turn } : p
    );
    const leadId = party.traderMobId ?? party.mobIds[0];
    const mobs = (state.mobs ?? []).map((m) =>
      m.id === leadId ? { ...m, name: visitor.name, worldKinRelation: phrase } : m
    );
    const kingdomParties = (state.kingdomParties ?? []).map((p) =>
      p.id === party.id ? { ...p, kinVisitorId: visitor.id } : p
    );
    const lead = mobs.find((m) => m.id === leadId);
    simLog.logActivity({
      turn,
      type: 'social',
      actor: 'system',
      action: 'Kin among the party',
      result: `${visitor.name}, ${phrase}, has come with the ${party.kind}`,
      severity: 'success',
      entityIds: lead ? [lead.id] : undefined,
      focusX: lead?.x,
      focusY: lead?.y
    });
    return { ...state, worldPawns, mobs, kingdomParties };
  }

  private eligibleSenders(state: GameState): { kingdom: Kingdom; relation: KingdomRelation }[] {
    const out: { kingdom: Kingdom; relation: KingdomRelation }[] = [];
    for (const k of state.kingdoms ?? []) {
      if (k.relationBias === 'always_hostile') continue;
      const rel = findKingdomRelation(state.kingdomRelations ?? [], COLONY_RELATION_ID, k.id);
      if (!rel) continue;
      if (rel.score <= -20) continue;
      out.push({ kingdom: k, relation: rel });
    }
    return out;
  }

  private nextCadenceTicks(state: GameState, relationScore: number, wealthTier: number): number {
    const freq = clamp(
      1 - V.cadenceWealthSqueeze * wealthTier - relationScore / V.cadenceRelationDivisor,
      V.cadenceClamp[0],
      V.cadenceClamp[1]
    );
    const jitterDays = rng.range(-V.cadenceJitterDays, V.cadenceJitterDays);
    return Math.max(
      V.cadenceFloorTicks,
      Math.round((V.baseCadenceDays * freq + jitterDays) * TICKS_PER_DAY)
    );
  }

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

  isKnowledgeStale(kingdom: Kingdom, turn: number): boolean {
    if (kingdom.lastContactTurn == null) return true;
    return turn - kingdom.lastContactTurn > STALE_AFTER_TICKS;
  }

  seedKnowledge(state: GameState, kingdomId: string, xp: number, via?: string): GameState {
    if (xp <= 0) return state;
    let seeded: Kingdom | undefined;
    const kingdoms = (state.kingdoms ?? []).map((k) => {
      if (k.id !== kingdomId) return k;
      seeded = {
        ...k,
        discovered: true,
        knownVia: k.knownVia ?? via,
        knowledge: Math.min(SEED_KNOWLEDGE_CAP, k.knowledge + xp),
        known: k.known ?? {
          leaderName: k.lore.leaderName,
          wealthBand: k.lore.wealthBand,
          famedItems: {
            created: [...k.lore.famedItems.created],
            held: [...k.lore.famedItems.held]
          },
          asOfTurn: state.turn
        }
      };
      return seeded;
    });
    if (!seeded) return state;
    const familiar = knowledgeTier(seeded.knowledge) >= 2;
    const metCultureIds = new Set(
      (familiar ? seeded.cultureMix : seeded.cultureMix.slice(0, 1)).map((s) => s.cultureId)
    );
    const pool = state.culturePool ?? [];
    const anyNew = pool.some((c) => metCultureIds.has(c.id) && !c.discovered);
    return {
      ...state,
      kingdoms,
      ...(anyNew
        ? {
            culturePool: pool.map((c) =>
              metCultureIds.has(c.id) && !c.discovered
                ? { ...c, discovered: true, discoveredVia: c.discoveredVia ?? via }
                : c
            )
          }
        : {})
    };
  }

  seedKingdomKnowledgeFromPawns(
    state: GameState,
    pawns: Pawn[],
    includeWorldliness = true
  ): GameState {
    if (!state.kingdoms || state.kingdoms.length === 0) return state;
    let s = state;
    for (const p of pawns) {
      const childhood = getBackgroundById(p.childhoodId);
      const adulthood = getBackgroundById(p.adulthoodId);
      if (p.homeKingdomId) {
        s = this.seedKnowledge(
          s,
          p.homeKingdomId,
          backgroundHomeKnowledge(childhood, adulthood),
          p.name
        );
      }
      if (!includeWorldliness) continue;
      const { count, band } = backgroundWorldliness(childhood, adulthood);
      if (count > 0) {
        const others = (s.kingdoms ?? []).filter((k) => k.id !== p.homeKingdomId);
        for (let i = 0; i < count && others.length > 0; i++) {
          const k = others.splice(rng.int(0, others.length - 1), 1)[0];
          s = this.seedKnowledge(s, k.id, rng.int(band[0], band[1]), p.name);
        }
      }
    }
    return s;
  }

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

  onKingdomMobKilled(state: GameState, mob: Mob): GameState {
    if (!mob.kingdomId) return state;
    return this.adjustColonyRelation(state, mob.kingdomId, -45);
  }

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

  generateCaravanStock(
    kingdom: Kingdom,
    colonyWealthTier: number,
    relationScore = 0
  ): CaravanGood[] {
    const kingdomWealthIdx = WEALTH_BANDS.indexOf(kingdom.lore.wealthBand);
    const tierCap = clamp(Math.min(colonyWealthTier + 1, kingdomWealthIdx + 2), 1, 5);
    const tradeable = allItemDefs().filter((d) => this.isTradeableDef(d, tierCap, relationScore));
    if (tradeable.length === 0) return [];
    const lines = rng.int(6, 10 + kingdomWealthIdx);
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

  isTradeableDef(def: Item, tierCap: number, relationScore = 0): boolean {
    if (def.hidden) return false;
    if (def.tradeRelationsMin != null && relationScore < def.tradeRelationsMin) return false;
    if (def.type === 'currency') return false;
    if ((def.tier ?? 1) > tierCap) return false;
    if (def.id.endsWith('_carcass')) return false;
    if (def.category === 'natural_weapon' || def.category === 'organic') return false;
    if (def.id.startsWith('rotten_')) return false;
    return (
      def.type === 'material' ||
      def.type === 'consumable' ||
      def.type === 'tool' ||
      def.type === 'weapon' ||
      def.type === 'armor' ||
      def.type === 'food' ||
      def.type === 'fluid'
    );
  }

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
    const margin = clamp(0.4 - 0.25 * (tradeStat - 1) - (relation?.score ?? 0) * 0.001, 0.05, 0.6);
    const price = side === 'receive' ? base * (1 + margin) : base * (1 - margin);
    return Math.max(1, Math.round(price));
  }

  private qualityMult(quality: number | undefined): number {
    const mults = [0.8, 1.0, 1.15, 1.3, 1.5, 1.8];
    return mults[clamp(quality ?? 1, 0, 5)];
  }
}

export const kingdomService = new KingdomServiceImpl();
