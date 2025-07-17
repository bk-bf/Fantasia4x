# Fantasia4x Development Roadmap

## 🎉 Major Milestone Achieved: Game Almost Playable!

**BREAKING**: Hunger and rest systems are now fully functional! The game has reached a major milestone where the core survival loop works perfectly. Pawns automatically eat and sleep with realistic mechanics, making the game almost playable.

**CRITICAL MISSING**: Adverse consequences for unmet needs (starvation death, fatigue collapse) - identified as essential for realistic survival gameplay.

## 📋 **CORRECTED Development Priority (Real Order)**

### 🚨 **Phase 1: Foundation Cleanup (Weeks 1-4)**

_Fix architecture and screen bloat before adding features_

#### 1. ✅ **COMPLETE: Hunger/Rest System** 

- **Status**: ✅ **COMPLETE AND WORKING**
- **Missing**: ⚠️ **Adverse consequences for unmet needs** (Week 6)
- **Achievements**: 
  - Realistic food consumption with direct nutrition mapping
  - Smart sleep duration balancing hunger vs fatigue
  - 5 fatigue recovery per turn with multi-turn sleep sessions
  - Automatic need satisfaction integrated with turn processing
  - Work assignment display properly synchronized
- **Impact**: Game is now almost playable with functional survival mechanics

#### 2. ⚠️ **gameengine-refactoring** (Week 1 - PARTIAL: 50%)

- **Status**: ⚠️ **CRITICAL: GameEngine Too Large (900+ lines)**
- **Purpose**: Extract most pressing pawn logic from GameEngine (not everything)
- **Scope**: **PARTIAL** - only the most critical architectural debt
- **Priority Tasks** (50% completion):
  - Move automatic eating/sleeping logic to PawnService
  - Move work sync coordination to proper services  
  - Reduce GameEngine from 900+ lines to ~600 lines (manageable)
- **Skip**: Service completion, circular dependency elimination (not urgent)
- **Files**: requirements.md ✅, design.md ✅, tasks.md ✅ (update to 50% scope)

#### 3. 🖥️ **screen-refactoring** (Week 2-3 - URGENT)

- **Status**: ❌ **NEW CRITICAL SPEC: Screens are bloated like PawnScreen was**
- **Purpose**: Break down 1-3 most convoluted screens (especially WorkScreen for next tasks)
- **Target Screens**:
  - **WorkScreen.svelte**: 1314 lines - needs healthcare, cooking jobs
  - **CraftingScreen.svelte**: Likely massive, needed for production chains
  - **BuildingMenu.svelte**: Needed for building bonuses
- **Pattern**: Same as pawn-screen-refactoring - directory per screen with components
- **Priority**: **WorkScreen first** (needed for healthcare/cooking jobs)
- **Dependencies**: None (UI refactoring independent)
- **Files**: requirements.md ❌, design.md ❌, tasks.md ❌ (new spec needed)

---

### 🏗️ **Phase 2: Production Chain (Weeks 4-5)**

_Complete the survival → production → building → bonus cycle_

#### 4. 🏗️ **production-chain-integration** (Week 4 - HIGH PRIORITY)

- **Status**: ❌ **Complete gameplay loop needed**
- **Purpose**: Implement resource → craft → build → bonus → better resources cycle
- **Key Features**:
  - **Building work bonuses**: Kitchen +40% cooking, Workshop +25% crafting
  - **Tool progression**: Wood → Stone → Iron tools with efficiency multipliers
  - **Research unlocks**: Metallurgy → Smelter → Iron tools
  - **New jobs**: Healthcare and cooking (via WorkScreen refactoring)
- **Dependencies**: screen-refactoring (needs WorkScreen components for new jobs)
- **Impact**: Complete core gameplay loop making game fully playable

---

### 💀 **Phase 3: Death & Stakes (Weeks 5-6)**

_Add realistic survival consequences_

#### 5. 💀 **survival-consequences** (Week 5 - HIGH PRIORITY)

- **Status**: ❌ **Missing survival stakes**
- **Purpose**: Implement realistic adverse consequences for unmet needs
- **Key Features**:
  - **Starvation Disease**: Progressive debuff system (200-300 turns to death)
  - **Random Death Rolls**: Increasing chance every 50 turns (realistic/fun randomness)
  - **Fatigue Collapse**: Forced rest at 100% fatigue (no choice override)
  - **Death Mechanics**: Permanent pawn loss with grief/morale consequences
- **Dependencies**: architecture-refactoring (needs clean HealthService/DiseaseService)
- **Impact**: Makes food production critically important - failure has real consequences

#### 6. ⚔️ **basic-combat-auto-resolve** (Week 6 - MEDIUM PRIORITY)

- **Status**: ❌ **Simple auto-resolve combat only**
- **Purpose**: Basic combat resolution without tactical grid (auto-resolve)
- **Key Features**:
  - **Fatigue Combat Penalties**: Tired pawns fight poorly
  - **Simple Combat Resolution**: Attack/defend with modifiers, no tactics
  - **Equipment Integration**: Tools as weapons (pickaxe, bow, sword)
  - **Combat Death**: Second death vector beyond starvation
