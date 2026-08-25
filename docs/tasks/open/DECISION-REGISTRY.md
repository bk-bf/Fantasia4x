<!-- LOC cap: 300 (created: 2026-08-25) -->

# DECISION REGISTRY — make a claim about the code fail when it stops being true

> **Related:** [DECISIONS](../../game/DECISIONS.md) · [BUGS](../../game/BUGS.md) · [issues/README](../../issues/README.md) · [tools/audit](../../../tools/audit/README.md)

## The problem, measured

`DECISIONS.md` has drifted from **itself**: 34 ADRs in the body, three of them
(**031, 032, 034**) missing from the index in the same file. A cross-reference that cannot
survive inside one document will not survive between a document and a codebase.

Against the code, on 2026-08-25:

| | |
|---|---|
| ADRs declared | 34 |
| encoded as a deterministic seam | 4 |
| carrying a T2 audit rule | 7 |
| named by at least one test | 10 |
| **claimed by nothing at all** | **21** |
| `BUGS.md` entries | 22, every one `[FIXED]` |
| entries whose subject no test names (`opp-hunt`, `reserved-drop`, `_terrainRev`) | at least 3 |
| test files citing an ADR or a bug | 26 of 206, one direction only, by convention |

Drift is not the document going stale. It is that **nothing fails when it does**. The claim
and its check live in different files and the link between them is a string in prose, which
no machine can evaluate, so the only detector is a person happening to notice.

## What is actually encodable

An ADR has three parts and one of them is checkable. **Context** is why, **Consequences** is
what it cost, **Decision** is the constraint. Encoding "the ADR" fails because two thirds of
it is irreducibly prose. Extract the constraint; leave the prose as commentary that is
explicitly not authoritative.

Then invert the direction. Today the document is authored and the code is expected to match.
Instead **the code declares and the document is generated**, because a generated file cannot
drift from its source, and a stale one fails the build.

## Three encodings

| Claim shape | Encoding | Now |
|---|---|---|
| A prohibition naming a symbol — "`X` is reachable only from `Y`" | an entry in `tools/audit/seams.jsonc`, checked by `audit t0` against the AST spans the ledger already builds | 4 of ~8 candidates |
| A stated number — a cap, a threshold, a budget | one exported const; the document quotes it **by generation**, never by copy | 7 ADRs state one |
| A behavioural invariant, and every `BUGS.md` entry | a test whose filename carries the id | 10 ADRs, and 3+ bugs have none |

`BUGS.md` is not a tracker — all 22 entries are `[FIXED]`, which makes it a **regression
register**. The drift-proof form of "this is fixed" is a test that fails when it comes back.

## The enforcement primitive

All of the above only holds if the link is machine-resolvable, so **the id becomes a symbol
the runner resolves, not a string in prose**:

```
src/tests/regressions/BUG-014-sated-predator-oscillation.test.ts
tools/audit/seams.jsonc            → { "adr": "ADR-014", … }
src/lib/game/core/limits.ts        → export const BLOCK_CAP = 0.65;  // claims ADR-012
```

A single registry test asserts the mapping is **total in both directions**: every declared id
has at least one claimant, and every claimant names a declared id. That second direction is
what catches a test still citing an ADR that was superseded a month ago.

## Acceptance criteria

- [ ] `src/tests/meta/registry.test.ts` parses every id declared in `DECISIONS.md` and `BUGS.md`.
- [ ] It collects claimants from three sources: `seams.jsonc` `adr` fields, test filenames under `src/tests/regressions/`, and an `id` field on constant declarations.
- [ ] It fails when a claimant names an id that is not declared.
- [ ] It fails when a declared id has no claimant **and** no `unchecked:` reason.
- [ ] It fails when the count of `unchecked:` ids **rises**. Never on the current count.
- [ ] `DECISIONS.md` and `BUGS.md` are generated from their declaration sites; CI regenerates and fails on a diff.
- [ ] A `BUGS.md` entry marked fixed with no regression test is a build failure.
- [ ] A failing regression test renders its entry `[OPEN]` in the generated file, so `[FIXED]` cannot be asserted by hand.
- [ ] `audit t0`'s `adr-coverage` counts seam-covered ADRs as covered (today it reads only T2 rules, so ADR-026 and ADR-034 report as gaps while being checked deterministically).
- [ ] The three ADRs missing from the index (031, 032, 034) stop being possible, because the index is generated.

## Adoption

Backfilling 21 ADRs at once is how this dies. Land the registry test first with every
unclaimed id marked `unchecked:` and a reason — the same acknowledgement the old graph config
demanded. It then enforces one thing: **the unchecked count never rises.** New decisions are
born checkable or say plainly why they cannot be.

## What this cannot do

It cannot make prose true. Context and Consequences will still age; the win is that they stop
*looking* authoritative once the constraint beside them is executable. Two of the 34 ADRs name
no symbol and state no prohibition, and will never be more than `unchecked` with a reason —
recording that honestly is the point, not a shortfall.

It does not cover `.claude/rules`. One of that file's two rules ("never render internal
identifiers in player-facing UI") is already audit rule B01 with an open issue, and should
become that rule rather than prose. The other is about agent behaviour and belongs in
`AGENTS.md`.

## Out of scope

Rewriting the existing 22 bug entries as tests in one pass, and authoring seams for all 8
prohibition-shaped ADRs. Both are the ratchet's job, one at a time, and neither blocks the
registry test — which is worth landing alone, because it reports the true size of the gap
without changing anything.
