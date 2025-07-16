# Technology Stack & Build System

## Core Technologies

- **SvelteKit**: Modern reactive frontend framework with file-based routing
- **TypeScript**: Strict type safety throughout the codebase
- **Vite**: Fast development server and build tool
- **CSS**: Custom styling with dark theme, no external CSS frameworks
- **LocalStorage**: Client-side persistence for game saves

## Dependencies

### Production Dependencies

- `@google/generative-ai`: AI integration for procedural generation
- `uuid`: Unique identifier generation
- `blessed-contrib`: Terminal UI components
- `figlet`: ASCII art text generation

### Development Dependencies

- **Linting & Formatting**: ESLint + Prettier with Svelte support
- **Type Checking**: TypeScript with strict configuration
- **Testing**: Playwright for end-to-end testing

## Common Commands

### Development

```bash
npm run dev          # Start development server with host binding
npm run build        # Production build
npm run preview      # Preview production build
```

### Code Quality

```bash
npm run lint         # Check code style and lint rules
npm run lint:fix     # Auto-fix linting and formatting issues
npm run format       # Format code with Prettier
```

### Testing

```bash
npm run test         # Run Playwright tests
```

## Build Configuration

- **Adapter**: `@sveltejs/adapter-auto` for automatic deployment detection
- **Preprocessing**: Vite preprocessing for Svelte components
- **Module Resolution**: Bundler mode with strict TypeScript settings
- **Path Aliases**: `$lib` alias configured for clean imports

## Current Development Challenges

### Performance Issues

- **Monolithic Files**: Items.ts (2000+ lines) and Buildings.ts (1000+ lines) create parsing overhead
- **Circular Dependencies**: Complex import chains slow down development server
- **Memory Usage**: Large data structures loaded unnecessarily in components

### Development Velocity Blockers

- **Adding New Features**: Requires navigating circular dependencies
- **Balancing Combat**: Impossible without central GameEngine coordination
- **Testing Systems**: Can't isolate logic from data due to mixed concerns
- **Implementing Features**: Requires refactoring existing architecture first

### TypeScript Integration Issues

- **Circular Import Dependencies**: Import chains creating compilation issues
- **Scattered Type Dependencies**: Types spread across multiple files
- **Build Performance**: Circular dependencies slow down TypeScript compilation

## Refactoring-Specific Guidelines

### Phase 1: Emergency Refactoring (Current Priority)

```bash
# Backup critical files before refactoring
cp src/lib/game/core/Items.ts src/lib/game/core/Items.ts.backup
cp src/lib/game/core/Buildings.ts src/lib/game/core/Buildings.ts.backup

# Create service layer structure
mkdir -p src/lib/game/services
mkdir -p src/lib/game/systems
mkdir -p src/lib/game/entities
```

### Development Workflow During Refactoring

1. **Always backup** before major changes
2. **Test incrementally** after each service extraction
3. **Update imports** one component at a time
4. **Validate TypeScript** compilation after each change
5. **Run linting** to catch circular dependency issues

### Code Quality During Migration

- **Maintain strict TypeScript** throughout refactoring
- **Extract pure functions first** before complex business logic
- **Keep data centralized** while moving logic to services
- **Document architectural decisions** in migration logs

## Performance Monitoring

- **Bundle Size**: Monitor impact of service layer on build size
- **Development Server**: Track hot reload performance during refactoring
- **Memory Usage**: Profile memory consumption with new architecture
- **Type Checking**: Monitor TypeScript compilation speed

## Critical Development Patterns

### Service Layer Pattern

```typescript
// Extract from monolithic files
export class ItemService {
  static getItemsByType(type: string): Item[] {
    return ITEMS_DATABASE.filter((item) => item.type === type);
  }
}
```

### Clean Import Patterns

```typescript
// Avoid circular dependencies
import { ItemService } from '$lib/game/services/ItemService';
import type { Item } from '$lib/game/core/types';
```

### Component Integration

```typescript
// Use services in components, not direct database access
import { ItemService } from '$lib/game/services/ItemService';
// NOT: import { ITEMS_DATABASE } from '$lib/game/core/Items';
```

## Migration Success Metrics

- **Week 2**: ItemService operational, Items.ts reorganized internally
- **Week 3**: All services created, components using service layer
- **Week 4**: GameEngine operational, centralized system interactions
- **Week 5**: All components use clean architecture
- **Week 6**: Documentation complete, legacy functions removed

## Development Guidelines (Updated for Refactoring)

- **DO NOT** add new content to monolithic files during refactoring
- **DO** extract functions into services before adding features
- **DO** maintain backward compatibility during migration
- **DO** use TypeScript strict mode throughout refactoring
- **DO** leverage SvelteKit's `$lib` alias for clean service imports
- **DO** separate game logic (`$lib/game`) from UI components (`$lib/components`)
- **DO** document all architectural changes for team coordination
