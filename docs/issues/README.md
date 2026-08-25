<!-- LOC cap: 200 (created: 2026-08-25) -->

# Issues

> **Related:** [tasks/open/ROADMAP](../tasks/open/ROADMAP.md) · [game/DECISIONS](../game/DECISIONS.md) · [tools/audit](../../tools/audit/README.md) · [AUDIT (archived)](../tasks/archive/AUDIT-2026-08-25.md)

The board the nightly audit writes to and the fixer works from. One file per issue, flat.

**These files are canonical; the GitHub issue is a projection of one.** The mapping is the
`github:` field, written back when the issue is raised. Keeping the truth in the repo means
an issue survives without a network, is reviewed in the same PR as the code, and cannot
drift from what the code says — which is the failure this whole board exists to catch.

## Lifecycle

```
audit finds it  ──▶  docs/issues/<slug>.md        status: open   ready: false
                          │
                    you read it, decide it is worth doing
                          │
                          ▼                        ready: true
                     audit publish  ──▶  GitHub issue          github: 42
                          │
                     the fixer takes it  ──▶  worktree ──▶ PR   status: in-review  pr: 51
                          │
                     you merge                                  status: closed
```

`ready: false` is the gate. Nothing the audit raises is worked on until a person flips it —
the fixer never picks up an issue it wrote itself.

Every fix attempt lands in `mon` under the **`fix`** tag, so it can be read and replied to
from anywhere. An attempt that could not get green keeps its worktree and the session runs
inside it, which means `mon steer` carries that same attempt forward instead of restarting.

## Frontmatter

Every field the loop reads. Anything else is prose.

```yaml
---
id: core-stat-single-source     # == the filename slug; stable, never renamed
title: Core stats are re-declared by hand in ten places
status: open                    # open | in-progress | in-review | closed
kind: drift                     # drift | correctness | performance | boundary | data | test-gap
severity: high                  # critical | high | medium | low
ready: false                    # true = the fixer may take it. Only a person sets this.
origin: human                   # human | audit
rules: [S01, S02]               # audit rule ids that raised it; empty when origin is human
files:                          # blast radius, and what the fixer is scoped to
  - src/lib/game/core/types/culture.ts
symbols:                        # ledger keys, so a re-audit can tell this issue is stale
  - src/lib/game/core/Culture.ts::STATS#0
github: 42                      # issue number, written by `audit publish`
branch: fix/core-stat-single-source   # written by the fixer
pr: 51                          # written by the fixer
created: 2026-08-24
updated: 2026-08-25
---
```

`status` and `ready` are separate on purpose: an issue can be worth recording and not worth
doing yet, and conflating them means the only way to park something is to close it.

## Body template

Five sections, in this order. The template is
[`_TEMPLATE.md`](_TEMPLATE.md); `audit issues` fills it in.

| Section | Holds |
|---|---|
| `## What breaks` | The concrete failure in one paragraph — what goes wrong, for whom, when. Not the abstraction. |
| `## Evidence` | `file:line` citations, one per claim. A line with no citation does not belong here. |
| `## Why nothing caught it` | Which tier should have — a type, a lint rule, a test, the headless sim — and why it did not. This is what stops the same class recurring. |
| `## Remediation` | GitHub task-list checkboxes, in the order they should be done. The fixer works the whole list in one PR, so the list is the PR's scope. |
| `## Out of scope` | What is deliberately not being fixed, and why. Without it the fixer expands until something breaks. |

Two rules the template enforces, both from [AGENTS.md](../../AGENTS.md):

- **Cite or cut.** Every factual claim carries a `file:line`. An issue whose evidence cannot
  be checked is a rumour, and the fixer will act on it anyway.
- **Say what breaks, not what it cost.** No narration about how it was found or how long it
  took. The failure, the evidence, the fix.

## Severity

| | |
|---|---|
| `critical` | The game is wrong for the player right now — bad numbers, a stall, lost state. |
| `high` | Silently wrong under a condition that occurs in normal play, or a contract nothing checks. |
| `medium` | Wrong only in a case that has not happened yet, or noise that hides real signal. |
| `low` | Cosmetic, or a cleanup with no behavioural consequence. |

Severity is about the player, never about how annoying the code is to read.

## Commands

```bash
node tools/audit/audit.mjs issues            # findings -> issue files (origin: audit)
node tools/audit/audit.mjs issues --dry-run  # what it would write
node tools/audit/audit.mjs publish           # unpublished + ready issues -> GitHub
node tools/audit/audit.mjs board             # every issue, by status
node tools/audit/fix.mjs --issue <slug>      # work one issue in a worktree, open a PR
node tools/audit/fix.mjs --next              # the oldest ready issue
node tools/audit/fix.mjs --next --keep       # leave the worktree to inspect
node tools/audit/fix.mjs --next --no-mon     # skip the mon session
```

## Relationship to the other trackers

| | Owns |
|---|---|
| `docs/issues/` | Defects. Something is wrong and should be made right. |
| [`tasks/open/ROADMAP.md`](../tasks/open/ROADMAP.md) | Features. Something does not exist yet and should. |
| `tasks/open/<SPEC>.md` | Design work too large for one issue — a rebuild or a system that does not exist yet. |

A spec under `tasks/open/` holds the reasoning behind work that has not been scoped into a unit
yet. Once a defect has an issue file, that file is the only record of it — the analysis moves into
`## Evidence` rather than living in a second document that drifts from it.
