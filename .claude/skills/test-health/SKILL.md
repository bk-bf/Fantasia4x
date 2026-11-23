---
name: test-health
description: The nightly test-health pass over Fantasia4x — read the night's CI run on dev and the latest runs on the active branches, find failing, flaky and stale tests and surviving mutants, hand each one to the agent responsible or fix it, all on the one branch fix/test-health, and carry the fixes to every active branch. Runs from the T3 scheduled task "Nightly test health" at 04:00 UTC. Use when that task fires, or when asked to run the test-health pass by hand.
---

# Nightly test health

Every fix this pass makes lands on one branch, `fix/test-health`, and reaches `dev` through one
pull request, so the owner watches a single place. Every issue and pull request it opens carries
the origin label `found by nightly check`.

## 1. Budget and branch

1. `gh api graphql -f query='{rateLimit{remaining resetAt}}' --jq .data.rateLimit`. Below 50, stop
   and say so; `pnpm issue create` needs GraphQL.
2. `git fetch origin`. The worktree is `~/.t3/worktrees/Fantasia4x/test-health`; create it if missing:
   `git worktree add --no-track -B fix/test-health ~/.t3/worktrees/Fantasia4x/test-health origin/dev`.
3. If `origin/fix/test-health` has an open pull request, check it out and `git rebase origin/dev`;
   otherwise `git reset --hard origin/dev`. Read every comment on that pull request first.

## 2. What to look at

- **The night's run on dev.** `gh run list -w check.yml --event schedule -L 1`, then
  `gh run view <id> --log-failed`. Every failed job, and in the `mutants` job every line
  `SURVIVED` or `UNBUILT`.
- **Green only on a retry.** `gh run list -w check.yml -L 100 --json databaseId,attempt,conclusion,headBranch,createdAt`:
  a run from the last day with `attempt` above 1 that ended in `success` failed first. Read the
  failed attempt with `gh run view <id> --attempt 1 --log-failed`.
- **Flaky on dev.** In the worktree, `pnpm test` three times in a row. A test file that fails in
  some runs and passes in others is flaky.
- **The active branches.** `git for-each-ref --sort=-committerdate --format='%(committerdate:relative) %(refname:short)' refs/remotes/origin/test refs/remotes/origin/feat`:
  every branch with a commit in the last three days. For each, the latest run on it,
  `gh run list --branch <branch> -L 1`, and its failed jobs.
- **Stale tests.** A surviving mutant names one: its tests pass with the code broken. So does a
  test that still passes after its subject was deleted or rewritten, found while reading the above.

Nothing found: say so in one line and stop. No pull request, no issue.

## 3. Each finding

1. **Who broke it.** `git log` on the test and on the code it exercises, back to the last green
   run. The commit's `Claude-Session:` or `T3-Thread:` trailer names the session; `ListAgents`
   shows whether it is still running.
2. **A live agent is responsible:** `SendMessage` it the run link, the failing log lines and the
   commit, and leave the fix to it.
3. **Otherwise:** `pnpm issue create --type fix` with `found by nightly check`, the rule
   `flaky-test`, `stale-test` or `surviving-mutant`, kind `correctness` or `test gap`,
   `verify tests` and the subarea. Then start a child agent per issue, in its own worktree branched
   from `fix/test-health`, whose whole task is that issue. When it reports, cherry-pick its commits
   onto `fix/test-health`.
4. **A test that exists only on a feat or test branch** is not fixed here: file the issue, and
   message that branch's agent, or comment on its pull request when none is live.

## 4. Landing and fanning out

1. `pnpm chain` on `fix/test-health`. Red: fix it here before anything else.
2. Open the pull request into `dev` once, `pnpm -s issue pr --head fix/test-health --title "fix(tests): nightly test health" --body-file -`,
   with one `Fixes #n` line per issue; on later nights, `pnpm issue pr-edit <n> --body-file -`
   and `pnpm issue pr-sync <n>`.
3. Green: `gh pr merge <n> --merge`, then `pnpm issue close <n> --commit <sha>` for each issue.
4. Carry the merge to every active branch from step 2: merge `origin/dev` into it in a worktree,
   `pnpm test:related` on the test files the pull request changed, push. A branch with a live agent
   gets a `SendMessage` asking it to merge `origin/dev` instead.
5. Report in the thread: each finding, where it went (fixed in `<sha>`, sent to which agent,
   issue `#n`), and which branches received the merge.
