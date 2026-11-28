import type { GameState, Pawn } from '$lib/game/core/types';
import { CORE_STATS } from '$lib/game/core/types';
import statsData from '$lib/game/database/pawns/stats.json';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import { pawnService } from '$lib/game/services/PawnService';
import { itemService } from '$lib/game/services/ItemService';
import {
  conditionModifierContributions,
  conditionPainMultiplier
} from '$lib/game/core/rules/body/conditions';
import { powerStatOf } from '$lib/game/core/rules/body/powerScale';
import { isAptitudeStat } from '$lib/game/core/rules/body/aptitudes';
import { otherOf, relationshipsOf, STAGE_LABEL } from '$lib/game/core/rules/social/social';
import { partLabel } from '$lib/components/util/bodyLabels';
import {
  buildStatContext,
  computeStatView,
  traitMods,
  type StatContext,
  type StatDef
} from '$lib/components/util/statView';
import { pawnWorkTables, skillCell, type SkillCell } from '$lib/components/util/skillRows';
import { DISCIPLINE_PARENTS, disciplineLeaves } from '$lib/game/core/defs/disciplines';

export type Trend = 'up' | 'down' | '';
export interface AttrRow {
  label: string;
  value: string;
}
export interface AttrCell {
  key: string;
  label: string;
  value: string;
  trend: Trend;
  blurb: string;
  rows: AttrRow[];
  work?: SkillCell;
}
export interface AttrCategory {
  label: string;
  cells: AttrCell[];
}

const STAT = new Map((statsData as unknown as StatDef[]).map((s) => [s.id, s]));
const CAPACITIES = (statsData as unknown as StatDef[]).filter((s) => s.category === 'capacity');
const WITS = [
  'consciousness',
  'manipulation',
  'moving',
  'blood_pumping',
  'blood_filtration',
  'breathing',
  'digestion',
  'talking'
];

const x2 = (n: number) => `×${n.toFixed(2)}`;
const pct = (r: number) => `${r >= 1 ? '+' : '−'}${Math.abs(Math.round((r - 1) * 100))}%`;
const trendOf = (ratio: number, lowerBetter = false): Trend => {
  const r = lowerBetter ? 1 / ratio : ratio;
  return r >= 1.03 ? 'up' : r <= 0.97 ? 'down' : '';
};

function nudged(pawn: Pawn, statId: string, alt: Partial<Pawn>, label: string, out: AttrRow[]) {
  const now = pawnStatService.evaluateStat(statId, pawn);
  const was = pawnStatService.evaluateStat(statId, { ...pawn, ...alt } as Pawn);
  if (Math.abs(was) < 1e-6 || Math.abs(now / was - 1) < 0.005) return;
  out.push({ label, value: pct(now / was) });
}

function statRows(statId: string, pawn: Pawn, ctx: StatContext): AttrRow[] {
  const def = STAT.get(statId);
  if (!def) return [];
  const f = def.formula;
  const has = (t: string) => new RegExp(`\\b${t}\\b`).test(f);
  const rows: AttrRow[] = [];
  const mh = pawn.equipment?.mainHand;
  const power = has('POWER')
    ? powerStatOf(mh ? itemService.getItemById(mh.itemId)?.weaponProperties : undefined)
    : null;
  for (const s of CORE_STATS)
    if (has(s.id.toUpperCase()) || power === s.id)
      nudged(
        pawn,
        statId,
        { stats: { ...pawn.stats, [s.id]: 10 } },
        `${s.name} ${pawn.stats[s.id]}`,
        rows
      );
  const body = pawn.physicalTraits;
  if (has('weight') && body)
    nudged(
      pawn,
      statId,
      { physicalTraits: { ...body, weight: 70 } },
      `Build ${Math.round(body.weight)} kg`,
      rows
    );
  if (has('APT') && isAptitudeStat(statId))
    nudged(
      pawn,
      statId,
      { aptitudes: { ...pawn.aptitudes, [statId]: 1 } as Pawn['aptitudes'] },
      'Knack',
      rows
    );
  for (const cap of CAPACITIES) {
    const v = ctx.capacities[cap.id];
    if (cap.id !== 'pain' && has(cap.id) && v !== undefined && Math.abs(v - 1) >= 0.01)
      rows.push({ label: cap.name, value: x2(v) });
  }
  for (const m of traitMods(statId, pawn)) rows.push({ label: m.name, value: m.text });
  for (const c of conditionModifierContributions(pawn, statId as never))
    rows.push({
      label: c.name,
      value: `${c.value >= 0 ? '+' : '−'}${Math.abs(Math.round(c.value * 100))}%`
    });
  return rows;
}

