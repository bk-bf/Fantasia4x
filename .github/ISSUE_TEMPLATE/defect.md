---
name: Defect
about: Something in the code is wrong. Cite it.
labels: found by hand
---

## What breaks

What goes wrong, and what a person or the sim sees when it does. Name the behaviour, not the
file. One paragraph.

## Evidence

At least one citation, as a permalink to the line — `pnpm issue` turns `src/lib/x.ts:41` into
one for you.

- `src/lib/game/…:41` — what this line does that is wrong
- `src/lib/game/…:88` — the place that already does it correctly, if there is one

## Remediation

- [ ] The change that fixes it
- [ ] The check that would have caught it, or why it stays a judgment call
- [ ] `pnpm check` and `pnpm test:related` on the changed files are green

## Out of scope

What this issue deliberately does not cover, so it can be closed.
