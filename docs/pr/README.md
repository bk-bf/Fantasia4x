<!-- LOC cap: 200 (created: 2026-08-25) -->

# Review board

> **Related:** [issues/README](../issues/README.md) · [tasks/open/ROADMAP](../tasks/open/ROADMAP.md) · [tools/audit](../../tools/audit/README.md)

Where a fix attempt argues for itself. One file per attempt, flat, next to the
[issue](../issues/README.md) it answers.

A pull request is two things: a branch, and a document arguing for it. Git gives you the
first natively — a branch is a complete, reviewable change without anything hosting it. Only
the second ever needed a forge. So the branch stays a plain local branch in this repo, the
argument lands here, and nothing about a defect or an attempted fix leaves the machine.

**Nothing here is pushed.** The fixer commits to a local branch and stops. Whether a change
reaches `main` is a decision a person makes, by reading the diff.

## Lifecycle

```
issue marked ready: true
        │
   fix.mjs takes it ──▶ worktree on fix/<slug> off main
        │
        ├── green   ──▶ committed ──▶ docs/pr/<slug>.md    status: open
        │                             issue -> in-review
        │
        └── not green ─▶ uncommitted ─▶ docs/pr/<slug>.md   status: abandoned
                                        worktree kept, issue back to open
        │
   you read the diff
        │
        ├── merge  ──▶ status: merged
        └── drop   ──▶ status: abandoned, branch deleted
```

## Frontmatter

```yaml
---
id: core-stat-single-source     # == the filename slug, and the issue it answers
issue: core-stat-single-source  # the issue file in docs/issues/
branch: fix/core-stat-single-source
base: main
status: open                    # open | merged | abandoned
verified: pass                  # pass | fail — what the harness observed, not what was claimed
created: 2026-08-25
updated: 2026-08-25
---
```

`verified` is the harness's own result from re-running `pnpm check` and
`pnpm test:related`, recorded separately from the attempt's account of itself so the two can
be compared rather than having to be trusted together.

## Reviewing one

```bash
git diff main...fix/<slug>          # the whole change
git log --oneline main..fix/<slug>  # what it committed
git merge --no-ff fix/<slug>        # take it
git branch -D fix/<slug>            # drop it
```

Then set `status:` to `merged` or `abandoned`. A dropped attempt keeps its file — what was
tried and why it was not taken is worth more than a deleted branch.

An attempt that could not get green keeps its worktree under `.claude/worktrees/fix-<slug>`,
and its `mon` session runs inside it, so `mon steer` carries that same attempt forward
instead of starting over.

## Why not GitHub

The board was projected to GitHub issues and PRs at first. It was removed on 2026-08-25:
unattended output on a public repo is published before anyone has read it, and the issue
number becomes a second identity for something the repo already names. The files here are
the record; a forge would only be a viewer for them.

Nothing in the tool talks to `gh` any more. If a shared UI is ever wanted, the honest way
back is a private forge that reads these files — not writing to a public one.