function statCell(
  key: string,
  statId: string,
  blurb: string,
  pawn: Pawn,
  ctx: StatContext,
  form: 'x' | '%' | 'n' = 'x'
): AttrCell {
  const v = computeStatView(statId, pawn, ctx);
  const value = v?.value ?? 0;
  const base = v?.base || 1;
  const shown =
    form === '%'
      ? `${Math.round(value * 100)}%`
      : form === 'n'
        ? `${Math.round(value)}`
        : x2(value);
  return {
    key,
    label: STAT.get(statId)?.name ?? key,
    value: shown,
    trend: form === 'n' ? '' : trendOf(value / base),
    blurb,
    rows: statRows(statId, pawn, ctx)
  };
}

const MOVE_LABEL = {
  dexterity: (p: Pawn) => `Dexterity ${p.stats.dexterity}`,
  build: (p: Pawn) => `Build ${Math.round(p.physicalTraits?.weight ?? 70)} kg`,
  legs: () => 'Legs',
  needs: () => 'Hunger and weariness',
  boots: (p: Pawn) => itemService.getItemById(p.equipment?.boots?.itemId ?? '')?.name ?? 'Boots',
  barefoot: () => 'Barefoot',
  conditions: () => 'Ailments',
  load: () => 'Load'
} as const;

function bodyCells(pawn: Pawn, ctx: StatContext): AttrCell[] {
  const mv = pawnService.getMoveSpeed(pawn);
  const ratio = mv.sources.reduce((r, s) => r * s.mult, 1);
  const c = ctx.carry;
  const blood = pawn.maxBloodVolume
    ? (pawn.bloodVolume ?? pawn.maxBloodVolume) / pawn.maxBloodVolume
    : 1;
  const bleed = (pawn.limbs ?? []).reduce((s, l) => s + (l.bleedRate ?? 0), 0);
  const pain = conditionPainMultiplier(pawn);
  const organs = (re: RegExp) =>
    (pawn.limbs ?? [])
      .flatMap((l) => (l.parts ?? []).filter((p) => re.test(p.id)))
      .map((p) => ({
        label: partLabel(p.id),
        value: p.isMissing ? 'gone' : `${Math.round((p.health / (p.maxHp || 100)) * 100)}%`
      }));
  const capCell = (
    key: string,
    id: string,
    label: string,
    blurb: string,
    rows: AttrRow[]
  ): AttrCell => {
    const v = computeStatView(id, pawn, ctx)?.value ?? 1;
    return { key, label, value: x2(v), trend: trendOf(v), blurb, rows };
  };
  return [
    {
      key: 'move',
      label: 'Move',
      value: `${mv.tilesPerSecond.toFixed(1)}/s`,
      trend: trendOf(ratio),
      blurb: 'Pace across open ground.',
      rows: mv.sources
        .filter((s) => Math.abs(s.mult - 1) >= 0.005)
        .map((s) => ({ label: MOVE_LABEL[s.kind](pawn), value: pct(s.mult) }))
    },
    {
      key: 'carry',
      label: 'Carry',
      value: `${Math.round(c.weight.total)} kg`,
      trend: '',
      blurb: 'What can be lifted and walked with.',
      rows: [
        {
          label: `Strength ${c.strength}`,
          value: `${Math.round(c.weight.total - c.weight.gear)} kg`
        },
        ...c.gearSources
          .filter((g) => g.weightKg)
          .map((g) => ({ label: g.name, value: `+${Math.round(g.weightKg)} kg` }))
      ]
    },
    {
      key: 'pack',
      label: 'Pack room',
      value: `${Math.round(c.volume.total)} L`,
      trend: '',
      blurb: 'What fits on back and belt.',
      rows: [
        {
          label: `Build ${Math.round(c.bodyWeight)} kg`,
          value: `${Math.round(c.volume.total - c.volume.gear)} L`
        },
        ...c.gearSources
          .filter((g) => g.volumeL)
          .map((g) => ({ label: g.name, value: `+${Math.round(g.volumeL)} L` }))
      ]
    },
    {
      key: 'blood',
      label: 'Blood',
      value: `${Math.round(blood * 100)}%`,
      trend: trendOf(blood),
      blurb: 'Blood left in the body.',
      rows: [{ label: 'Bleeding', value: bleed > 0 ? `${bleed.toFixed(1)}/s` : 'none' }]
    },
    statCell('healing', 'heal_rate', 'How fast wounds close.', pawn, ctx),
    {
      key: 'pain',
      label: 'Pain felt',
      value: x2(pain),
      trend: trendOf(pain, true),
      blurb: 'How sharply pain arrives.',
      rows: conditionModifierContributions(pawn, 'pain')
        .filter((m) => m.value !== 1)
        .map((m) => ({ label: m.name, value: x2(m.value) }))
    },
    capCell('sight', 'sight', 'Sight', 'How well the eyes serve.', organs(/Eye$/)),
    capCell('hearing', 'hearing', 'Hearing', 'How well the ears serve.', organs(/Ear$/)),
    capCell(
      'wits',
      'consciousness',
      'Wits',
      'How much of the mind is all there.',
      WITS.map((id) => ({
        label: STAT.get(id)?.name ?? '',
        value: x2(computeStatView(id, pawn, ctx)?.value ?? 1)
      }))
    )
  ];
}

