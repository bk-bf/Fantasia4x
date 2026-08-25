import type {
  GameState,
  Pawn,
  Mob,
  PlacedBuilding,
  ConditionDef,
  ConditionStage,
  Injury,
  LimbState,
  EntityCondition,
  DroppedItem,
  DeadPawnRecord,
  Item,
  EquipmentSlot
} from '../core/types';
import {
  HEALING_CONFIG,
  CARE_CONFIG,
  isTended,
  isUncareable,
  healLimbs,
  rollWoundClotting,
  CLOT_ROLL_INTERVAL,
  BASE_CLOT_CHANCE
} from '../core/defs/wounds';
import { feedOnVictim } from '../core/defs/lineages';
import { coversPart } from '../core/rules/gear/armorCoverage';
import { lethalAnatomyCause } from '../core/defs/bodyParts';
import conditionsData from '../database/pawns/conditions.jsonc';
import buildingsData from '../database/world/buildings.jsonc';
const BED_TREATMENT_BONUS = new Map<string, number>(
  (buildingsData as unknown as Array<{ id: string; effects?: { treatmentBonus?: number } }>)
    .filter((b) => (b.effects?.treatmentBonus ?? 0) > 0)
    .map((b) => [b.id, b.effects!.treatmentBonus!])
);
import { itemService } from '../services/ItemService';
import { pawnStatService } from '../services/PawnStatService';
import { socialService } from '../services/SocialService';
import { memoryService } from '../services/MemoryService';
import { simLog } from '../core/util/logSink';
import { gameLogger } from '../debug/gameLogger';
import { perTick, SECONDS_PER_TICK } from '../core/util/time';
import {
  driveNeedConditions,
  decayIntoxication,
  driveTemperatureConditions,
  driveEncumbrance,
  driveWieldStrain,
  driveWindchill,
  getConditionFloater,
  applyShock,
  snapshotConditionStages,
  snapshotVitalStages,
  emitPersistentConditionFloaters,
  detectVitalEscalations,
  conditionsSig,
  syncFractureConditions,
  getTransientConditionDef,
  getConditionDefById,
  CONDITION_IDS_WITH_TRIGGERS,
  COLLAPSE_CONSCIOUSNESS,
  RECOVER_CONSCIOUSNESS,
  FSM_STATE_BY_CONDITION,
  TIRED_FATIGUE_THRESHOLD
} from '../core/rules/body/conditions';
import {
  evaluatePredicate,
  fireTriggers,
  type GraphContext,
  type FiredEdge
} from '../core/rules/body/conditionGraph';
import {
  weatherEffects,
  diurnalTempDelta,
  coldExposure,
  heatExposure,
  thermalAt,
  isRoofedTile,
  effectiveTemperature,
  effectiveWindAt,
  seasonBakedTemp,
  getAmbientLight,
  computeTileLightLevel,
  ticksFromGameHours,
  TURNS_PER_DAY,
  dayIndexForTurn,
  isFullMoon
} from '../services/EnvironmentService';
import { getNightVision, dampenLightByNightVision } from '../core/rules/body/vision';
import { calcBloodRegenRate } from '../entities/Pawns';
import { rng } from '../core/util/rng';
import { pawnById } from '../core/state/pawnIndex';

import { PAWN_STATE, type PawnStateName } from './pawn/pawnStates';
import {
  findCombatThreat,
  amenityAt,
  FILTHY_THRESHOLD,
  WET_THRESHOLD,
  releaseClaimedJobs,
  forceUncontrolled
} from './pawn/pawnHelpers';
import {
  handleIdle,
  handleMovingToResource,
  handleWorking,
  handleHauling,
  handleMovingToDeposit
} from './pawn/handlers/work';
import {
  handleHungry,
  handleTired,
  handleMovingToNeed,
  handleEating,
  handleSleeping,
  handleDrinking,
  handleWashing,
  handleSocialising,
  handleLounging
} from './pawn/handlers/needs';
import {
  handleFighting,
  handleFleeing,
  handleHunting,
  handleBloodHunt
} from './pawn/handlers/combat';
import { handleRescuing } from './pawn/handlers/rescue';
import {
  handleCrying,
  handleHiding,
  handlePanicking,
  shouldRollBreakdown,
  breakdownChance,
  rollBreakdown,
  pickBreakdownKind,
  CATHARSIS_HOURS
} from './pawn/handlers/breakdown';
import { tryRally, RALLIED_HOURS, RALLY_RELATION_BOOST } from './pawn/rally';

const BREAKDOWN_STATE_BY_KIND: Record<string, string> = {
  crying: PAWN_STATE.CRYING,
  hiding: PAWN_STATE.HIDING,
  fleeing: PAWN_STATE.PANICKING
};
const BREAKDOWN_STATES: ReadonlySet<string> = new Set([
  PAWN_STATE.CRYING,
  PAWN_STATE.HIDING,
  PAWN_STATE.PANICKING
]);
import { moodEffect } from '../core/defs/moods';
import { needNum } from '../core/defs/needs';
export { PAWN_STATE, type PawnStateName };
export { resetUnreachableJobs } from './pawn/pawnHelpers';

const COMBAT_SCAN_INTERVAL = 6;

const SHELTER_RECOVERY_MUL = 2.5;
const SHELTER_WIND_MUL = 0.25;

const EXPOSURE_GAIN_PER_SEC = 4;
const EXPOSURE_DRAIN_PER_SEC = 5;

function approachExposure(current: number, target: number, recoveryMul: number): number {
  if (target > current) return Math.min(target, current + perTick(EXPOSURE_GAIN_PER_SEC));
  if (target < current)
    return Math.max(target, current - perTick(EXPOSURE_DRAIN_PER_SEC) * recoveryMul);
  return current;
}

const WET_COLD_EXTRA = 0.8;
const WET_HEAT_REDUCT = 0.6;
const WIND_COLD_EXTRA = 0.6;
const WET_SOAKED = 95;

const ACTIVE_HEAL_MUL = 0.1;
const SHELTER_HEAL_MUL = 1.6;

const CONDITIONS_DB = conditionsData as unknown as ConditionDef[];

const BLEED_ETA_REF_HOURS = 8;

function getConditionStage(conditionId: string, severity: number): ConditionStage | undefined {
  const def = CONDITIONS_DB.find((d) => d.id === conditionId);
  if (!def) return undefined;
  let active: ConditionStage | undefined;
  for (const stage of def.stages) {
    if (severity >= stage.minSeverity) active = stage;
  }
  return active;
}

export function killPawn(
  pawn: Pawn,
  cause: DeadPawnRecord['cause'],
  gameState: GameState
): GameState {
  simLog.logActivity({
    turn: gameState.turn,
    type: 'pawn_action',
    actor: pawn.id,
    action: 'died',
    target: cause,
    result: `${pawn.name} has died of ${cause.replace('_', ' ')}.`,
    severity: 'critical'
  });
  return finalizePawnDeath(pawn, cause, gameState);
}

