# System Interaction Protocols - Usage Examples

## Overview

This document provides comprehensive examples of how to use the system interaction protocols within the Fantasia4x GameEngine architecture. These examples demonstrate the four core protocol types: data requests, event propagation, state consistency, and error recovery.

## Data Request Protocol Examples

### Example 1: Pawn Requesting Item Crafting Validation

```typescript
import { createDataRequest } from '../systems/SystemInteractionProtocols';

// Pawn system needs to validate if a pawn can craft an item
async function validatePawnCanCraftItem(
    gameEngine: GameEngine,
    pawnId: string,
    itemId: string
): Promise<boolean> {
    const request = createDataRequest(
        'PawnSystem',
        'ItemSystem',
        'canCraftItem',
        {
            itemId,
            pawnId,
            gameState: gameEngine.getGameState()
        },
        'validation',
        'normal'
    );

    const response = await gameEngine.processDataRequest(request);
    
    if (response.success) {
        return response.data as boolean;
    } else {
        console.error('Crafting validation failed:', response.error?.message);
        return false;
    }
}
```

### Example 2: Building System Requesting Work Efficiency Calculation

```typescript
// Building system needs to calculate work efficiency bonuses
async function calculateBuildingWorkBonus(
    gameEngine: GameEngine,
    buildingId: string,
    workType: string
): Promise<number> {
    const request = createDataRequest(
        'BuildingSystem',
        'WorkSystem',
        'calculateWorkEfficiencyBonus',
        {
            buildingId,
            workType,
            gameState: gameEngine.getGameState()
        },
        'calculation',
        'high'
    );

    const response = await gameEngine.processDataRequest(request);
    return response.success ? (response.data as number) : 1.0;
}
```

### Example 3: Aggregated Data Request from Multiple Systems

```typescript
// Research system needs data from multiple systems to unlock new technology
async function validateResearchUnlock(
    gameEngine: GameEngine,
    researchId: string
): Promise<ResearchValidationResult> {
    const request = createDataRequest(
        'ResearchSystem',
        'AggregationService',
        'aggregateResearchData',
        {
            aggregation: {
                sources: [
                    {
                        system: 'ItemSystem',
                        operation: 'getRequiredItems',
                        parameters: { researchId },
                        key: 'requiredItems'
                    },
                    {
                        system: 'BuildingSystem',
                        operation: 'getRequiredBuildings',
                        parameters: { researchId },
                        key: 'requiredBuildings'
                    },
                    {
                        system: 'PawnSystem',
                        operation: 'getAvailableScholars',
                        parameters: {},
                        key: 'availableScholars'
                    }
                ]
            }
        },
        'aggregation',
        'normal'
    );

    const response = await gameEngine.processDataRequest(request);
    
    if (response.success) {
        const data = response.data;
        return {
            canUnlock: data.requiredItems.length > 0 && 
                      data.requiredBuildings.length > 0 && 
                      data.availableScholars.length > 0,
            requirements: data
        };
    }
    
    return { canUnlock: false, requirements: null };
}
```

## Event Propagation Protocol Examples

### Example 1: Building Construction Completion Event

```typescript
import { createSystemEvent } from '../systems/SystemInteractionProtocols';

// Building system notifies other systems when construction completes
async function notifyBuildingCompleted(
    gameEngine: GameEngine,
    buildingId: string,
    locationId: string,
    effects: BuildingEffects
): Promise<void> {
    const event = createSystemEvent(
        'BuildingSystem',
        'building_event',
        {
            action: 'construction_completed',
            buildingId,
            locationId,
            effects,
            completionTime: Date.now()
        },
        undefined, // Broadcast to all systems
        'normal'
    );

    const result = await gameEngine.propagateEvent(event);
    
    if (!result.success) {
        console.error('Failed to propagate building completion event:', result.errors);
    } else {
        console.log(`Building completion event processed by: ${result.processedBy.join(', ')}`);
        
        // Handle any generated events
        if (result.generatedEvents.length > 0) {
            console.log(`Generated ${result.generatedEvents.length} additional events`);
        }
    }
}
```

### Example 2: Pawn Status Change Event with Targeted Systems

```typescript
// Pawn system notifies specific systems about pawn status changes
async function notifyPawnStatusChange(
    gameEngine: GameEngine,
    pawnId: string,
    statusChange: PawnStatusChange
): Promise<void> {
    const event = createSystemEvent(
        'PawnSystem',
        'pawn_status_change',
        {
            pawnId,
            statusChange,
            timestamp: Date.now()
        },
        ['WorkSystem', 'EventSystem', 'UISystem'], // Target specific systems
        statusChange.severity === 'critical' ? 'high' : 'normal'
    );

    await gameEngine.propagateEvent(event);
}
```