function fightCells(pawn: Pawn, ctx: StatContext): AttrCell[] {
  const guards = ['cutting_resistance', 'piercing_resistance', 'blunt_resistance'].map((id) => ({
    label: STAT.get(id)?.name ?? '',
    v: computeStatView(id, pawn, ctx)?.value ?? 0
  }));
  const top = Math.max(0, ...guards.map((g) => g.v));
  return [
    statCell('hit', 'hit_chance', 'How often a blow lands.', pawn, ctx),
    statCell('dodge', 'dodge', 'How often a blow misses.', pawn, ctx),
    statCell('block', 'block', 'Blows turned aside on shield or haft.', pawn, ctx, '%'),
    statCell(
      'precision',
      'hit_precision',
      'Blows that find a gap or a vital spot.',
      pawn,
      ctx,
      '%'
    ),
    statCell('range', 'aim_range', 'How far a shot reaches.', pawn, ctx),
    statCell('aim', 'aim_accuracy', 'How true a shot flies.', pawn, ctx),
    statCell('reload', 'reload_speed', 'How fast a crossbow is spanned again.', pawn, ctx),
    statCell('shot', 'ranged_damage', 'How hard a shot strikes.', pawn, ctx),
    {
      key: 'armour',
      label: 'Armour',
      value: `${Math.round(top)}`,
      trend: '',
      blurb: 'The best cover worn.',
      rows: guards.map((g) => ({ label: g.label, value: `${Math.round(g.v)}` }))
    },
    statCell('swing', 'attack_speed', 'How quickly the next blow follows.', pawn, ctx),
    statCell('strike', 'melee_damage', 'How hard a blow lands.', pawn, ctx),
    statCell('leverage', 'armor_damage', 'How well a blow bites through armour.', pawn, ctx),
    statCell('footing', 'knockdown_resistance', 'How hard to knock down.', pawn, ctx),
    statCell('draw', 'aim_speed', 'How fast a shot is drawn and loosed.', pawn, ctx),
    statCell('stealth', 'stealth', 'How hard to notice.', pawn, ctx)
  ];
}

const WORK_CELLS: [string, string, string][] = [
  ['Felling', 'woodcutting', 'Trees brought down.'],
  ['Building', 'construction', 'Walls, floors and roofs raised.'],
  ['Foraging', 'foraging', 'Wild food gathered.'],
  ['Farming', 'planting', 'Fields sown and reaped.'],
  ['Tending', 'caretaking', 'Wounds dressed and the sick looked after.'],
  ['Hauling', 'hauling', 'Loads carried to store.']
];
const CRAFTS = DISCIPLINE_PARENTS.flatMap((p) =>
  disciplineLeaves(p).length ? disciplineLeaves(p) : [p]
);
const eff = (c: SkillCell) => c.mods.speed * (c.mods.yield ?? 1) * (c.mods.quality ?? 1);

function workCells(pawn: Pawn, gs: GameState): AttrCell[] {
  const { mods, ranks } = pawnWorkTables(pawn);
  const a = gs.workAssignments?.[pawn.id];
  const cells: AttrCell[] = [];
  for (const [label, id, blurb] of WORK_CELLS) {
    const c = skillCell(pawn, id, mods, ranks, a);
    if (c)
      cells.push({
        key: id,
        label,
        value: x2(eff(c)),
        trend: trendOf(eff(c)),
        blurb,
        rows: [],
        work: c
      });
  }
  const crafts = CRAFTS.map((id) => skillCell(pawn, id, mods, ranks, a)).filter(
    (c): c is SkillCell => c !== null
  );
  const best = crafts.reduce((m, c) => Math.max(m, eff(c)), 0);
  cells.push({
    key: 'crafting',
    label: 'Crafting',
    value: x2(best),
    trend: trendOf(best),
    blurb: 'Each craft on its own.',
    rows: crafts.map((c) => ({ label: `${c.name} ${c.level}`, value: x2(eff(c)) }))
  });
  return cells;
}