function finalizePawnDeath(
  pawn: Pawn,
  cause: DeadPawnRecord['cause'],
  gameState: GameState
): GameState {
  simLog.pawnDeath(
    pawn.id,
    pawn.name,
    String(cause),
    gameState.turn,
    pawn.position?.x ?? -1,
    pawn.position?.y ?? -1
  );
  const deadRecord = {
    name: pawn.name,
    cause,
    turn: gameState.turn,
    stats: {
      strength: pawn.stats.strength ?? 10,
      dexterity: pawn.stats.dexterity ?? 10,
      intelligence: pawn.stats.intelligence ?? 10
    },
    id: pawn.id,
    ...(pawn.kin ? { kin: pawn.kin } : {})
  };

  gameState = socialService.onPawnDeath(gameState, pawn);

  const pos = pawn.position;
  const newDrops: DroppedItem[] = [];
  if (pos) {
    const tag = `${pawn.id}-${gameState.turn}`;
    for (const [resourceId, qty] of Object.entries(pawn.inventory?.items ?? {})) {
      if (qty > 0)
        newDrops.push({
          id: `death-${tag}-${resourceId}`,
          resourceId,
          x: pos.x,
          y: pos.y,
          quantity: qty
        });
    }
    const droppedInstances = [
      ...(pawn.inventory?.instances ?? []),
      ...Object.values(pawn.equipment ?? {}).filter((i): i is NonNullable<typeof i> => !!i)
    ];
    for (const inst of droppedInstances) {
      newDrops.push({
        id: `death-${tag}-${inst.instanceId}`,
        resourceId: inst.itemId,
        x: pos.x,
        y: pos.y,
        quantity: 1,
        instance: inst
      });
    }
    newDrops.push({
      id: `corpse-${tag}`,
      resourceId: 'pawn_carcass',
      x: pos.x,
      y: pos.y,
      quantity: 1,
      name: itemService.makeDynamicName('pawn_carcass', pawn.name)
    });
  }

  const pawns = gameState.pawns.map((p) => {
    if (p.id === pawn.id) {
      return {
        ...p,
        isAlive: false,
        corpseDropped: true,
        currentState: 'Dead',
        activeJob: undefined,
        path: [],
        isMoving: false,
        equipment: {},
        inventory: p.inventory ? { ...p.inventory, items: {}, instances: [] } : p.inventory
      };
    }
    if (p.isAlive === false) return p;
    return {
      ...p,
      state: { ...p.state, mood: Math.max(0, (p.state?.mood ?? 50) - 5) }
    };
  });

  const jobs = (gameState.jobs ?? []).map((j) =>
    j.claimedBy === pawn.id ? { ...j, claimedBy: null } : j
  );

  return {
    ...gameState,
    pawns,
    jobs,
    droppedItems: [...(gameState.droppedItems ?? []), ...newDrops],
    deadPawns: [...(gameState.deadPawns ?? []), deadRecord]
  };
}

export function reapDeadPawns(gameState: GameState): GameState {
  if (!gameState.pawns.some((p) => p.isAlive === false)) return gameState;

  let state = gameState;
  for (const p of gameState.pawns) {
    if (p.isAlive === false && !p.corpseDropped) {
      state = finalizePawnDeath(p, 'combat', state);
    }
  }

  return {
    ...state,
    pawns: state.pawns.filter((p) => p.isAlive !== false)
  };
}

const DARKNESS_ONSET = 0.5;
const DARKNESS_SIGHT_FLOOR = 0.1;