### Example 3: Event Handler Registration

```typescript
// Register event handlers for different systems
function registerSystemEventHandlers(coordinator: SystemInteractionCoordinator): void {
    // Work system handler for building events
    coordinator.registerEventHandler({
        systemName: 'WorkSystem',
        eventTypes: ['building_event'],
        handler: async (event: SystemEvent): Promise<EventHandlerResult> => {
            if (event.eventData.action === 'construction_completed') {
                // Recalculate work efficiencies for affected location
                await recalculateWorkEfficiencies(event.eventData.locationId);
                
                return {
                    success: true,
                    generatedEvents: [{
                        eventId: generateEventId(),
                        eventType: 'action_completed',
                        sourceSystem: 'WorkSystem',
                        eventData: {
                            action: 'efficiency_recalculation',
                            locationId: event.eventData.locationId
                        },
                        timestamp: Date.now(),
                        priority: 'normal',
                        causedBy: event.eventId
                    }]
                };
            }
            
            return { success: true };
        },
        priority: 100,
        async: true
    });

    // UI system handler for various events
    coordinator.registerEventHandler({
        systemName: 'UISystem',
        eventTypes: ['building_event', 'pawn_status_change', 'resource_update'],
        handler: async (event: SystemEvent): Promise<EventHandlerResult> => {
            // Update UI displays based on event type
            await updateUIForEvent(event);
            return { success: true };
        },
        priority: 50,
        async: true
    });
}
```

## State Consistency Protocol Examples

### Example 1: Atomic Resource Update

```typescript
import { generateUpdateId } from '../systems/SystemInteractionProtocols';

// Update resources atomically when pawn completes work
async function updateResourcesFromWork(
    gameEngine: GameEngine,
    workResult: WorkResult
): Promise<boolean> {
    const update: StateUpdateRequest = {
        updateId: generateUpdateId(),
        updateType: 'atomic',
        sourceSystem: 'WorkSystem',
        affectedSystems: ['ResourceSystem', 'PawnSystem'],
        updates: [
            {
                path: `resources.${workResult.resourceType}`,
                operation: 'increment',
                value: workResult.amount,
                conditions: [
                    {
                        path: `resources.${workResult.resourceType}`,
                        operator: 'exists',
                        value: true
                    }
                ]
            },
            {
                path: `pawns.${workResult.pawnId}.fatigue`,
                operation: 'increment',
                value: workResult.fatigueIncrease
            }
        ],
        validationRules: [
            {
                name: 'non_negative_resources',
                validator: (gameState, update) => {
                    if (update.path.startsWith('resources.') && update.operation === 'increment') {
                        const currentValue = getValueAtPath(gameState, update.path) || 0;
                        const newValue = currentValue + update.value;
                        return {
                            isValid: newValue >= 0,
                            errors: newValue < 0 ? ['Resource cannot be negative'] : [],
                            warnings: []
                        };
                    }
                    return { isValid: true, errors: [], warnings: [] };
                },
                errorMessage: 'Resources cannot be negative',
                severity: 'error'
            }
        ],
        timestamp: Date.now()
    };

    const result = await gameEngine.coordinateStateUpdate(update);
    
    if (!result.success) {
        console.error('Resource update failed:', result.validationErrors);
        return false;
    }

    console.log(`Updated ${result.updatesApplied} state values in ${result.updateTime}ms`);
    return true;
}
```

### Example 2: Transaction-Based Multi-System Update

```typescript
// Complex transaction involving multiple systems (crafting completion)
async function completeCraftingTransaction(
    gameEngine: GameEngine,
    craftingResult: CraftingResult
): Promise<boolean> {
    const update: StateUpdateRequest = {
        updateId: generateUpdateId(),
        updateType: 'transaction',
        sourceSystem: 'CraftingSystem',
        affectedSystems: ['ItemSystem', 'PawnSystem', 'ResourceSystem'],
        updates: [
            // Remove consumed materials
            ...craftingResult.consumedMaterials.map(material => ({
                path: `resources.${material.id}`,
                operation: 'increment' as const,
                value: -material.amount,
                previousValue: getResourceAmount(gameState, material.id)
            })),
            // Add crafted item
            {
                path: `items.${craftingResult.itemId}`,
                operation: 'increment',
                value: craftingResult.quantity
            },
            // Update pawn experience
            {
                path: `pawns.${craftingResult.pawnId}.experience.crafting`,
                operation: 'increment',
                value: craftingResult.experienceGained
            }
        ],
        validationRules: [
            {
                name: 'sufficient_materials',
                validator: (gameState, update) => {
                    if (update.path.startsWith('resources.') && update.value < 0) {
                        const currentAmount = getValueAtPath(gameState, update.path) || 0;
                        const hasEnough = currentAmount >= Math.abs(update.value);
                        return {
                            isValid: hasEnough,
                            errors: hasEnough ? [] : [`Insufficient ${update.path.split('.')[1]}`],
                            warnings: []
                        };
                    }
                    return { isValid: true, errors: [], warnings: [] };
                },
                errorMessage: 'Insufficient materials for crafting',
                severity: 'error'
            }
        ],
        rollbackData: {
            craftingAttempt: craftingResult,
            timestamp: Date.now()
        },
        timestamp: Date.now()
    };

    const result = await gameEngine.coordinateStateUpdate(update);
    
    if (result.rollbackPerformed) {
        console.warn('Crafting transaction was rolled back due to validation failure');
        return false;
    }

    return result.success;
}
```

