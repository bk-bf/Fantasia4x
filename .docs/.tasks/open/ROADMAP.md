<!-- LOC cap: 300 (created: 2026-05-25) -->

# ROADMAP

> **Related:** [game/DESIGN](../game/DESIGN.md) · [game/ARCHITECTURE](../game/ARCHITECTURE.md) · [TRAITS](TRAITS.md) · [CREATURE-COMBAT-OVERHAUL](CREATURE-COMBAT-OVERHAUL.md) · [KINGDOMS-TRADE](KINGDOMS-TRADE.md) · [RACE-SYSTEM](RACE-SYSTEM.md) · [SOCIAL-LAYER](SOCIAL-LAYER.md) · [PRODUCTION-CHAIN-III-TAILS](PRODUCTION-CHAIN-III-TAILS.md) · [STEALTH](STEALTH.md) · [DRAFTED-JOB-ORDERS](DRAFTED-JOB-ORDERS.md) · [ANIMAL-HUSBANDRY](ANIMAL-HUSBANDRY.md) · [RESEARCH-ENHANCEMENT](RESEARCH-ENHANCEMENT.md)

Phase 1 (foundation), Phase 2 (core loop), Phase 4 (distribution), and most of Phase 3 are **done** —
combat, entity spawning A–B, the production chains, equipment, living world, ranged combat, traits/lineages,
race Phase 0, and the Electron build all shipped. Full specs live in `.tasks/archive/`. What remains is the
sequence below, in the owner's priority order (set 2026-07-10), heading to the itch.io alpha.

## Remaining work — priority order

`[ ]` not started · `[-]` in progress · `[~]` deferred

| # | Item | Spec | Status / note |
|---|------|------|----------------|
| 1 | **Finish Traits** (Phase 2 hooks) | [TRAITS](TRAITS.md) | `[ ]` age + `evolvesTo` evolution audited **live**; only small refinements/hooks left |
| 2 | **Creature Combat Overhaul** | [CREATURE-COMBAT-OVERHAUL](CREATURE-COMBAT-OVERHAUL.md) | `[ ]` armour-binary fix → elite ladder + gear drops → lair evolution (+ §4 traps/turrets & famed boss-drop) |
| 3 | **Kingdoms & Trade** | [KINGDOMS-TRADE](KINGDOMS-TRADE.md) | `[ ]` = RACE-SYSTEM Phase 2; the code `faction`→`kingdom` rename is part of this item |
| 4 | **Finish Race → Culture System** | [RACE-SYSTEM](RACE-SYSTEM.md) | `[ ]` Ph0 done; rename `Race`→`Culture` across code/UI; Ph1 wiring waits on #5 |
| 5 | **Social Layer** | [SOCIAL-LAYER](SOCIAL-LAYER.md) | `[ ]` relationships/family/conversation/mood; unblocks RACE Ph1 + prestige/trade |
| 6 | **Rest from Production Chain III** | [PRODUCTION-CHAIN-III-TAILS](PRODUCTION-CHAIN-III-TAILS.md) | `[ ]` §G drink-use action + §I famed craft-stamp/display |
| 7 | **Stealth** | [STEALTH](STEALTH.md) | `[ ]` design locked; needs an encounter balance re-pass |
| 8 | **Drafted Job/Need Orders** | [DRAFTED-JOB-ORDERS](DRAFTED-JOB-ORDERS.md) | `[ ]` design locked; small, self-contained |
| 9 | **Rest from Entity Spawning** | [ANIMAL-HUSBANDRY](ANIMAL-HUSBANDRY.md) | `[ ]` taming → husbandry → mounts → animal hauling |
| 10 | **Magic III** | _unspecced_ | `[~]` future; the magic depth-layer is already met by the shipped [LINEAGES](../archive/LINEAGES-2026-07-09.md) + [LINEAGES-II](../archive/LINEAGES-II-2026-07-10.md) — no spec written or planned yet |
| 11 | **Research Enhancement** | [RESEARCH-ENHANCEMENT](RESEARCH-ENHANCEMENT.md) | `[~]` **deferred — not for now; always last** |

Loose ends with no dedicated spec (do opportunistically): building-work bonus stacking, and AI event
generation on the migrant-wave `pendingEvent` seam.
