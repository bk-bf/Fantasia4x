/**
 * Service Registry Implementation
 * 
 * Concrete implementation of the ServiceRegistry interface with
 * lifecycle management, dependency injection, and health monitoring.
 * 
 * Requirements: 2.1, 2.3
 */

import type { GameState } from '../core/types';
import type {
    ServiceRegistry,
    ServiceStatus,
    ServiceInitializationResult,
    ServiceValidationResult,
    ServiceMessage,
    ServiceLifecycleManager,
    ServiceContainer,
    ServiceFactory,
    ServiceRegistration,
    ServiceIntegrationConfig,
    ItemService,
    BuildingService,
    WorkService,
    ResearchService,
    PawnService,
    EventService
} from './ServiceIntegration';

/**
 * Concrete ServiceRegistry implementation
 */
export class ServiceRegistryImpl implements ServiceRegistry {
    private services: Map<string, any> = new Map();
    private serviceStatuses: Map<string, ServiceStatus> = new Map();
    private lifecycleManager: ServiceLifecycleManager;
    private container: ServiceContainer;
    private config: ServiceIntegrationConfig;
    private initialized = false;

    constructor(
        lifecycleManager: ServiceLifecycleManager,
        container: ServiceContainer,
        config: ServiceIntegrationConfig
    ) {
        this.lifecycleManager = lifecycleManager;
        this.container = container;
        this.config = config;
    }

    // ===== SERVICE ACCESS =====

    get itemService(): ItemService {
        return this.getService('itemService');
    }

    get buildingService(): BuildingService {
        return this.getService('buildingService');
    }

    get workService(): WorkService {
        return this.getService('workService');
    }

    get researchService(): ResearchService {
        return this.getService('researchService');
    }

    get pawnService(): PawnService {
        return this.getService('pawnService');
    }

    get eventService(): EventService {
        return this.getService('eventService');
    }

    private getService<T>(serviceName: string): T {
        if (!this.initialized) {
            throw new Error(`ServiceRegistry not initialized. Call initializeServices() first.`);
        }

        const service = this.services.get(serviceName);
        if (!service) {
            throw new Error(`Service '${serviceName}' not found in registry`);
        }

        return service as T;
    }

    // ===== SERVICE MANAGEMENT =====

    isInitialized(): boolean {
        return this.initialized;
    }

    getServiceStatus(serviceName: string): ServiceStatus {
        const status = this.serviceStatuses.get(serviceName);
        if (!status) {
            return {
                name: serviceName,
                isInitialized: false,
                isHealthy: false,
                dependencies: [],
                dependents: []
            };
        }
        return { ...status };
    }

    getAllServiceStatuses(): Record<string, ServiceStatus> {
        const statuses: Record<string, ServiceStatus> = {};
        for (const [name, status] of this.serviceStatuses) {
            statuses[name] = { ...status };
        }
        return statuses;
    }

    // ===== SERVICE LIFECYCLE =====

    async initializeServices(gameState: GameState): Promise<ServiceInitializationResult> {
        if (this.initialized) {
            throw new Error('Services already initialized');
        }

        try {
            // Validate dependencies first
            const validation = this.validateServiceDependencies();
            if (!validation.isValid) {
                return {
                    success: false,
                    initializedServices: [],
                    failedServices: Object.keys(this.container.getDependencyGraph()),
                    errors: {
                        'dependency_validation': `Circular dependencies: ${validation.circularDependencies.join(', ')}`
                    },
                    totalInitializationTime: 0
                };
            }

            // Initialize services through lifecycle manager
            const result = await this.lifecycleManager.initializeInOrder(this, gameState);

            if (result.success) {
                this.initialized = true;

                // Store initialized services
                for (const serviceName of result.initializedServices) {
                    const service = this.container.resolve(serviceName);
                    this.services.set(serviceName, service);

                    // Update service status
                    this.serviceStatuses.set(serviceName, {
                        name: serviceName,
                        isInitialized: true,
                        isHealthy: true,
                        dependencies: this.container.getDependencyGraph()[serviceName] || [],
                        dependents: this.getDependents(serviceName),
                        initializationTime: Date.now()
                    });
                }
            }

            return result;
        } catch (error) {
            return {
                success: false,
                initializedServices: [],
                failedServices: Object.keys(this.container.getDependencyGraph()),
                errors: {
                    'initialization_error': error instanceof Error ? error.message : 'Unknown error'
                },
                totalInitializationTime: 0
            };
        }
    }

    async shutdownServices(): Promise<void> {
        if (!this.initialized) {
            return;
        }

        try {
            await this.lifecycleManager.shutdownInOrder(this);

            // Clear all services and statuses
            this.services.clear();
            this.serviceStatuses.clear();
            this.initialized = false;
        } catch (error) {
            console.error('Error during service shutdown:', error);
            // Force cleanup even if shutdown fails
            this.services.clear();
            this.serviceStatuses.clear();
            this.initialized = false;
        }
    }

