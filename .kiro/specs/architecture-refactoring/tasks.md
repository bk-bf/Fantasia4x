# Fantasia4x Architecture Refactoring Implementation Plan
*Based on ROADMAP.md v6.0 and Steering Documents*

## 🚨 PHASE 1: FOUNDATION STABILIZATION (Weeks 1-2)
**CRITICAL: Must complete before any new features**

### Week 1: Architecture Analysis & Design
**Priority: HIGH - Map current chaos and design clean interfaces**

#### System Flow Documentation
- [x] **Map current data flow** through all major systems
  - Document Pawns → Work → Resources → Buildings flow
  - Identify circular dependencies (Pawns → Items → Work → Pawns)
  - Catalog all system integration points
  - _Requirements: 3.1, 3.2, 9.1_
- [x] **Analyze state management patterns** across components
  - Document GameState update patterns
  - Identify component state synchronization issues
  - Map reactive data binding problems
  - _Requirements: 7.1, 7.4, 9.2_
- [x] **Create system hierarchy diagram**
  - Define primary systems (Pawns, Work, Resources)
  - Define secondary systems (Events, Research, Exploration)
  - Document system dependencies and interaction points
  - _Requirements: 2.1, 2.4_

#### Clean Architecture Design
- [x] **Design service layer interfaces**
  - ItemService for clean item queries
  - BuildingService for building validation
  - WorkService for work assignment logic
  - ResearchService for research progression
  - _Requirements: 1.1, 1.2, 1.3, 1.4_
- [x] **Plan GameEngine pattern implementation**
- [ ] **Define GameEngine core interface**
  - Create GameEngine TypeScript interface with method signatures
  - Define system coordination methods (processGameTurn, coordinateSystemInteractions)
  - Define unified calculation methods (calculatePawnEfficiency, calculateBuildingEffects)
  - Define state management methods (getGameState, updateGameState)
  - _Requirements: 2.1, 2.2_
- [ ] **Design service integration architecture**
  - Define ServiceRegistry interface for managing all services
  - Plan how GameEngine will inject and coordinate services
  - Design service communication patterns through GameEngine
  - Create service lifecycle management strategy
  - _Requirements: 2.1, 2.3_
- [ ] **Plan unified calculation system**
  - Design single source of truth for all bonus calculations
  - Plan modifier aggregation system (equipment + buildings + research)
  - Design efficiency calculation pipeline for work assignments
  - Create calculation caching strategy for performance
  - _Requirements: 2.2, 4.1, 4.2_
- [ ] **Design system interaction protocols**
  - Define how systems request data from other systems through GameEngine
  - Plan event propagation system for system-to-system communication
  - Design state consistency validation mechanisms
  - Create error handling and recovery protocols
  - _Requirements: 2.1, 2.3, 7.1_
- [ ] **Plan GameEngine implementation phases**
  - Define incremental implementation strategy
  - Plan backward compatibility during transition
  - Design testing approach for each implementation phase
  - Create rollback procedures for each phase
  - _Requirements: 2.1, 9.3, 9.5_
- [ ] **Design automated modifier system**
  - Auto-generate work efficiencies from Buildings/Items
  - Eliminate manual ability/building/item mapping
  - Create clean bonus calculation pipeline
  - _Requirements: 4.1, 4.2_

#### Deliverables
- [ ] **Complete system flow diagram**
- [ ] **Integration interface specifications**
- [ ] **Refactoring priority list**
- [ ] **Architecture decision document**

### Week 2: Core System Refactoring
**Priority: HIGH - Implement clean architecture**

#### Service Layer Creation
- [ ] **Extract ItemService.ts from Items.ts**
  - Move `getItemsByType()`, `getCraftableItems()`, `canCraftItem()`
  - Keep `ITEMS_DATABASE` as pure data export
  - Update all component imports to use ItemService
  - _Requirements: 1.1, 4.1, 4.3_
- [ ] **Extract BuildingService.ts from Buildings.ts**
  - Move building query functions
  - Move building cost/requirement checking
  - Move construction logic
  - _Requirements: 1.2, 4.1, 4.3_
