# Implementation Plan

> **Phase 1 – Critical Importance (WorkScreen Priority):**  
> The following tasks focus on WorkScreen refactoring first since it's needed for healthcare/cooking jobs. Complete these items before proceeding to other screens.

- [ ] 1. Create PopulationOverview component for WorkScreen
  - Extract worker cards display with stats and current job indicators from WorkScreen
  - Move RimWorld-style job queue visualization for each pawn
  - Implement pawn selection handling for detailed work management
  - Import and use existing pawn utilities for stat display formatting
  - _Requirements: 1.1, 1.2, 4.1, 5.1_

- [ ] 2. Create WorkPriorities component for WorkScreen
  - Extract individual pawn work priority management from WorkScreen
  - Move work efficiency calculations and harvest predictions display
  - Implement priority adjustment logic with duplicate priority conflict detection
  - Use WorkService for all efficiency and harvest calculations
  - _Requirements: 1.1, 1.2, 5.1, 5.2_

- [ ] 3. Create JobQueue component for WorkScreen
  - Extract RimWorld-style job cycling visualization from WorkScreen
  - Move job cycling timer logic and current job progression display
  - Implement job queue order display with active job highlighting
  - Use existing work category data and color schemes
  - _Requirements: 1.1, 1.2, 5.1_

- [ ] 4. Create ProductionManagement component for WorkScreen
  - Extract location-based production targets and worker assignments from WorkScreen
  - Move resource allocation percentage management
  - Implement worker assignment display per location and work type
  - Use LocationService for all location data and calculations
  - _Requirements: 1.1, 1.2, 5.3_

- [ ] 5. Update main WorkScreen component
  - Import all extracted work components (PopulationOverview, WorkPriorities, etc.)
  - Replace large sections with component usage and prop passing
  - Keep only main navigation, state management, and event coordination
  - Ensure all existing WorkScreen functionality is preserved
  - _Requirements: 1.1, 1.3, 1.4, 6.1_

> **Phase 2 – High Importance (ExplorationScreen):**  
> These tasks refactor the ExplorationScreen to improve exploration feature maintainability.

- [ ] 6. Create DiscoveredLocations component for ExplorationScreen
  - Extract known locations display with resource information from ExplorationScreen
  - Move resource richness calculations and availability data display
  - Implement location-specific work bonuses visualization
  - Use LocationService for all resource calculations and data
  - _Requirements: 2.1, 2.2, 4.1, 5.3_

- [ ] 7. Create ActiveMissions component for ExplorationScreen
  - Extract expeditions in progress display from ExplorationScreen
  - Move mission progress tracking with cancel/recall options
  - Implement mission recall logic with partial supply refunds
  - Use CurrentTask component for consistent progress display UI
  - _Requirements: 2.1, 2.2, 5.1_

- [ ] 8. Create AvailableExplorations component for ExplorationScreen
  - Extract available exploration opportunities list from ExplorationScreen
  - Move mission requirements checking and success chance display
  - Implement mission launch logic with resource validation
  - Use existing requirement checking patterns from other screens
  - _Requirements: 2.1, 2.2, 5.1, 5.2_

- [ ] 9. Update main ExplorationScreen component
  - Import all extracted exploration components (DiscoveredLocations, ActiveMissions, etc.)
  - Replace large sections with component usage and prop passing
  - Keep only main navigation, state management, and event coordination
  - Ensure all existing ExplorationScreen functionality is preserved
  - _Requirements: 2.1, 2.3, 2.4, 6.2_

> **Phase 3 – Medium Importance (CraftingScreen):**  
> These tasks refactor the CraftingScreen to improve crafting feature maintainability.

- [ ] 10. Create CraftingFilters component for CraftingScreen
  - Extract item type and category filtering from CraftingScreen
  - Move filter buttons with icons, counts, and state management
  - Implement filter change handling with proper state updates
  - Use existing item categorization and type systems
  - _Requirements: 3.1, 3.2, 4.1, 5.2_

