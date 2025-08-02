# Fantasia4x Project Guide

## Game Overview

Fantasia4x is a **mechanics-first**, **beginner-friendly** 4X strategy game built through **iterative development**. The core innovation is solving the "early game variety challenge" - making every playthrough feel different from turn 1.

### Core Features
- **Procedural Everything**: Races, traits, events, and discoveries are dynamically generated
- **Event-Driven Gameplay**: Discovery through dynamic events rather than manual exploration
- **Beginner-Friendly**: Clean, intuitive interfaces without overwhelming complexity
- **Mechanics Over Graphics**: Solid gameplay systems before visual polish

## Technology Stack

### Core Technologies
- **SvelteKit**: Modern reactive frontend framework
- **TypeScript**: Strict type safety throughout the codebase
- **Vite**: Fast development server and build tool
- **CSS**: Custom styling with dark theme
- **LocalStorage**: Client-side persistence for game saves

### Common Commands
```bash
npx tsc --noEmit     # TypeScript type checking (run after tasks)
npm run lint         # Check code style
npm run lint:fix     # Auto-fix linting issues
npm run test         # Run tests
```

## Project Structure

### Current Structure
```
src/lib/
├── components/           # Svelte components
│   ├── UI/              # Core UI components
│   └── screens/         # Game screen components
├── game/                # Game logic (TypeScript)
│   ├── core/           # Data files (Items.ts, Buildings.ts, etc.)
│   ├── systems/        # Game systems (ModifierSystem, etc.)
│   └── services/       # Data access services
├── stores/             # Svelte stores for state management
└── utils/              # Utility functions
```

### Key Principles
- **Use `$lib` alias** for internal imports
- **Separate game logic** (`$lib/game`) from UI components (`$lib/components`)
- **Keep data centralized** in core files for easy balancing and modding
- **Extract utilities** when code is duplicated 3+ times

## Development Status

### Completed Systems ✅
- Procedural Race Generation
- Building & Construction System
- Research System with three-tier progression
- Work Assignment System
- Event System with dynamic storytelling
- Crafting & Tool System (20+ tools across 4 tech levels)
- Exploration System with location discovery
- Inventory & Equipment with unified management

### Current Priorities
1. **Component Refactoring**: Break down large components (PawnScreen, etc.)
2. **Bug Fixes**: Event system message log, pawn behavior automation
3. **UI Polish**: Improve user experience and visual consistency
4. **Combat System**: Implement turn-based tactical combat

## Development Guidelines

### Code Quality (In Priority Order)
1. **Readability**: Code should tell a clear story
2. **Maintainability**: Easy to modify and extend
3. **Testability**: Simple to write tests for
4. **Performance**: Optimize only when needed

### Component Guidelines
- **Under 200 lines** per component
- **Single responsibility** - one thing well
- **Extract components** when files get too large
- **Use existing systems** (ModifierSystem, PawnEquipment, etc.)

### Function Guidelines
- **Under 30 lines** per function
- **Clear names** that explain purpose
- **Simple logic** that's easy to follow
- **Extract utilities** when duplicated

### Error Handling
```typescript
// Good: Simple and clear
function safeCalculateAbilities(pawn, gameState) {
  try {
    return calculateAllModifierResults(pawn, gameState);
  } catch (error) {
    console.error('Failed to calculate abilities:', error);
    return {}; // Simple fallback
  }
}
```

### Testing Approach
```typescript
// Good: Simple, focused tests
describe('PawnOverview', () => {
  test('displays pawn name and basic info', () => {
    const mockPawn = { name: 'Test Pawn', physicalTraits: { height: 180 } };
    render(PawnOverview, { props: { pawn: mockPawn } });
    
    expect(screen.getByText('Test Pawn')).toBeInTheDocument();
    expect(screen.getByText('180cm')).toBeInTheDocument();
  });
});
```

## Refactoring Guidelines

### When to Refactor
- Component is over 300 lines
- Function is over 50 lines
- Code is duplicated 3+ times
- Logic is hard to understand

### How to Refactor
1. **Start Small**: Make one small change at a time
2. **Test Each Step**: Ensure functionality works after each change
3. **Keep It Working**: Never break existing functionality
4. **Document Changes**: Simple comments explaining what and why

### Component Extraction Pattern
```typescript
// Before: Massive component
<script>
  // 500+ lines of mixed logic
</script>

// After: Focused components
<script>
  import PawnOverview from './PawnOverview.svelte';
  import PawnStats from './PawnStats.svelte';
  import PawnNeeds from './PawnNeeds.svelte';
</script>

<PawnOverview {pawn} />
<PawnStats {pawn} />
<PawnNeeds {pawn} />
```

## What We Avoid

### ❌ Enterprise Overengineering
- Complex service layers with 20+ methods
- ServiceResult patterns with error codes
- Dependency injection containers
- Abstract factories and registries
- Complex caching systems

### ❌ Premature Optimization
- Micro-optimizations before profiling
- Complex performance monitoring
- Over-abstracted interfaces
- Unnecessary design patterns

## Success Metrics

### Code Quality Indicators
- **Component size**: Under 200 lines per component
- **Function size**: Under 30 lines per function
- **Readability**: New developers can understand code quickly
- **Maintainability**: Changes are easy to make without breaking things

### Development Velocity Indicators
- **Feature development**: New features can be added quickly
- **Bug fixes**: Issues can be located and fixed easily
- **Refactoring**: Code can be improved without fear of breaking things
- **Testing**: Tests are easy to write and understand

## Remember

**The goal is a working, enjoyable game - not a showcase of software engineering patterns.**

- Start simple
- Refactor when needed
- Test what matters
- Keep it readable
- Build iteratively
- Avoid overengineering

**When in doubt, choose the simpler approach.**