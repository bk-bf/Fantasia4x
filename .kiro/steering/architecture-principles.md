# Architecture Principles

## Core Architectural Patterns

### GameEngine Central Coordinator Pattern
- **Single Source of Truth**: GameEngine serves as the central coordinator for all system interactions
- **Unified Calculations**: All complex calculations (efficiency, bonuses, effects) go through GameEngine
- **System Integration**: GameEngine coordinates between services, never direct service-to-service communication
- **State Management**: All state changes flow through GameEngine for consistency validation

### Service Layer Separation
- **Business Logic Extraction**: Extract all business logic from data files into dedicated services
- **Pure Data Files**: Data files (Items.ts, Buildings.ts, etc.) contain only definitions and exports
- **Service Interfaces**: All services implement clean interfaces for testability and maintainability
- **Unidirectional Dependencies**: Services depend on data layer, never the reverse

### Dependency Flow Architecture
```
UI Components → GameEngine → Service Layer → Data Layer
```
- **No Circular Dependencies**: Strict unidirectional flow prevents circular import issues
- **Clean Imports**: Use service registry for unified access, avoid direct service imports in components
- **Interface-Based Design**: Program against interfaces, not concrete implementations

## Implementation Standards

### Backward Compatibility Requirements
- **Parallel Implementation**: New architecture runs alongside existing systems during transition
- **Feature Flags**: Use configuration flags to enable/disable new architecture components
- **Zero Breaking Changes**: Existing functionality must remain unchanged during migration
- **Gradual Migration**: Migrate components one at a time, not all at once

### State Management Principles
- **Immutable Updates**: All state changes create new state objects, never mutate existing state
- **Centralized Validation**: GameEngine validates state consistency after every operation
- **State Synchronization**: Ensure state remains consistent between old and new patterns during migration
- **Rollback Capability**: Maintain ability to restore previous state on errors

### Testing Requirements
- **Test-Driven Migration**: Write tests before refactoring existing functionality
- **Service Unit Tests**: Each service must have comprehensive unit test coverage
- **Integration Tests**: Test service interactions through GameEngine coordination
- **Performance Validation**: Ensure no performance regression during architecture changes

## Critical Design Decisions

### Service Registry Pattern
- **Singleton Access**: Use ServiceRegistry for unified service access across the application
- **Dependency Injection**: Services receive dependencies through constructor injection
- **Interface Contracts**: All services implement well-defined interfaces
- **Service Composition**: Services can use other services through the registry

### Error Handling Standards
- **Result Pattern**: Services return `ServiceResult<T>` objects with success/error information
- **Error Recovery**: GameEngine implements automatic error recovery and state rollback
- **Validation First**: Validate all inputs at service boundaries before processing
- **Graceful Degradation**: System continues operating even when individual services fail

### Performance Optimization
- **Calculation Caching**: Cache expensive calculations with proper invalidation strategies
- **Lazy Loading**: Load data only when needed, not preemptively
- **Batch Operations**: Group related operations to minimize overhead
- **Memory Management**: Proper cleanup of temporary objects and event listeners

## Migration Safety Protocols

### Rollback Procedures
- **Backup Strategy**: Create `.backup` copies of all files before modification
- **Emergency Rollback**: Automated scripts to restore original functionality instantly
- **Feature Toggles**: Ability to disable new architecture components without code changes
- **Validation Scripts**: Automated verification that rollback restores original behavior

### Risk Mitigation
- **Phase-Based Implementation**: Implement architecture changes in small, reversible phases
- **Performance Monitoring**: Track performance metrics at each phase with automatic alerts
- **State Consistency Checks**: Automated validation of state consistency after each operation
- **Component-Level Rollback**: Ability to rollback individual components independently

## Code Quality Standards

### TypeScript Integration
- **Strict Type Checking**: Use strict TypeScript configuration throughout refactoring
- **Interface-First Design**: Define interfaces before implementing concrete classes
- **Type Safety**: Eliminate `any` types, use proper generic constraints
- **Compile-Time Validation**: Catch errors at compile time, not runtime

### Import Patterns
```typescript
// Correct: Use service registry
import { serviceRegistry } from '$lib/game/services';
const items = serviceRegistry.itemService.getItemsByType('tool');

// Incorrect: Direct service imports in components
import { ItemService } from '$lib/game/services/ItemService';
```

### Documentation Requirements
- **Architecture Decisions**: Document all major design choices and rationale
- **Migration Logs**: Record each component migration with before/after comparisons
- **API Documentation**: Maintain comprehensive documentation for all service interfaces
- **Troubleshooting Guides**: Document common issues and their solutions

## Success Metrics

### Architecture Quality
- **Zero Circular Dependencies**: No circular import chains in the codebase
- **Clean Compilation**: TypeScript compiles without warnings or errors
- **Test Coverage**: Minimum 80% test coverage for all service layer code
- **Performance Baseline**: No more than 5% performance degradation during migration

### System Stability
- **Extended Gameplay**: System remains stable during 50+ turn game sessions
- **Save/Load Integrity**: Save files remain compatible throughout migration
- **UI Reactivity**: Svelte stores update correctly with new architecture
- **Error Recovery**: System recovers gracefully from errors without data loss