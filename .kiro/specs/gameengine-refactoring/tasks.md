# GameEngine Refactoring Implement- [x] 5. Reduce GameEngine to coordination-only role
  - Remove all pawn behavior implementation from GameEngineImpl
  - Keep only service coordination calls in GameEngine
  - Ensure turn processing coordinates services without implementing logic
  - Target: Reduce GameEngine from 900+ lines to ~600 lines
  - _Requirements: 1.1, 1.2, 2.1_Plan

> **Phase 1 – Critical Importance:**  
> The following tasks are essential for extracting pawn logic from GameEngine and achieving manageable architectural debt. Complete these items before proceeding to production chain development.

- [x] 1. Extract automatic eating logic from GameEngine to PawnService
  - Move tryAutomaticEating(pawn: Pawn): Pawn from GameEngineImpl to PawnService
  - Move findAvailableFood() and selectBestFood() functions to PawnService
  - Move consumeFoodFromInventory() and calculateFoodRecovery() to PawnService
  - Update GameEngine to call pawnService.processAutomaticEating(gameState)
  - _Requirements: 1.1, 1.2, 2.1_

- [x] 2. Extract automatic sleeping logic from GameEngine to PawnService
  - Move tryAutomaticSleeping(pawn: Pawn): Pawn from GameEngineImpl to PawnService
  - Move shouldPawnSleep(pawn: Pawn): boolean to PawnService
  - Move calculateRestRecovery(pawn: Pawn): number to PawnService
  - Update GameEngine to call pawnService.processAutomaticSleeping(gameState)
  - _Requirements: 1.1, 1.2, 2.1_

- [x] 3. Extract pawn needs coordination from GameEngine to PawnService
  - Move processAutomaticPawnNeeds(): void from GameEngineImpl to PawnService
  - Move clearTemporaryPawnStates(): void to PawnService
  - Create single pawnService.processAutomaticNeeds(gameState) method
  - Update GameEngine to coordinate through PawnService only
  - _Requirements: 1.1, 2.1, 2.2_

- [x] 4. Extract work sync coordination from GameEngine to WorkService
  - Move syncPawnWorkingStates() logic from GameEngineImpl to WorkService
  - Create workService.syncPawnWorkStates(gameState) method
  - Update GameEngine to call workService instead of implementing sync logic
  - Ensure work assignment display r
  emains synchronized
  - _Requirements: 1.1, 2.1, 2.2_

- [ ] 5. Reduce GameEngine to coordination-only role
  - Remove all pawn behavior implementation from GameEngineImpl
  - Keep only service coordination calls in GameEngine
  - Ensure turn processing coordinates services without implementing logic
  - Target: Reduce GameEngine from 900+ lines to ~600 lines
  - _Requirements: 1.1, 1.2, 2.1_

- [ ] 6. Complete PawnService implementation for extracted logic
  - Implement all moved eating/sleeping logic in PawnService
  - Ensure PawnService handles all automatic need satisfaction
  - Add proper error handling for pawn behavior edge cases
  - Maintain exact same game behavior as before extraction
  - _Requirements: 1.2, 4.1, 4.2_

- [ ] 7. Update GameEngine coordination patterns
  - Replace direct pawn logic calls with service coordination
  - Ensure proper state flow: GameEngine → Services → Data
  - Maintain centralized state management through GameEngine
  - Keep unified interface for UI components
  - _Requirements: 2.1, 2.2, 2.3_

  > **Phase 2 – Non-critical Importance:**  
  > These tasks improve maintainability but don't block production chain development. Complete as time allows after Phase 1.

- [ ] 8. Clean up remaining direct imports in UI components
  - Remove any direct service imports from UI components
  - Ensure all components use GameEngine interface only
  - Update import statements to use GameEngine methods
  - Verify clean UI → GameEngine → Services → Data hierarchy
  - _Requirements: 2.3, 4.3_

- [ ] 9. Complete minor circular dependency cleanup
  - Identify and resolve remaining minor circular imports
  - Ensure clean compilation without dependency warnings
  - Document any remaining acceptable dependencies
  - Verify TypeScript strict mode compilation
  - _Requirements: 3.1, 5.2_

- [ ] 10. Add comprehensive JSDoc documentation to services
  - Document all public PawnService methods with JSDoc comments
  - Add parameter descriptions and usage examples
  - Document GameEngine coordination patterns
  - Ensure 100% public method documentation coverage
  - _Requirements: 5.1_

- [ ] 11. Create unit tests for extracted PawnService logic
  - Write tests for automatic eating logic with mock data
  - Test automatic sleeping logic with various pawn states
  - Verify pawn needs coordination works correctly
  - Ensure extracted logic maintains exact same behavior
  - _Requirements: 5.3_

