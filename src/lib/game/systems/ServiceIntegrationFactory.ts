/**
 * Service Integration Factory
 * 
 * Factory for creating and configuring service integration components,
 * including ServiceRegistry, GameEngine integration, and lifecycle management.
 * 
 * Requirements: 2.1, 2.3
 */

import type { GameState } from '../core/types';
import type { GameEngine, GameEngineConfig } from './GameEngine';
import type {
    ServiceRegistry,
    ServiceIntegrationConfig,
    ServiceLifecycleManager,
    ServiceContainer,
    ServiceCommunicationCoordinator,
    GameEngineServiceIntegration,
    ServiceFactory
} from './ServiceIntegration';

import {
    DEFAULT_SERVICE_INTEGRATION_CONFIG
} from './ServiceIntegration';

import {
    ServiceRegistryImpl,
    SimpleServiceContainer,
    BasicServiceLifecycleManager
} from './ServiceRegistryImpl';

// Import existing service implementations
import {
    ItemServiceImpl,
    BuildingServiceImpl,
    WorkServiceImpl,
    ResearchServiceImpl
} from '../services';

/**
 * Service Integration Factory
 * 
 * Central factory for creating all service integration components
 * with proper configuration and dependency management.
 */
export class ServiceIntegrationFactory {
    private static instance: ServiceIntegrationFactory;
    private config: ServiceIntegrationConfig;

    private constructor(config: ServiceIntegrationConfig = DEFAULT_SERVICE_INTEGRATION_CONFIG) {
        this.config = { ...config };
    }

    /**
     * Get singleton factory instance
     */
    static getInstance(config?: ServiceIntegrationConfig): ServiceIntegrationFactory {
        if (!ServiceIntegrationFactory.instance) {
            ServiceIntegrationFactory.instance = new ServiceIntegrationFactory(config);
        }
        return ServiceIntegrationFactory.instance;
    }

    /**
     * Create a complete ServiceRegistry with all services configured
     */
    createServiceRegistry(): ServiceRegistry {
        const container = this.createServiceContainer();
        const lifecycleManager = this.createLifecycleManager();

        // Register all core services
        this.registerCoreServices(container);

        return new ServiceRegistryImpl(
            lifecycleManager,
            container,
            this.config
        );
    }

    /**
     * Create service container with dependency injection
     */
    createServiceContainer(): ServiceContainer {
        return new SimpleServiceContainer();
    }

    /**
     * Create service lifecycle manager
     */
    createLifecycleManager(): ServiceLifecycleManager {
        return new BasicServiceLifecycleManager();
    }

    /**
     * Create service communication coordinator
     */
    createCommunicationCoordinator(): ServiceCommunicationCoordinator {
        return new ServiceCommunicationCoordinatorImpl(this.config);
    }

    /**
     * Create GameEngine service integration
     */
    createGameEngineIntegration(gameEngine: GameEngine): GameEngineServiceIntegration {
        return new GameEngineServiceIntegrationImpl(gameEngine, this.config);
    }

    /**
     * Create complete integrated system
     */
    async createIntegratedSystem(
        initialGameState: GameState,
        gameEngineConfig?: GameEngineConfig
    ): Promise<IntegratedGameSystem> {
        // Create service registry
        const serviceRegistry = this.createServiceRegistry();

        // Create GameEngine (would need actual implementation)
        const gameEngine = this.createGameEngine(gameEngineConfig);

        // Create integration components
        const communicationCoordinator = this.createCommunicationCoordinator();
        const gameEngineIntegration = this.createGameEngineIntegration(gameEngine);

        // Initialize services
        const initResult = await serviceRegistry.initializeServices(initialGameState);
        if (!initResult.success) {
            throw new Error(`Service initialization failed: ${JSON.stringify(initResult.errors)}`);
        }

        // Integrate services with GameEngine
        gameEngineIntegration.injectServices(serviceRegistry);

        return new IntegratedGameSystem(
            gameEngine,
            serviceRegistry,
            communicationCoordinator,
            gameEngineIntegration
        );
    }