    async restartService(serviceName: string): Promise<boolean> {
        try {
            // Check if service exists
            if (!this.services.has(serviceName)) {
                return false;
            }

            // Shutdown service
            const service = this.services.get(serviceName);
            if (service && typeof service.shutdown === 'function') {
                await service.shutdown();
            }

            // Reinitialize service
            const newService = this.container.resolve<any>(serviceName);
            if (newService && typeof newService.initialize === 'function') {
                await newService.initialize();
            }

            // Update registry
            this.services.set(serviceName, newService);

            // Update status
            const status = this.serviceStatuses.get(serviceName);
            if (status) {
                status.isHealthy = true;
                status.lastError = undefined;
                status.lastHealthCheck = Date.now();
            }

            return true;
        } catch (error) {
            // Update status with error
            const status = this.serviceStatuses.get(serviceName);
            if (status) {
                status.isHealthy = false;
                status.lastError = error instanceof Error ? error.message : 'Unknown error';
            }
            return false;
        }
    }

    // ===== SERVICE COMMUNICATION =====

    broadcastToServices(message: ServiceMessage): void {
        for (const [serviceName, service] of this.services) {
            if (service && typeof service.handleMessage === 'function') {
                try {
                    service.handleMessage(message);
                } catch (error) {
                    console.error(`Error broadcasting message to ${serviceName}:`, error);

                    // Update service health status
                    const status = this.serviceStatuses.get(serviceName);
                    if (status) {
                        status.isHealthy = false;
                        status.lastError = error instanceof Error ? error.message : 'Message handling error';
                    }
                }
            }
        }
    }

    getServiceDependencies(serviceName: string): string[] {
        return this.container.getDependencyGraph()[serviceName] || [];
    }

    validateServiceDependencies(): ServiceValidationResult {
        return this.container.validateDependencies();
    }

    // ===== HELPER METHODS =====

    private getDependents(serviceName: string): string[] {
        const dependents: string[] = [];
        const dependencyGraph = this.container.getDependencyGraph();

        for (const [name, dependencies] of Object.entries(dependencyGraph)) {
            if (dependencies.includes(serviceName)) {
                dependents.push(name);
            }
        }

        return dependents;
    }

    // ===== HEALTH MONITORING =====

    async performHealthCheck(): Promise<Record<string, ServiceStatus>> {
        const healthStatuses = await this.lifecycleManager.performHealthChecks(this);

        // Update internal status tracking
        for (const [serviceName, status] of Object.entries(healthStatuses)) {
            this.serviceStatuses.set(serviceName, status);
        }

        return healthStatuses;
    }

    // ===== DEBUGGING AND DIAGNOSTICS =====

    getDiagnosticInfo(): {
        isInitialized: boolean;
        serviceCount: number;
        healthyServices: number;
        unhealthyServices: number;
        dependencyGraph: Record<string, string[]>;
        lastHealthCheck?: number;
    } {
        const statuses = Array.from(this.serviceStatuses.values());
        const healthyCount = statuses.filter(s => s.isHealthy).length;
        const unhealthyCount = statuses.filter(s => !s.isHealthy).length;
        const lastHealthCheck = Math.max(...statuses.map(s => s.lastHealthCheck || 0));

        return {
            isInitialized: this.initialized,
            serviceCount: this.services.size,
            healthyServices: healthyCount,
            unhealthyServices: unhealthyCount,
            dependencyGraph: this.container.getDependencyGraph(),
            lastHealthCheck: lastHealthCheck > 0 ? lastHealthCheck : undefined
        };
    }
}

/**
 * Simple Service Container Implementation
 */
export class SimpleServiceContainer implements ServiceContainer {
    private registrations: Map<string, ServiceRegistration> = new Map();
    private instances: Map<string, any> = new Map();

    register<T>(
        name: string,
        factory: ServiceFactory<T>,
        dependencies: string[] = []
    ): void {
        this.registrations.set(name, {
            name,
            factory,
            dependencies,
            singleton: true,
            lazy: false
        });
    }

    resolve<T>(name: string): T {
        // Check if singleton instance exists
        if (this.instances.has(name)) {
            return this.instances.get(name) as T;
        }

        // Get registration
        const registration = this.registrations.get(name);
        if (!registration) {
            throw new Error(`Service '${name}' not registered`);
        }

        // Resolve dependencies
        const dependencies: Record<string, any> = {};
        for (const depName of registration.dependencies) {
            dependencies[depName] = this.resolve(depName);
        }

        // Create instance
        const instance = registration.factory(dependencies);

        // Store singleton instance
        if (registration.singleton) {
            this.instances.set(name, instance);
        }

        return instance as T;
    }

    isRegistered(name: string): boolean {
        return this.registrations.has(name);
    }