function tickConditions(pawn: Pawn, gameState: GameState): GameState {
  const conditions = (pawn.conditions ??= []);
  const prevStages = snapshotConditionStages(conditions);
  const prevVitalStages = snapshotVitalStages(conditions);
  const condSigBefore = conditionsSig(conditions);
  const maxBloodVolume = pawn.maxBloodVolume ?? 100;
  let bloodVolume = pawn.bloodVolume ?? maxBloodVolume;
  const limbs = pawn.limbs ?? [];

  {
    const pos = pawn.position;
    const tileLight = pos
      ? computeTileLightLevel(
          gameState.turn,
          gameState.buildings ?? [],
          pos.x,
          pos.y,
          gameState.worldMap
        )
      : 1;
    const el = dampenLightByNightVision(tileLight, getNightVision(pawn));
    pawn.effectiveLight =
      el >= DARKNESS_ONSET ? 1 : Math.max(DARKNESS_SIGHT_FLOOR, el / DARKNESS_ONSET);
  }

  const needVals = pawn.needs as unknown as Record<string, number> | undefined;
  const lethalCause = driveNeedConditions(conditions, needVals);
  decayIntoxication(conditions);
  if (lethalCause) {
    return killPawn(
      { ...gameState.pawns.find((p) => p.id === pawn.id)!, conditions, bloodVolume },
      lethalCause as Parameters<typeof killPawn>[1],
      {
        ...gameState,
        pawns: gameState.pawns.map((p) =>
          p.id === pawn.id ? { ...p, conditions, bloodVolume } : p
        )
      }
    );
  }

  let windLevel = 0;
  {
    const pos = pawn.position;
    const tile = pos ? gameState.worldMap[pos.y]?.[pos.x] : undefined;
    const needs = pawn.needs;
    const hasExposure = !!needs && ((needs.coldExposure ?? 0) > 0 || (needs.heatExposure ?? 0) > 0);
    const hasTempCondition = conditions.some(
      (c) => c.id === 'hypothermia' || c.id === 'heat_stroke'
    );
    if (tile || hasTempCondition || hasExposure) {
      const thermal = pos ? thermalAt(pos.x, pos.y) : undefined;
      if (pos && thermal) {
        windLevel = effectiveWindAt(pos.x, pos.y, gameState.weather, thermal, gameState.worldMap);
        if (thermal.roofed) windLevel *= SHELTER_WIND_MUL;
      }
      const airDelta =
        weatherEffects(gameState.weather).tempDelta +
        diurnalTempDelta(gameState.turn, gameState.season);
      const base = tile ? seasonBakedTemp(tile.terrainType, gameState.season) : 15;
      const temp = thermal ? effectiveTemperature(base, airDelta, thermal) : base + airDelta;
      const tol = pawnStatService.temperatureTolerance(pawn);
      let coldTarget = coldExposure(temp, tol.coldOnset);
      let heatTarget = heatExposure(temp, tol.heatOnset);
      const wetness = needs?.wetness ?? 0;
      if (wetness > 0) {
        const f = wetness / 100;
        coldTarget *= 1 + WET_COLD_EXTRA * f;
        heatTarget *= 1 - WET_HEAT_REDUCT * f;
      }
      if (windLevel > 0 && coldTarget > 0) coldTarget *= 1 + WIND_COLD_EXTRA * windLevel;
      const recoveryMul = pos && isRoofedTile(pos.x, pos.y) ? SHELTER_RECOVERY_MUL : 1;
      const cold = approachExposure(needs?.coldExposure ?? 0, coldTarget, recoveryMul);
      const heat = approachExposure(needs?.heatExposure ?? 0, heatTarget, recoveryMul);
      if (cold > 50 || heat > 50 || Number.isNaN(coldTarget)) {
        gameLogger.log(
          gameState.turn,
          'NEED-CHECK',
          () =>
            `TEMP-DBG ${pawn.name} pos:(${pawn.position?.x},${pawn.position?.y}) ` +
            `terrain:${tile?.terrainType ?? '?'} cachedTemp:${tile?.temperature} ` +
            `base:${base.toFixed(1)} eff:${temp.toFixed(1)} ` +
            `onset:[${tol.coldOnset.toFixed(1)},${tol.heatOnset.toFixed(1)}] ` +
            `comfort:[${tol.comfortMin},${tol.comfortMax}] resDeg:[${tol.coldDeg.toFixed(1)},${tol.heatDeg.toFixed(1)}] ` +
            `coldTarget:${coldTarget} heatTarget:${heatTarget} cold:${cold.toFixed(1)} heat:${heat.toFixed(1)} ` +
            `wet:${(needs?.wetness ?? 0).toFixed(0)} wind:${windLevel.toFixed(2)} roofed:${!!thermal?.roofed} ` +
            `equip:[${Object.values(pawn.equipment ?? {})
              .map((i) => i?.itemId)
              .filter(Boolean)
              .join(',')}]`
        );
      }
      if (needs) {
        needs.coldExposure = cold;
        needs.heatExposure = heat;
      }
      const lethalTemp = driveTemperatureConditions(conditions, cold, heat, recoveryMul);
      if (lethalTemp) {
        return killPawn(
          { ...gameState.pawns.find((p) => p.id === pawn.id)!, conditions, bloodVolume },
          lethalTemp as Parameters<typeof killPawn>[1],
          {
            ...gameState,
            pawns: gameState.pawns.map((p) =>
              p.id === pawn.id ? { ...p, conditions, bloodVolume } : p
            )
          }
        );
      }
      if (wetness >= WET_SOAKED) {
        const edges = fireTriggers(
          getTransientConditionDef('wet')?.triggers,
          buildGraphContext(pawn, gameState.turn),
          (c) => rng.chance(perTick(c)),
          false
        );
        for (const edge of edges) applyConditionEdge(conditions, edge);
      }
    }
  }

  driveWindchill(conditions, windLevel);

  {
    const cap = itemService.getCarryCapacityBreakdown(pawn).weight.total;
    const load = itemService.getCurrentCarryLoad(pawn, gameState).weightKg;
    driveEncumbrance(conditions, cap > 0 ? load / cap : 0);
  }

  {
    const mhReq = pawn.equipment?.mainHand
      ? itemService.getItemById(pawn.equipment.mainHand.itemId)?.weaponProperties?.wieldRequirement
          ?.strength
      : undefined;
    driveWieldStrain(conditions, mhReq ? mhReq - pawn.stats.strength : 0);
  }

  let limbsDirty = false;
  if (gameState.turn % CLOT_ROLL_INTERVAL === 0 && limbs.length > 0) {
    const clotChance = Math.min(
      0.95,
      Math.max(0, BASE_CLOT_CHANCE * pawnStatService.evaluateStat('blood_clotting', pawn))
    );
    limbsDirty = rollWoundClotting(limbs, clotChance, gameState.turn);
  }

  const totalBleedRate = limbs.reduce((sum, l) => sum + (l.bleedRate ?? 0), 0);

  if (totalBleedRate > 0) {
    bloodVolume = Math.max(0, bloodVolume - perTick(totalBleedRate));
  }

  if (totalBleedRate === 0 && bloodVolume < maxBloodVolume) {
    bloodVolume = Math.min(maxBloodVolume, bloodVolume + perTick(calcBloodRegenRate(pawn.stats)));
  }

  if ((pawn.conditionTimers?.burning ?? 0) > 0) {
    const fireRes = Math.min(
      0.9,
      Math.max(0, pawnStatService.evaluateStat('fire_resistance', pawn))
    );
    bloodVolume = Math.max(0, bloodVolume - perTick(BURNING_DPS) * (1 - fireRes));
    if (bloodVolume <= 0) {
      const gs = {
        ...gameState,
        pawns: gameState.pawns.map((p) =>
          p.id === pawn.id ? { ...p, conditions, bloodVolume: 0, limbs } : p
        )
      };
      return killPawn(gs.pawns.find((p) => p.id === pawn.id)!, 'burning', gs);
    }
  }

  if (pawn.needs && envSelfConditionActive(pawn, 'photosynthesis', gameState.turn)) {
    pawn.needs.hunger = Math.max(
      0,
      pawn.needs.hunger - perTick(PHOTOSYNTHESIS_HUNGER_FILL_PER_SEC)
    );
  }

  if (bloodVolume <= 0) {
    const updatedGs = {
      ...gameState,
      pawns: gameState.pawns.map((p) =>
        p.id === pawn.id ? { ...p, conditions, bloodVolume: 0, limbs } : p
      )
    };
    return killPawn(updatedGs.pawns.find((p) => p.id === pawn.id)!, 'blood_loss', updatedGs);
  }

  let infectionPressure = 0;
  for (const limb of limbs) {
    for (const part of limb.parts ?? []) {
      for (const w of part.injuries) {
        const open =
          w.bleeding > 0 ||
          w.severity === 'serious' ||
          w.severity === 'critical' ||
          w.severity === 'destroyed';
        const age = gameState.turn - (w.inflictedAt ?? gameState.turn);
        if (
          open &&
          !isUncareable(w) &&
          !isTended(w, gameState.turn) &&
          age >= CARE_CONFIG.infectionIncubationTicks
        ) {
          infectionPressure += CARE_CONFIG.infectionRiskPerWound;
        }
      }
    }
  }
  infectionPressure = Math.min(infectionPressure, CARE_CONFIG.infectionRiskMax);
  const immune = Math.max(
    0,
    Math.min(0.95, CARE_CONFIG.immuneResistBase + (pawn.stats.constitution - 10) * 0.02)
  );
  const infIdx = conditions.findIndex((c) => c.id === 'infection');
  const curInf = infIdx >= 0 ? conditions[infIdx].severity : 0;
  const nextInf =
    infectionPressure > 0
      ? Math.min(1, curInf + perTick(infectionPressure * (1 - immune)))
      : Math.max(0, curInf - perTick(CARE_CONFIG.infectionRecovery));
  if (nextInf <= 0) {
    if (infIdx >= 0) conditions.splice(infIdx, 1);
  } else if (infIdx >= 0) {
    conditions[infIdx] = { ...conditions[infIdx], severity: nextInf };
  } else {
    conditions.push({ id: 'infection', severity: nextInf });
  }
  const infectionDef = CONDITIONS_DB.find((d) => d.id === 'infection');
  if (infectionDef && nextInf >= infectionDef.lethalSeverity) {
    const updatedGs = {
      ...gameState,
      pawns: gameState.pawns.map((p) =>
        p.id === pawn.id ? { ...p, conditions, bloodVolume, limbs } : p
      )
    };
    return killPawn(updatedGs.pawns.find((p) => p.id === pawn.id)!, 'infection', updatedGs);
  }

  if (lethalAnatomyCause(limbs)) {
    const updatedGs = {
      ...gameState,
      pawns: gameState.pawns.map((p) =>
        p.id === pawn.id ? { ...p, conditions, bloodVolume, limbs } : p
      )
    };
    return killPawn(updatedGs.pawns.find((p) => p.id === pawn.id)!, 'critical_limb', updatedGs);
  }

  syncFractureConditions(conditions, limbs);

  applyShock(conditions, pawn.pain ?? 0, 1 - bloodVolume / maxBloodVolume);

  {
    const timers = pawn.conditionTimers;
    const timerHas =
      !!timers &&
      Object.entries(timers).some(([k, v]) => v > 0 && CONDITION_IDS_WITH_TRIGGERS.has(k));
    const persistHas = conditions.some((c) => CONDITION_IDS_WITH_TRIGGERS.has(c.id));
    if (timerHas || persistHas) {
      const ctx = buildGraphContext(pawn, gameState.turn);
      const roll = (chance: number) => rng.chance(perTick(chance));
      if (timers) {
        for (const [id, rem] of Object.entries(timers)) {
          if (rem <= 0 || !CONDITION_IDS_WITH_TRIGGERS.has(id)) continue;
          for (const e of fireTriggers(getConditionDefById(id)?.triggers, ctx, roll, false))
            applyFiredEdge(pawn, conditions, e);
        }
      }
      for (const c of conditions) {
        if (!CONDITION_IDS_WITH_TRIGGERS.has(c.id)) continue;
        ctx.sourceSeverity = c.severity;
        for (const e of fireTriggers(getConditionDefById(c.id)?.triggers, ctx, roll, false))
          applyFiredEdge(pawn, conditions, e);
      }
    }
  }

  stampTriggeredConditions(pawn);

  if (pawn.bloodNeedKind && pawn.isAlive !== false) {
    const thirsting = (pawn.conditionTimers?.bloodthirst ?? 0) > 0;
    if (thirsting && pawn.currentState !== PAWN_STATE.COLLAPSED) {
      if (pawn.currentState !== PAWN_STATE.BLOOD_HUNT) {
        pawn.currentState = PAWN_STATE.BLOOD_HUNT;
        pawn.activeJob = undefined;
        pawn.huntTargetId = undefined;
        pawn.path = [];
        pawn.isMoving = false;
      }
      if (pawn.drafted) {
        pawn.drafted = false;
        pawn.draftTarget = undefined;
      }
    } else if (!thirsting && pawn.currentState === PAWN_STATE.BLOOD_HUNT) {
      pawn.currentState = PAWN_STATE.IDLE;
      pawn.huntTargetId = undefined;
    }
  }

  if (gameState.turn % 750 === 0) {
    if (pawn.lineagePaths?.length) {
      if ((pawn.needs?.wetness ?? 0) >= 50) {
        const deeds = (pawn.deeds ??= {});
        deeds.wetHours = (deeds.wetHours ?? 0) + 1;
      }
      if (pawn.position) {
        const { x, y } = pawn.position;
        const isWaterish = (t?: { type?: string; terrainType?: string }) =>
          !!t && (t.type === 'water' || t.terrainType === 'river' || t.terrainType === 'lake');
        const here = gameState.worldMap[y]?.[x];
        const onWater =
          here?.terrainType === 'swamp' ||
          isWaterish(here) ||
          isWaterish(gameState.worldMap[y]?.[x + 1]) ||
          isWaterish(gameState.worldMap[y]?.[x - 1]) ||
          isWaterish(gameState.worldMap[y + 1]?.[x]) ||
          isWaterish(gameState.worldMap[y - 1]?.[x]);
        if (onWater) {
          const deeds = (pawn.deeds ??= {});
          deeds.waterHours = (deeds.waterHours ?? 0) + 1;
        }
      }
      if (
        getAmbientLight(gameState.turn) < 0.35 &&
        pawn.position &&
        !isRoofedTile(pawn.position.x, pawn.position.y)
      ) {
        const deeds = (pawn.deeds ??= {});
        deeds.starlitHours = (deeds.starlitHours ?? 0) + 1;
        if (isFullMoon(dayIndexForTurn(gameState.turn)))
          deeds.moonlightHours = (deeds.moonlightHours ?? 0) + 1;
      }
    }
    if (pawn.silkSpinner && gameState.turn % 4500 === 0 && pawn.inventory) {
      const alive = (pawn.limbs ?? []).some((l) =>
        l.parts?.some((p) => p.id === 'spinneret' && !p.isMissing && p.health > 0)
      );
      if (alive) {
        pawn.inventory.items['raw_silk'] = (pawn.inventory.items['raw_silk'] ?? 0) + 1;
        pawn.inventory.weightKg += itemService.getItemById('raw_silk')?.weightKg ?? 0;
      }
    }
    if (pawn.bloodNeedKind && pawn.isAlive !== false && pawn.needs) {
      const hunger = Math.min(
        100,
        (pawn.needs.bloodHunger ?? 0) + needNum('bloodHunger', 'fillPerGameHour', 2)
      );
      pawn.needs.bloodHunger = hunger;
      if (
        pawn.bloodNeedKind === 'humanoid' &&
        hunger >= needNum('bloodHunger', 'feedThreshold', 70) &&
        pawn.position
      ) {
        const feedRadius = needNum('bloodHunger', 'feedRadius', 12);
        const victim = gameState.pawns.find(
          (v) =>
            v.id !== pawn.id &&
            v.isAlive !== false &&
            v.position &&
            Math.abs(v.position.x - pawn.position!.x) + Math.abs(v.position.y - pawn.position!.y) <=
              feedRadius
        );
        if (victim) feedOnVictim(pawn, victim, gameState.turn);
      }
      if ((pawn.needs.bloodHunger ?? 0) >= needNum('bloodHunger', 'rageThreshold', 100)) {
        const timers = (pawn.conditionTimers ??= {});
        timers.bloodthirst = Math.max(
          timers.bloodthirst ?? 0,
          ticksFromGameHours(needNum('bloodHunger', 'rageDurationHours', 6))
        );
      }
    }
  }

  pawn.conditions = conditionsSig(conditions) !== condSigBefore ? conditions.slice() : conditions;
  pawn.bloodVolume = bloodVolume;
  pawn.limbs = limbsDirty ? limbs.slice() : limbs;
  emitPersistentConditionFloaters(
    prevStages,
    conditions,
    pawn.position?.x ?? -1,
    pawn.position?.y ?? -1
  );
  memoryService.recordConditionOnsets(gameState, pawn, prevStages, conditions);
  for (const esc of detectVitalEscalations(prevVitalStages, conditions)) {
    simLog.vitalAlert(
      pawn.id,
      pawn.name,
      esc.id as 'malnutrition' | 'dehydration',
      esc.stageLabel,
      gameState.turn,
      pawn.position?.x ?? -1,
      pawn.position?.y ?? -1
    );
  }
  return gameState;
}

