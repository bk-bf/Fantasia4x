/**
 * System Interaction Coordinator Implementation
 *
 * Concrete implementation of the SystemInteractionCoordinator that handles
 * data requests, event propagation, state consistency, and error recovery
 * within the GameEngine architecture.
 *
 * Requirements: 2.1, 2.3, 7.1
 */

import type { GameState } from '../core/types';
import type { ServiceRegistry } from './ServiceIntegration';
import type {
  SystemInteractionCoordinator,
  SystemDataRequest,
  SystemDataResponse,
  SystemEvent,
  SystemEventType,
  EventProcessingResult,
  StateUpdateRequest,
  StateUpdateResult,
  SystemError,
  RecoveryResult,
  ProtocolValidationResult,
  InteractionProtocolConfig,
  EventHandler,
  ConsistencyValidator,
  ErrorRecoveryStrategy,
  EventHandlerResult,
  ConsistencyValidationResult,
  ValidationResult
} from './SystemInteractionProtocols';
import {
  DEFAULT_PROTOCOL_CONFIG,
  generateRequestId,
  generateEventId,
  createSystemError
} from './SystemInteractionProtocols';

/**
 * Concrete implementation of SystemInteractionCoordinator
 */
export class SystemInteractionCoordinatorImpl implements SystemInteractionCoordinator {
  private services: ServiceRegistry;
  private gameState: GameState;
  private config: InteractionProtocolConfig;
  private eventHandlers: Map<string, EventHandler[]> = new Map();
  private requestCache: Map<string, SystemDataResponse> = new Map();
  private eventQueue: SystemEvent[] = [];
  private processingRequests: Map<string, Promise<SystemDataResponse>> = new Map();
  private consistencyValidator: ConsistencyValidator;
  private errorRecoveryStrategy: ErrorRecoveryStrategy;
  private performanceMetrics: {
    requestTimes: number[];
    eventProcessingTimes: number[];
    stateUpdateTimes: number[];
    errorRecoveryTimes: number[];
  } = {
    requestTimes: [],
    eventProcessingTimes: [],
    stateUpdateTimes: [],
    errorRecoveryTimes: []
  };

  constructor(
    services: ServiceRegistry,
    gameState: GameState,
    config: InteractionProtocolConfig = DEFAULT_PROTOCOL_CONFIG
  ) {
    this.services = services;
    this.gameState = gameState;
    this.config = config;
    this.consistencyValidator = new ConsistencyValidatorImpl();
    this.errorRecoveryStrategy = new ErrorRecoveryStrategyImpl(this);

    // Start background processes
    this.startBackgroundProcesses();
  }

  // ===== DATA REQUEST PROCESSING =====