- [ ] 11. Create CurrentInventory component for CraftingScreen
  - Extract crafted items display with rarity indicators from CraftingScreen
  - Move item details, quantities, and durability information display
  - Implement inventory item formatting with proper rarity colors
  - Use ItemService for all item data and display formatting
  - _Requirements: 3.1, 3.2, 4.1, 5.2_

- [ ] 12. Create CraftingQueue component for CraftingScreen
  - Extract items currently being crafted display from CraftingScreen
  - Move crafting progress tracking with cancel options
  - Implement queue management and material refund logic
  - Use CurrentTask component for consistent progress display UI
  - _Requirements: 3.1, 3.2, 5.1, 5.2_

- [ ] 13. Create AvailableRecipes component for CraftingScreen
  - Extract craftable items grid with requirements from CraftingScreen
  - Move crafting cost validation and special properties display
  - Implement crafting initiation logic with resource validation
  - Use existing crafting cost calculations and item requirements
  - _Requirements: 3.1, 3.2, 5.1, 5.2_

- [ ] 14. Update main CraftingScreen component
  - Import all extracted crafting components (CraftingFilters, CurrentInventory, etc.)
  - Replace large sections with component usage and prop passing
  - Keep only main navigation, state management, and event coordination
  - Ensure all existing CraftingScreen functionality is preserved
  - _Requirements: 3.1, 3.3, 3.4, 6.3_

> **Phase 4 – Testing and Validation:**  
> These tasks ensure the refactored screens work correctly and maintain all functionality.

- [ ] 15. Add simple error handling to all screen components
  - Add fallback displays for missing data in each extracted component
  - Implement basic try-catch blocks for service function calls
  - Show simple error messages instead of crashing when operations fail
  - Log errors appropriately while allowing components to continue functioning
  - _Requirements: 7.1, 7.2, 7.4_

- [ ] 16. Test WorkScreen components individually
  - Write unit tests for PopulationOverview component with mock pawn data
  - Test WorkPriorities component work assignment and efficiency calculations
  - Verify JobQueue component displays job cycling correctly
  - Test ProductionManagement component location and resource handling
  - _Requirements: 1.1, 1.2, 6.1_

- [ ] 17. Test ExplorationScreen components individually
  - Write unit tests for DiscoveredLocations component with mock location data
  - Test ActiveMissions component mission progress and recall functionality
  - Verify AvailableExplorations component mission launch and requirements
  - Test integration between exploration components
  - _Requirements: 2.1, 2.2, 6.2_

- [ ] 18. Test CraftingScreen components individually
  - Write unit tests for CraftingFilters component filter state management
  - Test CurrentInventory component item display and formatting
  - Verify CraftingQueue component queue management and cancellation
  - Test AvailableRecipes component crafting validation and initiation
  - _Requirements: 3.1, 3.2, 6.3_

- [ ] 19. Integration testing of all refactored screens
  - Test that all screen components work together correctly
  - Verify state updates propagate properly between parent and child components
  - Ensure navigation and user interactions work as expected
  - Test error scenarios and edge cases across all screens
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 20. Performance verification and cleanup
  - Measure that WorkScreen is reduced from 1,313 to under 200 lines
  - Verify ExplorationScreen is reduced from 974 to under 200 lines
  - Confirm CraftingScreen is reduced from 950 to under 200 lines
  - Ensure each sub-component is under 200 lines
  - Remove unused imports and dead code from all components
  - _Requirements: 1.1, 2.1, 3.1, 4.2_

- [ ] 21. Final functionality verification
  - Test all existing screen features work exactly the same as before refactoring
  - Verify work assignment, exploration missions, and crafting behave identically
  - Ensure user experience is unchanged from the user's perspective
  - Confirm healthcare and cooking jobs can now be easily added to WorkScreen
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 22. Code cleanup and documentation
  - Add simple JSDoc comments to component props and main functions
  - Update any component documentation to reflect new structure
  - Ensure consistent code style across all extracted components
  - Document the new component directory structure for future developers
  - _Requirements: 4.2, 4.3_