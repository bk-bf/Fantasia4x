# Requirements Document

## Introduction

The PawnScreen.svelte component is currently a massive 2300+ line file that mixes UI presentation with business logic. This refactoring will break it down into smaller, focused components following the simple approach demonstrated in the refactoring guide. The goal is readability and maintainability, not enterprise complexity.

## Requirements

### Requirement 1

**User Story:** As a developer, I want the PawnScreen component broken into smaller, focused components, so that the code is easier to read and maintain.

#### Acceptance Criteria

1. WHEN viewing the component structure THEN it SHALL be split into logical sections (Overview, Stats, Needs, Traits, Abilities, Equipment)
2. WHEN reading each component THEN it SHALL be under 200 lines and focus on a single responsibility
3. WHEN making changes THEN I SHALL be able to work on one section without affecting others
4. WHEN debugging issues THEN I SHALL be able to quickly locate the relevant component

### Requirement 2

**User Story:** As a developer, I want to extract utility functions to shared modules, so that code is reusable and components stay focused on presentation.

#### Acceptance Criteria

1. WHEN components need formatting functions THEN they SHALL import from `$lib/utils/pawnUtils`
2. WHEN multiple components need the same logic THEN it SHALL be extracted to a shared utility
3. WHEN reading component code THEN utility functions SHALL not clutter the main component logic
4. WHEN testing utilities THEN they SHALL be testable independently of components

### Requirement 3

**User Story:** As a developer, I want each component to use existing systems properly, so that we leverage the ModifierSystem and other established patterns.

#### Acceptance Criteria

1. WHEN components need modifier calculations THEN they SHALL use the existing ModifierSystem
2. WHEN components need equipment operations THEN they SHALL use existing PawnEquipment functions
3. WHEN components access game data THEN they SHALL use established patterns from other components
4. WHEN adding new functionality THEN it SHALL integrate with existing systems rather than duplicate logic

### Requirement 4

**User Story:** As a user, I want all current PawnScreen functionality to work exactly the same after refactoring, so that no features are lost.

#### Acceptance Criteria

1. WHEN I view pawn statistics THEN I SHALL see all current displays with proper formatting and colors
2. WHEN I view pawn abilities THEN I SHALL see all work efficiency and other ability breakdowns
3. WHEN I manage pawn equipment THEN I SHALL be able to equip, unequip, and use items as before
4. WHEN I navigate between pawns THEN I SHALL see the same smooth experience
5. WHEN I view pawn traits THEN I SHALL see all racial traits with their effects

### Requirement 5

**User Story:** As a developer, I want the refactored components to handle errors gracefully, so that the UI doesn't crash when data is missing.

#### Acceptance Criteria

1. WHEN pawn data is missing THEN components SHALL show fallback content instead of crashing
2. WHEN calculations fail THEN components SHALL show default values with clear indicators
3. WHEN equipment operations fail THEN the UI SHALL provide clear feedback to the user
4. WHEN unexpected errors occur THEN components SHALL log errors and continue functioning