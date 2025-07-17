# Implementation Plan

- [x] 1. Create PawnOverview component
  - Extract basic pawn info display (name, height, weight, size) from PawnScreen
  - Move mood and health status display with existing color formatting
  - Import utility functions from pawnUtils.ts for formatting
  - _Requirements: 1.1, 1.2, 2.1_

- [x] 2. Create PawnStats component
  - Extract individual statistics display (strength, dexterity, etc.) from PawnScreen
  - Move stat bars and color coding logic
  - Use existing stat formatting utilities from pawnUtils.ts
  - _Requirements: 1.1, 1.2, 2.1_

- [x] 3. Create PawnNeeds component
  - Extract hunger, fatigue, and sleep level displays from PawnScreen
  - Move current activities section (working, sleeping, eating)
  - Use existing need formatting utilities from pawnUtils.ts
  - _Requirements: 1.1, 1.2, 2.1_

- [x] 4. Create PawnTraits component
  - Extract racial traits display section from PawnScreen
  - Move trait effects and descriptions display
  - Use existing trait utilities and getTraitIcon function
  - _Requirements: 1.1, 1.2, 2.1_

- [x] 5. Create PawnAbilities component
  - Extract complex ability calculations (work efficiency, combat, survival, etc.) from PawnScreen
  - Move breakdown display toggles and modifier result formatting
  - Use existing ModifierSystem for all calculations without changes
  - _Requirements: 1.1, 3.1, 3.2_

- [x] 6. Create PawnEquipment component
  - Extract equipment management functions (equip/unequip/use items) from PawnScreen
  - Move equipment loading states and error handling
  - Use existing PawnEquipment functions without modification
  - _Requirements: 1.1, 3.3, 3.4_

- [x] 7. Update main PawnScreen component
  - Import all extracted components (PawnOverview, PawnStats, etc.)
  - Replace large sections with component usage
  - Keep only pawn selection logic and navigation in main component
  - _Requirements: 1.1, 1.3, 1.4_

---

- [ ] 8. Add simple error handling to components
  - Add fallback displays for missing pawn data in each component
  - Implement basic try-catch blocks for calculation functions
  - Show simple error messages instead of crashing
  - _Requirements: 5.1, 5.2, 5.4_

- [ ] 9. Test each extracted component individually
  - Write unit tests for PawnOverview component with mock pawn data
  - Test PawnStats component displays all statistics correctly
  - Verify PawnNeeds component shows hunger, fatigue, and sleep properly
  - _Requirements: 1.1, 1.2, 4.1_

- [ ] 10. Test PawnTraits and PawnAbilities components
  - Verify PawnTraits component displays racial traits with effects
  - Test PawnAbilities component shows all ability categories correctly
  - Ensure breakdown toggles work properly in PawnAbilities
  - _Requirements: 1.1, 3.1, 4.2_

- [ ] 11. Test PawnEquipment component functionality
  - Verify equipment operations (equip/unequip/use items) work correctly
  - Test loading states during equipment changes
  - Ensure error handling works for failed equipment operations
  - _Requirements: 3.3, 3.4, 5.3_

- [ ] 12. Integration testing of refactored PawnScreen
  - Test that all components work together in the main PawnScreen
  - Verify pawn selection updates all sub-components correctly
  - Ensure navigation and scrolling still work as expected
  - _Requirements: 4.3, 4.4, 4.5_

- [ ] 13. Performance verification
  - Measure that component is reduced from 2300+ to under 200 lines
  - Verify that each sub-component is under 150 lines
  - Test that rendering performance is maintained or improved
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 14. Final functionality verification
  - Test all existing PawnScreen features work exactly the same
  - Verify stat displays, ability breakdowns, and equipment management unchanged
  - Ensure user experience is identical to before refactoring
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 15. Code cleanup and documentation
  - Remove unused imports and dead code from all components
  - Add simple JSDoc comments to component props
  - Update any component documentation to reflect new structure
  - _Requirements: 1.4, 2.2_