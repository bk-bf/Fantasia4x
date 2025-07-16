/**
 * System Interaction Protocols Implementation
 *
 * Concrete implementation of the system interaction protocols for coordinating
 * data requests, event propagation, state consistency, and error recovery
 * through the GameEngine.
 *
 * Requirements: 2.1, 2.3, 7.1
 */

import type { GameState } from '../core/types';

// ===== DATA REQUEST PROTOCOL =====

export type SystemDataRequestType =
  | 'query' // Read-only data queries
  | 'calculation' // Computed values (efficiency, bonuses, etc.)
  | 'validation' // Validation checks (can craft, can build, etc.)
  | 'aggregation' // Combined data from multiple sources
  | 'projection'; // Future state predictions

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

// ===== EVENT PROPAGATION PROTOCOL =====

export type SystemEventType =
  | 'state_change' // Game state modifications
  | 'action_completed' // System actions finished
  | 'resource_update' // Resource quantity changes
  | 'pawn_status_change' // Pawn state modifications
  | 'building_event' // Building construction/destruction
  | 'research_progress' // Research advancement
  | 'error_occurred' // System errors
  | 'system_lifecycle'; // System startup/shutdown

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

// ===== STATE CONSISTENCY PROTOCOL =====

export type StateUpdateType =
  | 'atomic' // Single, indivisible update
  | 'batch' // Multiple related updates
  | 'transaction' // Complex multi-system update
  | 'rollback'; // Undo previous updates

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
  path: string; // JSONPath to the data being updated
  operation: 'set' | 'merge' | 'delete' | 'increment';
  value: any;
  previousValue?: any;
  conditions?: StateCondition[];
}

export interface StateCondition {
  path: string;
  operator: 'equals' | 'greater' | 'less' | 'exists' | 'not_exists';
  value: any;
}