    /**
     * Register all core services in the container
     */
    private registerCoreServices(container: ServiceContainer): void {
        // ItemService - no dependencies
        container.register(
            'itemService',
            () => new ItemServiceImpl(),
            []
        );

        // BuildingService - no dependencies (uses ItemService internally)
        container.register(
            'buildingService',
            () => new BuildingServiceImpl(),
            []
        );

        // WorkService - no dependencies (uses ItemService internally)
        container.register(
            'workService',
            () => new WorkServiceImpl(),
            []
        );

        // ResearchService - no dependencies (uses ItemService internally)
        container.register(
            'researchService',
            () => new ResearchServiceImpl(),
            []
        );

        // PawnService - placeholder implementation
        container.register(
            'pawnService',
            () => new PawnServiceImpl(),
            []
        );

        // EventService - placeholder implementation
        container.register(
            'eventService',
            () => new EventServiceImpl(),
            []
        );
    }

    /**
     * Create GameEngine instance (placeholder - would need actual implementation)
     */
    private createGameEngine(config?: GameEngineConfig): GameEngine {
        // This would create the actual GameEngine implementation
        // For now, return a placeholder that satisfies the interface
        return new GameEngineImpl(config || {});
    }
}

/**
 * Service Communication Coordinator Implementation
 */
class ServiceCommunicationCoordinatorImpl implements ServiceCommunicationCoordinator {
    private messageHandlers: Map<string, Map<string, Function>> = new Map();
    private messageHistory: any[] = [];
    private config: ServiceIntegrationConfig;

    constructor(config: ServiceIntegrationConfig) {
        this.config = config;
    }

    async sendMessage(message: any): Promise<any> {
        // Add to history
        if (this.config.enableMessageLogging) {
            this.messageHistory.push(message);
            if (this.messageHistory.length > this.config.maxMessageHistory) {
                this.messageHistory.shift();
            }
        }

        // Find and execute handler
        const serviceHandlers = this.messageHandlers.get(message.target);
        if (serviceHandlers) {
            const handler = serviceHandlers.get(message.type);
            if (handler) {
                return await handler(message);
            }
        }

        throw new Error(`No handler found for message type ${message.type} on service ${message.target}`);
    }

    async broadcastMessage(message: any): Promise<void> {
        const broadcastMessage = { ...message, target: undefined };

        // Send to all registered handlers
        for (const [serviceName, handlers] of this.messageHandlers) {
            const handler = handlers.get(message.type);
            if (handler) {
                try {
                    await handler({ ...broadcastMessage, target: serviceName });
                } catch (error) {
                    console.error(`Error broadcasting to ${serviceName}:`, error);
                }
            }
        }
    }

    registerMessageHandler(serviceName: string, messageType: string, handler: Function): void {
        if (!this.messageHandlers.has(serviceName)) {
            this.messageHandlers.set(serviceName, new Map());
        }
        this.messageHandlers.get(serviceName)!.set(messageType, handler);
    }

    getMessageHistory(limit?: number): any[] {
        const history = [...this.messageHistory];
        return limit ? history.slice(-limit) : history;
    }
}

/**
 * GameEngine Service Integration Implementation
 */
class GameEngineServiceIntegrationImpl implements GameEngineServiceIntegration {
    private gameEngine: GameEngine;
    private services?: ServiceRegistry;
    private config: ServiceIntegrationConfig;

    constructor(gameEngine: GameEngine, config: ServiceIntegrationConfig) {
        this.gameEngine = gameEngine;
        this.config = config;
    }

    injectServices(services: ServiceRegistry): void {
        this.services = services;
        this.gameEngine.integrateServices(services);
    }

    getService<T extends keyof ServiceRegistry>(serviceName: T): ServiceRegistry[T] {
        if (!this.services) {
            throw new Error('Services not injected. Call injectServices() first.');
        }
        return this.services[serviceName];
    }

    async executeServiceOperation<T>(
        serviceName: keyof ServiceRegistry,
        operation: string,
        params: any[]
    ): Promise<T> {
        const service = this.getService(serviceName);
        const method = (service as any)[operation];

        if (typeof method !== 'function') {
            throw new Error(`Operation ${operation} not found on service ${String(serviceName)}`);
        }

        return await method.apply(service, params);
    }