function splintBoneHeal(pawn: Pawn): ((partId: string) => number) | undefined {
  const eq = pawn.equipment;
  if (!eq) return undefined;
  let pieces: { item: Item; slot: EquipmentSlot }[] | null = null;
  for (const [slot, inst] of Object.entries(eq)) {
    if (!inst) continue;
    const item = itemService.getItemById(inst.itemId);
    const mult = item?.armorProperties?.boneHealMultiplier;
    if (!item || !mult || mult <= 1) continue;
    (pieces ??= []).push({ item, slot: slot as EquipmentSlot });
  }
  if (!pieces) return undefined;
  const worn = pieces;
  return (partId: string) => {
    let best = 1;
    for (const p of worn) {
      const m = p.item.armorProperties!.boneHealMultiplier!;
      if (m > best && coversPart(p.item, p.slot, partId)) best = m;
    }
    return best;
  };
}

export function healWounds(pawn: Pawn, turn = 0, buildings?: PlacedBuilding[]): Pawn {
  const limbs = pawn.limbs;
  const hasWounds = limbs?.some((l) => (l.parts ?? []).some((p) => p.injuries.length > 0));
  if (!limbs || !hasWounds) return pawn;

  const healRate = Math.max(0, pawnStatService.evaluateStat('heal_rate', pawn));
  const resting =
    pawn.currentState === PAWN_STATE.SLEEPING || pawn.currentState === PAWN_STATE.COLLAPSED;
  let mult = resting ? 1 : ACTIVE_HEAL_MUL;
  if (resting) {
    mult *= HEALING_CONFIG.sleepingMultiplier;
    if (pawn.position && isRoofedTile(pawn.position.x, pawn.position.y)) mult *= SHELTER_HEAL_MUL;
    if (buildings && pawn.position) {
      const px = pawn.position.x;
      const py = pawn.position.y;
      for (const b of buildings) {
        if (b.status !== 'complete' || b.x !== px || b.y !== py) continue;
        const bonus = BED_TREATMENT_BONUS.get(b.type);
        if (bonus) mult *= 1 + bonus;
        break;
      }
      const a = amenityAt(buildings, px, py);
      const amenityHeal = Math.min(0.5, a.beauty * 0.15);
      if (amenityHeal > 0) mult *= 1 + amenityHeal;
    }
  }
  if ((pawn.needs?.hunger ?? 0) <= HEALING_CONFIG.wellFedHunger)
    mult *= HEALING_CONFIG.wellFedMultiplier;
  if ((pawn.state?.mood ?? 50) >= HEALING_CONFIG.goodMood)
    mult *= HEALING_CONFIG.goodMoodMultiplier;
  const baseHeal = HEALING_CONFIG.baseHealPerTick * healRate * mult;
  if (baseHeal <= 0) return pawn;

  const newLimbs = healLimbs(limbs, baseHeal, turn, true, true, splintBoneHeal(pawn));
  if (newLimbs === limbs) return pawn;

  let painTotal = 0;
  const newInjuries: Injury[] = [];
  for (const l of newLimbs) {
    for (const p of l.parts ?? []) {
      for (const w of p.injuries) {
        painTotal += w.painContribution;
        newInjuries.push(w);
      }
    }
  }
  return {
    ...pawn,
    limbs: newLimbs,
    pain: Math.max(0, Math.min(100, Math.round(painTotal))),
    injuries: newInjuries
  };
}

