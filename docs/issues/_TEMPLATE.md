---
id: <slug>
title: <one line, present tense, names the thing that is wrong>
status: open
kind: <drift | correctness | performance | boundary | data | test-gap>
severity: <critical | high | medium | low>
ready: false
origin: <human | audit>
rules: []
files: []
symbols: []
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
---

# <title>

> **Related:** <backlinks, same convention as the rest of docs/>

## What breaks

One paragraph. What goes wrong, for whom, under what condition. Concrete: the wrong number
the player sees, the pawn that stops hauling, the key that spawns a default. Not "this is
fragile" — say what happens when it gives.

## Evidence

- [`path/to/file.ts:123`](../../path/to/file.ts#L123) — what is on that line and why it is
  the problem
- one bullet per claim; a claim with no citation does not go in the issue

## Why nothing caught it

Which tier should have caught this and why it did not — the type that cannot express it, the
lint rule that does not exist, the test that asserts something weaker, the headless scenario
nobody wrote. If a cheap check would have caught it, say which; that check is usually part of
the remediation.

## Remediation

- [ ] Ordered steps. The fixer works the whole list in one PR, so this list is the PR's scope.
- [ ] Each step is verifiable — a file changes, a test goes green, a command exits 0.
- [ ] Include the check that would have caught it, so the class cannot come back silently.

## Out of scope

What is deliberately not being fixed here, and why. Without this the fixer widens the change
until something unrelated breaks.