- [ ] **Create WorkService.ts**
  - Extract work category logic from Work.ts
  - Clean pawn-to-work-to-resource flow
  - Standardize work assignment interfaces
  - _Requirements: 1.3, 4.1, 4.3_

#### Pawn System Overhaul
- [ ] **Implement basic needs behavior**
  - If hunger > 90%, pawns eat automatically
  - If sleep > 90%, pawns sleep automatically  
  - If fatigue > 80%, pawns rest automatically
  - _Requirements: 6.1, 6.2, 6.3_
- [ ] **Add simple morale consequences**
  - Work refusal at low morale
  - Efficiency penalties for unhappy pawns
  - _Requirements: 6.4, 6.5_
- [ ] **Create automated modifier system**
  - Auto-generate work efficiencies from Buildings/Items
  - Eliminate manual mapping between systems
  - _Requirements: 4.2, 4.4_

#### System Integration Fixes
- [ ] **Resolve inventory/equipment synchronization**
  - Fix shared vs individual item conflicts
  - Standardize item access patterns
  - _Requirements: 7.2, 7.3_
- [ ] **Fix event system integration**
  - Connect events to pawn states with automatic triggers
  - Repair message log functionality
  - _Requirements: 5.1, 5.2, 5.3_
- [ ] **Standardize GameState update patterns**
  - Consistent state mutation approaches
  - Fix component state synchronization
  - _Requirements: 7.1, 7.4_

**GATE: Game must run with clean architecture, service layer implemented, and no circular dependencies**

---

## 🐛 PHASE 2: BUG ELIMINATION & UI POLISH (Weeks 3-4)
**Priority: HIGH - Create polished, bug-free experience**

### Week 3: Backend Bug Fixes
**Priority: CRITICAL - Eliminate systemic issues**

#### Critical Bug Resolution
- [ ] **Fix data synchronization bugs**
  - Component state inconsistencies
  - GameState update conflicts
  - Reactive data binding issues
  - _Requirements: 7.1, 7.2, 8.5_
- [ ] **Repair event system bugs**
  - Message log functionality (currently not displaying)
  - Event trigger reliability
  - Consequence application accuracy
  - _Requirements: 5.1, 5.2, 5.4_
- [ ] **Fix work assignment bugs**
  - Efficiency calculation errors
  - Progress tracking accuracy
  - Task completion logic issues
  - _Requirements: 1.3, 4.2_
- [ ] **Stabilize save/load system**
  - State persistence integrity
  - Component restoration after load
  - Version compatibility handling
  - _Requirements: 7.2, 7.3, 8.5_

#### System Stability Validation
- [ ] **Implement automated testing** for core loops
  - _Requirements: 9.3, 9.4_
- [ ] **Conduct extended play sessions** (50+ turns without errors)
  - _Requirements: 8.1, 8.2_
- [ ] **Validate edge cases** with current content
  - _Requirements: 8.3, 8.4_
- [ ] **Profile and optimize performance**
  - _Requirements: 8.3, 8.6_

### Week 4: UI/UX Cleanup
**Priority: MEDIUM - Polish user-facing experience**

#### Visual Polish
- [ ] **Fix visual glitches**
  - Animation synchronization issues
  - Display inconsistencies
  - Layout stability problems
  - _Requirements: 8.2, 8.4_
- [ ] **Standardize component state management**
  - Fix reactive data binding
  - Consistent UI update patterns
  - _Requirements: 7.1, 7.4_
- [ ] **Improve information display**
  - Clear system status indicators
  - Intuitive data presentation
  - Better progress visualization
  - _Requirements: 8.2, 8.4_

#### Interface Consistency
- [ ] **Consolidate similar UI patterns**
  - Standardize TaskContainer usage
  - Consistent progress displays
  - Unified button and input styles
  - _Requirements: 7.4, 8.4_
- [ ] **Implement consistent error handling**
  - Graceful error recovery
  - User-friendly error messages
  - Consistent error display patterns
  - _Requirements: 8.5, 9.4_

**GATE: No backend errors for 50+ turns, responsive UI, stable features**

---

## ⚔️ PHASE 3: COMBAT SYSTEM IMPLEMENTATION (Weeks 5-9)
**Priority: MEDIUM - Core combat functionality**