- **Dependencies**: survival-consequences (death mechanics), production-chain (weapon crafting)
- **Scope**: **NOT** tactical combat - just auto-resolve with stats + equipment

---

### 🎮 **Phase 4: Core Systems (Weeks 7-12)**

_Complete fundamental game systems_

#### 7. 🖥️ **finish-pawn-screen-refactoring** (Week 7)

- **Status**: ✅ Spec complete, implementation needed
- **Purpose**: Finish PawnScreen component breakdown
- **Scope**: **Remove useless tasks** like error logging (console works fine)
- **Priority**: Medium (maintainability improvement)

#### 8. 🗺️ **exploration-system** (Week 8-9 - MEDIUM IMPLEMENTATION)

- **Status**: ❌ **Medium-grade implementation needed**
- **Purpose**: Location discovery, resource node exploration, mission system
- **Scope**: **Not basic, not polished** - solid medium implementation
- **Key Features**:
  - Location discovery with meaningful rewards
  - Resource node exploitation
  - Basic mission/expedition system
- **Dependencies**: production-chain (need rewards worth exploring for)

#### 9. 🎲 **basic-events** (Week 10)

- **Status**: ❌ **Events currently don't work at all**
- **Purpose**: Get event system functional again
- **Scope**: Basic event triggering and resolution
- **Key Features**:
  - Random events that can disrupt gameplay
  - Player choices with consequences
  - Integration with production/survival systems
- **Dependencies**: Functional main game loop (needs production + survival)

#### 10. 🔄 **finish-research** (Week 11)

- **Status**: ❌ **If not covered by production chains**
- **Purpose**: Complete research system gaps not handled by production
- **Scope**: Only if production chains don't cover research needs
- **Dependencies**: production-chain-integration completion assessment

#### 11. 🧠 **advanced-pawn-behavior** (Week 12)

- **Status**: ❌ **Enhanced pawn AI and personality**
- **Purpose**: Individual pawn personalities, social interactions, advanced behavior
- **Dependencies**: survival-consequences (grief affects behavior)
- **Priority**: Polish after core systems work

---

### ⚔️ **Phase 5: Advanced Combat (Weeks 13-16)**

_Moving toward Battle Brothers-style tactical combat_

#### 12. ⚔️ **tactical-combat-system** (Week 13-16)

- **Status**: ❌ **Full tactical combat from combat.md design**
- **Purpose**: Implement Battle Brothers-style tactical combat system
- **Key Features**:
  - **Turn-based tactical grid**: 12x8 ASCII battlefield
  - **Action Point system**: Movement and abilities cost AP
  - **Equipment-driven abilities**: Weapons determine combat options
  - **Formation mechanics**: Positioning matters tactically
  - **AI behaviors**: 5 AI personality types (Aggressive, Defensive, etc.)
- **Reference**: combat.md specification (comprehensive design exists)
- **Dependencies**: basic-combat-auto-resolve, advanced-pawn-behavior
- **Scope**: **Major system** - Battle Brothers-level tactical depth

---

### 🎯 **Phase 6: Content & Polish (Weeks 17-24)**

_Advanced content and polish systems_

#### 13. 🌟 **magic-materials-items** (Week 17-18)

- **Status**: ❌ **High-value shiny things to fight for**
- **Purpose**: Advanced materials, magical items, rare equipment
- **Rationale**: Production chains won't cover high-end aspirational content
- **Key Features**:
  - Rare magical materials and components
  - Legendary equipment with special properties
  - High-tier crafting recipes and research
- **Dependencies**: exploration-system, tactical-combat-system

#### 14. 🗺️ **polish-exploration** (Week 19)

- **Status**: ❌ **Polish the medium exploration implementation**
- **Purpose**: Enhance exploration system to polished state
- **Dependencies**: exploration-system, magic-materials-items

#### 15. 🎲 **advanced-events** (Week 20-21)

- **Status**: ❌ **Finish the event system**
- **Purpose**: Complete event system with depth and consequences
- **Dependencies**: basic-events, all core systems functional

#### 16. � **sound** (Week 22)

- **Status**: ❌ **Audio implementation**
- **Purpose**: Sound effects and ambient audio
- **Dependencies**: Core gameplay complete

#### 17. 🎨 **graphics-enhancement** (Week 23)

- **Status**: ❌ **Visual improvements**
- **Purpose**: Enhanced ASCII or basic sprite graphics
- **Dependencies**: All core systems complete

#### 18. ✨ **polish** (Week 24)

- **Status**: ❌ **Final polish pass**
- **Purpose**: Bug fixes, balance, UX improvements
- **Dependencies**: All systems implemented

---

### 🎯 **Phase 7: Future (Post-Launch)**

#### 19. 🔧 **modding** (Future)

- **Status**: ❌ **Modding support** 
- **Purpose**: Player modification tools and systems
- **Priority**: Post-launch only

---

