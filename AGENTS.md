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
  `fix`, `refactor`, `chore`, `docs`, `dev`, `agents`, `perf`, `style`, `test`, `ci` and
  `build`. Do not invent a type; `db:` and `gear-db:` are not types, they are nouns — they
  belong in the scope, as `feat(db):`.
- A body only where the change needs explaining. Many commits here have none.
- **A body is bullets, never prose.** One `- ` per change, sentence case, ending in a full
  stop, naming the symbol or file inline. `eb79af85`, `ef1cb295` and `bd98c2c4` are the
  reference. A paragraph explaining the reasoning behind a change does not belong in a commit
  message; put it in the code, a test, or `docs/`.
- Keep the `Co-Authored-By` trailer.

`scripts/hooks/commit-msg` refuses anything else, and `pnpm hooks:install` puts it in place
along with the pre-commit hook. `git commit --no-verify` bypasses it for a one-off.

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

**Every card is a real issue.** Do not put a draft card on the board to represent work that has
a spec but no issue — an empty card inflates the count and says nothing a person can act on.
Planned work lives in `docs/tasks/` and is listed in `ROADMAP.md`; it becomes an issue when
someone is ready to start it.
- **`Ready`** — nothing blocks it, no decision is outstanding, the scope is clear enough to
  start. It means *available to work on*, not *approved by a person*. Promoting one is a
  deliberate evaluation, so say why.
- **`In progress`** — a branch exists and someone is on it.
- **`In review`** — the work is finished and an agent is verifying it, by the route the
  `Verify` field names. Nothing here needs Kirill. A card that passes its route is merged to
  `main` by the reviewer, not held for him.
- **`Needs playtest`** — green, and the remaining question is one only he can answer. The work
  is committed on `fix/<slug>` and **not merged**; its worktree stays, with its own `.devport`,
  so `./dev.sh` in it runs beside whatever is already on 5173. This lane is his; put work here
  and stop.
- **`Done`** — merged, and the merge commit that closed the issue is named on it.
- **`Blocked on you`** — cannot proceed until he chooses: a proposal awaiting a yes, or a design
  call whose measurements are already in hand. Not a parking space for anything merely hard.

**`Blocked on you` and `Needs playtest` are his lanes.** Put a card in when it belongs there.
**Never take one out** — he is the only one who decides a thing he asked to look at has been
looked at. And do not put one back because he moved it out: him moving a card is the answer,
not a mistake to correct. Nothing watches those lanes for drift.

Move a card with `pnpm issue lane <n> <lane>`, which refuses a move out of his two lanes.
Direct `gh project item-edit` is denied.

Do not skip a lane. Nothing goes from `Backlog` straight to `In progress`, and nothing reaches
`Done` without passing its `Verify` route in `In review`.

**The board runs itself on the first two routes.** `pnpm audit:fix --next` takes the oldest
`Ready` card whose `Verify` is `tests`, works it in a worktree, and moves it to `In review` once
`pnpm check` and the related tests are green on the branch. Every green branch is pushed, so a
diff is readable from anywhere; `review.mjs` deletes it from origin when it merges. `pnpm audit:review --next` takes the
oldest `In review` card, checks the diff touches only files the issue cites, re-merges its
branch onto a freshly fetched `origin/main`, runs the route again on the merge result — plus a
headless session for `verify headless` — and pushes to `main`, closes the issue and moves the
card to `Done` only if that is green. Anything short of
green sends the card back to `Ready` with the failure written on the issue.

`--verify playtest` works the card the same way and stops at `Needs playtest`: committed,
pushed, not merged, worktree kept on its own port. Nothing merges a playtest branch except
Kirill. Both scripts stop while the audit is paused, because they spend the same limits.

**Never write to GitHub with `gh` directly.** `gh issue create|edit|close|comment` and
`gh label create|edit|delete` are denied in `.claude/settings.json`. Use `pnpm issue`:

```bash
pnpm issue labels                       # every label the schema allows
pnpm issue lint --body-file draft.md    # would this be accepted?
pnpm issue create --title T --body-file - --label high --label drift
pnpm issue close 12 --commit <sha>
```

It repairs what is mechanical and refuses what is not. A `path:line` written in prose becomes a
permalink pinned to the commit the audit indexed — a citation names a line, and a line is only
true at one revision. An issue URL in backticks becomes `#12`, because GitHub renders a code
span as code and links a bare reference. What it refuses: a label outside the schema, naming the
nearest real one (`test-missing` comes back as `missing-test`); a relative markdown link, which
means nothing in an issue body; a project-view URL, which is renumbered; a blob link whose file
or line does not exist at that commit; and `ready` on a new issue, because new work lands in
`Backlog`.

**Five classifications are required on every issue** — severity, kind, origin, verify and
subarea. An issue missing one cannot be sorted, filtered or costed, so `create` refuses it and
`pnpm issue check-labels` reports any open issue that has drifted.

**`subarea` names the part of the tree the issue is in**, one word, `game/` dropped:
`database`, `core`, `services`, `systems`, `sim`, `sim-core`, `entities`, `headless`, `world`,
`debug`, `ai`, `components`, `stores`, `webgl`, `audio`, `dev`, `server`, `actions`, `routes`,
`tools`. It is derived, not judged — `tools/audit/lib/subarea.mjs` maps a path to its label, and
an issue citing several files takes the one most of its evidence sits in. Set it by hand only on
an issue that cites no code.

This is not the board's `Area` field, which is a game-domain taxonomy: `combat`, `items`, `sim`,
`ui`, `data`, `tooling`. A card carries both — where in the code, and what part of the game.

**The work type is a board field, not a label**, and nothing mirrors it — a card would then
carry the same word twice. `pnpm issue create --type` is required and sets it, `raise.mjs`
passes the type its rule family implies, and `check-labels` reads the board and reports an open
issue whose card has no `Work type` or is not on the board at all. The words are the ones the
commit messages use: `feat`, `fix`, `refactor`, `perf`, `test`, `tooling`, `docs`, `chore`,
`decision`.

A field that nothing checks is how nine cards went untyped without anything noticing.

**A body has to say something.** `create` also refuses a stub: under ~240 characters of prose,
no citation, or no remediation checkbox (unless it carries `needs decision`). A heading with
nothing under it counts as empty. `.github/ISSUE_TEMPLATE` holds the shape, though structure is
not the bar — a checkbox list with citations is fine, and a wall of unbroken prose is not.

The vocabulary is `tools/audit/labels.json` plus one label per rule `name`. Adding a label means
editing that file, not inventing one at a call site. `pnpm issue sync-labels` creates what is
missing and names the strays; `--prune` deletes a stray no issue carries.

`pnpm issue check-links` reads every issue and reports each citation that points at nothing,
each relative link, and each body that is not in canonical form. It exits non-zero, so it is the
check to run after any pass that rewrites bodies — a spot check on a handful of issues proves
nothing about the rest. `pnpm issue fix-links` repairs what can be repaired and leaves the rest
reported.

Reading is unrestricted: `gh issue list`, `gh issue view`, `gh project item-list`.

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
