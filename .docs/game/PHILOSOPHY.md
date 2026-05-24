<!-- LOC cap: 100 (created: 2026-05-25) -->

# PHILOSOPHY [GAME]

> **Related:** [ARCHITECTURE](ARCHITECTURE.md) · [DECISIONS](DECISIONS.md)

## Project Thesis

Mechanics-first, beginner-friendly colony simulation where every playthrough feels different from turn 1 through procedural generation. Built iteratively — solid gameplay systems before visual polish.

## Principles

1. **Readability over cleverness** — code should tell a clear story to any developer
2. **Simple solutions first** — choose the simplest approach that solves the problem; refactor when complexity is earned
3. **Iterative improvement** — start simple, add abstraction only when the need is real and recurring
4. **Avoid overengineering** — no enterprise patterns (service registries, result monads, DI containers) unless a concrete problem demands them
5. **Existing systems first** — always integrate with `ModifierSystem`, `PawnEquipment`, etc. rather than duplicating logic
6. **Component size discipline** — components under 200 lines, functions under 30 lines; extract when exceeded
7. **Performance last** — optimise only when a measured problem exists

## What We Avoid

- Complex service layers with `ServiceResult<T>` wrappers for operations that cannot fail
- Dependency injection containers
- Abstract factories for objects that have one concrete implementation
- Defensive null checks inside pure game-logic functions (validate at system boundaries only)
