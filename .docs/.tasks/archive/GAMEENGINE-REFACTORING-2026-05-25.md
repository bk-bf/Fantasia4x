<!-- archived: 2026-05-25 — all tasks complete -->

# GAMEENGINE-REFACTORING

> **Related:** [game/ARCHITECTURE](../../game/ARCHITECTURE.md) · [ROADMAP](../open/ROADMAP.md)

## Goal

Extract pawn behavior logic out of `GameEngineImpl` so it becomes a coordination-only orchestrator. Reduce file from 900+ lines to ~600.

## Status: COMPLETE ✅

All Phase 1 tasks done. GameEngine reduced to coordination-only role.

## What Was Done

- [x] Extract `tryAutomaticEating()` and food helpers → `PawnService.processAutomaticEating()`
- [x] Extract `tryAutomaticSleeping()` and rest helpers → `PawnService.processAutomaticSleeping()`
- [x] Extract `processAutomaticPawnNeeds()` and `clearTemporaryPawnStates()` → `PawnService.processAutomaticNeeds()`
- [x] Extract `syncPawnWorkingStates()` → `WorkService.syncPawnWorkStates()`
- [x] Reduce `GameEngineImpl` to service coordination calls only
- [x] Complete `PawnService` implementation for all extracted logic
- [x] Update `GameEngine` to coordinate through services

## Outcome

- `GameEngineImpl` coordinates without implementing pawn behavior
- Automatic eating and sleeping managed entirely by `PawnService`
- Work state synchronisation managed entirely by `WorkService`
- Hunger/rest system fully functional with multi-turn sessions
- Adverse need consequences (starvation death, fatigue collapse) deferred to Phase 2
