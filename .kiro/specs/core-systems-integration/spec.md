# Core Systems Integration Specification

## Overview

This specification defines how the refactored game systems will integrate and communicate with each other through the GameEngine coordinator. It establishes the protocols, interfaces, and patterns that enable clean system interactions while eliminating circular dependencies.

## Prerequisites

- ✅ Architecture Refactoring must be completed
- ✅ Service layer operational
- ✅ GameEngine implemented as central coordinator
- ✅ Circular dependencies eliminated

## Requirements

### R1: System Communication Protocol

**As a developer**, I want systems to communicate through well-defined interfaces so that I can modify individual systems without breaking others.

**Acceptance Criteria:**

- All system interactions go through GameEngine
- Systems never directly import or call each other
- Clear event-based communication patterns
- Type-safe interfaces for all system interactions

### R2: Unified State Management

**As a developer**, I want centralized state management so that all systems have consistent access to game data.

**Acceptance Criteria:**

- Single source of truth for game state
- Predictable state update patterns
- State changes trigger appropriate system notifications
- No direct state mutations outside of designated patterns

### R3: System Lifecycle Management

**As a developer**, I want systems to initialize and update in the correct order so that dependencies are always satisfied.

**Acceptance Criteria:**

- Clear system initialization sequence
- Proper dependency resolution during startup
- Graceful system shutdown procedures
- Error handling for system failures

### R4: Event Propagation System

**As a developer**, I want systems to react to game events so that changes in one system can trigger appropriate responses in others.

**Acceptance Criteria:**

- Event-driven architecture for system communication
- Type-safe event definitions
- Proper event ordering and priority handling
- Event history for debugging and rollback

### R5: Performance Optimization

**As a developer**, I want system integration to be performant so that the game runs smoothly even with complex interactions.

**Acceptance Criteria:**

- Minimal overhead for system communication
- Efficient state synchronization
- Batched updates where appropriate
- Performance monitoring capabilities

## Design

### System Architecture

```typescript
// Central GameEngine coordinates all systems
class GameEngine {
  private systems: Map<string, GameSystem>;
  private eventBus: EventBus;
  private stateManager: StateManager;

  // System registration and lifecycle
  registerSystem(name: string, system: GameSystem): void;
  initializeSystems(): Promise<void>;
  updateSystems(deltaTime: number): void;
  shutdownSystems(): Promise<void>;

  // Event handling
  emitEvent(event: GameEvent): void;
  subscribeToEvent(eventType: string, handler: EventHandler): void;

  // State management
  getState(): GameState;
  updateState(updates: Partial<GameState>): void;
}
```

### System Interface

```typescript
interface GameSystem {
  name: string;
  dependencies: string[];

  initialize(engine: GameEngine): Promise<void>;
  update(deltaTime: number, state: GameState): SystemUpdateResult;
  shutdown(): Promise<void>;

  handleEvent(event: GameEvent): void;
}
```

### Event System

```typescript
interface GameEvent {
  type: string;
  timestamp: number;
  source: string;
  data: any;
  priority: EventPriority;
}

enum EventPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3
}
```

### State Management

```typescript
interface SystemUpdateResult {
  stateChanges?: Partial<GameState>;
  events?: GameEvent[];
  errors?: SystemError[];
}

interface StateManager {
  getCurrentState(): GameState;
  applyUpdates(updates: Partial<GameState>): void;
  subscribeToChanges(path: string, callback: StateChangeCallback): void;
  getHistory(): StateSnapshot[];
}
```

### System Communication Patterns

#### 1. Request-Response Pattern

```typescript
// System A requests data from System B through GameEngine
const result = await gameEngine.requestFromSystem('ItemService', 'getItemsByType', {
  type: 'weapon'
});
```

#### 2. Event-Driven Pattern

```typescript
// System A emits event, System B reacts
gameEngine.emitEvent({
  type: 'PAWN_NEEDS_CHANGED',
  source: 'PawnSystem',
  data: { pawnId: 'pawn-123', needs: updatedNeeds }
});
```

#### 3. State Subscription Pattern

```typescript
// System subscribes to specific state changes
gameEngine.subscribeToStateChanges('pawns.*.needs', (change) => {
  // React to pawn needs changes
});
```

## Implementation Tasks

### T1: Implement GameEngine Core

