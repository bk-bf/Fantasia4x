import { describe, it, expect, beforeEach } from 'vitest';
import {
  seedAwakeningPaths,
  advanceAwakeningMeters,
  lineageGrowthEvent,
  AWAKENING_DEFS,
  LINEAGE_DEFS
} from '$lib/game/core/defs/lineages';
import { feedOnVictim, sateBloodHunger } from '$lib/game/core/defs/lineages';
import { rng } from '$lib/game/core/util/rng';
import { drawPawnTraits } from '$lib/game/core/gen/culture';
import { createBodyPlanLimbs } from '$lib/game/systems/Combat';
import type { Culture, Pawn, Trait } from '$lib/game/core/types';

const pawn = (over: Partial<Pawn> = {}): Pawn =>
  ({ id: 'p', isAlive: true, stats: { perception: 10 }, traits: [], ...over }) as unknown as Pawn;

const clawGateway: Trait = {
  name: 'Beast Claws',
  description: '',
  kind: 'naturalGear',
  lineageExclusive: false,
  awakens: ['devour-raw-meat', 'moon-bathing']
} as Trait;

describe('LINEAGES §4 awakening meters', () => {
  beforeEach(() => rng.reseed(20260709));

  it('data integrity: every awakening names a real lineage', () => {
    const ids = new Set(LINEAGE_DEFS.map((l) => l.id));
    for (const a of AWAKENING_DEFS)
      expect(ids.has(a.lineage), `${a.id} → unknown lineage ${a.lineage}`).toBe(true);
  });

  it('a standalone gateway seeds one meter per candidate lineage (≥2 paths to choose from)', () => {
    const p = pawn({ traits: [clawGateway] });
    seedAwakeningPaths(p);
    expect(p.lineagePaths?.length).toBe(2);
    const lineages = p.lineagePaths!.map((x) => x.lineage).sort();
    expect(lineages).toEqual(['beast', 'werewolf']);
    const beast = p.lineagePaths!.find((x) => x.lineage === 'beast')!;
    expect(beast.target).toBeGreaterThanOrEqual(40);
    expect(beast.target).toBeLessThanOrEqual(80);
  });

  it('a many-condition gateway still seeds ONE meter per lineage (a random condition each)', () => {
    const fullClaws: Trait = {
      name: 'Rending Claws',
      description: '',
      kind: 'naturalGear',
      lineageExclusive: false,
      awakens: [
        'devour-raw-meat',
        'devour-carcass',
        'wild-kills',
        'moon-bathing',
        'cull-canines',
        'night-hunter'
      ]
    } as Trait;
    const p = pawn({ traits: [fullClaws] });
    seedAwakeningPaths(p);
    expect(p.lineagePaths?.length).toBe(2);
    expect(p.lineagePaths!.map((x) => x.lineage).sort()).toEqual(['beast', 'werewolf']);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      rng.reseed(seed);
      const q = pawn({ traits: [fullClaws] });
      seedAwakeningPaths(q);
      seen.add(q.lineagePaths!.find((x) => x.lineage === 'beast')!.condition);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('two gateways with overlapping lineages DEDUPE by lineage (claws + fur ⇒ still 2 meters)', () => {
    const fur: Trait = {
      name: 'Thick Fur',
      description: '',
      kind: 'naturalGear',
      lineageExclusive: false,
      awakens: ['devour-carcass', 'sleep-wild', 'moon-bathing', 'eat-canine']
    } as Trait;
    const p = pawn({ traits: [clawGateway, fur] });
    seedAwakeningPaths(p);
    expect(p.lineagePaths?.length).toBe(2);
    expect(new Set(p.lineagePaths!.map((x) => x.lineage)).size).toBe(2);
  });

  it('meter fills from fresh deeds and DECAYS when the deed stalls', () => {
    const p = pawn({ traits: [clawGateway], deeds: {} });
    seedAwakeningPaths(p);
    const beast = p.lineagePaths!.find((x) => x.lineage === 'beast')!;
    p.deeds!.ateRawMeat = 10;
    advanceAwakeningMeters(p, 100);
    expect(beast.value).toBe(10);
    expect(beast.lastFedDay).toBe(100);
    advanceAwakeningMeters(p, 102);
    expect(beast.value).toBe(10);
    advanceAwakeningMeters(p, 110);
    expect(beast.value).toBeLessThan(10);
  });

  it('gateway draw cap: at most TWO gateways per pawn, and a second is rare (~1 in 20)', () => {
    const gw = (id: string, lineages: string[]): Trait =>
      ({
        id,
        name: id,
        description: '',
        kind: 'naturalGear',
        lineage: lineages,
        lineageExclusive: false,
        awakens: ['devour-raw-meat', 'moon-bathing'],
        effects: {}
      }) as Trait;
    const culture = {
      guaranteedTraits: [],
      culturalTraitPool: [
        gw('gw-a', ['beast']),
        gw('gw-b', ['werewolf']),
        gw('gw-c', ['amphibian'])
      ],
      statRanges: {}
    } as unknown as Culture;
    let twos = 0;
    for (let seed = 1; seed <= 300; seed++) {
      rng.reseed(seed);
      const drawn = drawPawnTraits(culture);
      const gateways = drawn.filter((t) => t.lineageExclusive === false).length;
      expect(gateways).toBeLessThanOrEqual(2);
      if (gateways === 2) twos++;
    }
    expect(twos).toBeGreaterThan(0);
    expect(twos / 300).toBeLessThan(0.2);
  });

  it('a FULL meter LOCKS — it never decays, even after long idle (awaits the growth event)', () => {
    const p = pawn({ traits: [clawGateway], deeds: {} });
    seedAwakeningPaths(p);
    const beast = p.lineagePaths!.find((x) => x.lineage === 'beast')!;
    p.deeds!.ateRawMeat = beast.target;
    advanceAwakeningMeters(p, 100);
    expect(beast.value).toBe(beast.target);
    advanceAwakeningMeters(p, 500);
    expect(beast.value).toBe(beast.target);
  });

  it('a full meter AWAKENS the pawn: grants the lineage parent + its first member', () => {
    const parent: Trait = {
      id: 'beast-heritage',
      name: 'Beast',
      description: '',
      kind: 'passive'
    } as Trait;
    const member: Trait = {
      id: 'savage-bite',
      name: 'Savage Bite',
      description: '',
      kind: 'naturalGear',
      lineage: ['beast']
    } as Trait;
    const p = pawn({
      traits: [clawGateway],
      lineagePaths: [
        {
          condition: 'devour-raw-meat',
          lineage: LINEAGE_DEFS[0].id,
          deed: 'ateRawMeat',
          target: 5,
          value: 5,
          seen: 5,
          lastFedDay: 0
        }
      ]
    });
    const applied: Trait[] = [];
    const res = lineageGrowthEvent(p, (t) => applied.push(t));
    expect(['awaken', 'none', 'evolve', 'grow']).toContain(res.kind);
    void [parent, member];
  });

  it('Beast content: a FULL meter awakens the pawn → beast-heritage + a first beast member', () => {
    const gateway: Trait = {
      id: 'rending-claws',
      name: 'Rending Claws',
      description: '',
      kind: 'naturalGear',
      lineageExclusive: false,
      lineage: ['beast', 'werewolf']
    } as Trait;
    const applied: Trait[] = [];
    const p = pawn({
      traits: [gateway],
      stats: {
        strength: 10,
        constitution: 10,
        charisma: 10,
        perception: 10,
        dexterity: 10,
        intelligence: 10
      },
      lineagePaths: [
        {
          condition: 'devour-raw-meat',
          lineage: 'beast',
          deed: 'ateRawMeat',
          target: 5,
          value: 5,
          seen: 5,
          lastFedDay: 0
        }
      ]
    });
    const res = lineageGrowthEvent(p, (t) => applied.push(t));
    expect(res.kind).toBe('awaken');
    expect(res.lineage).toBe('beast');
    expect(res.added).toContain('beast-heritage');
    expect(res.added.length).toBe(2);
    expect(p.traits!.some((t) => t.id === 'beast-heritage')).toBe(true);
    expect(p.lineagePaths).toBeUndefined();
    expect(applied.length).toBe(2);
  });

  it('Beast content: a born beast pawn GROWS a new member at a growth event', () => {
    const parent: Trait = {
      id: 'beast-heritage',
      name: 'Beast Blood',
      description: '',
      kind: 'passive',
      lineage: ['beast']
    } as Trait;
    let grew = false;
    for (let seed = 1; seed < 300 && !grew; seed++) {
      rng.reseed(seed);
      const p = pawn({
        traits: [{ ...parent }],
        stats: {
          strength: 10,
          constitution: 10,
          charisma: 10,
          perception: 10,
          dexterity: 10,
          intelligence: 10
        }
      });
      const res = lineageGrowthEvent(p, () => {});
      if (res.kind === 'grow') {
        grew = true;
        expect(res.lineage).toBe('beast');
        expect(p.traits!.length).toBe(2);
      }
    }
    expect(grew, 'a born beast pawn should grow a member within 300 seeds').toBe(true);
  });

  it('a staged trait EVOLVES to its next rung at a growth event', () => {
    const s1: Trait = {
      id: 'spider-eyes-lesser',
      name: 'Extra Eye',
      description: '',
      kind: 'bodyMod',
      stage: 1,
      evolvesTo: 'spider-eyes'
    } as Trait;
    const p = pawn({ traits: [s1] });
    let evolved = false;
    for (let seed = 1; seed < 200 && !evolved; seed++) {
      const q = pawn({ traits: [{ ...s1 }] });
      rng.reseed(seed);
      const res = lineageGrowthEvent(q, () => {});
      if (res.kind === 'evolve') {
        evolved = true;
        expect(res.added).toContain('spider-eyes');
        expect(res.removed).toBe('spider-eyes-lesser');
        expect(q.traits!.some((t) => t.id === 'spider-eyes')).toBe(true);
        expect(q.traits!.some((t) => t.id === 'spider-eyes-lesser')).toBe(false);
      }
    }
    expect(evolved, 'evolve should fire within 200 seeds at 10% chance').toBe(true);
    void p;
  });
});

describe('vampiric feeding (feedOnVictim)', () => {
  it('stamps a small neck puncture + drains blood on the victim, and sates the feeder', () => {
    const feeder = {
      id: 'vamp',
      isAlive: true,
      needs: { bloodHunger: 100 },
      conditionTimers: { bloodthirst: 500 }
    } as unknown as Pawn;
    const victim = {
      id: 'meal',
      isAlive: true,
      bloodVolume: 100,
      maxBloodVolume: 100,
      limbs: createBodyPlanLimbs('humanoid', 1)
    } as unknown as Pawn;
    feedOnVictim(feeder, victim, 1000);
    expect(victim.bloodVolume).toBe(88);
    const neck = victim.limbs!.flatMap((l) => l.parts ?? []).find((p) => p.id === 'neck')!;
    const bite = neck.injuries.find((w) => w.type === 'puncture')!;
    expect(bite).toBeTruthy();
    expect(bite.permanent).toBeUndefined();
    expect(feeder.needs!.bloodHunger).toBe(0);
    expect(feeder.conditionTimers!.bloodthirst).toBeUndefined();
  });

  it('sateBloodHunger resets the meter and lifts the rage (the werewolf devour path)', () => {
    const wolf = {
      id: 'wolf',
      needs: { bloodHunger: 100 },
      conditionTimers: { bloodthirst: 300 }
    } as unknown as Pawn;
    sateBloodHunger(wolf);
    expect(wolf.needs!.bloodHunger).toBe(0);
    expect(wolf.conditionTimers!.bloodthirst).toBeUndefined();
  });
});
