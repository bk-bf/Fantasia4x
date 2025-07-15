# System Interaction Protocols Design

## Overview

This document defines the comprehensive protocols for system interactions within the Fantasia4x GameEngine architecture. These protocols establish how systems request data from other systems, propagate events, maintain state consistency, and handle errors through the central GameEngine coordinator.

## System Interaction Architecture

### Core Principles

1. **Central Coordination**: All system interactions flow through the GameEngine
2. **Unidirectional Data Flow**: Systems request data through well-defined interfaces
3. **Event-Driven Communication**: Systems communicate through structured events
4. **State Consistency**: All state changes are validated and coordinated
5. **Error Recovery**: Robust error handling with automatic recovery mechanisms

### Interaction Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                 SYSTEM INTERACTION FLOW                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────┐    ┌─────────────┐    ┌─────────┐             │
│  │System A │───►│ GameEngine  │◄───│System B │             │
│  │         │    │(Coordinator)│    │         │             │
│  └─────────┘    └──────┬──────┘    └─────────┘             │
│                         │                                   │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           INTERACTION PROTOCOLS                     │   │
│  │  • Data Request Protocol                            │   │
│  │  • Event Propagation Protocol                       │   │
│  │  • State Consistency Protocol                       │   │
│  │  • Error Recovery Protocol                          │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Data Request Protocol

### Protocol Definition

Systems request data from other systems through standardized request/response patterns coordinated by the GameEngine.

### Request Types

```typescript
export type SystemDataRequestType =
    | 'query'           // Read-only data queries
    | 'calculation'     // Computed values (efficiency, bonuses, etc.)
    | 'validation'      // Validation checks (can craft, can build, etc.)
    | 'aggregation'     // Combined data from multiple sources
    | 'projection';     // Future state predictions

export interface SystemDataRequest {
    requestId: string;
    requestType: SystemDataRequestType;
    sourceSystem: string;
    targetSystem: string;
    operation: string;
    parameters: Record<string, any>;
    timestamp: number;
    priority: 'low' | 'normal' | 'high' | 'critical';
    timeout?: number;
    cacheKey?: string;
}

export interface SystemDataResponse {
    requestId: string;
    success: boolean;
    data?: any;
    error?: SystemError;
    metadata: {
        executionTime: number;
        cacheHit: boolean;
        dataSource: string;
        timestamp: number;
    };
}
```

### Request Flow

1. **Request Initiation**: System creates standardized data request
2. **GameEngine Routing**: GameEngine validates and routes request
3. **Target Processing**: Target system processes request through service layer
4. **Response Coordination**: GameEngine coordinates response and caching
5. **Result Delivery**: Response delivered to requesting system

### Example Usage

```typescript
// Pawn system requesting item crafting validation
const request: SystemDataRequest = {
    requestId: generateId(),
    requestType: 'validation',
    sourceSystem: 'PawnSystem',
    targetSystem: 'ItemSystem',
    operation: 'canCraftItem',
    parameters: {
        itemId: 'iron_sword',
        pawnId: 'pawn_001',
        gameState: currentGameState
    },
    timestamp: Date.now(),
    priority: 'normal'
};

const response = await gameEngine.processDataRequest(request);
if (response.success) {
    const canCraft = response.data as boolean;
    // Process crafting validation result
}
```

## Event Propagation Protocol

### Event System Architecture

Events provide asynchronous communication between systems, allowing for loose coupling while maintaining system coordination.

### Event Types

```typescript
export type SystemEventType =
    | 'state_change'        // Game state modifications
    | 'action_completed'    // System actions finished
    | 'resource_update'     // Resource quantity changes
    | 'pawn_status_change'  // Pawn state modifications
    | 'building_event'      // Building construction/destruction
    | 'research_progress'   // Research advancement
    | 'error_occurred'      // System errors
    | 'system_lifecycle';   // System startup/shutdown

export interface SystemEvent {
    eventId: string;
    eventType: SystemEventType;
    sourceSystem: string;
    targetSystems?: string[]; // undefined = broadcast to all
    eventData: any;
    timestamp: number;
    priority: 'low' | 'normal' | 'high' | 'critical';
    correlationId?: string;
    causedBy?: string; // ID of event that caused this event
}

export interface EventProcessingResult {
    eventId: string;
    success: boolean;
    processedBy: string[];
    errors: Record<string, string>;
    generatedEvents: SystemEvent[];
    processingTime: number;
}
```

### Event Propagation Flow

