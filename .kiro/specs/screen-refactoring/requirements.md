# Requirements Document

## Introduction

The screen components in Fantasia4x have grown into massive, monolithic files that are difficult to maintain and extend. WorkScreen.svelte (1,313 lines), ExplorationScreen.svelte (974 lines), and CraftingScreen.svelte (950 lines) are the most critical offenders. This refactoring will break them down into smaller, focused components following the successful pattern established in the pawn-screen-refactoring spec.

## Requirements

### Requirement 1

**User Story:** As a developer, I want the WorkScreen component broken into smaller, focused components, so that I can easily add healthcare and cooking jobs without navigating a massive file.

#### Acceptance Criteria

1. WHEN viewing the WorkScreen structure THEN it SHALL be split into logical sections (Population Overview, Work Priorities, Job Queue, Production Management)
2. WHEN reading each component THEN it SHALL be under 200 lines and focus on a single responsibility
3. WHEN adding new work types THEN I SHALL be able to work on one section without affecting others
4. WHEN debugging work assignment issues THEN I SHALL be able to quickly locate the relevant component

### Requirement 2

**User Story:** As a developer, I want the ExplorationScreen component broken into smaller, focused components, so that exploration features are easier to maintain and extend.

#### Acceptance Criteria

1. WHEN viewing the ExplorationScreen structure THEN it SHALL be split into logical sections (Discovered Locations, Active Missions, Available Explorations)
2. WHEN reading each component THEN it SHALL be under 200 lines and focus on a single responsibility
3. WHEN adding new exploration types THEN I SHALL be able to work on one section without affecting others
4. WHEN debugging exploration mechanics THEN I SHALL be able to quickly locate the relevant component

### Requirement 3

**User Story:** As a developer, I want the CraftingScreen component broken into smaller, focused components, so that crafting features are easier to maintain and extend.

#### Acceptance Criteria

1. WHEN viewing the CraftingScreen structure THEN it SHALL be split into logical sections (Crafting Filters, Current Inventory, Crafting Queue, Available Recipes)
2. WHEN reading each component THEN it SHALL be under 200 lines and focus on a single responsibility
3. WHEN adding new crafting categories THEN I SHALL be able to work on one section without affecting others
4. WHEN debugging crafting mechanics THEN I SHALL be able to quickly locate the relevant component

### Requirement 4

**User Story:** As a developer, I want to extract utility functions to shared modules, so that code is reusable and components stay focused on presentation.

#### Acceptance Criteria

1. WHEN components need formatting functions THEN they SHALL import from appropriate utility modules
2. WHEN multiple components need the same logic THEN it SHALL be extracted to a shared utility
3. WHEN reading component code THEN utility functions SHALL not clutter the main component logic
4. WHEN testing utilities THEN they SHALL be testable independently of components

### Requirement 5

**User Story:** As a developer, I want each component to use existing systems properly, so that we leverage established patterns and services.

#### Acceptance Criteria

1. WHEN components need work calculations THEN they SHALL use the existing WorkService
2. WHEN components need item operations THEN they SHALL use existing ItemService functions
3. WHEN components need location data THEN they SHALL use existing LocationService functions
4. WHEN components access game data THEN they SHALL use established patterns from other components

### Requirement 6

**User Story:** As a user, I want all current screen functionality to work exactly the same after refactoring, so that no features are lost.

#### Acceptance Criteria

1. WHEN I use work assignment features THEN I SHALL see all current displays with proper formatting and functionality
2. WHEN I manage exploration missions THEN I SHALL be able to launch, monitor, and cancel expeditions as before
3. WHEN I use crafting features THEN I SHALL be able to filter, queue, and craft items as before
4. WHEN I navigate between screens THEN I SHALL see the same smooth experience
5. WHEN I interact with any screen feature THEN it SHALL behave identically to before refactoring

### Requirement 7

**User Story:** As a developer, I want the refactored components to handle errors gracefully, so that the UI doesn't crash when data is missing.

#### Acceptance Criteria

1. WHEN screen data is missing THEN components SHALL show fallback content instead of crashing
2. WHEN calculations fail THEN components SHALL show default values with clear indicators
3. WHEN service operations fail THEN the UI SHALL provide clear feedback to the user
4. WHEN unexpected errors occur THEN components SHALL log errors and continue functioning