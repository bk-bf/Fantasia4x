## Refactoring & Migration Task List

A prioritized roadmap for refactoring your codebase with central database files.

---

### 🎯 Phase 1: Extract Logic from Database Files (Week 1-2)
**Priority: Critical** — Separate data from business logic.

#### **Priority 1A: Items System Refactor**
- [ ] **Reorganize `Items.ts` internally:**
  - Group items by tech progression (Stone Age → Copper Age → etc.)
  - Add clear section headers and navigation comments
  - Keep all item data in single file for easy balancing
- [ ] **Extract functions from `Items.ts` into `ItemService.ts`:**
  - Move `getItemsByType()`, `getCraftableItems()`, `canCraftItem()` etc.
  - Keep `ITEMS_DATABASE` as pure data export
  - Create clean query interface
- [ ] **Update all imports** across components to use `ItemService`

#### **Priority 1B: Buildings System Refactor**
- [ ] **Reorganize `Buildings.ts` internally:**
  - Group by building type (Housing → Production → Military → Knowledge)
  - Add progression chains (Basic Workshop → Advanced Workshop)
  - Keep central building database for mod compatibility
- [ ] **Extract functions into `BuildingService.ts`:**
  - Move building query functions
  - Building cost/requirement checking
  - Construction logic
- [ ] **Update `BuildingMenu.svelte`** to use service layer

---

### 🏗️ Phase 2: Create Service Layer (Week 2-3)
**Priority: High** — Enable clean data access patterns.

#### **Priority 2A: Core Services**
- [ ] **Create `WorkService.ts`**
  - Extract work category logic from `Work.ts`
  - Keep work data centralized in reorganized `Work.ts`
  - Clean query interface for work assignments
- [ ] **Create `ResearchService.ts`**
  - Extract research logic from `Research.ts`
  - Keep technology trees in central `Research.ts`
  - Standardize research progression logic
- [ ] **Create `LocationService.ts`**
  - Extract location logic from `Locations.ts`
  - Keep location templates centralized
  - Clean exploration and travel interfaces

#### **Priority 2B: Entity Classes**
- [ ] `src/lib/game/entities/Pawn.ts` — Clean pawn entity with methods
- [ ] `src/lib/game/entities/Item.ts` — Item entity with crafting logic  
- [ ] `src/lib/game/entities/Building.ts` — Building entity with effects

---

### ⚙️ Phase 3: System Architecture (Week 3-4)
**Priority: High** — Implement your GameEngine pattern.

#### **Priority 3A: Central Game Engine**
- [ ] **Create `GameEngine.ts`** as proposed
  - Central coordinator for all system interactions
  - Unified efficiency calculations using services
  - Single source of truth for bonuses
- [ ] **Create `AbilitySystem.ts`**
  - Extract ability calculations from scattered locations
  - Centralize stat/trait/equipment bonus logic
- [ ] **Create `CraftingSystem.ts`**
  - Move crafting logic from `CraftingScreen.svelte`
  - Use `ItemService` for item queries
  - Clean crafting queue management

#### **Priority 3B: Specialized Systems**
- [ ] **Create `WorkSystem.ts`**
  - Extract work assignment logic
  - Use `WorkService` for work category queries
  - Clean pawn-to-work-to-resource flow
- [ ] **Create `EquipmentSystem.ts`**
  - Extract equipment logic from `PawnEquipment.ts`
  - Use `ItemService` for equipment queries
  - Centralize equipment bonus calculations
- [ ] **Create `EventSystem.ts`**
  - Clean up event triggering and consequence application

---

### 🎮 Phase 4: State Management Refactor (Week 4-5)
**Priority: Medium** — Clean up data flow.

#### **Priority 4A: Unified State**
- [ ] **Create `StateManager.ts`**
  - Centralize all GameState mutations
  - Clean persistence patterns
- [ ] **Refactor `gameState.ts` store**
  - Use GameEngine as single source of truth
  - Remove scattered state management
- [ ] **Update all components** to use GameEngine store pattern

#### **Priority 4B: Component Architecture**
- [ ] **Move components to clean structure:**
  - `core` — Reusable UI components
  - `game` — Game-specific components  
  - `screens` — Full screen components

---

### 🧹 Phase 5: Cleanup & Polish (Week 5-6)
**Priority: Low** — Final organization.