    async coordinateMultiServiceOperation(operations: any[]): Promise<any> {
        const results: Record<string, any> = {};
        const errors: Record<string, string> = {};
        const executionOrder: string[] = [];
        const startTime = Date.now();

        // Execute operations in dependency order
        for (const operation of operations) {
            try {
                const result = await this.executeServiceOperation(
                    operation.serviceName,
                    operation.operation,
                    operation.params
                );
                results[operation.serviceName] = result;
                executionOrder.push(operation.serviceName);
            } catch (error) {
                errors[operation.serviceName] = error instanceof Error ? error.message : 'Unknown error';
            }
        }

        return {
            success: Object.keys(errors).length === 0,
            results,
            errors,
            executionOrder,
            totalExecutionTime: Date.now() - startTime
        };
    }

    validateServiceIntegration(): any {
        if (!this.services) {
            return {
                isHealthy: false,
                serviceStatuses: {},
                communicationHealth: {
                    messagesProcessed: 0,
                    averageResponseTime: 0,
                    failedMessages: 0
                },
                dependencyHealth: {
                    circularDependencies: [],
                    unresolvedDependencies: ['Services not injected']
                }
            };
        }

        const serviceStatuses = this.services.getAllServiceStatuses();
        const dependencyValidation = this.services.validateServiceDependencies();

        return {
            isHealthy: dependencyValidation.isValid && Object.values(serviceStatuses).every(s => s.isHealthy),
            serviceStatuses,
            communicationHealth: {
                messagesProcessed: 0, // Would track actual metrics
                averageResponseTime: 0,
                failedMessages: 0
            },
            dependencyHealth: {
                circularDependencies: dependencyValidation.circularDependencies,
                unresolvedDependencies: Object.keys(dependencyValidation.missingDependencies)
            }
        };
    }
}

/**
 * Integrated Game System
 * 
 * Complete integrated system with GameEngine, services, and coordination
 */
export class IntegratedGameSystem {
    constructor(
        public readonly gameEngine: GameEngine,
        public readonly serviceRegistry: ServiceRegistry,
        public readonly communicationCoordinator: ServiceCommunicationCoordinator,
        public readonly gameEngineIntegration: GameEngineServiceIntegration
    ) { }

    /**
     * Get system health status
     */
    getSystemHealth(): SystemHealthStatus {
        const serviceHealth = this.gameEngineIntegration.validateServiceIntegration();
        const engineStatus = this.gameEngine.getEngineStatus();

        return {
            isHealthy: serviceHealth.isHealthy && engineStatus.isInitialized,
            gameEngine: engineStatus,
            services: serviceHealth,
            lastHealthCheck: Date.now()
        };
    }

    /**
     * Shutdown the entire system gracefully
     */
    async shutdown(): Promise<void> {
        await this.serviceRegistry.shutdownServices();
        await this.gameEngine.shutdown();
    }
}

/**
 * System health status interface
 */
export interface SystemHealthStatus {
    isHealthy: boolean;
    gameEngine: any;
    services: any;
    lastHealthCheck: number;
}

// Placeholder implementations for missing services
class PawnServiceImpl {
    async initialize(): Promise<void> {
        // Initialize pawn service
    }

    async shutdown(): Promise<void> {
        // Cleanup pawn service
    }

    // Placeholder methods to satisfy interface
    processPawnNeeds(): any { return {}; }
    calculateEffectiveStats(): any { return {}; }
    updatePawnMorale(): void { }
}

class EventServiceImpl {
    async initialize(): Promise<void> {
        // Initialize event service
    }

    async shutdown(): Promise<void> {
        // Cleanup event service
    }

    // Placeholder methods to satisfy interface
    generateEvents(): any[] { return []; }
    processEvent(): any { return {}; }
    getEventHistory(): any[] { return []; }
}

// Placeholder GameEngine implementation
class GameEngineImpl implements GameEngine {
    private services?: ServiceRegistry;
    private gameState?: GameState;
    private initialized = false;

    constructor(private config: GameEngineConfig) { }

    // System Coordination
    processGameTurn(): any {
        return {
            success: true,
            turnsProcessed: 1,
            systemsUpdated: ['pawn', 'work', 'building'],
            errors: [],
            warnings: []
        };
    }

    coordinateSystemInteractions(): any {
        return { success: true };
    }

    // Unified Calculations
    calculatePawnEfficiency(): number { return 1.0; }
    calculateBuildingEffects(): any { return {}; }
    calculateCraftingTime(): number { return 1; }
    calculateResourceProduction(): Record<string, number> { return {}; }
    calculateCombatEffectiveness(): number { return 1.0; }