  async processDataRequest(request: SystemDataRequest): Promise<SystemDataResponse> {
    const startTime = Date.now();

    try {
      // Check cache first
      if (this.config.enableRequestCaching && request.cacheKey) {
        const cached = this.requestCache.get(request.cacheKey);
        if (cached && Date.now() - cached.metadata.timestamp < this.config.cacheExpirationTime) {
          return {
            ...cached,
            metadata: {
              ...cached.metadata,
              cacheHit: true
            }
          };
        }
      }

      // Check for duplicate in-flight requests
      if (this.processingRequests.has(request.requestId)) {
        return await this.processingRequests.get(request.requestId)!;
      }

      // Create processing promise
      const processingPromise = this.executeDataRequest(request);
      this.processingRequests.set(request.requestId, processingPromise);

      try {
        const response = await processingPromise;

        // Cache successful responses
        if (response.success && this.config.enableRequestCaching && request.cacheKey) {
          this.requestCache.set(request.cacheKey, response);
        }

        // Record performance metrics
        const executionTime = Date.now() - startTime;
        this.performanceMetrics.requestTimes.push(executionTime);
        this.trimMetricsArray(this.performanceMetrics.requestTimes);

        return response;
      } finally {
        this.processingRequests.delete(request.requestId);
      }
    } catch (error) {
      const executionTime = Date.now() - startTime;
      return {
        requestId: request.requestId,
        success: false,
        error: createSystemError(
          'communication_error',
          'high',
          'SystemInteractionCoordinator',
          `Failed to process data request: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { request, error: error instanceof Error ? error.stack : error }
        ),
        metadata: {
          executionTime,
          cacheHit: false,
          dataSource: 'error',
          timestamp: Date.now()
        }
      };
    }
  }

  private async executeDataRequest(request: SystemDataRequest): Promise<SystemDataResponse> {
    const startTime = Date.now();

    // Route request to appropriate service
    const targetService = this.getTargetService(request.targetSystem);
    if (!targetService) {
      throw new Error(`Target system '${request.targetSystem}' not found`);
    }

    // Execute operation
    let result: any;
    switch (request.requestType) {
      case 'query':
        result = await this.executeQuery(targetService, request);
        break;
      case 'calculation':
        result = await this.executeCalculation(targetService, request);
        break;
      case 'validation':
        result = await this.executeValidation(targetService, request);
        break;
      case 'aggregation':
        result = await this.executeAggregation(request);
        break;
      case 'projection':
        result = await this.executeProjection(targetService, request);
        break;
      default:
        throw new Error(`Unsupported request type: ${request.requestType}`);
    }

    return {
      requestId: request.requestId,
      success: true,
      data: result,
      metadata: {
        executionTime: Date.now() - startTime,
        cacheHit: false,
        dataSource: request.targetSystem,
        timestamp: Date.now()
      }
    };
  }

  private async executeQuery(service: any, request: SystemDataRequest): Promise<any> {
    const method = service[request.operation];
    if (typeof method !== 'function') {
      throw new Error(`Operation '${request.operation}' not found on service`);
    }

    const params = Object.values(request.parameters);
    return await method.apply(service, params);
  }

  private async executeCalculation(service: any, request: SystemDataRequest): Promise<any> {
    // Similar to executeQuery but with additional validation for calculation methods
    return await this.executeQuery(service, request);
  }

  private async executeValidation(service: any, request: SystemDataRequest): Promise<any> {
    const result = await this.executeQuery(service, request);

    // Ensure validation results are boolean or validation objects
    if (typeof result !== 'boolean' && !this.isValidationResult(result)) {
      throw new Error(`Validation operation must return boolean or ValidationResult`);
    }

    return result;
  }

  private async executeAggregation(request: SystemDataRequest): Promise<any> {
    // Aggregate data from multiple services
    const aggregationConfig = request.parameters.aggregation;
    if (!aggregationConfig || !Array.isArray(aggregationConfig.sources)) {
      throw new Error('Aggregation request must specify sources');
    }

    const results: Record<string, any> = {};
    for (const source of aggregationConfig.sources) {
      const subRequest = {
        ...request,
        requestId: generateRequestId(),
        targetSystem: source.system,
        operation: source.operation,
        parameters: source.parameters || {}
      };

      const response = await this.processDataRequest(subRequest);
      if (response.success) {
        results[source.key || source.system] = response.data;
      } else {
        throw new Error(`Aggregation failed for ${source.system}: ${response.error?.message}`);
      }
    }

    return results;
  }

  private async executeProjection(service: any, request: SystemDataRequest): Promise<any> {
    // Execute projection with current game state
    const method = service[request.operation];
    if (typeof method !== 'function') {
      throw new Error(`Projection operation '${request.operation}' not found on service`);
    }

    const params = [this.gameState, ...Object.values(request.parameters)];
    return await method.apply(service, params);
  }

  // ===== EVENT PROPAGATION =====

  async propagateEvent(event: SystemEvent): Promise<EventProcessingResult> {
    const startTime = Date.now();
    const processedBy: string[] = [];
    const errors: Record<string, string> = {};
    const generatedEvents: SystemEvent[] = [];

    try {
      // Get target handlers
      const handlers = this.getEventHandlers(event);

      // Process event with each handler
      for (const handler of handlers) {
        try {
          const result = await this.processEventWithHandler(event, handler);
          processedBy.push(handler.systemName);

          if (result.generatedEvents) {
            generatedEvents.push(...result.generatedEvents);
          }
        } catch (error) {
          errors[handler.systemName] = error instanceof Error ? error.message : 'Unknown error';
        }
      }

      // Process generated events recursively (with depth limit)
      if (generatedEvents.length > 0) {
        for (const generatedEvent of generatedEvents) {
          // Add correlation tracking
          generatedEvent.causedBy = event.eventId;

          // Process asynchronously to prevent infinite recursion
          setTimeout(() => this.propagateEvent(generatedEvent), 0);
        }
      }

      // Record performance metrics
      const processingTime = Date.now() - startTime;
      this.performanceMetrics.eventProcessingTimes.push(processingTime);
      this.trimMetricsArray(this.performanceMetrics.eventProcessingTimes);

      return {
        eventId: event.eventId,
        success: Object.keys(errors).length === 0,
        processedBy,
        errors,
        generatedEvents,
        processingTime
      };
    } catch (error) {
      return {
        eventId: event.eventId,
        success: false,
        processedBy,
        errors: { coordinator: error instanceof Error ? error.message : 'Unknown error' },
        generatedEvents: [],
        processingTime: Date.now() - startTime
      };
    }
  }

  private getEventHandlers(event: SystemEvent): EventHandler[] {
    const handlers: EventHandler[] = [];

    // Get handlers for specific targets
    if (event.targetSystems) {
      for (const targetSystem of event.targetSystems) {
        const systemHandlers = this.eventHandlers.get(targetSystem) || [];
        handlers.push(...systemHandlers.filter((h) => h.eventTypes.includes(event.eventType)));
      }
    } else {
      // Broadcast to all handlers
      for (const systemHandlers of this.eventHandlers.values()) {
        handlers.push(...systemHandlers.filter((h) => h.eventTypes.includes(event.eventType)));
      }
    }

    // Sort by priority
    return handlers.sort((a, b) => b.priority - a.priority);
  }

  private async processEventWithHandler(
    event: SystemEvent,
    handler: EventHandler
  ): Promise<EventHandlerResult> {
    const timeout = this.config.eventProcessingTimeout;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Event handler timeout for ${handler.systemName}`));
      }, timeout);