## Error Recovery Protocol Examples

### Example 1: Handling Service Communication Error

```typescript
// Handle error when service communication fails
async function handleServiceCommunicationError(
    gameEngine: GameEngine,
    originalError: Error,
    context: any
): Promise<void> {
    const systemError = createSystemError(
        'communication_error',
        'high',
        'ServiceCoordinator',
        `Service communication failed: ${originalError.message}`,
        {
            originalError: originalError.stack,
            context,
            timestamp: Date.now()
        },
        ['ItemSystem', 'WorkSystem'] // Affected systems
    );

    const recoveryResult = await gameEngine.handleSystemError(systemError);
    
    if (recoveryResult.success) {
        console.log(`Error recovered using ${recoveryResult.recoveryMethod} in ${recoveryResult.recoveryTime}ms`);
    } else {
        console.error('Error recovery failed:', recoveryResult.remainingIssues);
        
        // Escalate to manual intervention
        await escalateToManualIntervention(systemError, recoveryResult);
    }
}
```

### Example 2: State Consistency Violation Recovery

```typescript
// Handle state consistency violations
async function handleConsistencyViolation(
    gameEngine: GameEngine,
    violation: ConsistencyViolation
): Promise<void> {
    const systemError = createSystemError(
        'consistency_error',
        violation.severity === 'critical' ? 'critical' : 'high',
        'ConsistencyValidator',
        `State consistency violation: ${violation.description}`,
        {
            violation,
            affectedPath: violation.affectedPath,
            suggestedFix: violation.suggestedFix
        },
        violation.systemsInvolved
    );

    // Attempt automatic recovery
    const recoveryResult = await gameEngine.handleSystemError(systemError);
    
    if (!recoveryResult.success) {
        // If automatic recovery fails, try suggested fix
        if (violation.suggestedFix) {
            await attemptSuggestedFix(violation);
        }
    }
}
```

## Integration Examples

### Example 1: Complete System Interaction Flow

```typescript
// Complete flow: Pawn attempts to craft item
async function attemptPawnCrafting(
    gameEngine: GameEngine,
    pawnId: string,
    itemId: string
): Promise<CraftingResult> {
    try {
        // Step 1: Validate crafting possibility (Data Request)
        const canCraft = await validatePawnCanCraftItem(gameEngine, pawnId, itemId);
        if (!canCraft) {
            return { success: false, reason: 'Cannot craft item' };
        }

        // Step 2: Calculate crafting time (Data Request)
        const craftingTime = await gameEngine.processDataRequest(
            createDataRequest(
                'CraftingSystem',
                'ItemSystem',
                'calculateCraftingTime',
                { itemId, pawnId }
            )
        );

        // Step 3: Start crafting (State Update)
        const startCraftingUpdate: StateUpdateRequest = {
            updateId: generateUpdateId(),
            updateType: 'atomic',
            sourceSystem: 'CraftingSystem',
            affectedSystems: ['PawnSystem'],
            updates: [{
                path: `pawns.${pawnId}.currentActivity`,
                operation: 'set',
                value: {
                    type: 'crafting',
                    itemId,
                    startTime: Date.now(),
                    estimatedCompletion: Date.now() + (craftingTime.data * 1000)
                }
            }],
            validationRules: [],
            timestamp: Date.now()
        };

        await gameEngine.coordinateStateUpdate(startCraftingUpdate);

        // Step 4: Notify systems of crafting start (Event Propagation)
        await gameEngine.propagateEvent(
            createSystemEvent(
                'CraftingSystem',
                'action_completed',
                {
                    action: 'crafting_started',
                    pawnId,
                    itemId,
                    estimatedCompletion: startCraftingUpdate.updates[0].value.estimatedCompletion
                }
            )
        );

        return { 
            success: true, 
            craftingTime: craftingTime.data,
            estimatedCompletion: startCraftingUpdate.updates[0].value.estimatedCompletion
        };

    } catch (error) {
        // Step 5: Handle any errors (Error Recovery)
        await handleServiceCommunicationError(gameEngine, error as Error, {
            operation: 'attemptPawnCrafting',
            pawnId,
            itemId
        });

        return { success: false, reason: 'System error occurred' };
    }
}
```