**Requirement Reference:** R1, R2, R3

**Implementation Steps:**

1. Create `src/lib/game/systems/GameEngine.ts`
2. Implement system registration and lifecycle management
3. Add state management integration
4. Create system interface definitions
5. Add error handling and logging

**Validation:**

- Systems can be registered and initialized
- State updates propagate correctly
- Error conditions are handled gracefully

### T2: Implement Event Bus System

**Requirement Reference:** R1, R4

**Implementation Steps:**

1. Create `src/lib/game/systems/EventBus.ts`
2. Implement event emission and subscription
3. Add event priority handling
4. Create event history tracking
5. Add type-safe event definitions

**Validation:**

- Events are delivered to correct subscribers
- Event ordering respects priority
- Event history is maintained correctly

### T3: Integrate Existing Systems

**Requirement Reference:** R1, R2, R3

**Implementation Steps:**

1. Convert existing services to implement GameSystem interface
2. Update system initialization in main game loop
3. Replace direct system calls with GameEngine mediation
4. Add proper dependency declarations
5. Update component imports to use GameEngine

**Validation:**

- All systems initialize in correct order
- No direct system-to-system calls remain
- Components access systems through GameEngine

### T4: Implement State Synchronization

**Requirement Reference:** R2, R5

**Implementation Steps:**

1. Create centralized state management in GameEngine
2. Implement state change notifications
3. Add batched update mechanisms
4. Create state validation and consistency checks
5. Add state persistence integration

**Validation:**

- State changes are properly synchronized
- Performance meets requirements
- State consistency is maintained

### T5: Add Performance Monitoring

**Requirement Reference:** R5

**Implementation Steps:**

1. Add system performance metrics collection
2. Implement update timing measurements
3. Create performance reporting dashboard
4. Add memory usage tracking
5. Implement performance alerts

**Validation:**

- Performance metrics are collected accurately
- Performance issues are detected early
- System bottlenecks are identified

### T6: Update Component Integration

**Requirement Reference:** R1, R2

**Implementation Steps:**

1. Update Svelte components to use GameEngine
2. Replace direct service imports with GameEngine access
3. Add proper error handling in components
4. Update state subscriptions to use GameEngine
5. Add component lifecycle integration

**Validation:**

- Components work correctly with new architecture
- No direct service dependencies in components
- Error handling works properly

## Testing Strategy

### Unit Testing

- Test GameEngine system registration and lifecycle
- Test event bus functionality and ordering
- Test state management operations
- Test individual system integrations

### Integration Testing

- Test complete system initialization sequence
- Test cross-system event propagation
- Test state synchronization across systems
- Test error handling and recovery

### Performance Testing

- Measure system update performance
- Test event handling throughput
- Validate memory usage patterns
- Test with realistic game scenarios

### Regression Testing

- Ensure existing functionality still works
- Validate save/load compatibility
- Test UI component integration
- Verify game mechanics remain intact

## Success Criteria

### Functional Success

- ✅ All systems communicate through GameEngine
- ✅ No circular dependencies between systems
- ✅ State management is centralized and consistent
- ✅ Event system enables proper system coordination
- ✅ Existing game functionality is preserved

### Performance Success

- ✅ System integration overhead < 5ms per frame
- ✅ Memory usage remains stable during gameplay
- ✅ Event processing latency < 1ms
- ✅ State synchronization completes within frame budget

### Development Success

- ✅ New systems can be added without modifying existing ones
- ✅ System interactions are type-safe and well-documented
- ✅ Debugging and monitoring tools are available
- ✅ Code is maintainable and follows established patterns

## Migration Notes

### Breaking Changes

- Components must access systems through GameEngine
- Direct service imports will no longer work
- System initialization order may change

### Compatibility

- Existing save files should continue to work
- Game mechanics should remain unchanged
- UI behavior should be preserved

### Rollback Plan

- Keep backup of pre-integration code
- Maintain feature flags for gradual rollout
- Document all changes for easy reversal

## Next Steps

After completing this specification:

1. **Implement Pawn Behavior System** - Automated needs satisfaction
2. **Develop Research Enhancement** - Three-tier research system
3. **Create Production Chain System** - Resource flow optimization

This specification provides the foundation for all future system development by establishing clean integration patterns and eliminating architectural debt.
