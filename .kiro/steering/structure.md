# Project Structure & Organization

## Root Structure

```
fantasia4x/
├── src/                    # Source code
├── static/                 # Static assets
├── docs/                   # Documentation and analysis
├── .kiro/                  # Kiro AI configuration
└── node_modules/           # Dependencies
```

## Current Architecture Issues

**⚠️ CRITICAL: The project suffers from missing central coordination and circular dependencies that prevent clean system integration.**

### Major Problems

- **Missing GameEngine**: No central coordinator for system interactions and unified calculations
- **Circular Dependencies**: Pawns → Items → Work → Pawns creating integration chaos
- **Scattered Business Logic**: Functions mixed with data in monolithic files
- **Missing Service Layer**: No unified system for managing interactions between core systems

## Current Source Organization (`src/lib/`)

### Existing Structure (Problematic)

```
lib/
├── components/           # Svelte components
│   ├── UI/              # Core UI components
│   └── screens/         # Game screen components
├── game/                # Game logic (TypeScript)
│   └── core/           # Monolithic database files
│       ├── Buildings.ts # 1000+ lines: data + logic mixed
│       ├── Items.ts     # 2000+ lines: data + logic mixed
│       ├── GameState.ts # Central state management
│       ├── types.ts     # TypeScript interfaces
│       └── Work.ts      # Work assignment systems
├── stores/             # Svelte stores for state management
└── index.ts            # Library exports
```

## Target Architecture (Post-Refactoring)

### Planned Clean Structure

```
lib/
├── game/
│   ├── core/                    # Central database files (organized internally)
│   │   ├── Items.ts             # All items, organized by progression
│   │   ├── Buildings.ts         # All buildings, organized by type
│   │   ├── Research.ts          # All technologies, organized by tree
│   │   ├── Work.ts              # All work categories
│   │   ├── Locations.ts         # All location templates
│   │   ├── Race.ts              # All race templates
│   │   └── types.ts             # Type definitions
│   ├── entities/                # Entity classes with methods
│   │   ├── Pawn.ts
│   │   ├── Item.ts
│   │   ├── Building.ts
│   │   └── Location.ts
│   ├── systems/                 # Game systems (GameEngine pattern)
│   │   ├── GameEngine.ts        # Central coordinator
│   │   ├── AbilitySystem.ts
│   │   ├── CraftingSystem.ts
│   │   ├── WorkSystem.ts
│   │   ├── BuildingSystem.ts
│   │   ├── ResearchSystem.ts
│   │   ├── EventSystem.ts
│   │   └── EquipmentSystem.ts
│   ├── services/                # Data access & queries
│   │   ├── ItemService.ts       # Item queries & lookups
│   │   ├── BuildingService.ts   # Building queries
│   │   ├── ResearchService.ts   # Research queries
│   │   ├── WorkService.ts       # Work category queries
│   │   └── LocationService.ts   # Location queries
│   └── state/                   # State management
│       ├── GameState.ts
│       └── StateManager.ts
├── stores/                      # Svelte stores
│   ├── gameEngine.ts
│   ├── uiState.ts
│   └── logging.ts
├── components/                  # UI Components
│   ├── core/                    # Reusable core components
│   ├── game/                    # Game-specific components
│   └── screens/                 # Full screen components
└── utils/                       # Utility functions
    ├── calculations.ts
    ├── formatting.ts
    └── validation.ts
```

## Refactoring Strategy

### Phase 1: Extract Logic from Database Files

1. **Keep all data centralized** in reorganized core files
2. **Extract business logic** into service layer
3. **Maintain mod compatibility** by keeping single-file databases
4. **Enable clean queries** through service interfaces

### Phase 2: Create Service Layer

- Clean separation between data access and business logic
- Unified interfaces for system interactions
- Elimination of circular dependencies

### Phase 3: Implement GameEngine Pattern

- Central coordinator for all system interactions
- Unified efficiency calculations
- Single source of truth for bonuses and modifiers

## Key Benefits of Target Architecture

### Central Database Benefits

- **Easy balancing**: See all weapon damage in one file
- **Mod-friendly**: Single file for modders to understand
- **Search efficiency**: Ctrl+F finds anything instantly
- **No category ambiguity**: Clear where everything belongs

### Clean Logic Separation

- **Service layer**: Clean queries and business logic
- **System layer**: Coordinated game mechanics
- **Pure data files**: Easy to edit, version control friendly

### Migration Safety

- **No breaking changes**: Data stays in same files
- **Incremental**: Move logic piece by piece
- **Testable**: Each service can be tested independently
- **Rollback-friendly**: Backup original files

## Current Development Guidelines

### Immediate Priorities (Phase 1)

1. **DO NOT** add new content to monolithic files
2. **DO** extract functions from Items.ts/Buildings.ts into services
3. **DO** reorganize existing files internally by progression/type
4. **DO** maintain backward compatibility during refactoring

### Code Patterns to Follow

- Use `$lib` alias for internal imports
- Group imports: external libraries first, then internal modules
- Maintain strict TypeScript typing throughout refactoring
- Document all architectural changes in migration logs

## Documentation Structure (`docs/`)

```
docs/
├── core/               # Core gameplay documentation
├── analysis/           # Architecture analysis (critical reading)
└── tasks/              # Development tasks and refactoring roadmaps
```

## Critical Reading

- **Architecture_Analysis_08.25.md**: Detailed analysis of current problems
- **Refactoring.md**: Step-by-step migration plan
- **ROADMAP.md**: Updated development priorities focusing on stability