const AURA_INTERVAL_TICKS = 180;
const AURA_DEFAULT_LINGER_SECONDS = 8;

function stampAuraCondition(target: Pawn | Mob, condId: string, lingerTicks: number): void {
  const timers = (target.conditionTimers ??= {});
  timers[condId] = Math.max(timers[condId] ?? 0, lingerTicks);
  if (!(target.transientConditions ?? []).includes(condId)) {
    (target.transientConditions ??= []).push(condId);
  }
}

export function tickAuras(state: GameState): void {
  if (state.turn % AURA_INTERVAL_TICKS !== 0) return;
  for (const emitter of state.pawns) {
    if (emitter.isAlive === false || !emitter.position) continue;
    const traits = emitter.traits;
    if (!traits || traits.length === 0) continue;
    for (const t of traits) {
      const aura = t.aura;
      if (!aura || !getTransientConditionDef(aura.condition)) continue;
      const lingerTicks = Math.max(
        AURA_INTERVAL_TICKS + 1,
        Math.round((aura.lingerSeconds ?? AURA_DEFAULT_LINGER_SECONDS) / SECONDS_PER_TICK)
      );
      const ex = emitter.position.x;
      const ey = emitter.position.y;
      if (aura.affects !== 'foes') {
        for (const p of state.pawns) {
          if (p.id === emitter.id || p.isAlive === false || !p.position) continue;
          if (Math.max(Math.abs(p.position.x - ex), Math.abs(p.position.y - ey)) <= aura.radius) {
            stampAuraCondition(p, aura.condition, lingerTicks);
          }
        }
      }
      if (aura.affects !== 'allies') {
        for (const m of state.mobs ?? []) {
          if (m.isAlive === false || m.state === 'Corpse') continue;
          if (Math.max(Math.abs(m.x - ex), Math.abs(m.y - ey)) <= aura.radius) {
            stampAuraCondition(m, aura.condition, lingerTicks);
          }
        }
      }
    }
  }
}

function stampTriggeredConditions(pawn: Pawn): void {
  const traits = pawn.traits;
  if (!traits?.length) return;
  for (const t of traits) {
    const conditionId = t.triggeredCondition;
    if (!conditionId) continue;
    const def = getTransientConditionDef(conditionId);
    const trig = def?.selfTrigger;
    if (!trig) continue;
    const meter = trig.meter === 'pain' ? (pawn.pain ?? 0) : 0;
    if (meter < trig.atOrAbove) continue;
    const timers = (pawn.conditionTimers ??= {});
    if ((timers[conditionId] ?? 0) > 0) continue;
    const spent = def?.onExpiry?.to;
    if (spent && (timers[spent] ?? 0) > 0) continue;
    timers[conditionId] = ticksFromGameHours(trig.durationHours);
  }
}

function tickConditionTimers(pawn: Pawn): Pawn {
  const durations = pawn.conditionTimers;
  if (!durations || Object.keys(durations).length === 0) return pawn;
  const next: Record<string, number> = {};
  for (const [key, val] of Object.entries(durations)) {
    const remaining = val - 1;
    if (remaining > 0) next[key] = remaining;
    else {
      const onExp = getTransientConditionDef(key)?.onExpiry;
      if (onExp)
        next[onExp.to] = Math.max(next[onExp.to] ?? 0, ticksFromGameHours(onExp.durationHours));
    }
  }
  const changed =
    Object.keys(next).length !== Object.keys(durations).length ||
    Object.entries(next).some(([k, v]) => v !== durations[k]);
  if (!changed) return pawn;
  return { ...pawn, conditionTimers: next };
}

function reapBrokenGear(pawn: Pawn): Pawn | null {
  let equipment = pawn.equipment;
  let equipChanged = false;
  for (const slot of Object.keys(pawn.equipment ?? {}) as (keyof NonNullable<
    Pawn['equipment']
  >)[]) {
    const inst = pawn.equipment?.[slot];
    if (inst && inst.durability != null && inst.durability <= 0) {
      if (!equipChanged) {
        equipment = { ...pawn.equipment };
        equipChanged = true;
      }
      delete (equipment as Record<string, unknown>)[slot as string];
    }
  }
  const insts = pawn.inventory?.instances ?? [];
  const keptInsts = insts.filter((i) => {
    if (i.durability == null || i.durability > 0) return true;
    const def = itemService.getItemById(i.itemId);
    const wearable = !!def?.maxDurability && def.maxDurability > 0 && !def.dynamicName;
    return !wearable;
  });
  const instChanged = keptInsts.length !== insts.length;
  if (!equipChanged && !instChanged) return null;
  return {
    ...pawn,
    equipment: equipChanged ? equipment : pawn.equipment,
    inventory: instChanged ? { ...pawn.inventory!, instances: keptInsts } : pawn.inventory
  };
}