      handler
        .handler(event)
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  // ===== STATE CONSISTENCY =====

  async coordinateStateUpdate(update: StateUpdateRequest): Promise<StateUpdateResult> {
    const startTime = Date.now();

    try {
      // Validate update request
      const validation = await this.validateStateUpdate(update);
      if (!validation.isValid) {
        return {
          success: false,
          updatesApplied: 0,
          validationErrors: validation.errors,
          rollbackPerformed: false,
          affectedSystems: update.affectedSystems,
          updateTime: Date.now() - startTime
        };
      }

      // Create backup for rollback
      const backup = this.createStateBackup(update.affectedSystems);

      try {
        // Apply updates atomically
        const appliedUpdates = await this.applyStateUpdates(update);

        // Validate consistency after updates
        if (this.config.enableStrictConsistency) {
          const consistencyCheck = this.consistencyValidator.validateGlobalConsistency(
            this.gameState
          );
          if (!consistencyCheck.isConsistent) {
            // Rollback on consistency failure
            await this.restoreStateBackup(backup);
            return {
              success: false,
              updatesApplied: 0,
              validationErrors: consistencyCheck.violations.map((v) => v.description),
              rollbackPerformed: true,
              affectedSystems: update.affectedSystems,
              updateTime: Date.now() - startTime
            };
          }
        }

        // Notify affected systems
        await this.notifySystemsOfStateChange(update.affectedSystems, update);

        // Record performance metrics
        const updateTime = Date.now() - startTime;
        this.performanceMetrics.stateUpdateTimes.push(updateTime);
        this.trimMetricsArray(this.performanceMetrics.stateUpdateTimes);

        return {
          success: true,
          updatesApplied: appliedUpdates,
          validationErrors: [],
          rollbackPerformed: false,
          affectedSystems: update.affectedSystems,
          updateTime
        };
      } catch (error) {
        // Rollback on error
        await this.restoreStateBackup(backup);
        throw error;
      }
    } catch (error) {
      return {
        success: false,
        updatesApplied: 0,
        validationErrors: [error instanceof Error ? error.message : 'Unknown error'],
        rollbackPerformed: true,
        affectedSystems: update.affectedSystems,
        updateTime: Date.now() - startTime
      };
    }
  }