### Week 5-6: System Integration Validation
**Priority: HIGH - Prove architecture scales**

#### GameEngine Implementation
- [ ] **Create GameEngine.ts as central coordinator**
  - Implement unified system interactions
  - Create single source of truth for bonuses
  - Establish clean system boundaries
  - _Requirements: 2.1, 2.2, 2.4_
- [ ] **Validate system interactions**
  - Test service layer with existing content
  - Verify modifier generation system works
  - Validate clean integration patterns
  - _Requirements: 2.3, 2.6_

#### Architecture Scaling Tests
- [ ] **Performance testing** with current content
  - _Requirements: 8.3, 8.4_
- [ ] **Extended gameplay sessions** with new architecture
  - _Requirements: 8.1, 8.2_
- [ ] **Edge case validation** with multiple systems active
  - _Requirements: 8.3, 8.5_
- [ ] **Integration pattern verification**
  - _Requirements: 2.6, 10.1_

### Week 7: Combat System Foundation
**Priority: MEDIUM - Core tactical combat engine**

#### Combat Engine Core
- [ ] **Implement CombatState class**
  - Turn order tracking
  - Initiative calculation system
  - Action point allocation
  - Combat round progression
  - _Requirements: 10.1, 10.2_
- [ ] **Create ASCII grid rendering**
  - 12x8 battlefield grid component
  - Coordinate system (A1-L8)
  - Basic terrain rendering
  - Unit placement visualization
  - _Requirements: 10.1, 10.3_
- [ ] **Build basic combat mechanics**
  - Movement system with AP costs
  - Basic attack calculations
  - Line-of-sight for ranged attacks
  - Target selection and validation
  - _Requirements: 10.1, 10.2_

#### Equipment Integration
- [ ] **Connect item system to combat abilities**
  - Weapon-specific actions
  - Ability cost calculations
  - Weapon range and damage modifiers
  - _Requirements: 10.2, 10.5_
- [ ] **Build combat UI foundation**
  - Turn order display
  - Action selection buttons
  - Target highlighting
  - Health bars and AP displays
  - _Requirements: 10.1, 10.6_

### Week 8: Tactical Depth & AI
**Priority: MEDIUM - Advanced combat mechanics**

#### Advanced Combat Mechanics
- [ ] **Implement positioning bonuses**
  - Cover bonuses from terrain (+15% defense)
  - Flanking mechanics (+20% damage)
  - Formation bonuses
  - Opportunity attacks
  - _Requirements: 10.2, 10.5_
- [ ] **Create status effects system**
  - Status effect framework
  - Duration tracking
  - Visual indicators
  - Application/removal logic
  - _Requirements: 10.3, 10.6_
- [ ] **Add equipment effects in combat**
  - Armor damage reduction
  - Weapon durability
  - Equipment-specific abilities
  - Equipment loss mechanics
  - _Requirements: 10.2, 10.5_

#### Enemy AI Implementation
- [ ] **Build basic AI behaviors**
  - Aggressive AI (attacks nearest)
  - Defensive AI (holds position)
  - Opportunist AI (targets weak pawns)
  - Support AI (buffs allies)
  - _Requirements: 10.1, 10.2_
- [ ] **Create AI decision system**
  - Threat assessment algorithms
  - Target prioritization logic
  - Positioning evaluation
  - Action selection with personality weighting
  - _Requirements: 10.1, 10.5_

### Week 9: Combat Integration & Polish
**Priority: MEDIUM - Colony system integration**

#### Colony System Integration
- [ ] **Implement combat consequences**
  - Injury system affecting work efficiency
  - PTSD/morale effects from combat
  - Equipment loss impact on production
  - Pawn death consequences
  - _Requirements: 10.3, 10.4_
- [ ] **Connect combat to event system**
  - Victory/defeat events
  - Heroic action events
  - Mourning events for casualties
  - _Requirements: 10.4, 10.6_
- [ ] **Build pre/post combat systems**
  - Squad selection interface
  - Equipment preparation
  - Injury treatment and recovery
  - Experience gain system
  - _Requirements: 10.1, 10.3_

