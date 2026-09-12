---
name: board
description: Read the Fantasia4x project board and propose a short, ordered work sequence — what to do first, what each step frees, and what waits on what. Read-only. Use when asked what to work on next, for a gameplan or a sequencing report, for the state of the board, or to "look at the board".
---

# Sequencing the board

This skill reads and proposes; it writes nothing to GitHub and moves no card. Every line of the
report comes from what this run read. Nothing is carried over from an earlier report, because
the board changes under you: pull requests merge on their own, and cards move every five
minutes.

## 1. Read, in four calls

1. **Budget.** `gh api graphql -f query='{rateLimit{remaining resetAt}}' --jq .data.rateLimit`.
   The board read costs 101 points of an hourly 5,000 that every agent and `board-sync.py`
   share. Below about 150 remaining, say so and stop until `resetAt`.
2. **Board, once.** `gh project item-list 4 --owner bk-bf --limit 300 --format json`, saved to a
   temporary file and read from there. Each card has its lane (`status`), `work type`, `area`,
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
- `git fetch -q origin && git rev-list --count origin/main..origin/dev` — commits waiting for a
  promotion.
- For each `Failed` card, `gh issue view <n> --json comments` (about 1 point each). The latest
  comment holds the reason it failed; check whether that cause has been fixed since.

## 2. Order the work

Put first whatever frees the most other work, not whatever has the highest priority.

1. **Anything that stops the automation.** A red `check` on `dev` or on a pull request, a pull
   request GitHub reports `DIRTY` (it conflicts with `dev`), or a paused audit. Each of these
   holds up every card behind it.
2. **What only he can do, ordered by how many cards it frees.**
   - A `needs playtest` pull request, waiting for him to play and merge it.
   - A `Blocked on you` card that other cards wait for. Count its dependents: `blockedBy` edges,
     prose dependencies and open sub-issues. The whole lane is answered through `/unblock`.
   - A `Failed` card whose cause of failure has since been fixed, and so can go back to `Ready`.
3. **Work an agent can start now.** `Ready` cards with no open blocker.
   `pnpm audit:fix --next` works only the `tests` route; a `headless` or `playtest` card needs
   `pnpm audit:fix --issue <n>`.
4. **Chains.** Blocked cards, in the order their blockers clear. A parent comes after its open
   sub-issues.
5. **Promotion.** `pnpm audit:promote` once `On dev` holds finished work and nothing on `dev` is
   known to be broken.

Rules while ordering:

- A card with an open blocker, relation or prose, is not startable. Put it after the blocker.
- `Manual` cards are his, in progress by hand. List them; do not schedule them for an agent.
- Do not guess answers to `Blocked on you` cards. The sequence says which to answer first, and
  `/unblock` asks the questions.
- Ties break on Priority, `P0` first, then on Size, `S` before `L`, when both free the same
  number of cards.

## 3. Report

Short enough to act on in a minute.

- A table of lane counts, then the steps: 8 at most, numbered. Each step names its cards
  (`#n`), says in one line why it comes now and how many cards it frees, and gives the command
  when one exists: `/unblock`, `pnpm issue lane <n> ready`, `pnpm audit:fix --issue <n>`,
  `pnpm audit:promote`.
- List prose dependencies with no `blockedBy` relation, each with the command that records it:
  `pnpm issue blocked-by <n> <blocker>`.
- End with **Needs your decision**, holding only choices that are his.

A card that is in no step and in no decision stays out of the report. Do not walk the board card
by card.
