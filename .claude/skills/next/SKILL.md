---
name: next
description: Read the open Fantasia4x issues and pull requests and propose a short, ordered work sequence — what an agent can do first, his own decisions and playtests last. Read-only. Use when asked what to work on next, for next steps, a summary or state of the open work, a gameplan or a sequencing report.
---

# Sequencing the open work

This skill reads and proposes; it writes nothing to GitHub. Every line of the report comes from
what this run read. Nothing is carried over from an earlier report: pull requests merge on their
own and issues close under you.

## 1. Read, in three calls

1. **Budget.** `gh api graphql -f query='{rateLimit{remaining resetAt}}' --jq .data.rateLimit`.
   The relations query below needs about 3 points: below that, say so and stop until `resetAt`.
2. **Issues and relations, one query:**

   ```bash
   gh api graphql -f query='{ repository(owner:"bk-bf",name:"Fantasia4x"){ issues(states:OPEN, first:100){ nodes{ number title body labels(first:20){ nodes{ name } } milestone{ title } parent{ number } subIssues(first:30){ nodes{ number state } } blockedBy(first:20){ nodes{ number state } } } } } }'
   ```

   `blockedBy` is what `pnpm issue blocked-by` records, and `parent` and `subIssues` are what
   `--parent` records. A blocker that is `CLOSED` no longer blocks. Bodies also state
   dependencies in prose ("waits for #22", "depends on #54", "after #33"); count those too, and
   name each one that has no `blockedBy` relation.
3. **Pull requests.** `gh pr list --state open --json number,headRefName,isDraft,mergeStateStatus,labels,body,statusCheckRollup`.
   `Fixes #n` or `Part of #n` in the body ties a pull request to its issue.

## 2. Order the work

Work an agent or a command can finish comes first, and work only he can do comes last. Inside
each group, higher severity first (`critical`, `high`, `medium`, `low`); a step that unblocks more
issues breaks ties.

1. **Merges.** A red `check` on `dev` first, since it blocks every merge. Then each pull request
   whose checks are green and that waits only to be merged.
2. **Pull requests to finish.** Open pull requests that are red, conflicting or still draft.
3. **Agent work.** Open issues with no open blocker, no open pull request and no `needs decision`.
4. **Chains.** Blocked issues, in the order their blockers clear. A parent comes after its open
   sub-issues.
5. **His own work, last.** `needs playtest` pull requests to play and merge, and `needs decision`
   issues, the one with the most dependents first.

Never list a promotion of `dev` to `main`, nor how many commits wait for one.

## 3. Report

Short enough to act on in a minute.

- The steps under one heading per group from section 2, in that order, numbered across the
  groups. Each step names its issues or pull requests (`#n`), says in one line why it comes now
  and how many it unblocks, and gives the command when one exists.
- List prose dependencies with no `blockedBy` relation, each with the command that records it:
  `pnpm issue blocked-by <n> <blocker>`.
- End with **Needs your decision**, holding only choices that are his.

An issue that is in no step and in no decision stays out of the report.