export interface ValidationRule {
  name: string;
  validator: (gameState: GameState, update: StateUpdate) => ValidationResult;
  errorMessage: string;
  severity: 'warning' | 'error' | 'critical';
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface StateUpdateResult {
  success: boolean;
  updatesApplied: number;
  validationErrors: string[];
  rollbackPerformed: boolean;
  affectedSystems: string[];
  updateTime: number;
}

// ===== ERROR HANDLING PROTOCOL =====

export type SystemErrorType =
  | 'validation_error' // Data validation failures
  | 'consistency_error' // State consistency violations
  | 'communication_error' // Inter-system communication failures
  | 'resource_error' // Resource availability issues
  | 'timeout_error' // Operation timeout
  | 'dependency_error' // Missing dependencies
  | 'corruption_error' // Data corruption detected
  | 'system_error'; // Internal system errors

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

export interface RecoveryResult {
  success: boolean;
  recoveryMethod: string;
  recoveryTime: number;
  remainingIssues: SystemError[];
  systemsAffected: string[];
}

// ===== CONSISTENCY VALIDATION =====

export interface ConsistencyValidator {
  validateGlobalConsistency(gameState: GameState): ConsistencyValidationResult;
  validateStateUpdate(currentState: GameState, update: StateUpdateRequest): ValidationResult;
  validateReferentialIntegrity(gameState: GameState): IntegrityValidationResult;
  validateSystemInvariants(systemName: string, gameState: GameState): InvariantValidationResult;
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

export interface ConsistencyWarning {
  type: string;
  description: string;
  affectedPath: string;
  recommendation?: string;
}

export interface IntegrityValidationResult {
  isValid: boolean;
  brokenReferences: BrokenReference[];
  orphanedData: OrphanedData[];
}

export interface BrokenReference {
  sourcePath: string;
  targetPath: string;
  referenceType: string;
  description: string;
}

export interface OrphanedData {
  path: string;
  dataType: string;
  description: string;
  suggestedAction: string;
}

export interface InvariantValidationResult {
  isValid: boolean;
  violatedInvariants: InvariantViolation[];
}

export interface InvariantViolation {
  invariantName: string;
  description: string;
  currentValue: any;
  expectedValue: any;
  severity: 'warning' | 'error' | 'critical';
}

// ===== ERROR RECOVERY STRATEGY =====

export interface ErrorRecoveryStrategy {
  attemptAutoRecovery(error: SystemError): Promise<RecoveryResult>;
  rollbackToCheckpoint(checkpointId: string): Promise<RollbackResult>;
  resetSystem(systemName: string): Promise<ResetResult>;
  isolateSystem(systemName: string): Promise<IsolationResult>;
  createCheckpoint(description: string): Promise<CheckpointResult>;
}

export interface RollbackResult {
  success: boolean;
  checkpointId: string;
  rollbackTime: number;
  systemsReset: string[];
  dataLoss: boolean;
}

export interface ResetResult {
  success: boolean;
  systemName: string;
  resetTime: number;
  backupCreated: boolean;
  dependentSystemsAffected: string[];
}

export interface IsolationResult {
  success: boolean;
  systemName: string;
  isolationTime: number;
  alternativeHandlers: string[];
  impactAssessment: string[];
}

export interface CheckpointResult {
  success: boolean;
  checkpointId: string;
  creationTime: number;
  dataSize: number;
  includedSystems: string[];
}

// ===== SYSTEM INTERACTION COORDINATOR =====

export interface SystemInteractionCoordinator {
  processDataRequest(request: SystemDataRequest): Promise<SystemDataResponse>;
  propagateEvent(event: SystemEvent): Promise<EventProcessingResult>;
  coordinateStateUpdate(update: StateUpdateRequest): Promise<StateUpdateResult>;
  handleSystemError(error: SystemError): Promise<RecoveryResult>;
  validateInteractionProtocols(): Promise<ProtocolValidationResult>;
}

export interface ProtocolValidationResult {
  isValid: boolean;
  protocolErrors: ProtocolError[];
  performanceMetrics: ProtocolPerformanceMetrics;
  recommendations: string[];
}

export interface ProtocolError {
  protocolType: 'data_request' | 'event_propagation' | 'state_consistency' | 'error_recovery';
  errorType: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  suggestedFix: string;
}

export interface ProtocolPerformanceMetrics {
  averageRequestTime: number;
  eventThroughput: number;
  stateUpdateLatency: number;
  errorRecoveryTime: number;
  systemAvailability: number;
}

// ===== PROTOCOL CONFIGURATION =====

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

export const DEFAULT_PROTOCOL_CONFIG: InteractionProtocolConfig = {
  // Request handling
  defaultRequestTimeout: 5000, // 5 seconds
  maxConcurrentRequests: 100,
  enableRequestCaching: true,
  cacheExpirationTime: 60000, // 1 minute

  // Event processing
  eventProcessingTimeout: 10000, // 10 seconds
  maxEventQueueSize: 1000,
  enableEventPersistence: false,
  eventRetryAttempts: 3,

  // State consistency
  enableStrictConsistency: true,
  consistencyCheckInterval: 30000, // 30 seconds
  maxRollbackDepth: 10,
  autoRecoveryEnabled: true,

  // Error handling
  errorRecoveryMode: 'lenient',
  maxRecoveryAttempts: 3,
  systemIsolationThreshold: 5, // 5 consecutive errors
  checkpointInterval: 300000 // 5 minutes
};

// ===== UTILITY FUNCTIONS =====

export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function generateUpdateId(): string {
  return `upd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function generateErrorId(): string {
  return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function createSystemError(
  type: SystemErrorType,
  severity: SystemError['severity'],
  sourceSystem: string,
  message: string,
  details: Record<string, any> = {},
  affectedSystems: string[] = []
): SystemError {
  return {
    errorId: generateErrorId(),
    errorType: type,
    severity,
    sourceSystem,
    affectedSystems,
    message,
    details,
    timestamp: Date.now()
  };
}

export function createDataRequest(
  sourceSystem: string,
  targetSystem: string,
  operation: string,
  parameters: Record<string, any>,
  requestType: SystemDataRequestType = 'query',
  priority: SystemDataRequest['priority'] = 'normal'
): SystemDataRequest {
  return {
    requestId: generateRequestId(),
    requestType,
    sourceSystem,
    targetSystem,
    operation,
    parameters,
    timestamp: Date.now(),
    priority
  };
}

export function createSystemEvent(
  sourceSystem: string,
  eventType: SystemEventType,
  eventData: any,
  targetSystems?: string[],
  priority: SystemEvent['priority'] = 'normal'
): SystemEvent {
  return {
    eventId: generateEventId(),
    eventType,
    sourceSystem,
    targetSystems,
    eventData,
    timestamp: Date.now(),
    priority
  };
}