const PHOTOSYNTHESIS_HUNGER_FILL_PER_SEC = 3.0;
const BURNING_DPS = 2.5;

function buildGraphContext(pawn: Pawn, turn: number): GraphContext {
  const maxBV = pawn.maxBloodVolume ?? 100;
  return {
    needs: (pawn.needs as unknown as Record<string, number>) ?? {},
    bloodFrac: (pawn.bloodVolume ?? maxBV) / maxBV,
    pain: pawn.pain ?? 0,
    ambientLight: getAmbientLight(turn),
    unsheltered: !(pawn.position && isRoofedTile(pawn.position.x, pawn.position.y)),
    fullMoon: isFullMoon(dayIndexForTurn(turn)),
    hasCondition: (id) =>
      (pawn.transientConditions ?? []).includes(id) ||
      (pawn.conditions ?? []).some((c) => c.id === id),
    sourceSeverity: 0
  };
}

function hasLivingPart(pawn: Pawn, partIds: string[]): boolean {
  for (const limb of pawn.limbs ?? []) {
    if (limb.isMissing) continue;
    for (const part of limb.parts ?? []) {
      if (!part.isMissing && partIds.includes(part.id)) return true;
    }
  }
  return false;
}

function envSelfConditionActive(pawn: Pawn, condId: string, turn: number): boolean {
  if (!(pawn.traits ?? []).some((t) => t.selfCondition === condId)) return false;
  const def = getTransientConditionDef(condId);
  if (!def?.activateWhen) return true;
  return evaluatePredicate(def.activateWhen, buildGraphContext(pawn, turn));
}

function applyConditionEdge(conditions: { id: string; severity: number }[], edge: FiredEdge): void {
  const sev = edge.severity ?? 0;
  const idx = conditions.findIndex((c) => c.id === edge.to);
  if (idx === -1) conditions.push({ id: edge.to, severity: sev });
  else if (sev > 0)
    conditions[idx] = {
      ...conditions[idx],
      severity: Math.min(1, conditions[idx].severity + sev)
    };
}

function applyFiredEdge(
  pawn: Pawn,
  conditions: { id: string; severity: number }[],
  edge: FiredEdge
): void {
  if (getConditionDefById(edge.to)?.transient === true) {
    const timers = (pawn.conditionTimers ??= {});
    timers[edge.to] = Math.max(timers[edge.to] ?? 0, ticksFromGameHours(edge.durationHours ?? 1));
  } else {
    applyConditionEdge(conditions, edge);
  }
}

export function syncTransientConditions(pawn: Pawn, turn?: number): Pawn {
  const ids: string[] = [];
  const isEating = pawn.state?.isEating || pawn.currentState === PAWN_STATE.EATING;
  const isSleeping = pawn.state?.isSleeping || pawn.currentState === PAWN_STATE.SLEEPING;

  if (isEating) ids.push('eating');
  if (isSleeping) ids.push('sleeping');
  if (!isSleeping && (pawn.needs?.fatigue ?? 0) >= TIRED_FATIGUE_THRESHOLD) ids.push('tired');
  if ((pawn.needs?.hygiene ?? 0) >= FILTHY_THRESHOLD) ids.push('filthy');

  for (const [id, remaining] of Object.entries(pawn.conditionTimers ?? {})) {
    if (remaining > 0) ids.push(id);
  }

  if (pawn.position && isRoofedTile(pawn.position.x, pawn.position.y)) ids.push('sheltered');
  if ((pawn.effectiveLight ?? 1) < 0.999) ids.push('darkness');
  if ((pawn.needs?.wetness ?? 0) >= WET_THRESHOLD) ids.push('wet');

  let envCtx: GraphContext | null = null;
  for (const t of pawn.traits ?? []) {
    const sc = t.selfCondition;
    if (!sc || ids.includes(sc)) continue;
    const def = getTransientConditionDef(sc);
    if (def?.hostParts?.length && pawn.limbs?.length && !hasLivingPart(pawn, def.hostParts))
      continue;
    if (def?.activateWhen) {
      if (turn == null) continue;
      envCtx ??= buildGraphContext(pawn, turn);
      if (evaluatePredicate(def.activateWhen, envCtx)) ids.push(sc);
    } else {
      ids.push(sc);
    }
  }

  const mood = pawn.state?.mood ?? 50;
  if (mood >= 80) ids.push('mood_ecstatic');
  else if (mood >= 60) ids.push('mood_content');
  else if (mood >= 40) {
  } else if (mood >= 20) ids.push('mood_sad');
  else ids.push('mood_depressed');

  const equipment = pawn.equipment;
  if (equipment) {
    for (const inst of Object.values(equipment)) {
      if (!inst) continue;
      const granted = itemService.getItemById(inst.itemId)?.grantsConditions;
      if (granted) for (const cid of granted) if (!ids.includes(cid)) ids.push(cid);
      if (inst.famed && inst.famedEnchants)
        for (const cid of inst.famedEnchants) if (!ids.includes(cid)) ids.push(cid);
    }
    const mh = equipment.mainHand;
    if (mh && equipment.offHand && itemService.getItemById(mh.itemId)?.weaponProperties?.twoHanded)
      ids.push('fouled_guard');
  }

  const totalBleed = (pawn.limbs ?? []).reduce((s, l) => s + (l.bleedRate ?? 0), 0);
  if (totalBleed > 0 && (pawn.bloodVolume ?? 0) > 0) {
    const hoursToEmpty = (pawn.bloodVolume! / totalBleed) * (24 / TURNS_PER_DAY);
    const severity = Math.max(0, Math.min(1, 1 - hoursToEmpty / BLEED_ETA_REF_HOURS));
    const stage = getConditionStage('bleeding', severity);
    if (stage) ids.push(`bleeding:${stage.label}`);
  }

  for (const condition of pawn.conditions ?? []) {
    const stage = getConditionStage(condition.id, condition.severity);
    if (stage) ids.push(`${condition.id}:${stage.label}`);
  }

  const current = pawn.transientConditions ?? [];
  if (ids.length === current.length && ids.every((e, i) => e === current[i])) return pawn;

  const timers = pawn.conditionTimers ?? {};
  if (pawn.position) {
    for (const id of ids) {
      if (current.includes(id) || id.includes(':') || (timers[id] ?? 0) > 0) continue;
      const f = getConditionFloater(id);
      if (f)
        simLog.pushCombatText({
          worldX: pawn.position.x,
          worldY: pawn.position.y,
          text: f.name,
          kind: 'condition',
          color: f.color
        });
    }
  }
  return { ...pawn, transientConditions: ids };
}