  // ===== ERROR HANDLING =====

  async handleSystemError(error: SystemError): Promise<RecoveryResult> {
    const startTime = Date.now();

    try {
      // Record error metrics
      this.recordErrorMetrics(error);

      // Attempt recovery based on error type and severity
      const recoveryResult = await this.errorRecoveryStrategy.attemptAutoRecovery(error);

      // Record recovery time
      const recoveryTime = Date.now() - startTime;
      this.performanceMetrics.errorRecoveryTimes.push(recoveryTime);
      this.trimMetricsArray(this.performanceMetrics.errorRecoveryTimes);

      return {
        ...recoveryResult,
        recoveryTime
      };
    } catch (recoveryError) {
      return {
        success: false,
        recoveryMethod: 'none',
        recoveryTime: Date.now() - startTime,
        remainingIssues: [error],
        systemsAffected: error.affectedSystems
      };
    }
  }

  // ===== PROTOCOL VALIDATION =====

  async validateInteractionProtocols(): Promise<ProtocolValidationResult> {
    const errors: any[] = [];
    const performanceMetrics = this.calculatePerformanceMetrics();
    const recommendations: string[] = [];

    // Validate service availability
    if (!this.services.isInitialized()) {
      errors.push({
        protocolType: 'data_request',
        errorType: 'service_unavailable',
        description: 'Service registry not initialized',
        severity: 'critical',
        suggestedFix: 'Initialize service registry before using protocols'
      });
    }

    // Validate event handler registration
    if (this.eventHandlers.size === 0) {
      errors.push({
        protocolType: 'event_propagation',
        errorType: 'no_handlers',
        description: 'No event handlers registered',
        severity: 'medium',
        suggestedFix: 'Register event handlers for system communication'
      });
    }

    // Performance recommendations
    if (performanceMetrics.averageRequestTime > 1000) {
      recommendations.push('Consider enabling request caching to improve performance');
    }

    if (performanceMetrics.eventThroughput < 100) {
      recommendations.push('Consider optimizing event handlers for better throughput');
    }

    return {
      isValid: errors.filter((e) => e.severity === 'critical').length === 0,
      protocolErrors: errors,
      performanceMetrics,
      recommendations
    };
  }

  // ===== HELPER METHODS =====

  private getTargetService(systemName: string): any {
    switch (systemName.toLowerCase()) {
      case 'itemsystem':
      case 'item':
        return this.services.itemService;
      case 'buildingsystem':
      case 'building':
        return this.services.buildingService;
      case 'worksystem':
      case 'work':
        return this.services.workService;
      case 'researchsystem':
      case 'research':
        return this.services.researchService;
      case 'pawnsystem':
      case 'pawn':
        return this.services.pawnService;
      case 'eventsystem':
      case 'event':
        return this.services.eventService;
      default:
        return null;
    }
  }

  private isValidationResult(result: any): boolean {
    return result && typeof result === 'object' && typeof result.isValid === 'boolean';
  }

  private async validateStateUpdate(update: StateUpdateRequest): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate update structure
    if (!update.updates || update.updates.length === 0) {
      errors.push('State update must contain at least one update');
    }

    // Validate each update
    for (const stateUpdate of update.updates) {
      if (!stateUpdate.path) {
        errors.push('State update must specify path');
      }
      if (!stateUpdate.operation) {
        errors.push('State update must specify operation');
      }
    }