1. **Event Generation**: System creates event with appropriate metadata
2. **GameEngine Coordination**: GameEngine validates and routes event
3. **Target Notification**: Relevant systems receive event notifications
4. **Parallel Processing**: Systems process events independently
5. **Result Aggregation**: GameEngine collects processing results
6. **Cascade Handling**: Generated events are processed recursively

### Event Handler Registration

```typescript
export interface EventHandler {
    systemName: string;
    eventTypes: SystemEventType[];
    handler: (event: SystemEvent) => Promise<EventHandlerResult>;
    priority: number;
    async: boolean;
}

export interface EventHandlerResult {
    success: boolean;
    generatedEvents?: SystemEvent[];
    error?: string;
    metadata?: Record<string, any>;
}
```

### Example Event Flow

```typescript
// Building completion event
const buildingCompleteEvent: SystemEvent = {
    eventId: generateId(),
    eventType: 'building_event',
    sourceSystem: 'BuildingSystem',
    eventData: {
        buildingId: 'workshop',
        locationId: 'settlement_001',
        completionTime: Date.now(),
        effects: {
            workEfficiencyBonus: { crafting: 0.25 }
        }
    },
    timestamp: Date.now(),
    priority: 'normal'
};

// This event would trigger:
// 1. WorkSystem to recalculate pawn efficiencies
// 2. UISystem to update building displays
// 3. EventSystem to generate completion message
// 4. SaveSystem to mark state as dirty
```

## State Consistency Protocol

### Consistency Guarantees

The state consistency protocol ensures that all systems maintain a coherent view of the game state through coordinated updates and validation.

### State Update Types

```typescript
export type StateUpdateType =
    | 'atomic'      // Single, indivisible update
    | 'batch'       // Multiple related updates
    | 'transaction' // Complex multi-system update
    | 'rollback';   // Undo previous updates

export interface StateUpdateRequest {
    updateId: string;
    updateType: StateUpdateType;
    sourceSystem: string;
    affectedSystems: string[];
    updates: StateUpdate[];
    validationRules: ValidationRule[];
    rollbackData?: any;
    timestamp: number;
}

export interface StateUpdate {
    path: string;           // JSONPath to the data being updated
    operation: 'set' | 'merge' | 'delete' | 'increment';
    value: any;
    previousValue?: any;
    conditions?: StateCondition[];
}

export interface ValidationRule {
    name: string;
    validator: (gameState: GameState, update: StateUpdate) => ValidationResult;
    errorMessage: string;
    severity: 'warning' | 'error' | 'critical';
}
```

### Consistency Validation

```typescript
export interface ConsistencyValidator {
    /**
     * Validate state consistency across all systems
     */
    validateGlobalConsistency(gameState: GameState): ConsistencyValidationResult;

    /**
     * Validate specific state update
     */
    validateStateUpdate(
        currentState: GameState,
        update: StateUpdateRequest
    ): ValidationResult;

    /**
     * Check referential integrity
     */
    validateReferentialIntegrity(gameState: GameState): IntegrityValidationResult;

    /**
     * Validate system invariants
     */
    validateSystemInvariants(
        systemName: string,
        gameState: GameState
    ): InvariantValidationResult;
}

export interface ConsistencyValidationResult {
    isConsistent: boolean;
    violations: ConsistencyViolation[];
    warnings: ConsistencyWarning[];
    affectedSystems: string[];
    validationTime: number;
}

export interface ConsistencyViolation {
    type: 'referential_integrity' | 'invariant_violation' | 'data_corruption';
    severity: 'warning' | 'error' | 'critical';
    description: string;
    affectedPath: string;
    suggestedFix?: string;
    systemsInvolved: string[];
}
```

### State Update Flow

1. **Update Request**: System requests state modification
2. **Validation**: GameEngine validates update against rules
3. **Dependency Check**: Verify impact on dependent systems
4. **Atomic Application**: Apply updates atomically
5. **Consistency Verification**: Validate resulting state
6. **Event Propagation**: Notify affected systems
7. **Rollback on Failure**: Automatic rollback if validation fails

## Error Handling and Recovery Protocol

### Error Classification

```typescript
export type SystemErrorType =
    | 'validation_error'    // Data validation failures
    | 'consistency_error'   // State consistency violations
    | 'communication_error' // Inter-system communication failures
    | 'resource_error'      // Resource availability issues
    | 'timeout_error'       // Operation timeout
    | 'dependency_error'    // Missing dependencies
    | 'corruption_error'    // Data corruption detected
    | 'system_error';       // Internal system errors

export interface SystemError {
    errorId: string;
    errorType: SystemErrorType;
    severity: 'low' | 'medium' | 'high' | 'critical';
    sourceSystem: string;
    affectedSystems: string[];
    message: string;
    details: Record<string, any>;
    timestamp: number;
    stackTrace?: string;
    recoveryActions?: RecoveryAction[];
}

export interface RecoveryAction {
    actionType: 'retry' | 'rollback' | 'reset' | 'skip' | 'manual';
    description: string;
    parameters: Record<string, any>;
    maxAttempts?: number;
    timeout?: number;
}
```