    getDependencyGraph(): Record<string, string[]> {
        const graph: Record<string, string[]> = {};
        for (const [name, registration] of this.registrations) {
            graph[name] = [...registration.dependencies];
        }
        return graph;
    }

    validateDependencies(): ServiceValidationResult {
        const graph = this.getDependencyGraph();
        const circularDependencies: string[][] = [];
        const missingDependencies: Record<string, string[]> = {};
        const unresolvedServices: string[] = [];

        // Check for missing dependencies
        for (const [serviceName, dependencies] of Object.entries(graph)) {
            const missing = dependencies.filter(dep => !this.registrations.has(dep));
            if (missing.length > 0) {
                missingDependencies[serviceName] = missing;
            }
        }

        // Check for circular dependencies using DFS
        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        const hasCycle = (node: string, path: string[]): boolean => {
            if (recursionStack.has(node)) {
                const cycleStart = path.indexOf(node);
                circularDependencies.push(path.slice(cycleStart).concat(node));
                return true;
            }

            if (visited.has(node)) {
                return false;
            }

            visited.add(node);
            recursionStack.add(node);

            const dependencies = graph[node] || [];
            for (const dep of dependencies) {
                if (hasCycle(dep, [...path, node])) {
                    return true;
                }
            }

            recursionStack.delete(node);
            return false;
        };

        for (const serviceName of Object.keys(graph)) {
            if (!visited.has(serviceName)) {
                hasCycle(serviceName, []);
            }
        }

        return {
            isValid: circularDependencies.length === 0 && Object.keys(missingDependencies).length === 0,
            circularDependencies,
            missingDependencies,
            unresolvedServices
        };
    }
}

/**
 * Basic Service Lifecycle Manager Implementation
 */
export class BasicServiceLifecycleManager implements ServiceLifecycleManager {

    async initializeInOrder(
        services: ServiceRegistry,
        gameState: GameState
    ): Promise<ServiceInitializationResult> {
        const startTime = Date.now();
        const initializedServices: string[] = [];
        const failedServices: string[] = [];
        const errors: Record<string, string> = {};

        // Get dependency-ordered service list
        const serviceOrder = this.getInitializationOrder(services);

        for (const serviceName of serviceOrder) {
            try {
                const service = (services as any)[serviceName];
                if (service && typeof service.initialize === 'function') {
                    await service.initialize(gameState);
                }
                initializedServices.push(serviceName);
            } catch (error) {
                failedServices.push(serviceName);
                errors[serviceName] = error instanceof Error ? error.message : 'Unknown error';
            }
        }

        return {
            success: failedServices.length === 0,
            initializedServices,
            failedServices,
            errors,
            totalInitializationTime: Date.now() - startTime
        };
    }

    async shutdownInOrder(services: ServiceRegistry): Promise<void> {
        const serviceOrder = this.getInitializationOrder(services).reverse();

        for (const serviceName of serviceOrder) {
            try {
                const service = (services as any)[serviceName];
                if (service && typeof service.shutdown === 'function') {
                    await service.shutdown();
                }
            } catch (error) {
                console.error(`Error shutting down ${serviceName}:`, error);
            }
        }
    }

    async performHealthChecks(services: ServiceRegistry): Promise<Record<string, ServiceStatus>> {
        const statuses: Record<string, ServiceStatus> = {};
        const serviceNames = ['itemService', 'buildingService', 'workService', 'researchService', 'pawnService', 'eventService'];

        for (const serviceName of serviceNames) {
            try {
                const service = (services as any)[serviceName];
                const isHealthy = service && (typeof service.healthCheck !== 'function' || await service.healthCheck());

                statuses[serviceName] = {
                    name: serviceName,
                    isInitialized: !!service,
                    isHealthy: !!isHealthy,
                    dependencies: services.getServiceDependencies(serviceName),
                    dependents: [],
                    lastHealthCheck: Date.now()
                };
            } catch (error) {
                statuses[serviceName] = {
                    name: serviceName,
                    isInitialized: false,
                    isHealthy: false,
                    lastError: error instanceof Error ? error.message : 'Health check failed',
                    dependencies: [],
                    dependents: [],
                    lastHealthCheck: Date.now()
                };
            }
        }

        return statuses;
    }

    async restartFailedServices(services: ServiceRegistry): Promise<string[]> {
        const restarted: string[] = [];
        const statuses = await this.performHealthChecks(services);

        for (const [serviceName, status] of Object.entries(statuses)) {
            if (!status.isHealthy) {
                const success = await services.restartService(serviceName);
                if (success) {
                    restarted.push(serviceName);
                }
            }
        }

        return restarted;
    }

    private getInitializationOrder(services: ServiceRegistry): string[] {
        // Simple dependency-based ordering
        // In a real implementation, this would use topological sorting
        return [
            'itemService',
            'buildingService',
            'workService',
            'researchService',
            'pawnService',
            'eventService'
        ];
    }
}