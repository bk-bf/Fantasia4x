---
name: board
description: Read the Fantasia4x project board and propose a short, ordered work sequence — handed-off and automated work first, by effort, his own work last. Read-only. Use when asked what to work on next, for next steps, a summary or the state of the board, a gameplan or a sequencing report, after an audit run, or to "look at the board".
---

# Sequencing the board

This skill reads and proposes; it writes nothing to GitHub and moves no card. Every line of the
report comes from what this run read. Nothing is carried over from an earlier report, because
the board changes under you: pull requests merge on their own, and cards move every five
minutes.

## 1. Read, in four calls

1. **Budget.** `gh api graphql -f query='{rateLimit{remaining resetAt}}' --jq .data.rateLimit`.
   The board read costs 101 points of an hourly 5,000 that every agent and `board-sync.py`
   share; when they run out it reads over REST instead, which has its own hourly 5,000
   requests. The relations query below still needs about 3 points: below that, say so and stop
   until `resetAt`.
2. **Board, once.** `pnpm -s issue board > <temporary file>`, read from there. It prints what
   `gh project item-list` prints, and reads over REST when GraphQL fails. Each card has its lane (`status`), `work type`, `area`,
   `size`, `verify`, `priority` and labels. Do not read the board a second time.
3. **Relations, one query of about 3 points:**

   ```bash
   gh api graphql -f query='{ repository(owner:"bk-bf",name:"Fantasia4x"){ issues(states:OPEN, first:100){ nodes{ number title body parent{ number } subIssues(first:30){ nodes{ number state } } blockedBy(first:20){ nodes{ number state } } } } } }'
   ```

   `blockedBy` is what `pnpm issue blocked-by` records, and `parent` and `subIssues` are what
   `--parent` records. A blocker that is `CLOSED` no longer blocks. Bodies also state
   dependencies in prose ("waits for #22", "depends on #54", "blocked by #75", "after #33");
   count those as dependencies too, and name each one that has no `blockedBy` relation.
4. **Pull requests.** `gh pr list --state open --json number,headRefName,mergeStateStatus,labels,body,statusCheckRollup`.
   `Fixes #n` or `Part of #n` in the body ties a pull request to its card.

Then, without GitHub:

- `jq -c '{paused, reason}' tools/audit/.ledger/control.json`. While the audit is paused, the
  fixer and the reviewer work nothing.
- For each `Failed` card, `gh issue view <n> --json comments` (about 1 point each). The latest
  comment holds the reason it failed; check whether that cause has been fixed since.

## 2. Order the work

Work an agent or a command can finish comes first, and work only he can do comes last. Inside
each group, the least effort comes first. Free cards break ties: a step that frees more cards
goes first, then Priority, `P0` first.

1. **Lane moves and merges.** One command each, seconds of work.
   - A paused audit or a red `check` on `dev`, first: either stops the fixer and the reviewer.
   - `drift` and `test gap` cards in `Backlog`, which an agent moves to `Ready` itself:
     `pnpm issue lane <n> ready`.
   - A `Failed` card whose cause of failure has since been fixed, or that now has a clean open
     pull request. It needs his yes, because only he takes a card out of `Failed`.
   - A card in the wrong lane: a decision in `Ready`, which the fixer cannot work, or a `Ready`
     card with an open blocker.
   - A pull request that passed review and its checks, and waits only to be merged.
2. **Automated runs.** One command, then unattended. The reviewer on open pull requests
   (`pnpm audit:review --issue <n>`), then the fixer on `Ready` cards with no open blocker, `S`
   before `M` before `L`. `pnpm audit:fix --next` works only the `tests` route; a `headless` or
   `playtest` card needs `pnpm audit:fix --issue <n>`.
3. **Agent work that waits for his yes.** A card of another kind in `Backlog`, and a tooling
   repair the run found, `S` before `M` before `L`.
4. **Chains.** Blocked cards, in the order their blockers clear. A parent comes after its open
   sub-issues.
5. **His own work, last.** A `needs playtest` pull request to play and merge, the `Blocked on
   you` lane through `/unblock` (the card with the most dependents first), and `Manual` cards,
   including a `Manual` card's pull request that conflicts with `dev`.

Rules while ordering:

- A card with an open blocker, relation or prose, is not startable. Put it after the blocker.
- `Manual` cards are his, in progress by hand. Do not schedule them for an agent.
- Do not guess answers to `Blocked on you` cards. The sequence says which to answer first, and
  `/unblock` asks the questions.
- Never list a promotion of `dev` to `main`, nor how many commits wait for one.

## 3. Report

Short enough to act on in a minute.

- A table of lane counts, then the steps under one heading per group from section 2, in that
  order, numbered across the groups. Each step names its cards (`#n`), says in one line why it
  comes now and how many cards it frees, and gives the command when one exists:
  `pnpm issue lane <n> ready`, `pnpm audit:review --issue <n>`, `pnpm audit:fix --issue <n>`,
  `/unblock`.
- List prose dependencies with no `blockedBy` relation, each with the command that records it:
  `pnpm issue blocked-by <n> <blocker>`.
- End with **Needs your decision**, holding only choices that are his.

A card that is in no step and in no decision stays out of the report. Do not walk the board card
by card.