#### Combat Polish & Balance
- [ ] **Optimize performance** for 20-50 unit battles
  - _Requirements: 8.3, 8.4_
- [ ] **Add combat tutorial** for new players
  - _Requirements: 10.1, 10.6_
- [ ] **Implement helpful tooltips** and information displays
  - _Requirements: 10.6_
- [ ] **Balance test** with various pawn configurations
  - _Requirements: 10.2, 10.5_

**GATE: Basic combat functional, integrates with colony, AI provides fair challenge**

---

## 🎨 PHASE 4: ADVANCED FEATURES & VISUAL EVOLUTION (Weeks 10-14)
**Priority: LOW - Enhancement and polish**

### Week 10-11: Advanced Combat Features
- [ ] **Squad-based command system**
- [ ] **Advanced tactical mechanics** (combo attacks, environmental hazards)
- [ ] **Large-scale battle management** (50+ pawns)
- [ ] **Enhanced AI & difficulty scaling**

### Week 12-13: Graphics Foundation
- [ ] **Dual-mode rendering** (ASCII/Sprites toggle)
- [ ] **Sprite rendering system** (32x32 tiles)
- [ ] **Asset pipeline creation**
- [ ] **Animation system** for combat

### Week 14: Final Polish
- [ ] **Combat system completion**
- [ ] **Balance & tuning**
- [ ] **Documentation & accessibility**
- [ ] **Modding support foundation**

---

## 🔧 ONGOING MAINTENANCE TASKS

### Code Quality
- [ ] **Run `npm run lint:fix`** before each commit
  - _Requirements: 9.1, 9.2_
- [ ] **Maintain TypeScript strict mode** throughout refactoring
  - _Requirements: 9.1, 9.2_
- [ ] **Update imports** to use service layer pattern
  - _Requirements: 3.1, 3.2, 3.3_
- [ ] **Document architectural changes** in migration logs
  - _Requirements: 9.5, 9.6_

### Testing & Validation
- [ ] **Test core game loop** after each major change
  - _Requirements: 8.1, 8.2_
- [ ] **Validate save/load functionality** regularly
  - _Requirements: 7.2, 7.3_
- [ ] **Monitor performance** during content expansion
  - _Requirements: 8.3, 8.4_
- [ ] **Check for circular dependencies** in new code
  - _Requirements: 3.1, 3.6_

### Documentation
- [ ] **Update steering documents** as architecture evolves
  - _Requirements: 9.6_
- [ ] **Maintain refactoring decision log**
  - _Requirements: 9.5_
- [ ] **Document service layer interfaces**
  - _Requirements: 9.6_
- [ ] **Keep migration guides current**
  - _Requirements: 9.5_

---

## ⚠️ CRITICAL SUCCESS CRITERIA

### Phase 1 Gates
- ✅ Service layer extracting business logic from data files
- ✅ GameEngine implemented as central coordinator
- ✅ Clean architecture with no circular dependencies
- ✅ Core game loop stable with existing content

### Phase 2 Gates  
- ✅ No backend errors for 50+ consecutive turns
- ✅ All visual glitches resolved
- ✅ Responsive and predictable UI
- ✅ Stable save/load functionality

### Phase 3 Gates
- ✅ Basic combat functional with equipment integration
- ✅ AI provides fair tactical challenge
- ✅ Combat integrates seamlessly with colony systems
- ✅ Performance smooth with expanded content

### Phase 4 Gates
- ✅ Advanced combat features complete
- ✅ Graphics system functional
- ✅ Full accessibility compliance
- ✅ Modding foundation established

**KEY PRINCIPLE: Do not proceed to next phase until all gates are met. Simple, reliable systems are more valuable than complex, fragile ones.**

## Risk Mitigation

### Backup Strategy
- Create full backup of current codebase before starting
- Implement incremental backups after each major task
- Maintain rollback procedures for each refactoring phase

### Testing Strategy
- Test each service extraction independently
- Validate game functionality after each component update
- Run extended gameplay sessions after major changes

### Integration Strategy
- Implement services one at a time
- Maintain backward compatibility during transition
- Update components incrementally to use new architecture