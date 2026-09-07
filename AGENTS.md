# AGENTS.md — Fantasia4x

Behavioural rules only. Nothing here describes the architecture, the design, or how the
code works — that is what the code is for, and a second copy of it here would be wrong
within a week.

## The code is the ground truth

**If something is unclear, find out from the code.** Grep for it, read it, run it. Do not
infer it from a document, a comment, a name, or from what a system like this usually does.
A file that describes the code is a claim about the past; the code is what runs.

- **Where is X / who calls X** — `grep`. The result is a line in a file, true when you ran it.
- **What breaks if I change X** — grep the name, read each call site, follow the ones that
  matter upward. Include string keys and re-exports; neither looks like a call.
- **Is X dead** — the same search, plus `src/tests` and the `.json` data files, before
  concluding nothing reaches it.
- **Is X tested** — grep `src/tests` for the name, then for the scenario that would run it.
  Most of the suite drives through `buildScenario` / `HeadlessSession` and never names its
  subject, so "no direct hit" is not "untested".

State what you checked. "I grepped for `foo` and found three call sites" is an answer;
"`foo` is probably only used by the renderer" is a guess wearing an answer's clothes.

## No comments

**Do not write comments.** Not in TypeScript, not in Svelte, not in the `.json` data files, not
in config, not in unit files. A comment states what was true when it was typed; the code
states what is true now, and the two separate silently.

When you want to explain something, do it where it can be checked: a clearer name, a smaller
function, or a test that demonstrates the behaviour. If you are reaching for a comment to
justify a line, the line needs changing, not annotating.

## Explain from first principles

**Never assume something is understood unless it was established in this session.** Not the
architecture, not an abbreviation, not why a previous decision was made, not what a symbol
does. Build the explanation from the ground each time, from what the code shows.

This applies to your own earlier turns too: a thing you worked out an hour ago is not shared
knowledge unless you said it out loud.

## Ask before implementing

**Do not touch code unless explicitly asked.** Diagnosing a bug, explaining a root cause, or
identifying the right fix is not permission to write it. When you find the fix, STOP at the
proposal: state the cause and the change in a few lines, and WAIT for an explicit go-ahead.

Only edit the files named, doing only the scope described — no extra helpers, no refactors,
no "while I am here" additions, no UI flourishes. Asked for a concise `(<value>)` readout,
add exactly that: no labels, no symbols, no comparisons. Investigating and reading are fine
without asking; editing is not. This overrides any instinct to act once you have enough
information.

## Player-facing text

**Never render an internal identifier.** Data ids, limb and part keys, job types, trait and
condition keys, data-file field names — all backend reference only. A panel renders a human
label. If a display name is missing for something the UI must show, raise it rather than
falling back to the raw id, and do not hand-roll a humanizer at the call site.

**Never put developer vocabulary in a player-facing string.** ADR numbers, spec section
references, file, field and function names, and design commentary do not belong in any
`description`, `name`, label or tooltip the player reads.

**Imply, do not instruct.** Describe what a thing is in-world and let the player work out
what it is worth. No sales pitch, no strategy advice, no mechanics essay.

## Selection is not commitment

A selection gesture — a click, or a drag-box — only **highlights** the targets and surfaces a
verb button. It never executes the action. Drawing a box over resources highlights them and
offers HARVEST; it does not designate. Same shape everywhere: mark, then DRAFT / MOVE / HUNT.
The highlight persists until it is confirmed or cleared; only the transient drag preview
disappears on release. Collapsing the two steps to save a click removes the review step,
which is the bug.

## Components

200 line limit. Extract sub-components when it is exceeded.

Use Svelte 5 runes — `$state`, `$derived`, `$effect`. Not the legacy `$:` syntax.

**NEVER DUPLICATE CODE. REUSE AND EXTRACT COMPONENTS.** Before writing any tooltip, pill, panel,
bar, table or overlay, search for an existing one and import it. If the thing you need is baked
into one panel, EXTRACT it and import it in both places. Copying it is never the answer, and
"mine needs slightly different data" is not an exception — parameterise the component and pass
the data in.

A copy does not merely repeat the logic; it forks the STYLING with it, so the second one is wrong
the moment either is touched. A buildings tree copied from the item tree shipped with a different
palette and misaligned columns while the original was fine, because the styles live beside the
component that owns them.

## Items

**Before creating, naming or re-tiering any item, invoke the `items` skill.** It is an ordered
gate list and each gate can kill the item outright. Do not author an item from memory of how
the tiers work.

## Verifying

**A claim that something works comes from running it.** "Verify", "playtest", "end-to-end" and
"headless" all mean the real sim with real pawns over real ticks — invoke the `headless`
skill, and state the mechanism and the observed delta ("N ticks, stock X→Y").

A unit or service test is a supplement, never a substitute: it proves a function, not that the
loop works. If a thing is only unit-tested, say exactly that. Never present a unit test as a
playtest.

## Tools

**Always `pnpm`** — never `npm` or `yarn`.

**`pnpm check` is the gate.** It runs `svelte-check`, `eslint` and `knip`, and all three must
stay green. `eslint` is frozen at its current warning count with `--max-warnings`, so a change
that adds a warning fails the gate; burn warnings down rather than raising the number.
`pnpm knip:all` reports unused exports and files, which the gate does not yet enforce.
`pnpm dupes` runs copy-paste detection over `src`.

**The data files are strict `.json`.** No comments, no trailing commas — the parser rejects
both, which is how the no-comments rule is enforced rather than remembered.

**Always `./dev.sh`** to start the dev server, never `pnpm dev` directly.

