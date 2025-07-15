/**
 * Service Layer Index - Clean Architecture Implementation
 * 
 * This module exports all service interfaces and implementations,
 * providing a clean separation between business logic and data definitions.
 */

// Service Interfaces
export type { ItemService } from './ItemService';
export type { BuildingService } from './BuildingService';
export type { WorkService } from './WorkService';
export type { ResearchService } from './ResearchService';

// Service Implementations
export { ItemServiceImpl, itemService } from './ItemService';
export { BuildingServiceImpl, buildingService } from './BuildingService';
export { WorkServiceImpl, workService } from './WorkService';
export { ResearchServiceImpl, researchService } from './ResearchService';

// Import types for registry
import type { ItemService } from './ItemService';
import type { BuildingService } from './BuildingService';
import type { WorkService } from './WorkService';
import type { ResearchService } from './ResearchService';

/**
 * Service Registry - Central access point for all services
 */
export interface ServiceRegistry {
  itemService: ItemService;
  buildingService: BuildingService;
  workService: WorkService;
  researchService: ResearchService;
}

/**
 * Default service registry with singleton instances
 */
export const serviceRegistry: ServiceRegistry = {
  itemService,
  buildingService,
  workService,
  researchService
};

/**
 * Service Layer Benefits:
 * 
 * 1. Clean Separation: Business logic separated from data definitions
 * 2. Testability: Each service can be unit tested independently
 * 3. Consistency: Unified interfaces for similar operations
 * 4. Maintainability: Changes to business logic don't affect data files
 * 5. Extensibility: Easy to add new services or modify existing ones
 * 6. Type Safety: Full TypeScript support with proper interfaces
 */