### Example 2: System Initialization with Protocol Setup

```typescript
// Initialize GameEngine with full protocol support
async function initializeGameEngineWithProtocols(
    initialGameState: GameState,
    services: ServiceRegistry
): Promise<GameEngine> {
    // Create GameEngine instance
    const gameEngine = GameEngineFactory.createGameEngine({
        enableDebugLogging: true,
        validateStateOnEachUpdate: true,
        enablePerformanceMetrics: true,
        errorRecoveryMode: 'lenient'
    });

    // Initialize with services
    const initResult = await gameEngine.initialize(initialGameState, services);
    if (!initResult.success) {
        throw new Error(`GameEngine initialization failed: ${initResult.error}`);
    }

    // Configure interaction protocols
    gameEngine.configureInteractionProtocols({
        defaultRequestTimeout: 5000,
        maxConcurrentRequests: 50,
        enableRequestCaching: true,
        eventProcessingTimeout: 10000,
        enableStrictConsistency: true,
        autoRecoveryEnabled: true,
        errorRecoveryMode: 'lenient'
    });

    // Register event handlers
    const coordinator = gameEngine.getInteractionCoordinator();
    registerSystemEventHandlers(coordinator);

    // Validate protocol setup
    const protocolValidation = await coordinator.validateInteractionProtocols();
    if (!protocolValidation.isValid) {
        console.warn('Protocol validation issues:', protocolValidation.protocolErrors);
    }

    return gameEngine;
}
```

## Performance Monitoring Examples

### Example 1: Protocol Performance Monitoring

```typescript
// Monitor protocol performance
async function monitorProtocolPerformance(gameEngine: GameEngine): Promise<void> {
    const coordinator = gameEngine.getInteractionCoordinator();
    
    // Validate protocols and get performance metrics
    const validation = await coordinator.validateInteractionProtocols();
    const metrics = validation.performanceMetrics;

    console.log('Protocol Performance Metrics:');
    console.log(`- Average Request Time: ${metrics.averageRequestTime}ms`);
    console.log(`- Event Throughput: ${metrics.eventThroughput} events/sec`);
    console.log(`- State Update Latency: ${metrics.stateUpdateLatency}ms`);
    console.log(`- Error Recovery Time: ${metrics.errorRecoveryTime}ms`);
    console.log(`- System Availability: ${(metrics.systemAvailability * 100).toFixed(2)}%`);

    // Apply recommendations
    for (const recommendation of validation.recommendations) {
        console.log(`Recommendation: ${recommendation}`);
    }
}
```

## Testing Examples

### Example 1: Protocol Integration Test

```typescript
// Test complete protocol integration
async function testProtocolIntegration(): Promise<void> {
    const gameEngine = await initializeGameEngineWithProtocols(
        createTestGameState(),
        createTestServiceRegistry()
    );

    // Test data request protocol
    const dataRequest = createDataRequest(
        'TestSystem',
        'ItemSystem',
        'getItemById',
        { id: 'test_item' }
    );
    
    const dataResponse = await gameEngine.processDataRequest(dataRequest);
    console.assert(dataResponse.success, 'Data request should succeed');

    // Test event propagation protocol
    const testEvent = createSystemEvent(
        'TestSystem',
        'action_completed',
        { action: 'test_action' }
    );
    
    const eventResult = await gameEngine.propagateEvent(testEvent);
    console.assert(eventResult.success, 'Event propagation should succeed');

    // Test state consistency protocol
    const stateUpdate: StateUpdateRequest = {
        updateId: generateUpdateId(),
        updateType: 'atomic',
        sourceSystem: 'TestSystem',
        affectedSystems: ['TestSystem'],
        updates: [{
            path: 'test.value',
            operation: 'set',
            value: 'test_value'
        }],
        validationRules: [],
        timestamp: Date.now()
    };
    
    const updateResult = await gameEngine.coordinateStateUpdate(stateUpdate);
    console.assert(updateResult.success, 'State update should succeed');

    console.log('All protocol integration tests passed!');
}
```

These examples demonstrate the comprehensive usage of the system interaction protocols, showing how they enable clean, coordinated communication between systems while maintaining consistency and providing robust error recovery.