    // State Management
    getGameState(): GameState { return this.gameState!; }
    updateGameState(): any { return { success: true }; }
    validateSystemConsistency(): any { return { isValid: true, errors: [], warnings: [], affectedSystems: [] }; }
    resetGameState(): any { return { success: true }; }

    // Service Integration
    integrateServices(services: ServiceRegistry): void {
        this.services = services;
    }

    getServices(): ServiceRegistry {
        return this.services!;
    }

    // System Lifecycle
    initialize(initialState: GameState, services: ServiceRegistry): any {
        this.gameState = initialState;
        this.services = services;
        this.initialized = true;
        return { success: true };
    }

    shutdown(): any {
        this.initialized = false;
        return { success: true };
    }

    getEngineStatus(): any {
        return {
            isInitialized: this.initialized,
            systemsIntegrated: this.services ? Object.keys(this.services) : [],
            lastTurnProcessed: 0,
            pendingOperations: 0,
            errors: []
        };
    }
}

/**
 * Factory convenience functions
 */

/**
 * Create a basic service registry with default configuration
 */
export function createServiceRegistry(config?: ServiceIntegrationConfig): ServiceRegistry {
    return ServiceIntegrationFactory.getInstance(config).createServiceRegistry();
}

/**
 * Create a complete integrated game system
 */
export async function createIntegratedGameSystem(
    initialGameState: GameState,
    config?: ServiceIntegrationConfig,
    gameEngineConfig?: GameEngineConfig
): Promise<IntegratedGameSystem> {
    return ServiceIntegrationFactory.getInstance(config)
        .createIntegratedSystem(initialGameState, gameEngineConfig);
}

/**
 * Service Integration Strategy Implementation
 * 
 * Provides the step-by-step implementation strategy for service integration
 */
export const SERVICE_INTEGRATION_STRATEGY = {
    phase1_BasicRegistry: () => ({
        tasks: [
            'Implement ServiceRegistry interface with basic service access',
            'Create ServiceContainer with dependency injection',
            'Implement basic service lifecycle management',
            'Add service health monitoring and status tracking',
            'Create service registration and resolution mechanisms'
        ],
        deliverables: [
            'ServiceRegistryImpl class with full interface implementation',
            'SimpleServiceContainer with dependency resolution',
            'BasicServiceLifecycleManager for initialization/shutdown',
            'Service status tracking and health monitoring',
            'Unit tests for all service registry components'
        ],
        successCriteria: [
            'All services can be registered and resolved correctly',
            'Dependency injection works for complex dependency graphs',
            'Service lifecycle management handles initialization/shutdown',
            'Health monitoring accurately reports service status',
            'No circular dependencies in service registration'
        ]
    }),

    phase2_GameEngineIntegration: () => ({
        tasks: [
            'Integrate ServiceRegistry with GameEngine interface',
            'Implement service communication patterns through GameEngine',
            'Add service coordination for multi-service operations',
            'Create service message handling and broadcasting',
            'Implement service integration health monitoring'
        ],
        deliverables: [
            'GameEngineServiceIntegration implementation',
            'ServiceCommunicationCoordinator for inter-service messaging',
            'Multi-service operation coordination system',
            'Service integration health monitoring',
            'Integration tests for GameEngine-service interactions'
        ],
        successCriteria: [
            'GameEngine can coordinate all service interactions',
            'Services communicate through GameEngine coordination',
            'Multi-service operations execute in correct dependency order',
            'Service integration health monitoring works correctly',
            'All service operations maintain system consistency'
        ]
    }),

    phase3_AdvancedCoordination: () => ({
        tasks: [
            'Implement advanced error recovery and service restart',
            'Add performance monitoring and optimization',
            'Create service operation batching and caching',
            'Implement advanced service communication patterns',
            'Add comprehensive logging and debugging support'
        ],
        deliverables: [
            'Advanced error recovery and service restart mechanisms',
            'Performance monitoring and optimization systems',
            'Service operation batching and caching',
            'Advanced communication patterns (pub/sub, request/response)',
            'Comprehensive logging and debugging tools'
        ],
        successCriteria: [
            'System recovers gracefully from service failures',
            'Performance monitoring identifies and resolves bottlenecks',
            'Service operations are optimized through batching/caching',
            'Advanced communication patterns work reliably',
            'Debugging tools provide comprehensive system visibility'
        ]
    })
};