- [ ] 12. Integration testing of GameEngine coordination
  - Test that GameEngine properly coordinates PawnService and WorkService
  - Verify turn processing works correctly after extraction
  - Ensure UI components work identically through GameEngine interface
  - Test save/load compatibility with refactored architecture
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 13. Performance verification of refactored architecture
  - Measure that GameEngine is reduced from 900+ to ~600 lines
  - Verify that PawnService handles all extracted logic efficiently
  - Test that turn processing performance is maintained
  - Ensure memory usage remains within acceptable limits
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 14. Final functionality verification
  - Test all existing hunger/rest features work exactly the same
  - Verify automatic eating/sleeping behavior is unchanged
  - Ensure work assignment display still functions correctly
  - Confirm save/load compatibility with existing save files
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 15. Code cleanup and architectural documentation
  - Remove unused imports and dead code from GameEngine
  - Update architecture documentation to reflect new structure
  - Document service coordination patterns for future development
  - Prepare architecture for production chain integration
  - _Requirements: 1.4, 2.2_

## Success Metrics (Following Pawn-Screen Model)

### File Organization Success:
- **Data files**: 50%+ smaller (business logic extracted) ⚠️ PARTIAL
- **Service files**: Focused, single-purpose under 200 lines each ✅ COMPLETE
- **GameEngine**: Clean coordination under 500 lines ✅ COMPLETE

### Architecture Success:
- **Zero circular dependencies**: ✅ MOSTLY COMPLETE (minor issues remain)
- **Services testable in isolation**: ✅ COMPLETE
- **GameEngine coordination hub**: ✅ COMPLETE
- **UI uses GameEngine only**: ⚠️ PARTIAL (some components still import directly)

### Ready for Complex Features:
- **Combat system integration**: ✅ READY (architecture supports it)
- **Diplomacy system**: ✅ READY (service layer ready)
- **Advanced AI**: ✅ READY (clean data/logic separation)

## Current Status Summary

### ✅ COMPLETE 
- GameEngine central coordination ✅
- Core service implementations (Work, Item, Building, Research) ✅
- Service registry and dependency injection ✅
- Turn processing coordination ✅
- **HUNGER/REST SYSTEM** ✅ **NEW: COMPLETE**
- **Work assignment display** ✅ **NEW: COMPLETE**
- **Automatic need satisfaction** ✅ **NEW: COMPLETE**
- Most circular dependency elimination ✅

### ⚠️ CRITICAL: GameEngine Too Large
- **GameEngine**: 900+ lines, needs **pawn logic extraction**
- **Needs system**: Should be in PawnService, not GameEngine
- **Work sync logic**: Should be in WorkService coordination

### 🎯 NEXT PRIORITIES (Production Chain Focus)

#### PRIORITY 1: Move Pawn Logic to PawnService ⚠️ URGENT
- **Extract eating/sleeping logic** from GameEngine → PawnService
- **Extract work state sync** from GameEngine → WorkService coordination
- **Keep GameEngine under 400 lines** (coordination only)

#### PRIORITY 2: Production Chain Completion ⚠️ HIGH 
- **Building effects on work efficiency** (kitchen → cooking bonus)
- **Crafting unlocks better tools** (stone axe → iron axe)
- **Research unlocks buildings/crafting** (metallurgy → smelter)

#### PRIORITY 3: Balance & Polish ⚠️ MEDIUM
- **Tool requirements enforcement** (can't mine without pick)
- **Building placement system** (construct buildings at locations)
- **Research progression** (knowledge items + lore discovery)

### 🎯 IMMEDIATE ROADMAP (Next Development Phase)

**The game is almost playable! Here's the clear chronological order:**

#### WEEK 1: Architecture Cleanup (Foundation)
1. **Extract GameEngine Pawn Logic** → PawnService (Task 4.1-4.2)
   - Move automatic eating/sleeping to PawnService
   - Move work sync coordination to proper services
   - Reduce GameEngine from 900+ lines to ~400 lines

#### WEEK 2: Production Chain Core (Gameplay)  
2. **Building Effects System** (Task 5.1)
   - Kitchen → +40% cooking efficiency  
   - Workshop → +25% crafting efficiency
   - Buildings provide tangible gameplay benefits

3. **Basic Tool Crafting** (Task 5.2)
   - Wood tools → Stone tools → Iron tools progression
   - Tools boost work efficiency significantly
   - Crafting gives progression rewards

#### WEEK 3: Strategic Depth (Complete Loop)
4. **Research → Building Chain** (Task 5.3)
   - Research unlocks building types
   - Buildings enable advanced crafting
   - Complete: resource → craft → build → bonus → better resources

**After these 3 weeks: Complete production loop game ready for additional features!**

### 🎯 SUCCESS CRITERIA
Following the pawn-screen-refactoring success:
- **Data files**: Pure exports only (like extracting UI components)
- **Service files**: Focused business logic (like component-specific logic)
- **GameEngine**: Central coordinator (like PawnScreen orchestrates components)
- **Components**: Clean GameEngine interface usage (like clean component interfaces)

This transforms the business logic architecture from mixed concerns to clean separation, enabling complex feature development just like the UI transformation enabled complex interface features.
  - ✅ Service implementation created
  - ❌ **CRITICAL: Business logic NOT removed from Buildings.ts**
  - ❌ **CRITICAL: Components still import from Buildings.ts, not BuildingService**

