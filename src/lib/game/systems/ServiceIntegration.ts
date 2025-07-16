/**
 * Service Integration Architecture
 *
 * This module defines the architecture for integrating services with the GameEngine,
 * providing clean service lifecycle management, communication patterns, and
 * dependency injection strategies.
 *
 * Requirements: 2.1, 2.3
 */

import type { GameState } from '../core/types';
import type { GameEngine, SystemInteractionResult } from './GameEngine';

// ===== SERVICE REGISTRY INTERFACE =====

/**
 * Core service interfaces that must be implemented
 */
export interface ItemService {
  getItemById(id: string): any;
  getItemsByType(type: string): any[];
  canCraftItem(itemId: string, gameState: GameState): boolean;
  calculateCraftingTime(itemId: string, pawnId?: string): number;
}

export interface BuildingService {
  getBuildingById(id: string): any;
  canBuildBuilding(buildingId: string, gameState: GameState): boolean;
  calculateBuildingEffects(buildingId: string): any;
  calculateConstructionTime(buildingId: string): number;
}

export interface WorkService {
  getWorkCategories(): any[];
  assignPawnToWork(pawnId: string, workType: string): boolean;
  calculateWorkEfficiency(pawnId: string, workType: string): number;
  calculateResourceProduction(workAssignment: any): Record<string, number>;
}

export interface ResearchService {
  getAvailableResearch(gameState: GameState): any[];
  canResearch(researchId: string, gameState: GameState): boolean;
  calculateResearchTime(researchId: string): number;
}

export interface PawnService {
  processPawnNeeds(pawnId: string, gameState: GameState): GameState;
  calculateEffectiveStats(pawnId: string, gameState: GameState): any;
  updatePawnMorale(pawnId: string, factors: any): void;
}

export interface EventService {
  generateEvents(gameState: GameState): any[];
  processEvent(eventId: string, gameState: GameState): GameState;
  getEventHistory(): any[];
}

/**
 * Complete Service Registry Interface
 *
 * Central registry that manages all game services and provides
 * unified access patterns for the GameEngine.
 */
export interface ServiceRegistry {
  // Core Services
  itemService: ItemService;
  buildingService: BuildingService;
  workService: WorkService;
  researchService: ResearchService;
  pawnService: PawnService;
  eventService: EventService;

  // Service Management
  isInitialized(): boolean;
  getServiceStatus(serviceName: string): ServiceStatus;
  getAllServiceStatuses(): Record<string, ServiceStatus>;

  // Service Lifecycle
  initializeServices(gameState: GameState): Promise<ServiceInitializationResult>;
  shutdownServices(): Promise<void>;
  restartService(serviceName: string): Promise<boolean>;

  // Service Communication
  broadcastToServices(message: ServiceMessage): void;
  getServiceDependencies(serviceName: string): string[];
  validateServiceDependencies(): ServiceValidationResult;
}

// ===== SERVICE LIFECYCLE MANAGEMENT =====

/**
 * Service status information
 */
export interface ServiceStatus {
  name: string;
  isInitialized: boolean;
  isHealthy: boolean;
  lastError?: string;
  dependencies: string[];
  dependents: string[];
  initializationTime?: number;
  lastHealthCheck?: number;
}

/**
 * Service initialization result
 */
export interface ServiceInitializationResult {
  success: boolean;
  initializedServices: string[];
  failedServices: string[];
  errors: Record<string, string>;
  totalInitializationTime: number;
}

/**
 * Service validation result
 */
export interface ServiceValidationResult {
  isValid: boolean;
  circularDependencies: string[][];
  missingDependencies: Record<string, string[]>;
  unresolvedServices: string[];
}

/**
 * Service lifecycle manager interface
 */
export interface ServiceLifecycleManager {
  /**
   * Initialize services in dependency order
   */
  initializeInOrder(
    services: ServiceRegistry,
    gameState: GameState
  ): Promise<ServiceInitializationResult>;

  /**
   * Shutdown services in reverse dependency order
   */
  shutdownInOrder(services: ServiceRegistry): Promise<void>;

  /**
   * Health check all services
   */
  performHealthChecks(services: ServiceRegistry): Promise<Record<string, ServiceStatus>>;

  /**
   * Restart failed services
   */
  restartFailedServices(services: ServiceRegistry): Promise<string[]>;
}

// ===== SERVICE COMMUNICATION PATTERNS =====

/**
 * Service message types for inter-service communication
 */
export type ServiceMessageType =
  | 'state_update'
  | 'calculation_request'
  | 'validation_request'
  | 'event_notification'
  | 'system_shutdown'
  | 'health_check';

/**
 * Service message interface
 */
export interface ServiceMessage {
  type: ServiceMessageType;
  source: string;
  target?: string; // undefined means broadcast to all
  data: any;
  timestamp: number;
  correlationId?: string;
}

/**
 * Service communication coordinator
 */
export interface ServiceCommunicationCoordinator {
  /**
   * Send message between services through GameEngine
   */
  sendMessage(message: ServiceMessage): Promise<any>;

  /**
   * Broadcast message to all services
   */
  broadcastMessage(message: Omit<ServiceMessage, 'target'>): Promise<void>;

  /**
   * Register service message handler
   */
  registerMessageHandler(
    serviceName: string,
    messageType: ServiceMessageType,
    handler: (message: ServiceMessage) => Promise<any>
  ): void;

