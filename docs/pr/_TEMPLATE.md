---
id: <slug>
issue: <slug of the issue this answers>
branch: fix/<slug>
base: main
status: open
verified: pass
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
---

# fix: <the issue's title>

> **Related:** [issue](../issues/<slug>.md) · [pr/README](README.md) · [issues/README](../issues/README.md)

One line on whether the branch is committed and green, and that nothing was pushed.

## What it reports doing

The attempt's own account, verbatim. Not edited — it is evidence of what the model believed
it did, which is only useful if it is left alone to be compared against the diff.

## What failed

Only when `verified: fail`. The failing command and its output, so the attempt can be judged
without re-running it.

## Review it

```bash
git diff main...fix/<slug>
git log --oneline main..fix/<slug>
```

## Facts

What the harness observed, as opposed to what the attempt claimed: the issue, its severity,
what raised it, how many files moved, and whether the verification actually passed.