function logPawnTick(pawn: Pawn, gs: GameState): void {
  if (pawn.isAlive === false) return;
  if (!gameLogger.isEnabled) return;

  const pos = pawn.position ? `(${pawn.position.x},${pawn.position.y})` : '(-,-)';
  const job = pawn.activeJob;
  const targetStr = job
    ? `(${job.targetX},${job.targetY}) [${job.type}${job.jobId ? `#${job.jobId.slice(-4)}` : ''}]`
    : 'none';

  const hunger = (pawn.needs?.hunger ?? 0).toFixed(1);
  const fatigue = (pawn.needs?.fatigue ?? 0).toFixed(1);
  const state = (pawn.currentState ?? 'Idle').padEnd(18);

  const queueLabels = (pawn.jobQueue ?? []).map((id) => {
    const j = (gs.jobs ?? []).find((j) => j.id === id);
    return j
      ? `${j.type}(${j.targetX},${j.targetY})${j.claimedBy && j.claimedBy !== pawn.id ? '!' : ''}`
      : `?${id.slice(-4)}`;
  });
  const queueStr = queueLabels.length ? queueLabels.join(' > ') : 'empty';

  gameLogger.log(
    gs.turn,
    'PAWN-TICK',
    `${pawn.name.padEnd(12)} ${state}` +
      ` H:${hunger.padStart(5)} F:${fatigue.padStart(5)}` +
      ` pos:${pos.padEnd(9)} → target:${targetStr.padEnd(30)}` +
      ` queue:[${queueStr}]`
  );
}

type PawnHandler = (pawn: Pawn, gameState: GameState) => GameState;
const STATE_HANDLERS: Record<string, PawnHandler> = {
  [PAWN_STATE.IDLE]: handleIdle,
  [PAWN_STATE.MOVING_TO_RESOURCE]: handleMovingToResource,
  [PAWN_STATE.WORKING]: handleWorking,
  [PAWN_STATE.HUNGRY]: handleHungry,
  [PAWN_STATE.TIRED]: handleTired,
  [PAWN_STATE.MOVING_TO_NEED]: handleMovingToNeed,
  [PAWN_STATE.EATING]: handleEating,
  [PAWN_STATE.SLEEPING]: handleSleeping,
  [PAWN_STATE.HAULING]: handleHauling,
  [PAWN_STATE.MOVING_TO_DEPOSIT]: handleMovingToDeposit,
  [PAWN_STATE.DRINKING]: handleDrinking,
  [PAWN_STATE.WASHING]: handleWashing,
  [PAWN_STATE.SOCIALISING]: handleSocialising,
  [PAWN_STATE.LOUNGING]: handleLounging,
  [PAWN_STATE.FIGHTING]: handleFighting,
  [PAWN_STATE.FLEEING]: handleFleeing,
  [PAWN_STATE.HUNTING]: handleHunting,
  [PAWN_STATE.BLOOD_HUNT]: handleBloodHunt,
  [PAWN_STATE.RESCUING]: handleRescuing,
  [PAWN_STATE.CRYING]: handleCrying,
  [PAWN_STATE.HIDING]: handleHiding,
  [PAWN_STATE.PANICKING]: handlePanicking
};

function tickPawn(pawn: Pawn, gameState: GameState): GameState {
  if (gameState.turn % 30 === 0) logPawnTick(pawn, gameState);
  const state = pawn.currentState ?? PAWN_STATE.IDLE;
  const handler = STATE_HANDLERS[state];
  return handler ? handler(pawn, gameState) : gameState;
}

