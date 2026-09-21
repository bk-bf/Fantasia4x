---
name: Feature
about: New or changed game behaviour, built one step per branch.
labels: feature, found by hand
---

## What this is

What the player or the sim gains, in one paragraph. Name the issues it depends on or unblocks
as #N.

## Why

- `src/lib/x.ts:41` — what the code does today that this changes. One bullet per cited line.

## Steps

- [ ] One change. On an S or M card every step lands in one pull request; on an L card each is its own
- [ ] The next one

## How it gets verified

Which of `verify tests`, `verify headless` or `needs playtest`, and why the cheaper one cannot
settle it.