function weatherCells(pawn: Pawn, ctx: StatContext): AttrCell[] {
  const t = pawnStatService.temperatureTolerance(pawn);
  const deg = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n))}°`;
  const nv = computeStatView('night_vision', pawn, ctx)?.value ?? 0;
  return [
    {
      key: 'cold',
      label: 'Cold',
      value: `to ${Math.round(t.coldOnset)}°`,
      trend: '',
      blurb: 'Coldest air borne without harm.',
      rows: [
        { label: 'Comfort', value: `${Math.round(t.comfortMin)}°` },
        ...t.coldSources.map((s) => ({ label: s.label, value: deg(-s.deg) }))
      ]
    },
    {
      key: 'heat',
      label: 'Heat',
      value: `to ${Math.round(t.heatOnset)}°`,
      trend: '',
      blurb: 'Hottest air borne without harm.',
      rows: [
        { label: 'Comfort', value: `${Math.round(t.comfortMax)}°` },
        ...t.heatSources.map((s) => ({ label: s.label, value: deg(s.deg) }))
      ]
    },
    {
      key: 'night',
      label: 'Night sight',
      value: `${Math.round(nv * 100)}%`,
      trend: nv > 0 ? 'up' : '',
      blurb: 'How much of the dark the eyes cut through.',
      rows: traitMods('night_vision', pawn).map((m) => ({ label: m.name, value: m.text }))
    }
  ];
}

function mindCells(pawn: Pawn, gs: GameState): AttrCell[] {
  const mood = pawnService.getMoodBreakdown(pawn, gs);
  const merged = new Map<string, number>();
  for (const c of mood.contributions) merged.set(c.label, (merged.get(c.label) ?? 0) + c.value);
  const moodRows = [...merged]
    .filter(([, v]) => Math.round(v) !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 8)
    .map(([label, v]) => ({ label, value: `${v > 0 ? '+' : '−'}${Math.abs(Math.round(v))}` }));
  const names = new Map([...(gs.pawns ?? []), ...(gs.worldPawns ?? [])].map((p) => [p.id, p.name]));
  const ties = (stages: string[]) =>
    relationshipsOf(gs.relationships, pawn.id)
      .filter((r) => stages.includes(r.stage))
      .map((r) => ({
        label: names.get(otherOf(r, pawn.id)) ?? '',
        value: STAGE_LABEL[r.stage].toLowerCase()
      }))
      .filter((r) => r.label);
  const friends = ties(['friends', 'best_friends']);
  const grudges = ties(['rivals', 'enemies']);
  return [
    {
      key: 'mood',
      label: 'Mood',
      value: `${Math.round(mood.mood)}`,
      trend: '',
      blurb: 'How the day sits.',
      rows: moodRows
    },
    {
      key: 'grudges',
      label: 'Grudges',
      value: `${grudges.length}`,
      trend: grudges.length ? 'down' : '',
      blurb: grudges.length ? 'Old wrongs not forgotten.' : 'No one is held against.',
      rows: grudges
    },
    {
      key: 'friends',
      label: 'Friends',
      value: `${friends.length}`,
      trend: friends.length ? 'up' : '',
      blurb: friends.length ? 'Those counted close.' : 'No one counted close yet.',
      rows: friends
    }
  ];
}

function socialCells(pawn: Pawn, ctx: StatContext): AttrCell[] {
  return [
    statCell('trade', 'trade', 'How good a bargain is struck.', pawn, ctx),
    statCell('oratory', 'oratory', 'How far words carry a crowd.', pawn, ctx),
    statCell('beauty', 'beauty', 'How others see the face.', pawn, ctx),
    statCell('prestige', 'prestige', 'How the name stands in the colony.', pawn, ctx, 'n')
  ];
}

export function attributeCategories(pawn: Pawn, gs: GameState): AttrCategory[] {
  const ctx = buildStatContext(pawn);
  return [
    { label: 'Body', cells: bodyCells(pawn, ctx) },
    { label: 'Fight', cells: fightCells(pawn, ctx) },
    { label: 'Work', cells: workCells(pawn, gs) },
    { label: 'Weather', cells: weatherCells(pawn, ctx) },
    { label: 'Mind', cells: mindCells(pawn, gs) },
    { label: 'Social', cells: socialCells(pawn, ctx) }
  ];
}