class PawnStateMachineImpl {
  tick(gameState: GameState): GameState {
    if (gameState.turn % 60 === 0) gameLogger.logMapSnap(gameState);

    tickAuras(gameState);

    let state = gameState;
    for (const pawn of state.pawns) {
      const current = pawnById(state.pawns, pawn.id);
      if (!current) continue;
      if (current.isAlive === false) continue;

      if (current.drafted) {
        if (current.activeJob || (state.jobs ?? []).some((j) => j.claimedBy === current.id)) {
          const jobs = (state.jobs ?? []).map((j) =>
            j.claimedBy === current.id ? { ...j, claimedBy: null } : j
          );
          state = {
            ...state,
            jobs,
            pawns: state.pawns.map((p) =>
              p.id === current.id ? { ...p, activeJob: undefined } : p
            )
          };
        }
      }

      state = tickConditions(current, state);
      let afterConditions = pawnById(state.pawns, pawn.id);
      if (!afterConditions || afterConditions.isAlive === false) continue;

      if (gameState.turn % 30 === 0) {
        const reaped = reapBrokenGear(afterConditions);
        if (reaped) {
          state = { ...state, pawns: state.pawns.map((p) => (p.id === pawn.id ? reaped : p)) };
          afterConditions = reaped;
        }
      }

      const inMelee =
        afterConditions.currentState === PAWN_STATE.FIGHTING ||
        afterConditions.currentState === PAWN_STATE.FLEEING ||
        afterConditions.currentState === PAWN_STATE.HUNTING ||
        (afterConditions.drafted === true && afterConditions.draftTarget?.type === 'attack');
      if (!inMelee) {
        const healed = healWounds(afterConditions, state.turn, state.buildings);
        if (healed !== afterConditions) {
          afterConditions = healed;
          state = {
            ...state,
            pawns: state.pawns.map((p) => (p.id === pawn.id ? healed : p))
          };
        }
      }
      const consciousness = pawnStatService.computeCapacities(afterConditions).consciousness ?? 1;

      const wasCollapsed = afterConditions.currentState === PAWN_STATE.COLLAPSED;
      if (wasCollapsed || consciousness < COLLAPSE_CONSCIOUSNESS) {
        const durations = { ...(afterConditions.conditionTimers ?? {}) };
        let jobs = state.jobs;
        if (wasCollapsed) {
          if (consciousness >= RECOVER_CONSCIOUSNESS) delete durations.collapse;
          else durations.collapse = Math.max(durations.collapse ?? 0, 2);
        } else {
          durations.collapse = Math.max(durations.collapse ?? 0, 2);
          jobs = releaseClaimedJobs(state.jobs, afterConditions.id);
        }
        const synced = syncTransientConditions(
          { ...afterConditions, conditionTimers: durations },
          gameState.turn
        );
        let forced: string | undefined;
        for (const id of synced.transientConditions ?? []) {
          if (FSM_STATE_BY_CONDITION[id]) {
            forced = FSM_STATE_BY_CONDITION[id];
            break;
          }
        }
        const downed: Pawn = forced
          ? forceUncontrolled(synced, forced)
          : { ...synced, currentState: PAWN_STATE.IDLE };
        state = {
          ...state,
          jobs,
          pawns: state.pawns.map((p) => (p.id === pawn.id ? downed : p))
        };
        continue;
      }

      if (
        (afterConditions.conditionTimers?.mental_breakdown ?? 0) > 0 ||
        BREAKDOWN_STATES.has(afterConditions.currentState ?? '')
      ) {
        const stepped = tickConditionTimers(afterConditions);
        if ((stepped.conditionTimers?.mental_breakdown ?? 0) <= 0) {
          const cath = moodEffect('mood_catharsis');
          socialService.addMoodModifier(
            stepped,
            'catharsis',
            cath?.label ?? 'A great weight lifted',
            cath?.value ?? 40,
            ticksFromGameHours(CATHARSIS_HOURS),
            gameState.turn
          );
          const recovered = syncTransientConditions(
            {
              ...stepped,
              currentState: PAWN_STATE.IDLE,
              activeJob: undefined,
              path: [],
              isMoving: false,
              hasReachedDestination: false
            },
            gameState.turn
          );
          state = { ...state, pawns: state.pawns.map((p) => (p.id === pawn.id ? recovered : p)) };
          continue;
        }
        const rallier = tryRally(stepped, state, gameState.turn);
        if (rallier) {
          const timers = { ...(stepped.conditionTimers ?? {}) };
          delete timers.mental_breakdown;
          timers.rallied = ticksFromGameHours(RALLIED_HOURS);
          const recovered = syncTransientConditions(
            {
              ...stepped,
              conditionTimers: timers,
              currentState: PAWN_STATE.IDLE,
              activeJob: undefined,
              path: [],
              isMoving: false,
              hasReachedDestination: false
            },
            gameState.turn
          );
          state = socialService.adjustRelation(state, stepped, rallier, RALLY_RELATION_BOOST, {
            label: 'Talked me back from the brink',
            kind: 'rescue'
          });
          simLog.logActivity({
            turn: gameState.turn,
            type: 'social',
            actor: rallier.id,
            action: 'rallies',
            target: stepped.id,
            result: `${rallier.name} talks ${stepped.name} back to their feet.`,
            severity: 'success'
          });
          state = { ...state, pawns: state.pawns.map((p) => (p.id === pawn.id ? recovered : p)) };
          continue;
        }
        const forced = BREAKDOWN_STATES.has(afterConditions.currentState ?? '')
          ? afterConditions.currentState!
          : PAWN_STATE.CRYING;
        const jobs = releaseClaimedJobs(state.jobs, afterConditions.id);
        const broken = forceUncontrolled(stepped, forced, false);
        state = { ...state, jobs, pawns: state.pawns.map((p) => (p.id === pawn.id ? broken : p)) };
        state = tickPawn(broken, state);
        const after = pawnById(state.pawns, pawn.id);
        if (after) {
          const synced = syncTransientConditions(after, gameState.turn);
          if (synced !== after)
            state = { ...state, pawns: state.pawns.map((p) => (p.id === pawn.id ? synced : p)) };
        }
        continue;
      }
      if (shouldRollBreakdown(afterConditions, gameState.turn)) {
        const resist = pawnStatService.evaluateStat('mental_resistance', afterConditions);
        const chance = breakdownChance(afterConditions.state?.mood ?? 50, resist);
        const broke = rollBreakdown(afterConditions, gameState.turn, chance);
        if (broke) {
          const kind = pickBreakdownKind(
            afterConditions.id,
            gameState.turn,
            !!findCombatThreat(afterConditions, state)
          );
          const forced = BREAKDOWN_STATE_BY_KIND[kind];
          const timers = {
            ...(afterConditions.conditionTimers ?? {}),
            mental_breakdown: ticksFromGameHours(broke.hours)
          };
          const jobs = releaseClaimedJobs(state.jobs, afterConditions.id);
          const synced = syncTransientConditions(
            { ...afterConditions, conditionTimers: timers },
            gameState.turn
          );
          const broken: Pawn = forceUncontrolled(synced, forced);
          state = {
            ...state,
            jobs,
            pawns: state.pawns.map((p) => (p.id === pawn.id ? broken : p))
          };
          state = tickPawn(broken, state);
          const after = pawnById(state.pawns, pawn.id);
          if (after) {
            const synced2 = syncTransientConditions(after, gameState.turn);
            if (synced2 !== after)
              state = { ...state, pawns: state.pawns.map((p) => (p.id === pawn.id ? synced2 : p)) };
          }
          continue;
        }
      }

      let forCollapse = afterConditions;

      if (forCollapse.drafted) {
        const stepped = tickConditionTimers(forCollapse);
        const synced = syncTransientConditions(stepped, gameState.turn);
        if (synced !== forCollapse) {
          state = {
            ...state,
            pawns: state.pawns.map((p) => (p.id === pawn.id ? synced : p))
          };
        }
        continue;
      }

      const inCombat =
        forCollapse.currentState === PAWN_STATE.FIGHTING ||
        forCollapse.currentState === PAWN_STATE.FLEEING;
      const scanForThreat =
        inCombat || (state.turn + (forCollapse.debugId ?? 0)) % COMBAT_SCAN_INTERVAL === 0;
      const threat = scanForThreat ? findCombatThreat(forCollapse, state) : null;
      if (threat) {
        const desired =
          (forCollapse.combatStance ?? 'defensive') === 'flee'
            ? PAWN_STATE.FLEEING
            : PAWN_STATE.FIGHTING;
        if (!inCombat) {
          const jobs =
            forCollapse.activeJob || (state.jobs ?? []).some((j) => j.claimedBy === forCollapse.id)
              ? (state.jobs ?? []).map((j) =>
                  j.claimedBy === forCollapse.id ? { ...j, claimedBy: null } : j
                )
              : state.jobs;
          forCollapse = {
            ...forCollapse,
            currentState: desired,
            activeJob: undefined,
            path: [],
            isMoving: false,
            hasReachedDestination: false
          };
          state = {
            ...state,
            jobs,
            pawns: state.pawns.map((p) => (p.id === pawn.id ? forCollapse : p))
          };
        } else if (forCollapse.currentState !== desired) {
          forCollapse = { ...forCollapse, currentState: desired };
          state = {
            ...state,
            pawns: state.pawns.map((p) => (p.id === pawn.id ? forCollapse : p))
          };
        }
        state = tickPawn(forCollapse, state);
        const afterCombat = pawnById(state.pawns, pawn.id);
        if (afterCombat) {
          const stepped = tickConditionTimers(afterCombat);
          const synced = syncTransientConditions(stepped, gameState.turn);
          if (synced !== afterCombat) {
            state = {
              ...state,
              pawns: state.pawns.map((p) => (p.id === pawn.id ? synced : p))
            };
          }
        }
        continue;
      }

      if (
        (forCollapse.needs?.fatigue ?? 0) >= 100 &&
        forCollapse.currentState !== PAWN_STATE.SLEEPING
      ) {
        forCollapse = {
          ...forCollapse,
          currentState: PAWN_STATE.SLEEPING,
          activeJob: undefined,
          path: [],
          isMoving: false,
          hasReachedDestination: false,
          state: { ...forCollapse.state, isSleeping: true, isWorking: false, isEating: false }
        };
        state = { ...state, pawns: state.pawns.map((p) => (p.id === pawn.id ? forCollapse : p)) };
      }

      state = tickPawn(forCollapse, state);
      const updated = pawnById(state.pawns, pawn.id);
      if (updated) {
        let stepped = tickConditionTimers(updated);
        const synced = syncTransientConditions(stepped, gameState.turn);
        if (synced !== stepped) {
          state = { ...state, pawns: state.pawns.map((p) => (p.id === pawn.id ? synced : p)) };
        } else if (stepped !== updated) {
          state = { ...state, pawns: state.pawns.map((p) => (p.id === pawn.id ? stepped : p)) };
        }
      }
    }
    return state;
  }
}

export const pawnStateMachineService = new PawnStateMachineImpl();
