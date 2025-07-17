# Development Philosophy

## Core Principles

### Simplicity Over Complexity

**Fantasia4x is built through iterative development, prioritizing clear, readable, maintainable code over enterprise-grade overengineering.**

- **Readable Code First**: Code should be easy to understand by any developer
- **Simple Solutions**: Choose the simplest approach that solves the problem
- **Avoid Overengineering**: Don't build complex abstractions until they're actually needed
- **Iterative Improvement**: Start simple, refactor when complexity is justified

### Practical Development Guidelines

#### Code Quality Priorities (In Order)

1. **Readability**: Code should tell a clear story
2. **Maintainability**: Easy to modify and extend
3. **Testability**: Simple to write tests for
4. **Performance**: Optimize only when needed

#### What We Prefer

✅ **Simple, Direct Code**
```typescript
// Good: Clear and direct
function calculatePawnEfficiency(pawn: Pawn, workType: string): number {
  const baseStat = pawn.stats[getWorkPrimaryStat(workType)];
  const equipmentBonus = getEquipmentBonus(pawn, workType);
  return (baseStat / 10) * equipmentBonus;
}
```

✅ **Component Extraction Over Service Layers**
```typescript
// Good: Break large components into smaller ones
<PawnOverview pawn={selectedPawn} />
<PawnStats pawn={selectedPawn} />
<PawnAbilities pawn={selectedPawn} gameState={$gameState} />
```

✅ **Existing System Integration**
```typescript
// Good: Use existing systems
import { modifierSystem } from '$lib/game/systems/ModifierSystem';
const efficiency = modifierSystem.calculateWorkEfficiency(pawnId, workType, gameState);
```

#### What We Avoid

❌ **Complex Service Layers**
```typescript
// Avoid: Unnecessary abstraction
interface PawnService {
  calculateAllAbilities(pawn: Pawn, gameState: GameState): ServiceResult<PawnAbilityResults>;
  formatPawnStats(pawn: Pawn): FormattedPawnStats;
  // ... 20 more methods
}
```

❌ **Enterprise Patterns**
```typescript
// Avoid: Overengineered error handling
interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    context?: Record<string, any>;
  };
}
```

❌ **Complex Dependency Injection**
```typescript
// Avoid: Unnecessary complexity
class ServiceRegistry {
  registerService<T>(name: string, service: T): void;
  getService<T>(name: string): T;
  // Complex service management...
}
```

## Refactoring Guidelines

### When to Refactor

- **Component is over 500 lines**: Break it into smaller components
- **Function is over 50 lines**: Split into smaller functions
- **Code is duplicated 2+ times**: Extract to utility function
- **Logic is hard to understand**: Simplify and add comments

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

## Error Handling Philosophy

### Simple Error Handling

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

// Good: Graceful UI fallbacks
{#if selectedPawn}
  <PawnOverview pawn={selectedPawn} />
{:else}
  <div class="no-pawn">No pawn selected</div>
{/if}
```

### Avoid Complex Error Systems

```typescript
// Avoid: Overengineered error handling
try {
  const result = await pawnService.calculateAbilities(pawn, gameState);
  if (!result.success) {
    throw new ServiceError(result.error.code, result.error.message);
  }
  return result.data;
} catch (error) {
  this.errorHandler.handleServiceError(error);
  return this.fallbackProvider.getDefaultAbilities();
}
```

## Testing Philosophy

### Simple Testing Approach

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

### Avoid Complex Testing Infrastructure

```typescript
// Avoid: Overengineered test setup
class TestServiceFactory {
  createMockPawnService(): jest.Mocked<PawnService> {
    return {
      calculateAllAbilities: jest.fn(),
      formatPawnStats: jest.fn(),
      // ... 20 more mocked methods
    };
  }
}
```

## Performance Philosophy

### Simple Performance Optimizations

```typescript
// Good: Simple reactive optimization
$: pawnStats = selectedPawn ? formatPawnStats(selectedPawn) : null;

// Good: Use existing caching
$: allAbilities = selectedPawn && gameState ? 
  calculateAllModifierResults(selectedPawn, gameState) : {};
```

### Avoid Premature Optimization

```typescript
// Avoid: Complex caching systems
class CalculationCache {
  private cache = new Map<string, CacheEntry>();
  private invalidationStrategies = new Map<string, InvalidationStrategy>();
  
  get<T>(key: string, calculator: () => T): T {
    // Complex caching logic...
  }
}
```

## Architecture Decisions

### Use What Exists

- **ModifierSystem**: Already handles complex calculations with caching
- **PawnEquipment functions**: Already handle equipment operations
- **Existing utilities**: Use `pawnUtils.ts` for formatting
- **Svelte stores**: Use existing `gameState` and `uiState`

### Build Incrementally

1. **Extract components** from large files
2. **Add utilities** when code is duplicated
3. **Refactor systems** only when they become problematic
4. **Optimize** only when performance issues are identified

### Keep It Simple

- **One responsibility per component**
- **Clear function names and purposes**
- **Minimal abstractions**
- **Direct, readable code flow**

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