#### **Priority 5A: Utilities & Documentation**
- [ ] **Create utility modules:**
  - `src/lib/utils/calculations.ts` — Math utilities
  - `src/lib/utils/formatting.ts` — Display formatting
  - `src/lib/utils/validation.ts` — Input validation
- [ ] **Update documentation:**
  - System architecture docs
  - Data structure documentation
  - Integration guides

#### **Priority 5B: Remove Legacy Code**
- [ ] **Clean up unused functions** from database files
- [ ] **Standardize exports** from database files
- [ ] **Add progression chain exports** for balancing tools

---

### 🚧 Migration Strategy Per File

#### **For `Items.ts` (Highest Priority):**
```bash
# 1. Backup original file
cp src/lib/game/core/Items.ts src/lib/game/core/Items.ts.backup

# 2. Reorganize Items.ts internally (keep all data)
# 3. Create ItemService.ts
touch src/lib/game/services/ItemService.ts

# 4. Move functions from Items.ts to ItemService.ts
# 5. Update imports one component at a time
# 6. Test each migration step
```

**Critical Success Metrics:**
- [ ] **Week 2:** `ItemService` working, `Items.ts` reorganized internally
- [ ] **Week 3:** All services created, components using service layer
- [ ] **Week 4:** GameEngine operational, centralized system interactions
- [ ] **Week 5:** All components use clean architecture
- [ ] **Week 6:** Documentation complete, legacy functions removed

---

## Revised Directory Structure

```text
src/
├── lib/
│   ├── game/
│   │   ├── core/                    # Central database files (organized internally)
│   │   │   ├── Items.ts             # All items, organized by progression
│   │   │   ├── Buildings.ts         # All buildings, organized by type
│   │   │   ├── Research.ts          # All technologies, organized by tree
│   │   │   ├── Work.ts              # All work categories
│   │   │   ├── Locations.ts         # All location templates
│   │   │   ├── Race.ts              # All race templates
│   │   │   └── types.ts             # Type definitions
│   │   ├── entities/                # Entity classes with methods
│   │   │   ├── Pawn.ts
│   │   │   ├── Item.ts
│   │   │   ├── Building.ts
│   │   │   └── Location.ts
│   │   ├── systems/                 # Game systems (your GameEngine)
│   │   │   ├── GameEngine.ts        # Central coordinator
│   │   │   ├── AbilitySystem.ts
│   │   │   ├── CraftingSystem.ts
│   │   │   ├── WorkSystem.ts
│   │   │   ├── BuildingSystem.ts
│   │   │   ├── ResearchSystem.ts
│   │   │   ├── EventSystem.ts
│   │   │   └── EquipmentSystem.ts
│   │   ├── services/                # Data access & queries
│   │   │   ├── ItemService.ts       # Item queries & lookups
│   │   │   ├── BuildingService.ts   # Building queries
│   │   │   ├── ResearchService.ts   # Research queries
│   │   │   ├── WorkService.ts       # Work category queries
│   │   │   └── LocationService.ts   # Location queries
│   │   └── state/                   # State management
│   │       ├── GameState.ts
│   │       └── StateManager.ts
│   ├── stores/                      # Svelte stores
│   │   ├── gameEngine.ts
│   │   ├── uiState.ts
│   │   └── logging.ts
│   ├── components/                  # UI Components
│   │   ├── core/                    # Reusable core components
│   │   ├── game/                    # Game-specific components
│   │   └── screens/                 # Full screen components
│   └── utils/                       # Utility functions
│       ├── calculations.ts
│       ├── formatting.ts
│       └── validation.ts
└── docs/
    ├── architecture/
    ├── data/
    └── tasks/
```

---

## Key Benefits of This Approach:

### ✅ **Central Database Benefits**
- **Easy balancing**: See all weapon damage in one file
- **Mod-friendly**: Single file for modders to understand
- **No category ambiguity**: Clear where everything belongs
- **Search efficiency**: Ctrl+F finds anything instantly

### ✅ **Clean Logic Separation**  
- **Service layer**: Clean queries and business logic
- **System layer**: Coordinated game mechanics
- **Pure data files**: Easy to edit, version control friendly

### ✅ **Migration Safety**
- **No breaking changes**: Data stays in same files
- **Incremental**: Move logic piece by piece
- **Testable**: Each service can be tested independently
- **Rollback-friendly**: Backup original files

This keeps your game data centralized (like CDDA) while creating the clean architecture you need for maintainability!