### Recovery Strategies

```typescript
export interface ErrorRecoveryStrategy {
    /**
     * Automatic error recovery
     */
    attemptAutoRecovery(error: SystemError): Promise<RecoveryResult>;

    /**
     * Rollback to last known good state
     */
    rollbackToCheckpoint(checkpointId: string): Promise<RollbackResult>;

    /**
     * Reset system to clean state
     */
    resetSystem(systemName: string): Promise<ResetResult>;

    /**
     * Isolate failing system
     */
    isolateSystem(systemName: string): Promise<IsolationResult>;

    /**
     * Create recovery checkpoint
     */
    createCheckpoint(description: string): Promise<CheckpointResult>;
}

export interface RecoveryResult {
    success: boolean;
    recoveryMethod: string;
    recoveryTime: number;
    remainingIssues: SystemError[];
    systemsAffected: string[];
}
```

### Error Recovery Flow

1. **Error Detection**: System or GameEngine detects error
2. **Error Classification**: Categorize error type and severity
3. **Impact Assessment**: Determine affected systems
4. **Recovery Strategy Selection**: Choose appropriate recovery method
5. **Recovery Execution**: Execute recovery actions
6. **Validation**: Verify system health after recovery
7. **Logging and Monitoring**: Record recovery for analysis

## Protocol Implementation

### GameEngine Integration

```typescript
export interface SystemInteractionCoordinator {
    /**
     * Process data request between systems
     */
    processDataRequest(request: SystemDataRequest): Promise<SystemDataResponse>;

    /**
     * Propagate event to target systems
     */
    propagateEvent(event: SystemEvent): Promise<EventProcessingResult>;

    /**
     * Coordinate state update across systems
     */
    coordinateStateUpdate(update: StateUpdateRequest): Promise<StateUpdateResult>;

    /**
     * Handle system error with recovery
     */
    handleSystemError(error: SystemError): Promise<RecoveryResult>;

    /**
     * Validate system interactions
     */
    validateInteractionProtocols(): Promise<ProtocolValidationResult>;
}
```

### Protocol Configuration

```typescript
export interface InteractionProtocolConfig {
    // Request handling
    defaultRequestTimeout: number;
    maxConcurrentRequests: number;
    enableRequestCaching: boolean;
    cacheExpirationTime: number;

    // Event processing
    eventProcessingTimeout: number;
    maxEventQueueSize: number;
    enableEventPersistence: boolean;
    eventRetryAttempts: number;

    // State consistency
    enableStrictConsistency: boolean;
    consistencyCheckInterval: number;
    maxRollbackDepth: number;
    autoRecoveryEnabled: boolean;

    // Error handling
    errorRecoveryMode: 'strict' | 'lenient' | 'disabled';
    maxRecoveryAttempts: number;
    systemIsolationThreshold: number;
    checkpointInterval: number;
}
```

## Implementation Phases

### Phase 1: Basic Protocol Infrastructure
- Implement core protocol interfaces
- Create GameEngine coordination methods
- Basic request/response handling
- Simple event propagation

### Phase 2: Advanced Coordination
- State consistency validation
- Error recovery mechanisms
- Performance optimization
- Comprehensive testing

### Phase 3: Production Hardening
- Advanced error recovery strategies
- Performance monitoring
- Protocol optimization
- Documentation and examples

## Success Criteria

### Functional Requirements
- ✅ Systems can request data through standardized protocols
- ✅ Events propagate reliably between systems
- ✅ State consistency is maintained across all operations
- ✅ Errors are handled gracefully with automatic recovery

### Performance Requirements
- ✅ Data requests complete within 100ms for 95% of operations
- ✅ Event propagation handles 1000+ events per second
- ✅ State updates maintain consistency with <10ms overhead
- ✅ Error recovery completes within 5 seconds for 90% of errors

### Reliability Requirements
- ✅ System interactions have 99.9% success rate
- ✅ State corruption is prevented through validation
- ✅ Automatic recovery succeeds for 95% of recoverable errors
- ✅ System isolation prevents cascading failures

This protocol design provides the foundation for robust, scalable system interactions within the Fantasia4x architecture, ensuring clean separation of concerns while maintaining system coordination and consistency.