  /**
   * Get message history for debugging
   */
  getMessageHistory(limit?: number): ServiceMessage[];
}

// ===== GAMEENGINE SERVICE INTEGRATION =====

/**
 * GameEngine service integration interface
 *
 * Defines how the GameEngine coordinates with the service layer
 */
export interface GameEngineServiceIntegration {
  /**
   * Inject services into GameEngine
   */
  injectServices(services: ServiceRegistry): void;

  /**
   * Get service by name with type safety
   */
  getService<T extends keyof ServiceRegistry>(serviceName: T): ServiceRegistry[T];

  /**
   * Execute operation through service coordination
   */
  executeServiceOperation<T>(
    serviceName: keyof ServiceRegistry,
    operation: string,
    params: any[]
  ): Promise<T>;

  /**
   * Coordinate multi-service operations
   */
  coordinateMultiServiceOperation(operations: ServiceOperation[]): Promise<MultiServiceResult>;

  /**
   * Validate service integration health
   */
  validateServiceIntegration(): ServiceIntegrationHealth;
}

/**
 * Service operation definition
 */
export interface ServiceOperation {
  serviceName: keyof ServiceRegistry;
  operation: string;
  params: any[];
  dependencies?: string[]; // Other operations this depends on
}

/**
 * Multi-service operation result
 */
export interface MultiServiceResult {
  success: boolean;
  results: Record<string, any>;
  errors: Record<string, string>;
  executionOrder: string[];
  totalExecutionTime: number;
}

/**
 * Service integration health status
 */
export interface ServiceIntegrationHealth {
  isHealthy: boolean;
  serviceStatuses: Record<string, ServiceStatus>;
  communicationHealth: {
    messagesProcessed: number;
    averageResponseTime: number;
    failedMessages: number;
  };
  dependencyHealth: {
    circularDependencies: string[][];
    unresolvedDependencies: string[];
  };
}

// ===== SERVICE DEPENDENCY INJECTION =====

/**
 * Dependency injection container for services
 */
export interface ServiceContainer {
  /**
   * Register service with dependencies
   */
  register<T>(name: string, factory: ServiceFactory<T>, dependencies?: string[]): void;

  /**
   * Resolve service with all dependencies
   */
  resolve<T>(name: string): T;

  /**
   * Check if service is registered
   */
  isRegistered(name: string): boolean;

  /**
   * Get dependency graph
   */
  getDependencyGraph(): Record<string, string[]>;

  /**
   * Validate dependency graph for circular dependencies
   */
  validateDependencies(): ServiceValidationResult;
}

/**
 * Service factory function type
 */
export type ServiceFactory<T> = (dependencies: Record<string, any>) => T;

/**
 * Service registration configuration
 */
export interface ServiceRegistration {
  name: string;
  factory: ServiceFactory<any>;
  dependencies: string[];
  singleton: boolean;
  lazy: boolean;
}

// ===== IMPLEMENTATION STRATEGY =====

/**
 * Service integration implementation strategy
 *
 * This defines the step-by-step approach for implementing
 * the service integration architecture.
 */
export interface ServiceIntegrationStrategy {
  /**
   * Phase 1: Basic Service Registry
   * - Implement ServiceRegistry interface
   * - Create service container with dependency injection
   * - Basic service lifecycle management
   */
  phase1_BasicRegistry(): {
    tasks: string[];
    deliverables: string[];
    successCriteria: string[];
  };

  /**
   * Phase 2: GameEngine Integration
   * - Integrate services with GameEngine
   * - Implement service communication patterns
   * - Add service health monitoring
   */
  phase2_GameEngineIntegration(): {
    tasks: string[];
    deliverables: string[];
    successCriteria: string[];
  };

  /**
   * Phase 3: Advanced Coordination
   * - Multi-service operation coordination
   * - Advanced error recovery
   * - Performance optimization
   */
  phase3_AdvancedCoordination(): {
    tasks: string[];
    deliverables: string[];
    successCriteria: string[];
  };
}

// ===== CONFIGURATION AND SETTINGS =====

/**
 * Service integration configuration
 */
export interface ServiceIntegrationConfig {
  // Lifecycle settings
  initializationTimeout: number;
  healthCheckInterval: number;
  maxRetryAttempts: number;

  // Communication settings
  messageTimeout: number;
  maxMessageHistory: number;
  enableMessageLogging: boolean;

  // Performance settings
  enablePerformanceMetrics: boolean;
  operationTimeout: number;
  maxConcurrentOperations: number;

  // Error handling
  errorRecoveryMode: 'strict' | 'lenient' | 'disabled';
  enableAutoRestart: boolean;
  maxRestartAttempts: number;
}

/**
 * Default service integration configuration
 */
export const DEFAULT_SERVICE_INTEGRATION_CONFIG: ServiceIntegrationConfig = {
  // Lifecycle settings
  initializationTimeout: 30000, // 30 seconds
  healthCheckInterval: 60000, // 1 minute
  maxRetryAttempts: 3,

  // Communication settings
  messageTimeout: 5000, // 5 seconds
  maxMessageHistory: 1000,
  enableMessageLogging: true,

  // Performance settings
  enablePerformanceMetrics: true,
  operationTimeout: 10000, // 10 seconds
  maxConcurrentOperations: 10,

  // Error handling
  errorRecoveryMode: 'lenient',
  enableAutoRestart: true,
  maxRestartAttempts: 3
};

// Note: All interfaces are already exported above, no need for duplicate exports