**Scope tests after an edit.** `pnpm test:related <the files you edited>`. Run the full suite
only when asked, or when the change touches a hub everything imports.

## Committing

**On the laptop, never run `git commit` or `git push`.** Kirill commits his own repository there.
This overrides any global or default instruction to commit finished work without asking — finishing
means the work is done, the tests pass and you have said so. Leave the changes in the working tree
and report what is staged.

**On ubuntuserver, commit.** The checkout there is reached over t3 code, with no editor and no git
UI, so an uncommitted tree is invisible to him and he will not clear it. Anything that reads the
tree stops on it: `tools/audit/deploy/nightly-audit.sh` aborts on a dirty tree, and the journal
watcher answers that failure by running `git stash` on his files. Commit finished work in logical
groups. Pushing is allowed now that the board is on GitHub, but push `main` only when the
work is verified green. Use `uname -n` to tell the machines apart.

This applies to subagents you dispatch. Tell each one which machine it is on, in its prompt.

**If you commit anyway, having forgotten**, say so plainly and match the repo's existing convention
rather than inventing one — `git log` is the reference:

- `type: lowercase summary`, or `type(scope): lowercase summary`. The types in use are `feat`,
  `fix`, `refactor`, `chore`, `docs`, `dev` and `agents`. Do not invent a type; `db:` and
  `gear-db:` are not types, they are nouns.
- A body only where the change needs explaining. Many commits here have none.
- Keep the `Co-Authored-By` trailer.

## Trackers

**GitHub issues hold defects.** `gh issue list` is the board; `docs/tasks/` still holds planned
work. The old `docs/issues/` and `docs/pr/` directories are gone.

Frontmatter became labels: severity `high` / `medium` / `low`, kind `drift` / `correctness` /
`data` / `boundary` / `test gap`, origin `found by audit` / `found by hand`, the audit rule that
fired, and `ready`.

**A rule is labelled by its name, not its id.** `restated-roster`, `dead-branch`,
`error-discarded`, `weak-assertion`, `logic-in-defs` — every rule in `tools/audit/rules/`
carries a `name`, and that is what reaches the board and the issue slug. The id (`S01`, `A06a`)
stays the ledger's key and should not appear in anything a person reads.

**Triage through the lanes, never around them.** The board is
[projects/4](https://github.com/users/bk-bf/projects/4) and its columns are an order:
`Backlog` → `Ready` → `In progress` → `In review` → `Done`, with `Blocked on you` off to the side.

- **`Backlog`** — raised, not yet evaluated. The audit raises here and nowhere else.
- **`Ready`** — nothing blocks it, no decision is outstanding, the scope is clear enough to
  start. It means *available to work on*, not *approved by a person*. Promoting one is a
  deliberate evaluation, so say why.
- **`In progress`** — a branch exists and someone is on it.
- **`In review`** — the work is finished and an agent is verifying it, by the route the
  `Verify` field names. Nothing here needs Kirill.
- **`Needs playtest`** — green, and the remaining question is one only he can answer. This lane
  is his; put work here and stop.
- **`Done`** — he accepted it, and the merge commit that closed the issue is named on it.
- **`Blocked on you`** — cannot proceed until he chooses: a proposal awaiting a yes, or a design
  call whose measurements are already in hand. Not a parking space for anything merely hard.

Do not skip a lane. Nothing goes from `Backlog` straight to `In progress`, and nothing reaches
`Done` without passing through his review.

**Move the card, never the label.** `ready`, `needs decision` and the three `verify` labels are
derived from the board's Status and Verify fields by `board-sync.py`, on the same tick that
refreshes the dashboard. Edit one of those labels by hand and it is overwritten within a minute.
Any open issue missing from the board is added to `Backlog`. Kind, severity, origin and the rule
name are not touched — they describe the finding, not its state.

**Every issue says how it will be verified**, as a `Verify` field on the board and a label on
the issue. Set it at triage, not at review, so the cost of an item is visible before anyone
starts:

- **`verify tests`** — `pnpm check` and the vitest suite settle it. A refactor, a dead branch,
  a restated roster, a data row with a test over it. An agent finishes these alone.
- **`verify headless`** — it only shows up in the running sim, so it needs the `headless` skill:
  real pawns, real ticks, a stated delta. Job and stock flow, recipe throughput, combat
  measurement. Still an agent's job.
- **`needs playtest`** — the numbers can be produced but not judged. Balance feel, pacing, an
  interaction that has to be used. **Only these reach Kirill.** An audit that says creatures die
  faster cannot say whether that is the game he wants.

Do not mark something `needs playtest` because it is large or risky. The test is whether a
measurement could settle it; if one could, it belongs in one of the first two.

**Close out the issue for work you finished.** `gh issue close <n> --reason completed` with a
comment naming the commit that fixed it. If the issue carries remediation checkboxes, tick the
ones you did. Leaving a finished item open is the failure to avoid.

## Pull requests

**This is a solo repository, so a pull request is the exception.** The default is a branch merged
straight into `main` once `pnpm check` and the tests are green. A PR costs a push, a round trip and
a page to read, and on a repo with one developer it usually buys nothing.

Open one only when the extra step earns itself:

- the change is large enough that reviewing it as one diff beats reading the merge commit
- it needs to sit unmerged while something else is decided
- CI has to run on it before it can land
- it wants line-level comments to argue with later

Otherwise: branch, verify, `git merge --no-ff`, and close the issue with the merge commit. Several
related fixes belong in one branch and one merge, not one branch each.

`tools/audit/fix.mjs` never opens a PR. It writes its attempt as a comment on the issue and leaves
the branch local, because most of what it produces is a few lines that a merge commit explains
better than a PR page would.