    // Run custom validation rules
    for (const rule of update.validationRules) {
      for (const stateUpdate of update.updates) {
        const ruleResult = rule.validator(this.gameState, stateUpdate);
        if (!ruleResult.isValid) {
          if (rule.severity === 'error' || rule.severity === 'critical') {
            errors.push(...ruleResult.errors);
          } else {
            warnings.push(...ruleResult.warnings);
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  private createStateBackup(affectedSystems: string[]): any {
    // Create deep copy of relevant state portions
    return JSON.parse(
      JSON.stringify({
        gameState: this.gameState,
        timestamp: Date.now(),
        affectedSystems
      })
    );
  }

  private async restoreStateBackup(backup: any): Promise<void> {
    // Restore state from backup
    this.gameState = backup.gameState;
  }

  private async applyStateUpdates(update: StateUpdateRequest): Promise<number> {
    let appliedCount = 0;

    for (const stateUpdate of update.updates) {
      try {
        await this.applyStateUpdate(stateUpdate);
        appliedCount++;
      } catch (error) {
        throw new Error(`Failed to apply state update at ${stateUpdate.path}: ${error}`);
      }
    }

    return appliedCount;
  }

  private async applyStateUpdate(update: any): Promise<void> {
    // Apply individual state update using JSONPath-like operations
    const pathParts = update.path.split('.');
    let target = this.gameState as any;

    // Navigate to parent object
    for (let i = 0; i < pathParts.length - 1; i++) {
      if (!target[pathParts[i]]) {
        target[pathParts[i]] = {};
      }
      target = target[pathParts[i]];
    }

    const finalKey = pathParts[pathParts.length - 1];

    // Apply operation
    switch (update.operation) {
      case 'set':
        target[finalKey] = update.value;
        break;
      case 'merge':
        if (typeof target[finalKey] === 'object' && typeof update.value === 'object') {
          target[finalKey] = { ...target[finalKey], ...update.value };
        } else {
          target[finalKey] = update.value;
        }
        break;
      case 'delete':
        delete target[finalKey];
        break;
      case 'increment':
        target[finalKey] = (target[finalKey] || 0) + (update.value || 1);
        break;
    }
  }

  private async notifySystemsOfStateChange(
    affectedSystems: string[],
    update: StateUpdateRequest
  ): Promise<void> {
    const event = {
      eventId: generateEventId(),
      eventType: 'state_change' as const,
      sourceSystem: 'SystemInteractionCoordinator',
      targetSystems: affectedSystems,
      eventData: {
        updateId: update.updateId,
        updateType: update.updateType,
        affectedPaths: update.updates.map((u) => u.path)
      },
      timestamp: Date.now(),
      priority: 'normal' as const
    };

    await this.propagateEvent(event);
  }

  private recordErrorMetrics(error: SystemError): void {
    // Record error for monitoring and analysis
    console.error(`System Error [${error.errorType}]:`, error.message, error.details);
  }

  private calculatePerformanceMetrics(): any {
    return {
      averageRequestTime: this.calculateAverage(this.performanceMetrics.requestTimes),
      eventThroughput: this.performanceMetrics.eventProcessingTimes.length,
      stateUpdateLatency: this.calculateAverage(this.performanceMetrics.stateUpdateTimes),
      errorRecoveryTime: this.calculateAverage(this.performanceMetrics.errorRecoveryTimes),
      systemAvailability: 0.99 // Placeholder - would be calculated from actual uptime
    };
  }

  private calculateAverage(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
  }

  private trimMetricsArray(array: number[], maxSize: number = 1000): void {
    if (array.length > maxSize) {
      array.splice(0, array.length - maxSize);
    }
  }

  // ===== UTILITY FUNCTIONS =====

  private getValueAtPath(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private startBackgroundProcesses(): void {
    // Start cache cleanup process
    if (this.config.enableRequestCaching) {
      setInterval(() => {
        this.cleanupExpiredCache();
      }, this.config.cacheExpirationTime);
    }

    // Start consistency check process
    if (this.config.enableStrictConsistency) {
      setInterval(() => {
        this.performBackgroundConsistencyCheck();
      }, this.config.consistencyCheckInterval);
    }
  }

  private cleanupExpiredCache(): void {
    const now = Date.now();
    for (const [key, response] of this.requestCache.entries()) {
      if (now - response.metadata.timestamp > this.config.cacheExpirationTime) {
        this.requestCache.delete(key);
      }
    }
  }

  private async performBackgroundConsistencyCheck(): Promise<void> {
    try {
      const result = this.consistencyValidator.validateGlobalConsistency(this.gameState);
      if (!result.isConsistent) {
        console.warn('Background consistency check failed:', result.violations);
      }
    } catch (error) {
      console.error('Background consistency check error:', error);
    }
  }

  // ===== PUBLIC API FOR EVENT HANDLER REGISTRATION =====

  registerEventHandler(handler: EventHandler): void {
    if (!this.eventHandlers.has(handler.systemName)) {
      this.eventHandlers.set(handler.systemName, []);
    }
    this.eventHandlers.get(handler.systemName)!.push(handler);
  }

  unregisterEventHandler(systemName: string, eventTypes?: SystemEventType[]): void {
    if (!eventTypes) {
      this.eventHandlers.delete(systemName);
    } else {
      const handlers = this.eventHandlers.get(systemName);
      if (handlers) {
        const filtered = handlers.filter(
          (h) => !eventTypes.some((type) => h.eventTypes.includes(type))
        );
        this.eventHandlers.set(systemName, filtered);
      }
    }
  }
}

// ===== BASIC IMPLEMENTATIONS =====

class ConsistencyValidatorImpl implements ConsistencyValidator {
  validateGlobalConsistency(gameState: GameState): ConsistencyValidationResult {
    const violations: any[] = [];
    const warnings: any[] = [];
    const affectedSystems: string[] = [];

    // Basic consistency checks
    // TODO: Implement comprehensive validation logic

    return {
      isConsistent: violations.length === 0,
      violations,
      warnings,
      affectedSystems,
      validationTime: Date.now()
    };
  }

  validateStateUpdate(currentState: GameState, update: StateUpdateRequest): ValidationResult {
    // Basic validation - can be extended
    return {
      isValid: true,
      errors: [],
      warnings: []
    };
  }

  validateReferentialIntegrity(gameState: GameState): any {
    return {
      isValid: true,
      brokenReferences: [],
      orphanedData: []
    };
  }

  validateSystemInvariants(systemName: string, gameState: GameState): any {
    return {
      isValid: true,
      violatedInvariants: []
    };
  }
}

class ErrorRecoveryStrategyImpl implements ErrorRecoveryStrategy {
  constructor(private coordinator: SystemInteractionCoordinatorImpl) {}

  async attemptAutoRecovery(error: SystemError): Promise<RecoveryResult> {
    // Basic recovery strategy - can be extended
    return {
      success: false,
      recoveryMethod: 'none',
      recoveryTime: 0,
      remainingIssues: [error],
      systemsAffected: error.affectedSystems
    };
  }

  async rollbackToCheckpoint(checkpointId: string): Promise<any> {
    return { success: false, checkpointId, rollbackTime: 0, systemsReset: [], dataLoss: false };
  }

  async resetSystem(systemName: string): Promise<any> {
    return {
      success: false,
      systemName,
      resetTime: 0,
      backupCreated: false,
      dependentSystemsAffected: []
    };
  }

  async isolateSystem(systemName: string): Promise<any> {
    return {
      success: false,
      systemName,
      isolationTime: 0,
      alternativeHandlers: [],
      impactAssessment: []
    };
  }

  async createCheckpoint(description: string): Promise<any> {
    return { success: false, checkpointId: '', creationTime: 0, dataSize: 0, includedSystems: [] };
  }
}
